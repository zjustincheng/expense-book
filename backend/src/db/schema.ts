import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import type { EntryInput } from "../domain/ledger.js";
import type { RefundInput } from "../domain/lifecycle.js";
import type { HistoricalReport } from "../services/historical-report.js";

const sqliteUuidDefault = sql`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`;

function uuid() {
  return text();
}
function uuidPrimaryKey() {
  return text()
    .primaryKey()
    .default(sqliteUuidDefault)
    .$defaultFn(() => randomUUID());
}
function date() {
  return text();
}
function timestamp() {
  return integer({ mode: "timestamp_ms" });
}
function timestampNow() {
  return integer({ mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`)
    .$defaultFn(() => new Date());
}
function jsonb<T>() {
  return text({ mode: "json" }).$type<T>();
}
const bigint = customType<{
  data: bigint;
  driverData: number | bigint | string;
}>({
  dataType() {
    return "integer";
  },
  fromDriver(value) {
    return BigInt(value);
  },
  toDriver(value) {
    return value;
  },
});

export const users = sqliteTable("users", {
  id: uuidPrimaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text().notNull(),
  createdAt: timestampNow(),
});

export const userSessions = sqliteTable(
  "user_sessions",
  {
    id: uuidPrimaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp().notNull(),
    createdAt: timestampNow(),
  },
  (t) => [
    index("user_sessions_user").on(t.userId),
    index("user_sessions_expiry").on(t.expiresAt),
  ],
);

export const groups = sqliteTable(
  "groups",
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    currency: text().notNull(),
    defaultSplitMethod: text().notNull().default("equal"),
    managementVersion: integer().notNull().default(0),
    ledgerVersion: bigint()
      .notNull()
      .default(sql`0`)
      .$defaultFn(() => 0n),
    openingBalance: bigint()
      .notNull()
      .default(sql`0`)
      .$defaultFn(() => 0n),
    openingBalanceDate: date(),
    createdAt: timestampNow(),
  },
  (t) => [
    check(
      "supported_currency",
      sql`${t.currency} in ('USD', 'EUR', 'GBP', 'CAD', 'AUD')`,
    ),
    check(
      "default_split_method",
      sql`${t.defaultSplitMethod} in ('equal','weights','percentages','exact')`,
    ),
  ],
);

export const historicalReports = sqliteTable(
  "historical_reports",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    title: text().notNull(),
    fileName: text().notNull(),
    source: text().notNull(),
    sourceHash: text().notNull(),
    currency: text().notNull(),
    report: jsonb<HistoricalReport>().notNull(),
    createdBy: text().notNull(),
    createdAt: timestampNow(),
  },
  (t) => [
    unique("historical_report_source").on(t.groupId, t.sourceHash),
    index("historical_reports_group").on(t.groupId, t.createdAt),
  ],
);

export const access = sqliteTable(
  "group_access",
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    subject: text().notNull(),
    role: text().notNull(),
    email: text(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.subject] }),
    check("valid_role", sql`${t.role} in ('admin','editor','viewer')`),
  ],
);

export const userPreferences = sqliteTable("user_preferences", {
  subject: text().primaryKey(),
  notifications: jsonb<Record<string, boolean>>().notNull(),
  updatedAt: timestampNow(),
});

export const members = sqliteTable(
  "members",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    archivedAt: timestamp(),
    linkedSubject: text(),
  },
  (t) => [
    unique("member_group_id").on(t.groupId, t.id),
    unique("member_linked_account").on(t.groupId, t.linkedSubject),
    foreignKey({
      columns: [t.groupId, t.linkedSubject],
      foreignColumns: [access.groupId, access.subject],
    }),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    archivedAt: timestamp(),
    createdAt: timestampNow(),
  },
  (t) => [
    unique("project_group_id").on(t.groupId, t.id),
    unique("project_group_name").on(t.groupId, t.name),
    index("projects_group").on(t.groupId, t.archivedAt),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    archivedAt: timestamp(),
    createdAt: timestampNow(),
  },
  (t) => [
    unique("category_group_id").on(t.groupId, t.id),
    unique("category_group_name").on(t.groupId, t.name),
    index("categories_group").on(t.groupId, t.archivedAt),
  ],
);

export const splitTemplates = sqliteTable(
  "split_templates",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    method: text().notNull(),
    shares: jsonb<unknown>().notNull(),
    archivedAt: timestamp(),
    createdAt: timestampNow(),
  },
  (t) => [
    unique("split_template_group_id").on(t.groupId, t.id),
    unique("split_template_group_name").on(t.groupId, t.name),
    index("split_templates_group").on(t.groupId, t.archivedAt),
    check(
      "split_template_method",
      sql`${t.method} in ('equal','weights','percentages','exact')`,
    ),
  ],
);

export const recurringTransactions = sqliteTable(
  "recurring_transactions",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    input: jsonb<EntryInput>().notNull(),
    frequency: text().notNull(),
    nextRun: date().notNull(),
    anchorDay: integer(),
    active: integer().notNull().default(1),
    createdBy: text().notNull(),
    createdAt: timestampNow(),
    updatedAt: timestampNow(),
  },
  (t) => [
    unique("recurring_group_id").on(t.groupId, t.id),
    index("recurring_group_next_run").on(t.groupId, t.active, t.nextRun),
    check(
      "recurring_frequency",
      sql`${t.frequency} in ('weekly','monthly','quarterly','yearly')`,
    ),
    check("recurring_active", sql`${t.active} in (0, 1)`),
  ],
);

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    createdBy: text().notNull(),
    rowCount: integer().notNull(),
    requestHash: text(),
    createdAt: timestampNow(),
  },
  (t) => [index("import_batches_group_created").on(t.groupId, t.createdAt)],
);

export const notificationDismissals = sqliteTable(
  "notification_dismissals",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    subject: text().notNull(),
    notificationType: text().notNull(),
    notificationId: uuid().notNull(),
    dismissedAt: timestampNow(),
  },
  (t) => [
    unique("notification_dismissal_key").on(
      t.groupId,
      t.subject,
      t.notificationType,
      t.notificationId,
    ),
  ],
);

// Append-only journal. The input snapshot preserves the split rule and expression.
export const entries = sqliteTable(
  "entries",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    kind: text().notNull(),
    description: text().notNull(),
    date: date().notNull(),
    amount: bigint().notNull(),
    input: jsonb<
      EntryInput | RefundInput | { reverses: string; reason?: string }
    >().notNull(),
    actor: text().notNull(),
    idempotencyKey: uuid().notNull(),
    requestHash: text().notNull(),
    reverses: uuid(),
    refundOf: uuid(),
    corrects: uuid(),
    correctionReason: text(),
    createdAt: timestampNow(),
  },
  (t) => [
    unique("entry_group_id").on(t.groupId, t.id),
    unique("entry_request").on(t.groupId, t.idempotencyKey),
    unique("one_reversal").on(t.reverses),
    foreignKey({
      columns: [t.groupId, t.reverses],
      foreignColumns: [t.groupId, t.id],
    }),
    foreignKey({
      columns: [t.groupId, t.refundOf],
      foreignColumns: [t.groupId, t.id],
    }),
    foreignKey({
      columns: [t.groupId, t.corrects],
      foreignColumns: [t.groupId, t.id],
    }),
    unique("one_correction").on(t.corrects),
    index("entries_refund_of").on(t.refundOf),
    index("entries_group_date").on(t.groupId, t.date),
    check("positive_amount", sql`${t.amount} > 0`),
    check(
      "entry_kind",
      sql`${t.kind} in ('income','expense','obligation','transfer','settlement','adjustment','reversal','refund')`,
    ),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    entryId: uuid().notNull(),
    objectKey: text().notNull().unique(),
    uploadState: text().notNull().default("ready"),
    fileName: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    createdBy: text().notNull(),
    createdAt: timestampNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.groupId, t.entryId],
      foreignColumns: [entries.groupId, entries.id],
    }),
    index("attachments_entry").on(t.groupId, t.entryId),
  ],
);

export const effects = sqliteTable(
  "entry_effects",
  {
    groupId: uuid().notNull(),
    entryId: uuid().notNull(),
    memberId: uuid().notNull(),
    allocatedIncome: bigint().notNull(),
    allocatedExpense: bigint().notNull(),
    activityCash: bigint().notNull(),
    transferCash: bigint().notNull(),
    settlementCash: bigint().notNull(),
    obligation: bigint().notNull(),
    correction: bigint().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.memberId] }),
    foreignKey({
      columns: [t.groupId, t.entryId],
      foreignColumns: [entries.groupId, entries.id],
    }),
    foreignKey({
      columns: [t.groupId, t.memberId],
      foreignColumns: [members.groupId, members.id],
    }),
    index("effects_group_member").on(t.groupId, t.memberId),
  ],
);

// Drafts never have journal effects. Every edit preserves an audit revision.
export const drafts = sqliteTable(
  "drafts",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    input: jsonb<EntryInput>().notNull(),
    version: integer().notNull().default(1),
    state: text().notNull().default("draft"),
    postedEntryId: uuid(),
    createdBy: text().notNull(),
    updatedBy: text().notNull(),
    createdAt: timestampNow(),
    updatedAt: timestampNow(),
  },
  (t) => [
    unique("draft_group_id").on(t.groupId, t.id),
    index("drafts_group_state").on(t.groupId, t.state),
    check("draft_state", sql`${t.state} in ('draft','posted','discarded')`),
    check("draft_version", sql`${t.version} > 0`),
    check(
      "draft_posted_link",
      sql`(${t.state} = 'posted') = (${t.postedEntryId} is not null)`,
    ),
    foreignKey({
      columns: [t.groupId, t.postedEntryId],
      foreignColumns: [entries.groupId, entries.id],
    }),
  ],
);

export const draftRevisions = sqliteTable(
  "draft_revisions",
  {
    groupId: uuid().notNull(),
    draftId: uuid().notNull(),
    version: integer().notNull(),
    input: jsonb<EntryInput>().notNull(),
    state: text().notNull(),
    actor: text().notNull(),
    createdAt: timestampNow(),
  },
  (t) => [
    primaryKey({ columns: [t.draftId, t.version] }),
    foreignKey({
      columns: [t.groupId, t.draftId],
      foreignColumns: [drafts.groupId, drafts.id],
    }),
  ],
);

export const previews = sqliteTable(
  "financial_previews",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    actor: text().notNull(),
    requestHash: text().notNull(),
    ledgerVersion: bigint().notNull(),
    expiresAt: timestamp().notNull(),
  },
  (t) => [
    index("previews_expiry").on(t.expiresAt),
    unique("preview_group_id").on(t.groupId, t.id),
  ],
);

export const financialRequests = sqliteTable(
  "financial_requests",
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    key: uuid().notNull(),
    actor: text().notNull(),
    requestHash: text().notNull(),
    entryIds: jsonb<string[]>().notNull(),
    createdAt: timestampNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.key] })],
);

export const draftRequests = sqliteTable(
  "draft_requests",
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    key: uuid().notNull(),
    actor: text().notNull(),
    requestHash: text().notNull(),
    result: jsonb<{ id: string; version: number; state: string }>().notNull(),
    createdAt: timestampNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.key] })],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: uuid().primaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    memberId: uuid().notNull(),
    email: text().notNull(),
    role: text().notNull(),
    state: text().notNull().default("pending"),
    createdBy: text().notNull(),
    acceptedBy: text(),
    createdAt: timestampNow(),
    expiresAt: timestamp().notNull(),
    delivery: text().notNull().default("link"),
  },
  (t) => [
    foreignKey({
      columns: [t.groupId, t.memberId],
      foreignColumns: [members.groupId, members.id],
    }),
    index("invitations_group").on(t.groupId, t.createdAt),
    check("invitation_role", sql`${t.role} in ('admin','editor','viewer')`),
    check(
      "invitation_state",
      sql`${t.state} in ('pending','accepted','revoked')`,
    ),
    check(
      "invitation_delivery",
      sql`${t.delivery} in ('link','sending','sent','failed')`,
    ),
  ],
);

export const managementEvents = sqliteTable(
  "management_events",
  {
    id: uuidPrimaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    actor: text().notNull(),
    action: text().notNull(),
    details: jsonb<Record<string, unknown>>().notNull(),
    createdAt: timestampNow(),
  },
  (t) => [index("management_events_group").on(t.groupId, t.createdAt)],
);

export const managementRequests = sqliteTable(
  "management_requests",
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    key: uuid().notNull(),
    actor: text().notNull(),
    requestHash: text().notNull(),
    result: jsonb<{ id?: string }>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.key] })],
);
