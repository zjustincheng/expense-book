import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { is, SQL, type SQLWrapper } from "drizzle-orm";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import {
  drizzle as sqliteDrizzle,
  type SqliteRemoteDatabase,
} from "drizzle-orm/sqlite-proxy";
import pg from "pg";
import { resolveDriverFromUrl, type DatabaseDriver } from "./config.js";
import * as pgSchema from "./schema-pg.js";
import * as sqliteSchema from "./schema-sqlite.js";

export function resolveSqlitePath(url: string): string {
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed === ":memory:" ||
    trimmed.startsWith("file::memory:")
  ) {
    return ":memory:";
  }
  let filePath = trimmed;
  if (filePath.startsWith("sqlite://")) {
    filePath = filePath.slice("sqlite://".length);
  } else if (filePath.startsWith("sqlite:")) {
    filePath = filePath.slice("sqlite:".length);
  } else if (filePath.startsWith("file://")) {
    filePath = filePath.slice("file://".length);
  } else if (filePath.startsWith("file:")) {
    filePath = filePath.slice("file:".length);
  }
  const resolved = resolve(filePath);
  mkdirSync(dirname(resolved), { recursive: true });
  return resolved;
}

const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function normalizeCell(value: unknown): unknown {
  if (
    typeof value === "bigint" &&
    value >= MIN_SAFE_BIGINT &&
    value <= MAX_SAFE_BIGINT
  ) {
    return Number(value);
  }
  return value;
}

function validateDeferredLedgerInvariants(raw: DatabaseSync) {
  let hasEntriesTable: boolean;
  try {
    const check = raw
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'entries'",
      )
      .get();
    hasEntriesTable = Boolean(check);
  } catch {
    return;
  }
  if (!hasEntriesTable) return;

  const unbalanced = raw
    .prepare(
      `SELECT e.id, e.kind, e.amount, e."refundOf",
        count(ef."memberId") AS rows,
        coalesce(sum(ef."allocatedIncome"), 0) AS income,
        coalesce(sum(ef."allocatedExpense"), 0) AS expense,
        coalesce(sum(ef."activityCash"), 0) AS cash,
        coalesce(sum(ef."transferCash"), 0) AS transfers,
        coalesce(sum(ef."settlementCash"), 0) AS settlements,
        coalesce(sum(ef.obligation), 0) AS obligations,
        coalesce(sum(ef.correction), 0) AS corrections
      FROM entries e
      LEFT JOIN entry_effects ef ON ef."entryId" = e.id
      GROUP BY e.id
      HAVING rows = 0
        OR (income - expense - cash) <> 0
        OR transfers <> 0
        OR settlements <> 0
        OR obligations <> 0
        OR corrections <> 0
        OR (e.kind = 'income' AND (income <> e.amount OR expense <> 0))
        OR (e.kind = 'expense' AND (expense <> e.amount OR income <> 0))
        OR (e.kind IN ('transfer', 'settlement', 'obligation', 'adjustment')
            AND (income <> 0 OR expense <> 0 OR cash <> 0))`,
    )
    .get();
  if (unbalanced) {
    throw new Error("Entry must contain balanced financial effects");
  }
}

export type Database = SqliteRemoteDatabase<typeof sqliteSchema> & {
  execute: (query: SQLWrapper | string) => Promise<unknown>;
};

