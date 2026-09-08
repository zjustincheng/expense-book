import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { entries } from "../db/schema.js";
import { authorize } from "../services/access.js";
import { parseImportCsv } from "../services/csv-import.js";
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
}
