import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { access, effects, entries, groups, members } from "../db/schema.js";
import {
  emptyEffect,
  entryInput,
  outstanding,
  postEntry,
  suggestSettlements,
  type Effect,
} from "../domain/ledger.js";

const groupParams = z.object({ groupId: z.string().uuid() });
const entryParams = groupParams.extend({ entryId: z.string().uuid() });
const createGroupInput = z.object({
  name: z.string().trim().min(1).max(100),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]),
  members: z.array(z.string().trim().min(1).max(100)).min(2).max(100),
});
function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = <T>(value: T): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
const fields = [
  "allocatedIncome",
  "allocatedExpense",
  "activityCash",
  "transferCash",
  "settlementCash",
  "obligation",
  "correction",
] as const;

export function registerGroupRoutes(app: FastifyInstance, db: Database) {
  async function authorize(groupId: string, subject: string, write = false) {
    const [grant] = await db
      .select()
      .from(access)
      .where(and(eq(access.groupId, groupId), eq(access.subject, subject)));
    if (!grant) fail("Group not found.", 404);
    if (write && grant.role === "viewer")
      fail("You have read-only access to this group.", 403);
    return grant;
  }
  app.get("/groups", async (request) =>
    db
      .select({
        id: groups.id,
        name: groups.name,
        currency: groups.currency,
        role: access.role,
      })
      .from(groups)
      .innerJoin(
        access,
        and(eq(access.groupId, groups.id), eq(access.subject, request.subject)),
      )
      .orderBy(groups.createdAt),
  );
  app.post("/groups", async (request, reply) => {
    const input = createGroupInput.parse(request.body);
    if (
      new Set(input.members.map((m) => m.toLowerCase())).size !==
      input.members.length
    )
      fail("Use distinct member names.", 400);
    const result = await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({ name: input.name, currency: input.currency })
        .returning();
      await tx.insert(access).values({
        groupId: group!.id,
        subject: request.subject,
        role: "admin",
      });
      await tx
        .insert(members)
        .values(input.members.map((name) => ({ groupId: group!.id, name })));
      return group;
    });
    return reply.code(201).send(result);
  });
  app.get("/groups/:groupId", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    const grant = await authorize(groupId, request.subject);
    // One snapshot keeps totals and activity consistent during concurrent posting.
    return db.transaction(
      async (tx) => {
        const [group] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, groupId));
        const groupMembers = await tx
          .select()
          .from(members)
          .where(eq(members.groupId, groupId))
          .orderBy(members.id);
        const sums = await tx
          .select({
            memberId: effects.memberId,
            allocatedIncome: sql<string>`sum(${effects.allocatedIncome})::text`,
            allocatedExpense: sql<string>`sum(${effects.allocatedExpense})::text`,
            activityCash: sql<string>`sum(${effects.activityCash})::text`,
            transferCash: sql<string>`sum(${effects.transferCash})::text`,
            settlementCash: sql<string>`sum(${effects.settlementCash})::text`,
            obligation: sql<string>`sum(${effects.obligation})::text`,
            correction: sql<string>`sum(${effects.correction})::text`,
          })
          .from(effects)
          .where(eq(effects.groupId, groupId))
          .groupBy(effects.memberId);
        const totals = new Map(
          sums.map((row) => {
            const effect = emptyEffect(row.memberId);
            for (const field of fields) effect[field] = BigInt(row[field]);
            return [row.memberId, effect];
          }),
        );
        const balances = groupMembers.map((member) => {
          const effect = totals.get(member.id) ?? emptyEffect(member.id);
          return { ...member, ...effect, outstanding: outstanding(effect) };
        });
        const activity = await tx
          .select()
          .from(entries)
          .where(eq(entries.groupId, groupId))
          .orderBy(desc(entries.date), desc(entries.createdAt))
          .limit(100);
        return json({
          ...group,
          role: grant.role,
          members: balances,
          entries: activity,
          totals: {
            income: balances.reduce((s, b) => s + b.allocatedIncome, 0n),
            expenses: balances.reduce((s, b) => s + b.allocatedExpense, 0n),
            unsettled: balances.reduce(
              (s, b) => s + (b.outstanding > 0n ? b.outstanding : 0n),
              0n,
            ),
          },
          suggestions: suggestSettlements(balances),
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
  app.post("/groups/:groupId/preview", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    await authorize(groupId, request.subject, true);
    const input = entryInput.parse(request.body);
    const groupMembers = await db
      .select()
      .from(members)
      .where(eq(members.groupId, groupId));
    try {
      const posted = postEntry(
        input,
        groupMembers.map((m) => m.id),
      );
      return json({
        ...posted,
        effects: posted.effects.map((e) => ({
          ...e,
          outstanding: outstanding(e),
        })),
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : "Invalid entry.", 400);
    }
  });
  app.post("/groups/:groupId/entries", async (request, reply) => {
    const { groupId } = groupParams.parse(request.params);
    await authorize(groupId, request.subject, true);
    const input = entryInput.parse(request.body);
    const key = z.string().uuid().parse(request.headers["idempotency-key"]);
    const requestHash = hash(input);
    const entry = await db.transaction(async (tx) => {
      // Serialize financial writes for a group, including retry-key checks.
      await tx
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .for("update");
      const [existing] = await tx
        .select()
        .from(entries)
        .where(
          and(eq(entries.groupId, groupId), eq(entries.idempotencyKey, key)),
        );
      if (existing) {
        if (existing.requestHash !== requestHash)
          fail("This request key was already used for a different entry.", 409);
        return existing;
      }
      const groupMembers = await tx
        .select()
        .from(members)
        .where(eq(members.groupId, groupId));
      let posted;
      try {
        posted = postEntry(
          input,
          groupMembers.map((m) => m.id),
        );
      } catch (error) {
        fail(error instanceof Error ? error.message : "Invalid entry.", 400);
      }
      const [record] = await tx
        .insert(entries)
        .values({
          groupId,
          ...input,
          input,
          amount: posted!.amount,
          actor: request.subject,
          idempotencyKey: key,
          requestHash,
        })
        .returning();
      await tx.insert(effects).values(
        posted!.effects.map((effect) => ({
          ...effect,
          groupId,
          entryId: record!.id,
        })),
      );
      return record;
    });
    return reply.code(201).send(json(entry));
  });
  app.get("/groups/:groupId/entries/:entryId", async (request) => {
    const { groupId, entryId } = entryParams.parse(request.params);
    await authorize(groupId, request.subject);
    const [entry] = await db
      .select()
      .from(entries)
      .where(and(eq(entries.groupId, groupId), eq(entries.id, entryId)));
    if (!entry) fail("Entry not found.", 404);
    const rows = await db
      .select()
      .from(effects)
      .where(and(eq(effects.groupId, groupId), eq(effects.entryId, entryId)));
    return json({
      ...entry,
      effects: rows.map((e) => ({ ...e, outstanding: outstanding(e) })),
    });
  });
  app.post(
    "/groups/:groupId/entries/:entryId/reverse",
    async (request, reply) => {
      const { groupId, entryId } = entryParams.parse(request.params);
      await authorize(groupId, request.subject, true);
      const body = z
        .object({
          reason: z.string().trim().min(1).max(300),
          date: z.iso.date(),
        })
        .parse(request.body);
      const key = z.string().uuid().parse(request.headers["idempotency-key"]);
      const requestHash = hash({ entryId, ...body });
      const result = await db.transaction(async (tx) => {
        await tx
          .select()
          .from(groups)
          .where(eq(groups.id, groupId))
          .for("update");
        const [retry] = await tx
          .select()
          .from(entries)
          .where(
            and(eq(entries.groupId, groupId), eq(entries.idempotencyKey, key)),
          );
        if (retry) {
          if (retry.requestHash !== requestHash)
            fail("Request key conflict.", 409);
          return retry;
        }
        const [original] = await tx
          .select()
          .from(entries)
          .where(and(eq(entries.groupId, groupId), eq(entries.id, entryId)));
        if (!original) fail("Entry not found.", 404);
        if (original.kind === "reversal")
          fail("A reversal cannot be reversed. Post a new entry instead.", 400);
        const [prior] = await tx
          .select()
          .from(entries)
          .where(eq(entries.reverses, entryId));
        if (prior) fail("This entry has already been reversed.", 409);
        const [reversal] = await tx
          .insert(entries)
          .values({
            groupId,
            kind: "reversal",
            description: body.reason,
            date: body.date,
            amount: original.amount,
            input: { reverses: entryId },
            reverses: entryId,
            actor: request.subject,
            idempotencyKey: key,
            requestHash,
          })
          .returning();
        const rows = await tx
          .select()
          .from(effects)
          .where(
            and(eq(effects.groupId, groupId), eq(effects.entryId, entryId)),
          );
        await tx.insert(effects).values(
          rows.map((row) => {
            const reversed: Effect = emptyEffect(row.memberId);
            for (const field of fields) reversed[field] = -row[field];
            return { ...reversed, groupId, entryId: reversal!.id };
          }),
        );
        return reversal;
      });
      return reply.code(201).send(json(result));
    },
  );
}
