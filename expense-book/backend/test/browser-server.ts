/** Isolated browser-test fixture. Never used by the production server. */
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createApp } from "../src/app.js";
import type { Database } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
const client = new PGlite();
const migrations = new URL("../drizzle/", import.meta.url);
for (const file of (await readdir(migrations))
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  await client.exec(await readFile(new URL(file, migrations), "utf8"));
}
const app = await createApp(
  drizzle(client, { schema }) as unknown as Database,
  async () => "browser-test-user",
  { logging: false },
);
app.addHook("onClose", async () => client.close());
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ host: "127.0.0.1", port: 4001 });
