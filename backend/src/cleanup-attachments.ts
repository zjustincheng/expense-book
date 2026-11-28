import { connectDatabase } from "./db/client.js";
import { resolveDatabaseConfig } from "./db/config.js";
import {
  createAttachmentStorage,
  destroyAttachmentStorage,
} from "./services/attachments.js";
import { cleanupPendingAttachments } from "./services/attachment-cleanup.js";

const { driver, url } = resolveDatabaseConfig(process.env);
const storage = createAttachmentStorage(process.env);
if (!storage) throw new Error("ATTACHMENT_DIR or S3_BUCKET is required.");
const { db, pool } = connectDatabase(url, driver);
try {
  const result = await cleanupPendingAttachments(db, storage);
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} finally {
  await pool.end();
  destroyAttachmentStorage(storage);
}
