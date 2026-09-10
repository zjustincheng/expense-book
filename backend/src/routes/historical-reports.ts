import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { groups, historicalReports } from "../db/schema.js";
import { authorize, lockGroup } from "../services/access.js";
import { parseHistoricalReport } from "../services/historical-report.js";
import { fail } from "../lib/errors.js";
import { requestHash } from "../lib/json.js";

const groupParams = z.object({ groupId: z.string().uuid() });
const inputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(180),
  format: z.enum(["txt", "toml", "csv"]),
  source: z.string().min(1).max(1_000_000),
});
function parseInput(body: unknown) {
  const input = inputSchema.parse(body);
  try {
    return { input, report: parseHistoricalReport(input.source, input.format) };
  } catch (error) {
    fail(
      error instanceof Error && !(error instanceof z.ZodError)
        ? error.message
        : "The file does not match the supported rental-record format.",
      400,
    );
  }
}
export function registerHistoricalReportRoutes(
  app: FastifyInstance,
  db: Database,
) {
  app.get("/groups/:groupId/historical-reports", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    await authorize(db, groupId, request.subject);
    return db
      .select({
        id: historicalReports.id,
        title: historicalReports.title,
        fileName: historicalReports.fileName,
        createdAt: historicalReports.createdAt,
      })
      .from(historicalReports)
      .where(eq(historicalReports.groupId, groupId))
      .orderBy(desc(historicalReports.createdAt));
  });
  app.get("/groups/:groupId/historical-reports/:reportId", async (request) => {
    const { groupId, reportId } = groupParams
      .extend({ reportId: z.string().uuid() })
      .parse(request.params);
    await authorize(db, groupId, request.subject);
    const [report] = await db
      .select()
      .from(historicalReports)
      .where(
        and(
          eq(historicalReports.groupId, groupId),
          eq(historicalReports.id, reportId),
        ),
      );
    if (!report) fail("Historical report not found.", 404);
    return report;
  });
  app.post(
    "/groups/:groupId/historical-reports/preview",
    { bodyLimit: 2_000_000 },
    async (request) => {
      const { groupId } = groupParams.parse(request.params);
      await authorize(db, groupId, request.subject, true);
      const { input, report } = parseInput(request.body);
      const [group] = await db
        .select({ currency: groups.currency })
        .from(groups)
        .where(eq(groups.id, groupId));
      return {
        ...input,
        report,
        currency: group!.currency,
        reviewHash: requestHash(input),
      };
    },
  );
  app.post(
    "/groups/:groupId/historical-reports",
    { bodyLimit: 2_000_000 },
    async (request, reply) => {
      const { groupId } = groupParams.parse(request.params);
      await authorize(db, groupId, request.subject, true);
      const { input, report } = parseInput(request.body);
      const { reviewHash, reviewed } = z
        .object({ reviewHash: z.string(), reviewed: z.literal(true) })
        .parse(request.body);
      if (!reviewed || reviewHash !== requestHash(input))
        fail("The file changed. Preview it again before saving.", 409);
      const result = await db.transaction(async (tx) => {
        const group = await lockGroup(tx, groupId, request.subject);
        const hash = requestHash({
          source: input.source,
          format: input.format,
          currency: group.currency,
        });
        const [existing] = await tx
          .select({ id: historicalReports.id })
          .from(historicalReports)
          .where(
            and(
              eq(historicalReports.groupId, groupId),
              eq(historicalReports.sourceHash, hash),
            ),
          );
        if (existing) return { ...existing, existing: true };
        const [saved] = await tx
          .insert(historicalReports)
          .values({
            groupId,
            title: input.title,
            fileName: input.fileName,
            source: input.source,
            sourceHash: hash,
            report,
            currency: group.currency,
            createdBy: request.subject,
          })
          .returning({ id: historicalReports.id });
        return { ...saved!, existing: false };
      });
      return reply.code(result.existing ? 200 : 201).send(result);
    },
  );
}
