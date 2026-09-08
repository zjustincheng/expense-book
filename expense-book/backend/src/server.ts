import { createApp } from "./app.js";
import { createAuthenticator } from "./auth.js";
import { connectDatabase } from "./db/client.js";
import { createInvitationDelivery } from "./services/invitation-delivery.js";
import { createAttachmentStorage } from "./services/attachments.js";
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required. Copy backend/.env.example to backend/.env for local development.",
  );
const authenticate = createAuthenticator(process.env);
const { db, pool } = connectDatabase(process.env.DATABASE_URL);
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
