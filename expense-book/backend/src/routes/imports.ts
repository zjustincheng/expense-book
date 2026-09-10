import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { entries, importBatches } from "../db/schema.js";
import { authorize, lockGroup } from "../services/access.js";
import { fail } from "../lib/errors.js";
import { requestHash } from "../lib/json.js";
import { entryInput } from "../domain/ledger.js";
import { parseImportCsv } from "../services/csv-import.js";
import { changeDraft } from "../services/drafts.js";
const params = z.object({ groupId: z.string().uuid() });
function minorUnits(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}
export function registerImportRoutes(app: FastifyInstance, db: Database) {
  app.post("/groups/:groupId/import/preview", async (request) => {
    const { groupId } = params.parse(request.params);
    await authorize(db, groupId, request.subject, true);
    const { csv } = z
      .object({ csv: z.string().max(2_000_000) })
      .parse(request.body);
    const preview = parseImportCsv(csv);
    const existing = await db
      .select({
        date: entries.date,
        description: entries.description,
        amount: entries.amount,
      })
      .from(entries)
      .where(eq(entries.groupId, groupId));
    const keys = new Set(
      existing.map(
        (row) => `${row.date}|${row.description.toLowerCase()}|${row.amount}`,
      ),
    );
    return {
      ...preview,
      rows: preview.rows.map((row) => ({
        ...row,
        duplicate: keys.has(
          `${row.date}|${row.description.toLowerCase()}|${minorUnits(row.amount)}`,
        ),
      })),
    };
  });
  app.post("/groups/:groupId/import/confirm", async (request, reply) => {
    const { groupId } = params.parse(request.params);
    await authorize(db, groupId, request.subject, true);
    const body = z
      .object({
        rows: z
          .array(
            z.object({
              date: z.iso.date(),
              description: z.string().trim().min(1).max(300),
              kind: z.enum([
                "income",
                "expense",
                "obligation",
                "transfer",
                "settlement",
                "adjustment",
              ]),
              amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
              project: z.string().max(80).optional(),
              category: z.string().max(80).optional(),
              cashMemberId: z.string().uuid().optional(),
              splitMemberIds: z.array(z.string().uuid()).max(100).optional(),
              fromMemberId: z.string().uuid().optional(),
              toMemberId: z.string().uuid().optional(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(request.body);
    const key = z.string().uuid().parse(request.headers["idempotency-key"]);
    const result = await db.transaction(async (tx) => {
      await lockGroup(tx, groupId, request.subject);
      const hash = requestHash(body);
      const [retry] = await tx
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, key));
      if (retry) {
        if (
          retry.groupId !== groupId ||
          retry.createdBy !== request.subject ||
          retry.requestHash !== hash
        )
          fail("Request key conflict.", 409);
        return {
          batch: { id: retry.id, createdAt: retry.createdAt },
          count: retry.rowCount,
        };
      }
      const results = [];
      for (const row of body.rows) {
        const input =
          row.kind === "income" || row.kind === "expense"
            ? {
                kind: row.kind,
                date: row.date,
                description: row.description,
                expression: row.amount,
                cash: [
                  {
                    memberId: row.cashMemberId!,
                    amount: minorUnits(row.amount),
                  },
                ],
                split: {
                  method: "equal" as const,
                  members: row.splitMemberIds ?? [],
                },
                ...(row.project ? { project: row.project } : {}),
                ...(row.category ? { category: row.category } : {}),
              }
            : {
                kind: row.kind,
                date: row.date,
                description: row.description,
                expression: row.amount,
                fromMemberId: row.fromMemberId!,
                toMemberId: row.toMemberId!,
              };
        results.push(
          await changeDraft(
            tx,
            groupId,
            request.subject,
            { action: "create", input: entryInput.parse(input) },
            crypto.randomUUID(),
          ),
        );
      }
      const [batch] = await tx
        .insert(importBatches)
        .values({
          id: key,
          groupId,
          createdBy: request.subject,
          rowCount: results.length,
          requestHash: hash,
        })
        .returning({
          id: importBatches.id,
          createdAt: importBatches.createdAt,
        });
      return { batch, count: results.length };
    });
    return reply.code(201).send(result);
  });
  app.get("/groups/:groupId/import/history", async (request) => {
    const { groupId } = params.parse(request.params);
    await authorize(db, groupId, request.subject);
    return db
      .select()
      .from(importBatches)
      .where(eq(importBatches.groupId, groupId))
      .orderBy(importBatches.createdAt);
  });
}
