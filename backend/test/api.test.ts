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
let db: Database;
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
      return { subject, verifiedEmail: async () => `${subject}@example.test` };
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
  it("exposes liveness and database readiness probes", async () => {
    expect((await app.inject({ url: "/health" })).json()).toEqual({
      status: "ok",
    });
    expect((await app.inject({ url: "/ready" })).json()).toEqual({
      status: "ready",
    });
  });
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
  it("reports totals across the complete filtered result", async () => {
    const response = await app.inject({
      url: `${groupPath()}/reports?page=1&pageSize=1`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      count: 1,
      pageCount: 1,
      totalPages: 1,
      totals: { income: "100000" },
    });
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

it("attention queues paginate, exclude reversed and attached expenses, and enforce group access", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers,
    payload: {
      name: "Review queue",
      currency: "USD",
      members: ["Alex", "Jordan"],
    },
  });
  const id = created.json().id;
  const reviewMembers = (
    await app.inject({ url: `/api/groups/${id}`, headers })
  ).json().members as { id: string }[];
  const reviewMemberIds = reviewMembers.map((member) => member.id);
  const rows: { id: string }[] = [];
  for (let index = 0; index < 23; index += 1) {
    const kind = index === 22 ? "income" : "expense";
    const input = {
      kind,
      description: `Review ${index}`,
      date: "2026-09-08",
      expression: "1",
      cash: [{ memberId: reviewMemberIds[0]!, amount: "100" }],
      split: { method: "equal" as const, members: reviewMemberIds },
      ...(index === 21 ? { category: "Food" } : {}),
    };
    const preview = await app.inject({
      method: "POST",
      url: `/api/groups/${id}/preview`,
      headers,
      payload: { action: "post", input },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const posted = await app.inject({
      method: "POST",
      url: `/api/groups/${id}/entries`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: {
        command: { action: "post", input },
        previewId: preview.json().previewId,
      },
    });
    expect(posted.statusCode, posted.body).toBe(201);
    rows.push({ id: posted.json().entryIds[0] });
  }
  const reversal = {
    action: "reverse" as const,
    entryId: rows[0]!.id,
    reason: "Reversed fixture",
    date: "2026-09-08",
  };
  const reversalPreview = await app.inject({
    method: "POST",
    url: `/api/groups/${id}/preview`,
    headers,
    payload: reversal,
  });
  await app.inject({
    method: "POST",
    url: `/api/groups/${id}/entries`,
    headers: { ...headers, "idempotency-key": randomUUID() },
    payload: { command: reversal, previewId: reversalPreview.json().previewId },
  });
  await db.insert(schema.attachments).values({
    groupId: id,
    entryId: rows[1]!.id,
    objectKey: randomUUID(),
    fileName: "receipt.pdf",
    contentType: "application/pdf",
    size: 100,
    createdBy: "alice",
  });
  const path = `/api/groups/${id}/attention`;
  const firstResponse = await app.inject({
    url: `${path}?reason=uncategorized`,
    headers,
  });
  expect(firstResponse.statusCode, firstResponse.body).toBe(200);
  const first = firstResponse.json();
  const secondResponse = await app.inject({
    url: `${path}?reason=uncategorized&page=2`,
    headers,
  });
  expect(secondResponse.statusCode, secondResponse.body).toBe(200);
  const second = secondResponse.json();
  expect(first.records).toHaveLength(20);
  expect(first.hasMore).toBe(true);
  expect(second.records).toHaveLength(1);
  expect(second.hasMore).toBe(false);
  const ids = [...first.records, ...second.records].map(
    (row: { id: string }) => row.id,
  );
  expect(new Set(ids).size).toBe(21);
  expect(ids).not.toContain(rows[0]!.id);
  expect(ids).not.toContain(rows[21]!.id);
  const missing = (
    await app.inject({ url: `${path}?reason=missing_attachment`, headers })
  ).json();
  expect(missing.records).toHaveLength(20);
  expect(missing.hasMore).toBe(false);
  expect(
    missing.records.every(
      (row: { kind: string; id: string }) =>
        row.kind === "expense" &&
        row.id !== rows[0]!.id &&
        row.id !== rows[1]!.id,
    ),
  ).toBe(true);
  expect(
    (
      await app.inject({
        url: `${path}?reason=uncategorized`,
        headers: { "x-test-subject": "mallory" },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (await app.inject({ url: `${path}?reason=unknown`, headers })).statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ url: `${path}?reason=uncategorized&page=0`, headers }))
      .statusCode,
  ).toBe(400);
});
