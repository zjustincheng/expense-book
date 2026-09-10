import { randomUUID } from "node:crypto";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  expect,
  it,
  vi,
} from "vitest";
import { createApp } from "../src/app.js";
import { attachments } from "../src/db/schema.js";
import { testDatabase } from "./test-database.js";
import { cleanupPendingAttachments } from "../src/services/attachment-cleanup.js";

let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createApp>>;
let groupId: string;
let attachmentId: string;
let entryId: string;
const client = new S3Client({
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});
const send = vi.spyOn(client, "send");
beforeAll(async () => {
  database = await testDatabase();
}, 30_000);
afterAll(async () => {
  client.destroy();
  await database.close();
});
beforeEach(async () => {
  send.mockReset();
  send.mockResolvedValue(undefined);
  app = await createApp(
    database.db,
    async () => ({
      subject: "alice",
      verifiedEmail: async () => "alice@example.test",
    }),
    {
      logging: false,
      attachments: { bucket: "test-receipts", client },
    },
  );
  const created = await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: {
      name: "Receipt test",
      currency: "USD",
      members: ["Alice", "Bob"],
    },
  });
  groupId = created.json().id;
  const group = (await app.inject({ url: `/api/groups/${groupId}` })).json();
  const ids = group.members.map((member: { id: string }) => member.id);
  const command = {
    action: "post",
    input: {
      kind: "expense",
      description: "Rent",
      date: "2026-09-10",
      expression: "100",
      cash: [{ memberId: ids[0], amount: "10000" }],
      split: { method: "equal", members: ids },
    },
  };
  const preview = await app.inject({
    method: "POST",
    url: `/api/groups/${groupId}/preview`,
    payload: command,
  });
  expect(preview.statusCode).toBe(200);
  const posted = await app.inject({
    method: "POST",
    url: `/api/groups/${groupId}/entries`,
    headers: { "idempotency-key": randomUUID() },
    payload: { command, previewId: preview.json().previewId },
  });
  expect(posted.statusCode).toBe(201);
  entryId = posted.json().entryIds[0];
  const [attachment] = await database.db
    .insert(attachments)
    .values({
      groupId,
      entryId: posted.json().entryIds[0],
      objectKey: `groups/${groupId}/receipt.pdf`,
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      size: 100,
      createdBy: "alice",
    })
    .returning();
  attachmentId = attachment!.id;
});
afterEach(async () => {
  await app.close();
});
const remove = () =>
  app.inject({
    method: "DELETE",
    url: `/api/groups/${groupId}/attachments/${attachmentId}`,
  });
const saved = () =>
  database.db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId));

const complete = () =>
  app.inject({
    method: "POST",
    url: `/api/groups/${groupId}/attachments/${attachmentId}/complete`,
    payload: {},
  });

it("only publishes a pending upload after size and type verification, with safe retries", async () => {
  await database.db
    .update(attachments)
    .set({ uploadState: "pending" })
    .where(eq(attachments.id, attachmentId));
  expect(
    (
      await app.inject({
        url: `/api/groups/${groupId}/attachments/${attachmentId}/download`,
      })
    ).statusCode,
  ).toBe(409);
  send.mockImplementation(async () => ({
    ContentLength: 100,
    ContentType: "application/pdf",
  }));
  expect((await complete()).statusCode).toBe(200);
  expect((await saved())[0]?.uploadState).toBe("ready");
  send.mockClear();
  expect((await complete()).statusCode).toBe(200);
  expect(send).not.toHaveBeenCalled();
});

it.each(["NotFound", "SlowDown", "AccessDenied"])(
  "retains pending uploads when verification returns %s",
  async (name) => {
    await database.db
      .update(attachments)
      .set({ uploadState: "pending" })
      .where(eq(attachments.id, attachmentId));
    send.mockRejectedValue(Object.assign(new Error(name), { name }));
    expect((await complete()).statusCode).toBe(name === "NotFound" ? 409 : 503);
    expect((await saved())[0]?.uploadState).toBe("pending");
  },
);

