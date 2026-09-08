import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { recurringTransactions } from "../db/schema.js";
import { entryInput } from "../domain/ledger.js";
import { json } from "../lib/json.js";
import { fail } from "../lib/errors.js";
import { authorize } from "../services/access.js";

const params = z.object({ groupId: z.string().uuid() });
const recurringInput = z.object({
  name: z.string().trim().min(1).max(100),
  input: entryInput,
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRun: z.iso.date(),
});
export function registerRecurringRoutes(app: FastifyInstance, db: Database) {
  app.get("/groups/:groupId/recurring", async (request) => {
    const { groupId } = params.parse(request.params);
    await authorize(db, groupId, request.subject);
    return db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.groupId, groupId))
      .orderBy(asc(recurringTransactions.nextRun));
  });
  app.post("/groups/:groupId/recurring", async (request, reply) => {
    const { groupId } = params.parse(request.params);
    await authorize(db, groupId, request.subject, true);
    const input = recurringInput.parse(request.body);
    const [row] = await db
      .insert(recurringTransactions)
      .values({
        groupId,
        ...input,
        active: 1,
        createdBy: request.subject,
      })
      .returning();
    return reply.code(201).send(json(row));
  });
  app.patch("/groups/:groupId/recurring/:recurringId", async (request) => {
    const { groupId, recurringId } = params
      .extend({ recurringId: z.string().uuid() })
      .parse(request.params);
    await authorize(db, groupId, request.subject, true);
    const input = recurringInput.partial().parse(request.body);
    const [row] = await db
      .update(recurringTransactions)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(recurringTransactions.groupId, groupId),
          eq(recurringTransactions.id, recurringId),
        ),
      )
      .returning();
    if (!row) fail("Recurring transaction not found.", 404);
    return json(row);
  });
  app.post(
    "/groups/:groupId/recurring/:recurringId/archive",
    async (request) => {
      const { groupId, recurringId } = params
        .extend({ recurringId: z.string().uuid() })
        .parse(request.params);
      await authorize(db, groupId, request.subject, true);
      const [row] = await db
        .update(recurringTransactions)
        .set({ active: 0, updatedAt: new Date() })
        .where(
          and(
            eq(recurringTransactions.groupId, groupId),
            eq(recurringTransactions.id, recurringId),
          ),
        )
        .returning();
      if (!row) fail("Recurring transaction not found.", 404);
      return json(row);
    },
  );
}
