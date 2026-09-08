import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Database } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";

/** Each suite owns an isolated schema in CI, or its own embedded database locally. */
export async function testDatabase() {
  let db: Database;
  let execute: (statement: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const namespace = `test_${randomUUID().replaceAll("-", "")}`;
  if (process.env.TEST_DATABASE_URL) {
    const admin = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 1,
    });
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${namespace},public`,
      max: 5,
    });
    db = postgresDrizzle(pool, { schema });
    execute = (statement) =>
      pool.query(statement.replaceAll('"public".', `"${namespace}".`));
    close = async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA "${namespace}" CASCADE`);
      await admin.end();
    };
  } else {
    const client = new PGlite();
    db = pgliteDrizzle(client, { schema }) as unknown as Database;
    execute = (statement) => client.exec(statement);
    close = () => client.close();
  }
  try {
    const directory = new URL("../drizzle/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort())
      await execute(await readFile(new URL(file, directory), "utf8"));
    return { db, close };
  } catch (error) {
    await close();
    throw error;
  }
}
