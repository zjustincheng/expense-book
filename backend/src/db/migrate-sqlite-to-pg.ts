import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { applyMigrations, resolveSqlitePath } from "./client.js";

type ColumnSpec = {
  name: string;
  kind?: "timestamp" | "jsonb";
};

type TableSpec = {
  table: string;
  conflictTarget: string;
  columns: ColumnSpec[];
  sortEntries?: boolean;
};

const TABLES: TableSpec[] = [
  {
    table: "users",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "email" },
      { name: "name" },
      { name: "passwordHash" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "user_sessions",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "userId" },
      { name: "tokenHash" },
      { name: "expiresAt", kind: "timestamp" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "user_preferences",
    conflictTarget: '("subject")',
    columns: [
      { name: "subject" },
      { name: "notifications", kind: "jsonb" },
      { name: "updatedAt", kind: "timestamp" },
    ],
  },
  {
    table: "groups",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "name" },
      { name: "currency" },
      { name: "defaultSplitMethod" },
      { name: "managementVersion" },
      { name: "ledgerVersion" },
      { name: "openingBalance" },
      { name: "openingBalanceDate" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "group_access",
    conflictTarget: '("groupId", "subject")',
    columns: [
      { name: "groupId" },
      { name: "subject" },
      { name: "role" },
      { name: "email" },
    ],
  },
  {
    table: "members",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "name" },
      { name: "archivedAt", kind: "timestamp" },
      { name: "linkedSubject" },
    ],
  },
  {
    table: "projects",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "name" },
      { name: "archivedAt", kind: "timestamp" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "categories",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "name" },
      { name: "archivedAt", kind: "timestamp" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "split_templates",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "name" },
      { name: "method" },
      { name: "shares", kind: "jsonb" },
      { name: "archivedAt", kind: "timestamp" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "recurring_transactions",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "name" },
      { name: "input", kind: "jsonb" },
      { name: "frequency" },
      { name: "nextRun" },
      { name: "anchorDay" },
      { name: "active" },
      { name: "createdBy" },
      { name: "createdAt", kind: "timestamp" },
      { name: "updatedAt", kind: "timestamp" },
    ],
  },
  {
    table: "import_batches",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "createdBy" },
      { name: "rowCount" },
      { name: "requestHash" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "notification_dismissals",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "subject" },
      { name: "notificationType" },
      { name: "notificationId" },
      { name: "dismissedAt", kind: "timestamp" },
    ],
  },
  {
    table: "historical_reports",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "title" },
      { name: "fileName" },
      { name: "source" },
      { name: "sourceHash" },
      { name: "currency" },
      { name: "report", kind: "jsonb" },
      { name: "createdBy" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "entries",
    conflictTarget: '("id")',
    sortEntries: true,
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "kind" },
      { name: "description" },
      { name: "date" },
      { name: "amount" },
      { name: "input", kind: "jsonb" },
      { name: "actor" },
      { name: "idempotencyKey" },
      { name: "requestHash" },
      { name: "reverses" },
      { name: "refundOf" },
      { name: "corrects" },
      { name: "correctionReason" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "entry_effects",
    conflictTarget: '("entryId", "memberId")',
    columns: [
      { name: "groupId" },
      { name: "entryId" },
      { name: "memberId" },
      { name: "allocatedIncome" },
      { name: "allocatedExpense" },
      { name: "activityCash" },
      { name: "transferCash" },
      { name: "settlementCash" },
      { name: "obligation" },
      { name: "correction" },
    ],
  },
  {
    table: "attachments",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "entryId" },
      { name: "objectKey" },
      { name: "uploadState" },
      { name: "fileName" },
      { name: "contentType" },
      { name: "size" },
      { name: "createdBy" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "drafts",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "input", kind: "jsonb" },
      { name: "version" },
      { name: "state" },
      { name: "postedEntryId" },
      { name: "createdBy" },
      { name: "updatedBy" },
      { name: "createdAt", kind: "timestamp" },
      { name: "updatedAt", kind: "timestamp" },
    ],
  },
  {
    table: "draft_revisions",
    conflictTarget: '("draftId", "version")',
    columns: [
      { name: "groupId" },
      { name: "draftId" },
      { name: "version" },
      { name: "input", kind: "jsonb" },
      { name: "state" },
      { name: "actor" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "financial_previews",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "actor" },
      { name: "requestHash" },
      { name: "ledgerVersion" },
      { name: "expiresAt", kind: "timestamp" },
    ],
  },
  {
    table: "financial_requests",
    conflictTarget: '("groupId", "key")',
    columns: [
      { name: "groupId" },
      { name: "key" },
      { name: "actor" },
      { name: "requestHash" },
      { name: "entryIds", kind: "jsonb" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "draft_requests",
    conflictTarget: '("groupId", "key")',
    columns: [
      { name: "groupId" },
      { name: "key" },
      { name: "actor" },
      { name: "requestHash" },
      { name: "result", kind: "jsonb" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "invitations",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "memberId" },
      { name: "email" },
      { name: "role" },
      { name: "state" },
      { name: "createdBy" },
      { name: "acceptedBy" },
      { name: "createdAt", kind: "timestamp" },
      { name: "expiresAt", kind: "timestamp" },
      { name: "delivery" },
    ],
  },
  {
    table: "management_events",
    conflictTarget: '("id")',
    columns: [
      { name: "id" },
      { name: "groupId" },
      { name: "actor" },
      { name: "action" },
      { name: "details", kind: "jsonb" },
      { name: "createdAt", kind: "timestamp" },
    ],
  },
  {
    table: "management_requests",
    conflictTarget: '("groupId", "key")',
    columns: [
      { name: "groupId" },
      { name: "key" },
      { name: "actor" },
      { name: "requestHash" },
      { name: "result", kind: "jsonb" },
    ],
  },
];

function sortEntriesTopologically(rows: Record<string, unknown>[]) {
  const remaining = new Map(rows.map((row) => [String(row.id), row]));
  const inserted = new Set<string>();
  const ordered: Record<string, unknown>[] = [];
  while (remaining.size > 0) {
    let progressed = false;
    for (const [id, row] of remaining) {
      const deps = [row.reverses, row.refundOf, row.corrects].filter(
        (dep): dep is string => typeof dep === "string" && dep.length > 0,
      );
      if (deps.every((dep) => inserted.has(dep) || !remaining.has(dep))) {
        ordered.push(row);
        inserted.add(id);
        remaining.delete(id);
        progressed = true;
      }
    }
    if (!progressed) {
      ordered.push(...remaining.values());
      break;
    }
  }
  return ordered;
}

function convertValue(value: unknown, kind?: "timestamp" | "jsonb"): unknown {
  if (value === null || value === undefined) return null;
  if (kind === "timestamp") {
    return value instanceof Date ? value : new Date(Number(value));
  }
  if (kind === "jsonb") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return value;
}

async function main() {
  const sourcePath = resolveSqlitePath(
    process.env.SOURCE_SQLITE_PATH ?? "./data/expense-book.sqlite",
  );
  const targetUrl = (
    process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL
  )?.trim();
  if (!targetUrl || !/^postgres(?:ql)?:\/\//i.test(targetUrl)) {
    throw new Error(
      "TARGET_DATABASE_URL (or DATABASE_URL) must be a postgresql:// connection string.",
    );
  }

  const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
  const pgPool = new pg.Pool({
    connectionString: targetUrl,
    max: 4,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await applyMigrations(
      {
        query: async (sqlText, params) => {
          const result = params
            ? await pgPool.query(sqlText, params)
            : await pgPool.query(sqlText);
          return { rows: (result.rows ?? []) as Record<string, unknown>[] };
        },
        end: async () => undefined,
      },
      "postgres",
    );

    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        'ALTER TABLE "entries" DISABLE TRIGGER "journal_version"',
      );

      for (const spec of TABLES) {
        let rows = sqlite
          .prepare(`SELECT * FROM "${spec.table}"`)
          .all() as Record<string, unknown>[];
        if (spec.sortEntries) {
          rows = sortEntriesTopologically(rows);
        }

        if (rows.length > 0) {
          const columnNames = spec.columns.map((c) => `"${c.name}"`).join(", ");
          const placeholders = spec.columns
            .map((c, idx) =>
              c.kind === "jsonb" ? `$${idx + 1}::jsonb` : `$${idx + 1}`,
            )
            .join(", ");
          const insertSql = `INSERT INTO "${spec.table}" (${columnNames}) VALUES (${placeholders}) ON CONFLICT ${spec.conflictTarget} DO NOTHING`;

          for (const row of rows) {
            const values = spec.columns.map((c) =>
              convertValue(row[c.name], c.kind),
            );
            await client.query(insertSql, values);
          }
        }

        const countResult = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM "${spec.table}"`,
        );
        const targetCount = Number(countResult.rows[0]?.n ?? 0);
        if (targetCount < rows.length) {
          throw new Error(
            `Verification failed for ${spec.table}: source=${rows.length}, target=${targetCount}`,
          );
        }
        console.log(
          `${spec.table}: source=${rows.length}, target=${targetCount}`,
        );
      }

      await client.query(
        'ALTER TABLE "entries" ENABLE TRIGGER "journal_version"',
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    sqlite.close();
    await pgPool.end();
  }
}

await main();
