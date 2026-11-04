import { applyMigrations, connectDatabase } from "./client.js";

const databaseUrl = process.env.DATABASE_URL ?? "./data/expense-book.sqlite";
const { pool } = connectDatabase(databaseUrl);
try {
  await applyMigrations(pool);
} finally {
  await pool.end();
}
