import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { EntryInput } from "../domain/ledger.js";

export const groups = pgTable(
  "groups",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    currency: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "supported_currency",
      sql`${t.currency} in ('USD', 'EUR', 'GBP', 'CAD', 'AUD')`,
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
  },
  (t) => [unique("member_group_id").on(t.groupId, t.id)],
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
    input: jsonb().$type<EntryInput | { reverses: string }>().notNull(),
    actor: text().notNull(),
    idempotencyKey: uuid().notNull(),
    requestHash: text().notNull(),
    reverses: uuid(),
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
    index("entries_group_date").on(t.groupId, t.date),
    check("positive_amount", sql`${t.amount} > 0`),
    check(
      "entry_kind",
      sql`${t.kind} in ('income','expense','obligation','transfer','settlement','adjustment','reversal')`,
    ),
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
