import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Database } from "../src/db/client.js";
import { createAuthenticator } from "../src/auth.js";
import * as schema from "../src/db/schema.js";

let app: Awaited<ReturnType<typeof createApp>>;
let closeDatabase: () => Promise<void>;
let groupId = "";
let memberIds: string[] = [];
let incomeId = "";
const headers = { "x-test-subject": "alice" };
const groupPath = () => `/api/groups/${groupId}`;
const incomeInput = () => ({
  kind: "income",
  description: "Club event",
  date: "2026-09-07",
  expression: "1000",
  cash: [{ memberId: memberIds[0], amount: "100000" }],
  split: { method: "equal", members: memberIds },
});

beforeAll(async () => {
  let db: Database;
  let execute: (sql: string) => Promise<unknown>;
  if (process.env.TEST_DATABASE_URL) {
    const connection = (await import("../src/db/client.js")).connectDatabase(
      process.env.TEST_DATABASE_URL,
    );
    db = connection.db;
    execute = (sql) => connection.pool.query(sql);
    closeDatabase = () => connection.pool.end();
  } else {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    execute = (sql) => client.exec(sql);
    closeDatabase = () => client.close();
  }
  const migrationDir = new URL("../drizzle/", import.meta.url);
  for (const file of (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
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
    const detail = (await app.inject({ url: groupPath(), headers })).json();
    memberIds = detail.members.map((m: { id: string }) => m.id);
    expect(
      detail.members.every(
        (m: { outstanding: string }) => m.outstanding === "0",
      ),
    ).toBe(true);
  });
  it("isolates groups from other users", async () =>
    expect(
      (
        await app.inject({
          url: groupPath(),
          headers: { "x-test-subject": "mallory" },
        })
      ).statusCode,
    ).toBe(404));
  it("requires the exact preview and posts idempotently", async () => {
    const command = { action: "post", input: incomeInput() };
    const preview = await app.inject({
      method: "POST",
      url: `${groupPath()}/preview`,
      headers,
      payload: command,
    });
    expect(preview.statusCode).toBe(200);
    const previewId = preview.json().previewId;
    expect(
      (await app.inject({ url: groupPath(), headers })).json().entries,
    ).toHaveLength(0);
    const writeHeaders = { ...headers, "idempotency-key": randomUUID() };
    const first = await app.inject({
      method: "POST",
      url: `${groupPath()}/entries`,
      headers: writeHeaders,
      payload: { command, previewId },
    });
    expect(first.statusCode).toBe(201);
    incomeId = first.json().entryIds[0];
    const retry = await app.inject({
      method: "POST",
      url: `${groupPath()}/entries`,
      headers: writeHeaders,
      payload: { command, previewId },
    });
    expect(retry.json().entryIds).toEqual([incomeId]);
    const changed = await app.inject({
      method: "POST",
      url: `${groupPath()}/entries`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: {
        command: {
          ...command,
          input: { ...incomeInput(), description: "Changed" },
        },
        previewId,
      },
    });
    expect(changed.statusCode).toBe(409);
  });
  it("invalidates an old preview after another write", async () => {
    const command = {
      action: "post",
      input: { ...incomeInput(), description: "Second" },
    };
    const preview = await app.inject({
      method: "POST",
      url: `${groupPath()}/preview`,
      headers,
      payload: command,
    });
    const other = {
      action: "post",
      input: { ...incomeInput(), description: "Third" },
    };
    const otherPreview = await app.inject({
      method: "POST",
      url: `${groupPath()}/preview`,
      headers,
      payload: other,
    });
    await app.inject({
      method: "POST",
      url: `${groupPath()}/entries`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { command: other, previewId: otherPreview.json().previewId },
    });
    const stale = await app.inject({
      method: "POST",
      url: `${groupPath()}/entries`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { command, previewId: preview.json().previewId },
    });
    expect(stale.statusCode).toBe(409);
  });
  it("supports drafts with optimistic revision checks", async () => {
    const draftInput = { ...incomeInput(), description: "Draft event" };
    const create = await app.inject({
      method: "POST",
      url: `${groupPath()}/drafts`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { action: "create", input: draftInput },
    });
    expect(create.statusCode).toBe(201);
    const draft = create.json();
    const stale = await app.inject({
      method: "POST",
      url: `${groupPath()}/drafts`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: {
        action: "update",
        draftId: draft.id,
        version: 99,
        input: draftInput,
      },
    });
    expect(stale.statusCode).toBe(409);
    const command = {
      action: "postDraft",
      draftId: draft.id,
      version: draft.version,
    };
    const preview = await app.inject({
      method: "POST",
      url: `${groupPath()}/preview`,
      headers,
      payload: command,
    });
    const posted = await app.inject({
      method: "POST",
      url: `${groupPath()}/entries`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { command, previewId: preview.json().previewId },
    });
    expect(posted.statusCode).toBe(201);
    expect(
      (
        await app.inject({ url: `${groupPath()}/drafts/${draft.id}`, headers })
      ).json().state,
    ).toBe("posted");
  });
  it("supports linked refunds and blocks corrections until refunds are resolved", async () => {
    const refund = {
      action: "refund",
      entryId: incomeId,
      input: {
        description: "Refund",
        date: "2026-09-08",
        expression: "250",
        cash: [{ memberId: memberIds[0], amount: "25000" }],
      },
    };
    const refundPreview = await app.inject({
      method: "POST",
      url: `${groupPath()}/preview`,
      headers,
      payload: refund,
    });
    const refundPost = await app.inject({
      method: "POST",
      url: `${groupPath()}/entries`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { command: refund, previewId: refundPreview.json().previewId },
    });
    expect(refundPost.statusCode).toBe(201);
    const correction = {
      action: "correct",
      entryId: incomeId,
      reason: "Correct amount",
      replacement: {
        ...incomeInput(),
        expression: "900",
        cash: [{ memberId: memberIds[0], amount: "90000" }],
      },
    };
    const correctionPreview = await app.inject({
      method: "POST",
      url: `${groupPath()}/preview`,
      headers,
      payload: correction,
    });
    expect(correctionPreview.statusCode).toBe(409);
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
