import { createApp } from "./app.js";
import { createAuthenticator } from "./auth.js";
import { applyMigrations, connectDatabase } from "./db/client.js";
import { createInvitationDelivery } from "./services/invitation-delivery.js";
import { createAttachmentStorage } from "./services/attachments.js";

const databaseUrl = process.env.DATABASE_URL ?? "./data/expense-book.sqlite";
const { db, pool } = connectDatabase(databaseUrl);
await applyMigrations(pool);
const authenticate = createAuthenticator(process.env, { db });
const app = await createApp(db, authenticate, {
  invitations: createInvitationDelivery(process.env),
  attachments: createAttachmentStorage(process.env),
});
app.addHook("onClose", async () => {
  await pool.end();
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "127.0.0.1",
});
