import {
  applyMigrations,
  connectDatabase,
  connectPgliteDatabase,
} from "../src/db/client.js";
import { resolveDatabaseConfig } from "../src/db/config.js";

/** Each suite owns an isolated SQLite, PGlite, or PostgreSQL database instance. */
export async function testDatabase() {
  const overrideUrl = process.env.TEST_DATABASE_URL?.trim();
  const config = resolveDatabaseConfig({
    ...process.env,
    DATABASE_URL: overrideUrl ?? process.env.DATABASE_URL,
  });

  if (config.driver === "pglite") {
    const { db, pool } = await connectPgliteDatabase(
      overrideUrl || "memory://",
    );
    try {
      await applyMigrations(pool, "pglite");
      return { db, close: () => pool.end() };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  const url =
    config.driver === "postgres" ? config.url : (overrideUrl ?? ":memory:");
  const { db, pool, driver } = connectDatabase(url, config.driver);
  try {
    await applyMigrations(pool, driver);
    return {
      db,
      close: () => pool.end(),
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
