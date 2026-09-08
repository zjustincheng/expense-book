import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { access, effects, entries, groups, members } from "../db/schema.js";
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

const groupParams = z.object({ groupId: z.string().uuid() });
const createGroupInput = z.object({
  name: z.string().trim().min(1).max(100),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]),
  members: z.array(z.string().trim().min(1).max(100)).min(2).max(100),
});
export function registerGroupRoutes(app: FastifyInstance, db: Database) {
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
  registerFinancialRoutes(app, db);
}
