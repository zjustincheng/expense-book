import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { entries, importBatches } from "../db/schema.js";
import { authorize } from "../services/access.js";
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
                { memberId: row.cashMemberId!, amount: minorUnits(row.amount) },
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
          db,
          groupId,
          request.subject,
          { action: "create", input },
          crypto.randomUUID(),
        ),
      );
    }
    const [batch] = await db
      .insert(importBatches)
      .values({ groupId, createdBy: request.subject, rowCount: results.length })
      .returning({ id: importBatches.id, createdAt: importBatches.createdAt });
    return reply
      .code(201)
      .send({ batch, drafts: results, count: results.length });
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
