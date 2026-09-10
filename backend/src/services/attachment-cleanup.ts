import { and, eq, lt } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { attachments } from "../db/schema.js";
import { deleteObject, type AttachmentStorage } from "./attachments.js";

/** Explicit maintenance only. Upload URLs expire after five minutes; allow a full day. */
export async function cleanupPendingAttachments(
  db: Database,
  storage: AttachmentStorage,
) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(
        eq(attachments.uploadState, "pending"),
        lt(attachments.createdAt, cutoff),
      ),
    )
    .limit(100);
  let removed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      removed += await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(attachments)
          .where(
            and(
              eq(attachments.id, candidate.id),
              eq(attachments.uploadState, "pending"),
              lt(attachments.createdAt, cutoff),
            ),
          )
          .for("update");
        if (!row) return 0;
        // An ambiguous storage failure rolls back and retains the reference for retry.
        await deleteObject(storage, row.objectKey);
        await tx.delete(attachments).where(eq(attachments.id, row.id));
        return 1;
      });
    } catch {
      failed++;
    }
  }
  return { removed, failed };
}
