/** Isolated browser-test fixture. Never used by the production server. */
import { createApp } from "../src/app.js";
import { applyMigrations, connectDatabase } from "../src/db/client.js";

const { db, pool } = connectDatabase(":memory:");
await applyMigrations(pool);
const app = await createApp(
  db,
  async () => ({
    subject: "browser-test-user",
    verifiedEmail: async () => "developer@example.test",
  }),
  { logging: false, rateLimit: { max: 1000, timeWindow: "1 minute" } },
);
app.addHook("onClose", async () => pool.end());
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.TEST_API_PORT ?? 4001),
});
