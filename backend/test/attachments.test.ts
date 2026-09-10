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

let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createApp>>;
let groupId: string;
let attachmentId: string;
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
