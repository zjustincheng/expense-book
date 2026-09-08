import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectDatabase, type Database } from "../src/db/client.js";
import { createAuthenticator } from "../src/auth.js";
import * as schema from "../src/db/schema.js";

let app: Awaited<ReturnType<typeof createApp>>;
let closeDatabase: () => Promise<void>;
let groupId: string;
let memberIds: string[];
let postedId: string;
const headers = { "x-test-subject": "alice" };
const path = () => `/api/groups/${groupId}`;
beforeAll(async () => {
  let db: Database;
  let execute: (sql: string) => Promise<unknown>;
  if (process.env.TEST_DATABASE_URL) {
    const connection = connectDatabase(process.env.TEST_DATABASE_URL);
    db = connection.db;
    execute = (sql) => connection.pool.query(sql);
    closeDatabase = () => connection.pool.end();
  } else {
    const client = new PGlite();
    // Both Drizzle adapters expose the same query API used by the service.
    db = drizzle(client, { schema }) as unknown as Database;
    execute = (sql) => client.exec(sql);
    closeDatabase = () => client.close();
  }
  const migrationDir = new URL("../drizzle/", import.meta.url);
  for (const file of (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await execute(await readFile(new URL(file, migrationDir), "utf8"));
  app = await createApp(
    db,
    async (request) => {
      const subject = request.headers["x-test-subject"];
      if (typeof subject !== "string")
        throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      return subject;
    },
    { logging: false },
  );
  await app.ready();
}, 30_000);
afterAll(async () => {
  await app?.close();
  await closeDatabase?.();
});
describe("authenticated financial API", () => {
  it("requires an identity", async () =>
    expect((await app.inject({ url: "/api/groups" })).statusCode).toBe(401));
  it("creates a zero-balance group", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers,
      payload: {
        name: "Income club",
        currency: "USD",
        members: ["Alice", "Bob"],
      },
    });
    expect(response.statusCode).toBe(201);
    groupId = response.json().id;
    const detail = (await app.inject({ url: path(), headers })).json();
    memberIds = detail.members.map((m: { id: string }) => m.id);
    expect(
      detail.members.every(
        (m: { outstanding: string }) => m.outstanding === "0",
      ),
    ).toBe(true);
    expect(detail.totals).toEqual({
      income: "0",
      expenses: "0",
      unsettled: "0",
    });
  });
  it("hides groups from other users", async () => {
    expect(
      (
        await app.inject({
          url: path(),
          headers: { "x-test-subject": "mallory" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: "/api/groups",
          headers: { "x-test-subject": "mallory" },
        })
      ).json(),
    ).toEqual([]);
  });
  const payload = () => ({
    kind: "income",
    description: "Club event",
    date: "2026-09-07",
    expression: "1000",
    cash: [{ memberId: memberIds[0], amount: "100000" }],
    split: { method: "equal", members: memberIds },
  });
  it("previews without writing and posts a retry only once", async () => {
    const preview = await app.inject({
      method: "POST",
      url: `${path()}/preview`,
      headers,
      payload: payload(),
    });
    expect(preview.statusCode).toBe(200);
    expect(
      (await app.inject({ url: path(), headers })).json().entries,
    ).toHaveLength(0);
    const writeHeaders = { ...headers, "idempotency-key": randomUUID() };
    const first = await app.inject({
      method: "POST",
      url: `${path()}/entries`,
      headers: writeHeaders,
      payload: payload(),
    });
    expect(first.statusCode).toBe(201);
    postedId = first.json().id;
    const retry = await app.inject({
      method: "POST",
      url: `${path()}/entries`,
      headers: writeHeaders,
      payload: payload(),
    });
    expect(retry.json().id).toBe(postedId);
    expect(
      (await app.inject({ url: path(), headers })).json().entries,
    ).toHaveLength(1);
    const conflict = await app.inject({
      method: "POST",
      url: `${path()}/entries`,
      headers: writeHeaders,
      payload: { ...payload(), description: "Changed" },
    });
    expect(conflict.statusCode).toBe(409);
  });
  it("rejects another group's member without partial posting", async () => {
    const invalid = {
      ...payload(),
      cash: [{ memberId: randomUUID(), amount: "100000" }],
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${path()}/entries`,
          headers: { ...headers, "idempotency-key": randomUUID() },
          payload: invalid,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ url: path(), headers })).json().entries,
    ).toHaveLength(1);
  });
  it("records a partial settlement without changing income", async () => {
    const response = await app.inject({
      method: "POST",
      url: `${path()}/entries`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: {
        kind: "settlement",
        description: "Payment received",
        date: "2026-09-07",
        expression: "250",
        fromMemberId: memberIds[0],
        toMemberId: memberIds[1],
      },
    });
    expect(response.statusCode).toBe(201);
    const detail = (await app.inject({ url: path(), headers })).json();
    expect(detail.totals).toEqual({
      income: "100000",
      expenses: "0",
      unsettled: "25000",
    });
  });
  it("reverses with audit history and preserves overpayment", async () => {
    const response = await app.inject({
      method: "POST",
      url: `${path()}/entries/${postedId}/reverse`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { reason: "Income entered in error", date: "2026-09-07" },
    });
    expect(response.statusCode).toBe(201);
    const detail = (await app.inject({ url: path(), headers })).json();
    expect(detail.totals.income).toBe("0");
    expect(detail.totals.unsettled).toBe("25000");
    expect(detail.entries).toHaveLength(3);
    const duplicate = await app.inject({
      method: "POST",
      url: `${path()}/entries/${postedId}/reverse`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { reason: "Again", date: "2026-09-07" },
    });
    expect(duplicate.statusCode).toBe(409);
  });
});
it("refuses development authentication in production or on public interfaces", () => {
  expect(() =>
    createAuthenticator({ AUTH_MODE: "development", NODE_ENV: "production" }),
  ).toThrow();
  expect(() =>
    createAuthenticator({ AUTH_MODE: "development", HOST: "0.0.0.0" }),
  ).toThrow();
  expect(() => createAuthenticator({})).toThrow();
});
