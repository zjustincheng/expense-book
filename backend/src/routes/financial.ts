import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { drafts, draftRevisions, effects, entries } from "../db/schema.js";
import { outstanding } from "../domain/ledger.js";
import { financialCommand } from "../domain/lifecycle.js";
import { fail } from "../lib/errors.js";
import { json } from "../lib/json.js";
import { authorize } from "../services/access.js";
import { changeDraft, draftCommand } from "../services/drafts.js";
import { financialService } from "../services/financial.js";

const groupParams = z.object({ groupId: z.string().uuid() });
const postBody = z.object({
  command: financialCommand,
  previewId: z.string().uuid(),
});
const requestKey = z.string().uuid();
export function registerFinancialRoutes(app: FastifyInstance, db: Database) {
  const service = financialService(db);
  app.post("/groups/:groupId/preview", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    return json(
      await service.preview(
        groupId,
        request.subject,
        financialCommand.parse(request.body),
      ),
    );
  });
  app.post("/groups/:groupId/entries", async (request, reply) => {
    const { groupId } = groupParams.parse(request.params);
    const { command, previewId } = postBody.parse(request.body);
    const result = await service.post(
      groupId,
      request.subject,
      command,
      previewId,
      requestKey.parse(request.headers["idempotency-key"]),
    );
    return reply.code(201).send(result);
  });
  app.get("/groups/:groupId/entries/:entryId", async (request) => {
    const { groupId, entryId } = groupParams
      .extend({ entryId: z.string().uuid() })
      .parse(request.params);
    await authorize(db, groupId, request.subject);
    return db.transaction(
      async (tx) => {
        const [entry] = await tx
          .select()
          .from(entries)
          .where(and(eq(entries.groupId, groupId), eq(entries.id, entryId)));
        if (!entry) fail("Entry not found.", 404);
        const rows = await tx
          .select()
          .from(effects)
          .where(
            and(eq(effects.groupId, groupId), eq(effects.entryId, entryId)),
          );
        const related = await tx
          .select()
          .from(entries)
          .where(
            and(
              eq(entries.groupId, groupId),
              or(
                eq(entries.reverses, entryId),
                eq(entries.refundOf, entryId),
                eq(entries.corrects, entryId),
              ),
            ),
          )
          .orderBy(entries.createdAt);
        const refundIds = related
          .filter((record) => record.refundOf === entryId)
          .map((record) => record.id);
        const reversedRefunds = refundIds.length
          ? await tx
              .select({ reverses: entries.reverses })
              .from(entries)
              .where(
                and(
                  eq(entries.groupId, groupId),
                  inArray(entries.reverses, refundIds),
                ),
              )
          : [];
        const reversedIds = new Set(
          reversedRefunds.map((record) => record.reverses),
        );
        const refunded = related
          .filter(
            (record) =>
              record.refundOf === entryId && !reversedIds.has(record.id),
          )
          .reduce((sum, record) => sum + record.amount, 0n);
        const state = related.some((record) => record.reverses === entryId)
          ? "reversed"
          : "posted";
        return json({
          ...entry,
          state,
          related,
          remainingRefundable:
            state === "posted" &&
            (entry.kind === "income" || entry.kind === "expense")
              ? entry.amount - refunded
              : null,
          effects: rows.map((effect) => ({
            ...effect,
            outstanding: outstanding(effect),
          })),
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
  app.get("/groups/:groupId/drafts", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    await authorize(db, groupId, request.subject);
    return db
      .select()
      .from(drafts)
      .where(and(eq(drafts.groupId, groupId), eq(drafts.state, "draft")))
      .orderBy(desc(drafts.updatedAt))
      .limit(100);
  });
  app.get("/groups/:groupId/drafts/:draftId", async (request) => {
    const { groupId, draftId } = groupParams
      .extend({ draftId: z.string().uuid() })
      .parse(request.params);
    await authorize(db, groupId, request.subject);
    return db.transaction(
      async (tx) => {
        const [draft] = await tx
          .select()
          .from(drafts)
          .where(and(eq(drafts.groupId, groupId), eq(drafts.id, draftId)));
        if (!draft) fail("Draft not found.", 404);
        const revisions = await tx
          .select()
          .from(draftRevisions)
          .where(
            and(
              eq(draftRevisions.groupId, groupId),
              eq(draftRevisions.draftId, draftId),
            ),
          )
          .orderBy(draftRevisions.version);
        return { ...draft, revisions };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
  app.post("/groups/:groupId/drafts", async (request, reply) => {
    const { groupId } = groupParams.parse(request.params);
    const command = draftCommand.parse(request.body);
    const result = await changeDraft(
      db,
      groupId,
      request.subject,
      command,
      requestKey.parse(request.headers["idempotency-key"]),
    );
    return reply.code(command.action === "create" ? 201 : 200).send(result);
  });
}
