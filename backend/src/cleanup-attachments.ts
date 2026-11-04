import { connectDatabase } from "./db/client.js";
import {
  createAttachmentStorage,
  destroyAttachmentStorage,
} from "./services/attachments.js";
import { cleanupPendingAttachments } from "./services/attachment-cleanup.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const storage = createAttachmentStorage(process.env);
if (!storage) throw new Error("ATTACHMENT_DIR or S3_BUCKET is required.");
const { db, pool } = connectDatabase(process.env.DATABASE_URL);
try {
  const result = await cleanupPendingAttachments(db, storage);
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} finally {
  await pool.end();
  destroyAttachmentStorage(storage);
}
