import { expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { testDatabase } from "./test-database.js";

it("persists frequency anchors, dates catch-up drafts, rejects stale requests and skips without drafts", async () => {
  const database = await testDatabase();
  const app = await createApp(
    database.db,
    async () => ({
      subject: "alice",
      verifiedEmail: async () => "alice@example.test",
    }),
    { logging: false },
  );
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/groups",
      payload: {
        name: "Schedule checks",
        currency: "USD",
        members: ["Alice", "Bob"],
      },
    });
    const groupId = created.json().id;
    const group = (await app.inject({ url: `/api/groups/${groupId}` })).json();
    const ids = group.members.map((member: { id: string }) => member.id);
    const base = `/api/groups/${groupId}/recurring`;
    const recurring = await app.inject({
      method: "POST",
      url: base,
      payload: {
        name: "Rent",
        frequency: "weekly",
        nextRun: "2026-01-31",
        input: {
          kind: "expense",
          description: "Rent",
          date: "2026-01-01",
          expression: "100",
          cash: [{ memberId: ids[0], amount: "10000" }],
          split: { method: "equal", members: ids },
        },
      },
    });
    expect(recurring.statusCode).toBe(201);
    const path = `${base}/${recurring.json().id}`;
    const changed = await app.inject({
      method: "PATCH",
      url: path,
      payload: { frequency: "monthly" },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().anchorDay).toBe(31);
    const next = await app.inject({
      method: "POST",
      url: `${path}/generate`,
      payload: {
        expectedNextRun: "2026-01-31",
      },
    });
    expect(next.statusCode).toBe(201);
    expect(next.json().nextRun).toBe("2026-02-28");
    const renamed = await app.inject({
      method: "PATCH",
      url: path,
      payload: {
        name: "Monthly rent",
        frequency: "monthly",
        nextRun: "2026-02-28",
      },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().anchorDay).toBe(31);
    const stale = await app.inject({
      method: "POST",
      url: `${path}/generate`,
      payload: { expectedNextRun: "2026-01-31" },
    });
    expect(stale.statusCode).toBe(409);
    const today = new Date();
    const previousMonth = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
    )
      .toISOString()
      .slice(0, 10);
    const rescheduled = await app.inject({
      method: "PATCH",
      url: path,
      payload: { nextRun: previousMonth },
    });
    expect(rescheduled.statusCode, rescheduled.body).toBe(200);
    const caughtUp = await app.inject({
      method: "POST",
      url: `${path}/generate`,
      payload: { mode: "catchUp", expectedNextRun: previousMonth },
    });
    expect(caughtUp.statusCode).toBe(201);
    expect(caughtUp.json().count).toBe(2);
    expect(caughtUp.json().nextRun > today.toISOString().slice(0, 10)).toBe(
      true,
    );
    const drafts = (
      await app.inject({ url: `/api/groups/${groupId}/drafts` })
    ).json();
    expect(JSON.stringify(drafts)).toContain(previousMonth);
    await app.inject({
      method: "PATCH",
      url: path,
      payload: { nextRun: previousMonth },
    });
    const skipped = await app.inject({
      method: "POST",
      url: `${path}/generate`,
      payload: { mode: "skip" },
    });
    expect(skipped.statusCode).toBe(201);
    expect(skipped.json()).toMatchObject({ count: 0, skipped: 2 });
    expect(
      (await app.inject({ url: `/api/groups/${groupId}/drafts` })).json(),
    ).toEqual(drafts);
  } finally {
    await app.close();
    await database.close();
  }
}, 30_000);
