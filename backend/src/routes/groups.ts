import { and, desc, eq, exists, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import {
  access,
  attachments,
  effects,
  entries,
  groups,
  members,
} from "../db/schema.js";
import {
  emptyEffect,
  outstanding,
  suggestSettlements,
} from "../domain/ledger.js";
import { effectFields as fields } from "../domain/lifecycle.js";
import { json } from "../lib/json.js";
import { fail } from "../lib/errors.js";
import { authorize as checkAccess } from "../services/access.js";
import { registerFinancialRoutes } from "./financial.js";
import { registerRecurringRoutes } from "./recurring.js";
import { registerImportRoutes } from "./imports.js";

const groupParams = z.object({ groupId: z.string().uuid() });
const createGroupInput = z.object({
  name: z.string().trim().min(1).max(100),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]),
  members: z.array(z.string().trim().min(1).max(100)).min(2).max(100),
});
const reportQuery = z.object({
  search: z.string().trim().max(120).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  project: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  kind: z
    .enum([
      "income",
      "expense",
      "obligation",
      "transfer",
      "settlement",
      "adjustment",
      "refund",
      "reversal",
    ])
    .optional(),
  memberId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
const activityQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
  project: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  kind: z.string().trim().max(30).optional(),
});
export function registerGroupRoutes(app: FastifyInstance, db: Database) {
  app.get("/groups/:groupId/attention", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    await checkAccess(db, groupId, request.subject);
    const { reason, page } = z
      .object({
        reason: z.enum(["uncategorized", "missing_attachment"]),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(request.query);
    const [allEntries, attachmentRows] = await Promise.all([
      db.select().from(entries).where(eq(entries.groupId, groupId)),
      db
        .select({ entryId: attachments.entryId })
        .from(attachments)
        .where(eq(attachments.groupId, groupId)),
    ]);
    const reversed = new Set(
      allEntries.flatMap((entry) => (entry.reverses ? [entry.reverses] : [])),
    );
    const attached = new Set(attachmentRows.map((row) => row.entryId));
    const filtered = allEntries
      .filter((entry) => entry.kind === "income" || entry.kind === "expense")
      .filter((entry) => !reversed.has(entry.id))
      .filter((entry) => {
        const input = entry.input as { category?: string };
        return reason === "uncategorized"
          ? !input.category?.trim()
          : entry.kind === "expense" && !attached.has(entry.id);
      })
      .sort((a, b) =>
        `${b.date}${b.createdAt.toISOString()}${b.id}`.localeCompare(
          `${a.date}${a.createdAt.toISOString()}${a.id}`,
        ),
      );
    const rows = filtered.slice((page - 1) * 20, page * 20 + 1);
    return json({ records: rows.slice(0, 20), hasMore: rows.length > 20 });
  });
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
    return reply.code(201).send(json(result));
  });
  app.get("/groups/:groupId", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    const grant = await checkAccess(db, groupId, request.subject);
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
  app.get("/groups/:groupId/reports", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    await checkAccess(db, groupId, request.subject);
    const query = reportQuery.parse(request.query);
    if (query.from && query.to && query.from > query.to)
      fail("Report start date must be before its end date.", 400);
    const conditions = [eq(entries.groupId, groupId)];
    if (query.from) conditions.push(sql`${entries.date} >= ${query.from}`);
    if (query.to) conditions.push(sql`${entries.date} <= ${query.to}`);
    if (query.kind) conditions.push(eq(entries.kind, query.kind));
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(
        sql`(${entries.description} ilike ${term} or ${entries.input}->>'project' ilike ${term} or ${entries.input}->>'category' ilike ${term})`,
      );
    }
    if (query.project)
      conditions.push(
        sql`${entries.input}->>'project' ilike ${`%${query.project}%`}`,
      );
    if (query.category)
      conditions.push(
        sql`${entries.input}->>'category' ilike ${`%${query.category}%`}`,
      );
    if (query.memberId)
      conditions.push(
        exists(
          sql`select 1 from entry_effects report_effect where report_effect."groupId" = ${groupId} and report_effect."entryId" = ${entries.id} and report_effect."memberId" = ${query.memberId}`,
        ),
      );
    return db.transaction(
      async (tx) => {
        const rows = await tx
          .select()
          .from(entries)
          .where(and(...conditions))
          .orderBy(desc(entries.date), desc(entries.createdAt))
          .limit(query.pageSize + 1)
          .offset((query.page - 1) * query.pageSize);
        const hasMore = rows.length > query.pageSize;
        rows.splice(query.pageSize);
        const aggregateRows = await tx
          .select({ kind: entries.kind, amount: entries.amount })
          .from(entries)
          .where(and(...conditions));
        const totals = new Map<string, bigint>();
        for (const row of aggregateRows)
          totals.set(row.kind, (totals.get(row.kind) ?? 0n) + row.amount);
        return json({
          records: rows,
          totals: Object.fromEntries(totals),
          count: aggregateRows.length,
          pageCount: rows.length,
          totalPages: Math.max(
            1,
            Math.ceil(aggregateRows.length / query.pageSize),
          ),
          page: query.page,
          pageSize: query.pageSize,
          hasMore,
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
  app.get("/groups/:groupId/activity", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    await checkAccess(db, groupId, request.subject);
    const query = activityQuery.parse(request.query);
    const conditions = [eq(entries.groupId, groupId)];
    if (query.search)
      conditions.push(
        sql`(${entries.description} ilike ${`%${query.search}%`} or ${entries.input}->>'project' ilike ${`%${query.search}%`} or ${entries.input}->>'category' ilike ${`%${query.search}%`})`,
      );
    if (query.project)
      conditions.push(
        sql`${entries.input}->>'project' ilike ${`%${query.project}%`}`,
      );
    if (query.category)
      conditions.push(
        sql`${entries.input}->>'category' ilike ${`%${query.category}%`}`,
      );
    if (query.kind) conditions.push(eq(entries.kind, query.kind));
    const rows = await db
      .select()
      .from(entries)
      .where(and(...conditions))
      .orderBy(desc(entries.date), desc(entries.createdAt))
      .limit(query.pageSize + 1)
      .offset((query.page - 1) * query.pageSize);
    const hasMore = rows.length > query.pageSize;
    rows.splice(query.pageSize);
    return { entries: rows, page: query.page, hasMore };
  });
  app.get("/groups/:groupId/statements/:memberId", async (request) => {
    const { groupId, memberId } = groupParams
      .extend({ memberId: z.string().uuid() })
      .parse(request.params);
    await checkAccess(db, groupId, request.subject);
    const [member] = await db
      .select()
      .from(members)
      .where(and(eq(members.groupId, groupId), eq(members.id, memberId)));
    if (!member) fail("Member not found.", 404);
    const [balance] = await db
      .select({
        outstanding: sql<string>`coalesce(sum(${effects.allocatedIncome} - ${effects.allocatedExpense} - ${effects.activityCash} - ${effects.transferCash} - ${effects.settlementCash} + ${effects.obligation} + ${effects.correction}), 0)`,
      })
      .from(effects)
      .where(and(eq(effects.groupId, groupId), eq(effects.memberId, memberId)));
    const rows = await db
      .select({ entry: entries, effect: effects })
      .from(effects)
      .innerJoin(
        entries,
        and(
          eq(entries.groupId, effects.groupId),
          eq(entries.id, effects.entryId),
        ),
      )
      .where(and(eq(effects.groupId, groupId), eq(effects.memberId, memberId)))
      .orderBy(desc(entries.date), desc(entries.createdAt))
      .limit(500);
    return json({
      member: {
        ...member,
        outstanding: BigInt(balance?.outstanding ?? "0"),
      },
      records: rows.map((row) => ({ ...row.entry, effect: row.effect })),
    });
  });
  registerFinancialRoutes(app, db);
  registerRecurringRoutes(app, db);
  registerImportRoutes(app, db);
}
