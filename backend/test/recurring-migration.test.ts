import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { groups, recurringTransactions } from "../src/db/schema.js";
import { testDatabase } from "./test-database.js";

it("backfills legacy anchors without replacing explicit anchors or weekly schedules", async () => {
  const database = await testDatabase();
  try {
    const [group] = await database.db
      .insert(groups)
      .values({ name: "Legacy", currency: "USD" })
      .returning();
    const schedules = [
      {
        name: "monthly",
        frequency: "monthly",
        nextRun: "2026-01-31",
        anchorDay: null,
      },
      {
        name: "quarterly",
        frequency: "quarterly",
        nextRun: "2026-11-30",
        anchorDay: null,
      },
      {
        name: "yearly",
        frequency: "yearly",
        nextRun: "2024-02-29",
        anchorDay: null,
      },
      {
        name: "explicit",
        frequency: "monthly",
        nextRun: "2026-02-28",
        anchorDay: 31,
      },
      {
        name: "weekly",
        frequency: "weekly",
        nextRun: "2026-01-31",
        anchorDay: null,
      },
    ];
    await database.db.insert(recurringTransactions).values(
      schedules.map((schedule) => ({
        ...schedule,
        groupId: group!.id,
        createdBy: "alice",
        input: {
          kind: "expense" as const,
          description: "Rent",
          date: "2026-01-31",
          expression: "100",
          cash: [],
          split: { method: "equal" as const, members: [] },
        },
      })),
    );
    const migration = await readFile(
      new URL(
        "../drizzle/0018_backfill_recurring_anchors.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await database.db.execute(sql.raw(migration));
    // Re-running a data backfill must preserve the same anchors.
    await database.db.execute(sql.raw(migration));
    const rows = await database.db.select().from(recurringTransactions);
    expect(
      Object.fromEntries(rows.map((row) => [row.name, row.anchorDay])),
    ).toEqual({
      monthly: 31,
      quarterly: 30,
      yearly: 29,
      explicit: 31,
      weekly: null,
    });
  } finally {
    await database.close();
  }
}, 30_000);
