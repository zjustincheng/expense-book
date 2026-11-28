import { createApp } from "./app.js";
import { createAuthenticator } from "./auth.js";
import { applyMigrations, connectDatabase } from "./db/client.js";
import { resolveDatabaseConfig } from "./db/config.js";
import { createInvitationDelivery } from "./services/invitation-delivery.js";
import { createAttachmentStorage } from "./services/attachments.js";

const { driver, url } = resolveDatabaseConfig(process.env);
const { db, pool } = connectDatabase(url, driver);
await applyMigrations(pool, driver);
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