export type DatabasePool = {
  query: (
    sqlText: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

export type DatabaseConnection = {
  db: Database;
  pool: DatabasePool;
  driver: DatabaseDriver;
  raw?: DatabaseSync;
};

/** Applies row locking on PostgreSQL while acting as a no-op on serialized SQLite. */
export function withRowLock<T>(
  query: T,
  mode: "update" | "share" = "update",
): T {
  const lockable = query as { for?: (lockMode: "update" | "share") => T };
  return typeof lockable.for === "function" ? lockable.for(mode) : query;
}

function connectSqliteDatabase(url: string): DatabaseConnection {
  const path = resolveSqlitePath(url);
  const raw = new DatabaseSync(path);
  if (path !== ":memory:") {
    raw.exec("PRAGMA journal_mode = WAL;");
    raw.exec("PRAGMA synchronous = NORMAL;");
  }
  raw.exec("PRAGMA foreign_keys = ON;");
  raw.exec("PRAGMA busy_timeout = 5000;");

  let closed = false;
  const txContext = new AsyncLocalStorage<symbol>();
  let activeOwner: symbol | null = null;
  let activeBarrier: Promise<void> = Promise.resolve();
  let txQueue: Promise<void> = Promise.resolve();
  const dialect = new SQLiteAsyncDialect();

  async function waitIfLocked() {
    while (activeOwner !== null && txContext.getStore() !== activeOwner) {
      await activeBarrier;
    }
  }

  function executeRawStatement(
    sqlStr: string,
    params: unknown[],
    method: "run" | "all" | "values" | "get",
  ) {
    if (closed) throw new Error("Database connection is closed.");
    const trimmed = sqlStr.trim().toLowerCase();
    if (
      trimmed === "begin" ||
      trimmed.startsWith("begin ") ||
      trimmed === "commit" ||
      trimmed === "rollback" ||
      trimmed.startsWith("savepoint ") ||
      trimmed.startsWith("release savepoint ") ||
      trimmed.startsWith("rollback to savepoint ")
    ) {
      raw.exec(sqlStr);
      return { rows: [] };
    }
    const stmt = raw.prepare(sqlStr);
    const bindParams = params.map((p) =>
      p === undefined ? null : (p as SQLInputValue),
    );
    if (method === "run") {
      stmt.run(...bindParams);
      return { rows: [] };
    }
    stmt.setReturnArrays(true);
    stmt.setReadBigInts(true);
    const rawRows = stmt.all(...bindParams) as unknown as unknown[][];
    const rows = rawRows.map((row) => row.map(normalizeCell));
    return { rows: (method === "get" ? rows[0] : rows) as unknown[] };
  }

  const baseDb = sqliteDrizzle(
    async (sqlStr, params, method) => {
      await waitIfLocked();
      return executeRawStatement(sqlStr, params, method);
    },
    async (queries) => {
      await waitIfLocked();
      return queries.map((q) => executeRawStatement(q.sql, q.params, q.method));
    },
    { schema: sqliteSchema },
  );

  const originalTransaction = baseDb.transaction.bind(baseDb);

  const db = Object.assign(baseDb, {
    async execute(query: SQLWrapper | string) {
      await waitIfLocked();
      if (typeof query === "string") {
        raw.exec(query);
        return { rows: [] };
      }
      if (is(query, SQL)) {
        const built = dialect.sqlToQuery(query);
        if (built.params.length === 0) {
          raw.exec(built.sql);
          return { rows: [] };
        }
        return executeRawStatement(built.sql, built.params, "run");
      }
      return baseDb.run(query);
    },
    transaction: (async (
      transactionFn: Parameters<typeof originalTransaction>[0],
    ) => {
      if (
        txContext.getStore() !== undefined &&
        txContext.getStore() === activeOwner
      ) {
        return originalTransaction(transactionFn);
      }
      const owner = Symbol("sqlite-tx");
      const previous = txQueue;
      let releaseQueue!: () => void;
      txQueue = new Promise<void>((resolveQueue) => {
        releaseQueue = resolveQueue;
      });
      await previous;
      let releaseBarrier!: () => void;
      activeBarrier = new Promise<void>((resolveBarrier) => {
        releaseBarrier = resolveBarrier;
      });
      activeOwner = owner;
      try {
        return await txContext.run(owner, async () => {
          return originalTransaction(async (tx) => {
            const txWithExecute = Object.assign(tx, {
              execute: db.execute,
            });
            const result = await transactionFn(txWithExecute);
            validateDeferredLedgerInvariants(raw);
            return result;
          });
        });
      } finally {
        activeOwner = null;
        releaseBarrier();
        releaseQueue();
      }
    }) as typeof originalTransaction,
  });

  const pool: DatabasePool = {
    async query(sqlText: string, params?: unknown[]) {
      await waitIfLocked();
      if (closed) throw new Error("Database connection is closed.");
      if (params && params.length > 0) {
        const bindParams = params.map((p) =>
          p === undefined ? null : (p as SQLInputValue),
        );
        raw.prepare(sqlText).run(...bindParams);
        return { rows: [] };
      }
      if (/^\s*select\b/i.test(sqlText)) {
        const rows = raw.prepare(sqlText).all() as Record<string, unknown>[];
        return { rows };
      }
      raw.exec(sqlText);
      return { rows: [] };
    },
    async end() {
      if (!closed) {
        closed = true;
        raw.close();
      }
    },
  };

  return { db, pool, driver: "sqlite", raw };
}

function connectPostgresDatabase(url: string): DatabaseConnection {
  const pgPool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
  const db = pgDrizzle(pgPool, { schema: pgSchema }) as unknown as Database;
  const pool: DatabasePool = {
    async query(sqlText: string, params?: unknown[]) {
      const result = params
        ? await pgPool.query(sqlText, params)
        : await pgPool.query(sqlText);
      return { rows: (result.rows ?? []) as Record<string, unknown>[] };
    },
    end: () => pgPool.end(),
  };
  return { db, pool, driver: "postgres" };
}

export function connectDatabase(
  url: string,
  driverOverride?: DatabaseDriver,
): DatabaseConnection {
  const driver = driverOverride ?? resolveDriverFromUrl(url);
  if (driver === "postgres") {
    return connectPostgresDatabase(url);
  }
  if (driver === "pglite") {
    throw new Error("Use connectPgliteDatabase() for the pglite driver.");
  }
  return connectSqliteDatabase(url);
}

export async function connectPgliteDatabase(
  url = "memory://",
): Promise<DatabaseConnection> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: pgliteDrizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(url);
  const db = pgliteDrizzle(client, {
    schema: pgSchema,
  }) as unknown as Database;
  const pool: DatabasePool = {
    async query(sqlText: string, params?: unknown[]) {
      if (params && params.length > 0) {
        const result = await client.query(sqlText, params);
        return { rows: (result.rows ?? []) as Record<string, unknown>[] };
      }
      if (/^\s*select\b/i.test(sqlText)) {
        const result = await client.query(sqlText);
        return { rows: (result.rows ?? []) as Record<string, unknown>[] };
      }
      await client.exec(sqlText);
      return { rows: [] };
    },
    end: () => client.close(),
  };
  return { db, pool, driver: "pglite" };
}

export async function applyMigrations(
  pool: DatabasePool,
  driver: DatabaseDriver = "sqlite",
  migrationsFolder?: URL,
) {
  const folder =
    migrationsFolder ??
    new URL(
      driver === "sqlite" ? "../../drizzle/" : "../../drizzle-pg/",
      import.meta.url,
    );
  const idColumn =
    driver === "sqlite"
      ? '"id" INTEGER PRIMARY KEY AUTOINCREMENT'
      : '"id" SERIAL PRIMARY KEY';
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      ${idColumn},
      "name" TEXT NOT NULL UNIQUE,
      "applied_at" BIGINT NOT NULL
    );
  `);
  const existing = await pool.query(
    'SELECT "name" FROM "__drizzle_migrations"',
  );
  const applied = new Set(
    existing.rows.map((row) => String(row.name ?? "")).filter(Boolean),
  );
  const files = (await readdir(folder))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const content = await readFile(new URL(file, folder), "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (error) {
        if (error instanceof Error && /already exists/i.test(error.message)) {
          continue;
        }
        throw error;
      }
    }
    const insertSql =
      driver === "sqlite"
        ? 'INSERT INTO "__drizzle_migrations" ("name", "applied_at") VALUES (?, ?)'
        : 'INSERT INTO "__drizzle_migrations" ("name", "applied_at") VALUES ($1, $2)';
    await pool.query(insertSql, [file, Date.now()]);
  }
}
