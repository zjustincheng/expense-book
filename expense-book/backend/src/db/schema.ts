import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { EntryInput } from "../domain/ledger.js";
import type { RefundInput } from "../domain/lifecycle.js";

export const groups = pgTable(
  "groups",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    currency: text().notNull(),
    defaultSplitMethod: text().notNull().default("equal"),
    managementVersion: integer().notNull().default(0),
    ledgerVersion: bigint({ mode: "bigint" })
      .notNull()
      .default(sql`0`),
    openingBalance: bigint({ mode: "bigint" })
      .notNull()
      .default(sql`0`),
    openingBalanceDate: date(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
export const access = pgTable(
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
export const members = pgTable(
  "members",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
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
export const projects = pgTable(
  "projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("project_group_id").on(t.groupId, t.id),
    unique("project_group_name").on(t.groupId, t.name),
    index("projects_group").on(t.groupId, t.archivedAt),
  ],
);
export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("category_group_id").on(t.groupId, t.id),
    unique("category_group_name").on(t.groupId, t.name),
    index("categories_group").on(t.groupId, t.archivedAt),
  ],
);
export const splitTemplates = pgTable(
  "split_templates",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    method: text().notNull(),
    shares: jsonb().$type<unknown>().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
export const recurringTransactions = pgTable(
  "recurring_transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    name: text().notNull(),
    input: jsonb().$type<EntryInput>().notNull(),
    frequency: text().notNull(),
    nextRun: date().notNull(),
    active: integer().notNull().default(1),
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    createdBy: text().notNull(),
    rowCount: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_batches_group_created").on(t.groupId, t.createdAt)],
);
// Append-only journal. The input snapshot preserves the split rule and expression.
export const entries = pgTable(
  "entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    kind: text().notNull(),
    description: text().notNull(),
    date: date().notNull(),
    amount: bigint({ mode: "bigint" }).notNull(),
    input: jsonb()
      .$type<EntryInput | RefundInput | { reverses: string; reason?: string }>()
      .notNull(),
    actor: text().notNull(),
    idempotencyKey: uuid().notNull(),
    requestHash: text().notNull(),
    reverses: uuid(),
    refundOf: uuid(),
    corrects: uuid(),
    correctionReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
export const attachments = pgTable(
  "attachments",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    entryId: uuid().notNull(),
    objectKey: text().notNull().unique(),
    fileName: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.groupId, t.entryId],
      foreignColumns: [entries.groupId, entries.id],
    }),
    index("attachments_entry").on(t.groupId, t.entryId),
  ],
);
export const effects = pgTable(
  "entry_effects",
  {
    groupId: uuid().notNull(),
    entryId: uuid().notNull(),
    memberId: uuid().notNull(),
    allocatedIncome: bigint({ mode: "bigint" }).notNull(),
    allocatedExpense: bigint({ mode: "bigint" }).notNull(),
    activityCash: bigint({ mode: "bigint" }).notNull(),
    transferCash: bigint({ mode: "bigint" }).notNull(),
    settlementCash: bigint({ mode: "bigint" }).notNull(),
    obligation: bigint({ mode: "bigint" }).notNull(),
    correction: bigint({ mode: "bigint" }).notNull(),
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
export const drafts = pgTable(
  "drafts",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    input: jsonb().$type<EntryInput>().notNull(),
    version: integer().notNull().default(1),
    state: text().notNull().default("draft"),
    postedEntryId: uuid(),
    createdBy: text().notNull(),
    updatedBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
export const draftRevisions = pgTable(
  "draft_revisions",
  {
    groupId: uuid().notNull(),
    draftId: uuid().notNull(),
    version: integer().notNull(),
    input: jsonb().$type<EntryInput>().notNull(),
    state: text().notNull(),
    actor: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.draftId, t.version] }),
    foreignKey({
      columns: [t.groupId, t.draftId],
      foreignColumns: [drafts.groupId, drafts.id],
    }),
  ],
);
export const previews = pgTable(
  "financial_previews",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    actor: text().notNull(),
    requestHash: text().notNull(),
    ledgerVersion: bigint({ mode: "bigint" }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index("previews_expiry").on(t.expiresAt),
    unique("preview_group_id").on(t.groupId, t.id),
  ],
);
export const financialRequests = pgTable(
  "financial_requests",
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    key: uuid().notNull(),
    actor: text().notNull(),
    requestHash: text().notNull(),
    entryIds: jsonb().$type<string[]>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.key] })],
);
export const draftRequests = pgTable(
  "draft_requests",
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    key: uuid().notNull(),
    actor: text().notNull(),
    requestHash: text().notNull(),
    result: jsonb()
      .$type<{ id: string; version: number; state: string }>()
      .notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.key] })],
);

export const invitations = pgTable(
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
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
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

export const managementEvents = pgTable(
  "management_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    actor: text().notNull(),
    action: text().notNull(),
    details: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("management_events_group").on(t.groupId, t.createdAt)],
);

export const managementRequests = pgTable(
  "management_requests",
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id),
    key: uuid().notNull(),
    actor: text().notNull(),
    requestHash: text().notNull(),
    result: jsonb().$type<{ id?: string }>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.key] })],
);
