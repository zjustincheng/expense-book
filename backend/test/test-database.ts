import { applyMigrations, connectDatabase } from "../src/db/client.js";

/** Each suite owns an isolated SQLite database instance. */
export async function testDatabase() {
  const url = process.env.TEST_DATABASE_URL ?? ":memory:";
  const { db, pool } = connectDatabase(url);
  try {
    await applyMigrations(pool);
    return {
      db,
      close: () => pool.end(),
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
