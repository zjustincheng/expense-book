import { applyMigrations, connectDatabase } from "./client.js";
import { resolveDatabaseConfig } from "./config.js";

const { driver, url } = resolveDatabaseConfig(process.env);
const { pool } = connectDatabase(url, driver);
try {
  await applyMigrations(pool, driver);
} finally {
  await pool.end();
}
