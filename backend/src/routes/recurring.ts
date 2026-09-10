import { and, asc, eq, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import {
  drafts,
  importBatches,
  invitations,
  notificationDismissals,
  recurringTransactions,
} from "../db/schema.js";
import { entryInput } from "../domain/ledger.js";
import { json } from "../lib/json.js";
import { fail } from "../lib/errors.js";
import { authorize } from "../services/access.js";
import { changeDraft } from "../services/drafts.js";

const params = z.object({ groupId: z.string().uuid() });
const recurringInput = z.object({
  name: z.string().trim().min(1).max(100),
  input: entryInput,
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRun: z.iso.date(),
});
export function advanceDate(date: string, frequency: string) {
  const value = new Date(`${date}T00:00:00Z`);
  if (frequency === "weekly") value.setUTCDate(value.getUTCDate() + 7);
  if (["monthly", "quarterly", "yearly"].includes(frequency)) {
    const day = value.getUTCDate();
    const months =
      frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
    const target = new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1),
    );
    const lastDay = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}
export function advanceAnchoredDate(
  date: string,
  frequency: string,
  anchorDay?: number | null,
) {
  if (frequency === "weekly") return advanceDate(date, frequency);
  const value = new Date(`${date}T00:00:00Z`);
  const day = anchorDay ?? value.getUTCDate();
  const months =
    frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const target = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1),
  );
  target.setUTCDate(
    Math.min(
      day,
      new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return target.toISOString().slice(0, 10);
}
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
        anchorDay:
          input.frequency === "weekly"
            ? null
            : Number(input.nextRun.slice(8, 10)),
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
      .set({
        ...input,
        ...(input.nextRun
          ? {
              anchorDay:
                input.frequency === "weekly"
                  ? null
                  : Number(input.nextRun.slice(8, 10)),
            }
          : {}),
        updatedAt: new Date(),
      })
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
  app.post(
    "/groups/:groupId/recurring/:recurringId/toggle",
    async (request) => {
      const { groupId, recurringId } = params
        .extend({ recurringId: z.string().uuid() })
        .parse(request.params);
      await authorize(db, groupId, request.subject, true);
      const { active } = z.object({ active: z.boolean() }).parse(request.body);
      const [row] = await db
        .update(recurringTransactions)
        .set({ active: active ? 1 : 0, updatedAt: new Date() })
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
  app.post(
    "/groups/:groupId/recurring/:recurringId/generate",
    async (request, reply) => {
      const { groupId, recurringId } = params
        .extend({ recurringId: z.string().uuid() })
        .parse(request.params);
      await authorize(db, groupId, request.subject, true);
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(recurringTransactions)
          .where(
            and(
              eq(recurringTransactions.groupId, groupId),
              eq(recurringTransactions.id, recurringId),
            ),
          )
          .for("update");
        if (!row || !row.active)
          fail("Active recurring transaction not found.", 404);
        const draft = await changeDraft(
          tx,
          groupId,
          request.subject,
          { action: "create", input: row.input },
          crypto.randomUUID(),
        );
        const [updated] = await tx
          .update(recurringTransactions)
          .set({
            nextRun: advanceAnchoredDate(
              row.nextRun,
              row.frequency,
              row.anchorDay,
            ),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(recurringTransactions.groupId, groupId),
              eq(recurringTransactions.id, recurringId),
            ),
          )
          .returning({ nextRun: recurringTransactions.nextRun });
        return { draft, nextRun: updated?.nextRun };
      });
      return reply.code(201).send(result);
    },
  );
  app.post(
    "/groups/:groupId/recurring/generate-due",
    async (request, reply) => {
      const { groupId } = params.parse(request.params);
      await authorize(db, groupId, request.subject, true);
      const today = new Date().toISOString().slice(0, 10);
      const due = await db
        .select()
        .from(recurringTransactions)
        .where(
          and(
            eq(recurringTransactions.groupId, groupId),
            eq(recurringTransactions.active, 1),
            lte(recurringTransactions.nextRun, today),
          ),
        );
      const generated = [];
      for (const candidate of due) {
        const result = await db.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(recurringTransactions)
            .where(
              and(
                eq(recurringTransactions.groupId, groupId),
                eq(recurringTransactions.id, candidate.id),
              ),
            )
            .for("update");
          if (!row || !row.active || row.nextRun > today) return null;
          const draft = await changeDraft(
            tx,
            groupId,
            request.subject,
            { action: "create", input: row.input },
            crypto.randomUUID(),
          );
          await tx
            .update(recurringTransactions)
            .set({
              nextRun: advanceAnchoredDate(
                row.nextRun,
                row.frequency,
                row.anchorDay,
              ),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(recurringTransactions.groupId, groupId),
                eq(recurringTransactions.id, row.id),
              ),
            );
          return { id: row.id, name: row.name, draft };
        });
        if (result) generated.push(result);
      }
      return reply.code(201).send({ generated, count: generated.length });
    },
  );
  app.get("/groups/:groupId/notifications", async (request) => {
    const { groupId } = params.parse(request.params);
    await authorize(db, groupId, request.subject);
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() + 30);
    const due = await db
      .select({
        id: recurringTransactions.id,
        name: recurringTransactions.name,
        nextRun: recurringTransactions.nextRun,
      })
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.groupId, groupId),
          eq(recurringTransactions.active, 1),
          lte(recurringTransactions.nextRun, cutoff.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(asc(recurringTransactions.nextRun));
    const [draftRows, invitationRows, importRows] = await Promise.all([
      db
        .select({ id: drafts.id, updatedAt: drafts.updatedAt })
        .from(drafts)
        .where(and(eq(drafts.groupId, groupId), eq(drafts.state, "draft")))
        .limit(5),
      db
        .select({ id: invitations.id, email: invitations.email })
        .from(invitations)
        .where(
          and(
            eq(invitations.groupId, groupId),
            eq(invitations.state, "pending"),
          ),
        )
        .limit(5),
      db
        .select({
          id: importBatches.id,
          rowCount: importBatches.rowCount,
          createdAt: importBatches.createdAt,
        })
        .from(importBatches)
        .where(eq(importBatches.groupId, groupId))
        .orderBy(asc(importBatches.createdAt))
        .limit(3),
    ]);
    const notifications = [
      ...due.map((row) => ({ type: "recurring_due", ...row })),
      ...draftRows.map((row) => ({ type: "draft_review", ...row })),
      ...invitationRows.map((row) => ({
        type: "invitation_pending",
        ...row,
      })),
      ...importRows.map((row) => ({ type: "import_complete", ...row })),
    ];
    const dismissed = await db
      .select({
        type: notificationDismissals.notificationType,
        id: notificationDismissals.notificationId,
      })
      .from(notificationDismissals)
      .where(
        and(
          eq(notificationDismissals.groupId, groupId),
          eq(notificationDismissals.subject, request.subject),
        ),
      );
    const keys = new Set(dismissed.map((row) => `${row.type}:${row.id}`));
    return {
      notifications: notifications.filter(
        (row) => !keys.has(`${row.type}:${row.id}`),
      ),
    };
  });
  app.post(
    "/groups/:groupId/notifications/:type/:notificationId/dismiss",
    async (request) => {
      const { groupId, type, notificationId } = params
        .extend({
          type: z.string().min(1).max(40),
          notificationId: z.string().uuid(),
        })
        .parse(request.params);
      await authorize(db, groupId, request.subject, true);
      await db
        .insert(notificationDismissals)
        .values({
          groupId,
          subject: request.subject,
          notificationType: type,
          notificationId,
        })
        .onConflictDoNothing();
      return { dismissed: true };
    },
  );
}