it.each([
  { ContentLength: 101, ContentType: "application/pdf" },
  { ContentLength: 100, ContentType: "text/plain" },
])("rejects mismatched upload metadata", async (metadata) => {
  await database.db
    .update(attachments)
    .set({ uploadState: "pending" })
    .where(eq(attachments.id, attachmentId));
  send.mockImplementation(async () => metadata);
  expect((await complete()).statusCode).toBe(409);
  expect((await saved())[0]?.uploadState).toBe("pending");
});

it("cleans only expired pending uploads and retains references when storage deletion fails", async () => {
  const storage = { bucket: "test-receipts", client };
  expect(await cleanupPendingAttachments(database.db, storage)).toEqual({
    removed: 0,
    failed: 0,
  });
  await database.db
    .update(attachments)
    .set({ uploadState: "pending" })
    .where(eq(attachments.id, attachmentId));
  expect(await cleanupPendingAttachments(database.db, storage)).toEqual({
    removed: 0,
    failed: 0,
  });
  await database.db
    .update(attachments)
    .set({ createdAt: new Date(Date.now() - 48 * 3600_000) })
    .where(eq(attachments.id, attachmentId));
  send.mockRejectedValueOnce(new Error("Temporary outage"));
  expect(await cleanupPendingAttachments(database.db, storage)).toEqual({
    removed: 0,
    failed: 1,
  });
  expect(await saved()).toHaveLength(1);
  expect(await cleanupPendingAttachments(database.db, storage)).toEqual({
    removed: 1,
    failed: 0,
  });
  expect(await saved()).toHaveLength(0);
});

it.each(["SlowDown", "TimeoutError", "AccessDenied", "NotFound"])(
  "listing preserves attachment records without S3 calls when storage would return %s",
  async (name) => {
    send.mockRejectedValue(Object.assign(new Error(name), { name }));
    const response = await app.inject({
      url: `/api/groups/${groupId}/entries/${entryId}/attachments`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].id).toBe(attachmentId);
    expect(response.json()[0]).not.toHaveProperty("objectKey");
    expect(await saved()).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  },
);

it("lists attachments with no storage configured", async () => {
  const withoutStorage = await createApp(
    database.db,
    async () => ({
      subject: "alice",
      verifiedEmail: async () => "alice@example.test",
    }),
    { logging: false },
  );
  try {
    const response = await withoutStorage.inject({
      url: `/api/groups/${groupId}/entries/${entryId}/attachments`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0].id).toBe(attachmentId);
    expect(await saved()).toHaveLength(1);
  } finally {
    await withoutStorage.close();
  }
});

it("does not remove a newly reserved attachment before its upload finishes", async () => {
  const reserved = await app.inject({
    method: "POST",
    url: `/api/groups/${groupId}/entries/${entryId}/attachments`,
    payload: {
      fileName: "pending.pdf",
      contentType: "application/pdf",
      size: 120,
    },
  });
  expect(reserved.statusCode).toBe(201);
  send.mockRejectedValue(
    Object.assign(new Error("Not uploaded yet"), { name: "NotFound" }),
  );
  const response = await app.inject({
    url: `/api/groups/${groupId}/entries/${entryId}/attachments`,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().map((row: { id: string }) => row.id)).not.toContain(
    reserved.json().id,
  );
  expect(
    await database.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, reserved.json().id)),
  ).toHaveLength(1);
  expect(send).not.toHaveBeenCalled();
});

it("deletes a PDF from storage before removing its database link", async () => {
  send.mockImplementationOnce(async () => {
    expect(await saved()).toHaveLength(1);
    return {};
  });
  const response = await remove();
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ deleted: true });
  expect(send.mock.calls[0]![0]).toBeInstanceOf(DeleteObjectCommand);
  expect(send.mock.calls[0]![0].input).toMatchObject({
    Bucket: "test-receipts",
    Key: `groups/${groupId}/receipt.pdf`,
  });
  expect(await saved()).toHaveLength(0);
});

it("keeps the attachment when S3 denies deletion and permits a successful retry", async () => {
  send.mockRejectedValueOnce(
    Object.assign(new Error("Denied"), { name: "AccessDenied" }),
  );
  const failed = await remove();
  expect(failed.statusCode).toBe(503);
  expect(failed.json().error).toContain("attachment has been kept");
  expect(await saved()).toHaveLength(1);
  expect((await remove()).statusCode).toBe(200);
  expect(await saved()).toHaveLength(0);
});
