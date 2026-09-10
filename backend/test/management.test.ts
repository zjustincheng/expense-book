import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createApp } from "../src/app.js";
import {
  access,
  drafts,
  invitations,
  managementEvents,
} from "../src/db/schema.js";
import { testDatabase } from "./test-database.js";

let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createApp>>;
let groupId: string;
let memberId: string;
let sent: { email: string; groupName: string; url: string }[];
let failEmail: boolean;
beforeAll(async () => {
  database = await testDatabase();
}, 30_000);
afterAll(async () => {
  await database?.close();
});
beforeEach(async () => {
  sent = [];
  failEmail = false;
  app = await createApp(
    database.db,
    async (request) => {
      const subject = request.headers["x-test-subject"];
      if (typeof subject !== "string")
        throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      return {
        subject,
        verifiedEmail: async () =>
          subject === "unverified"
            ? null
            : `${subject === "bob2" ? "bob" : subject}@example.test`,
      };
    },
    {
      logging: false,
      invitations: {
        appUrl: "https://book.example.test",
        send: async (message) => {
          if (failEmail) throw new Error("Unavailable");
          sent.push(message);
        },
      },
    },
  );
  const created = await call("alice", "/api/groups", {
    name: "Shared club",
    currency: "USD",
    members: ["Alice", "Bob"],
  });
  expect(created.statusCode).toBe(201);
  groupId = created.json().id;
  memberId = (await settings()).members.find(
    (member: { name: string }) => member.name === "Bob",
  ).id;
});
afterEach(async () => {
  await app?.close();
});
const group = (suffix = "") => `/api/groups/${groupId}${suffix}`;
const call = (
  subject: string,
  url: string,
  payload?: unknown,
  key = randomUUID(),
) =>
  app.inject({
    url,
    method: payload === undefined ? "GET" : "POST",
    headers: { "x-test-subject": subject, "idempotency-key": key },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
const settings = async () => (await call("alice", group("/settings"))).json();
it("blocks viewers from uploading or deleting attachments", async () => {
  await database.db
    .insert(access)
    .values({ groupId, subject: "reader", role: "viewer" });
  const upload = await call(
    "reader",
    group(`/entries/${randomUUID()}/attachments`),
    { fileName: "receipt.png", contentType: "image/png", size: 100 },
  );
  expect(upload.statusCode).toBe(403);
  const removal = await app.inject({
    method: "DELETE",
    url: group(`/attachments/${randomUUID()}`),
    headers: { "x-test-subject": "reader" },
  });
  expect(removal.statusCode).toBe(403);
  const list = await call(
    "reader",
    group(`/entries/${randomUUID()}/attachments`),
  );
  expect(list.statusCode).toBe(200);
});
it("returns saved opening references without changing member balances", async () => {
  expect(await settings()).toMatchObject({
    currency: "USD",
    openingBalance: "0",
    openingBalanceDate: null,
  });
  const before = (await call("alice", group())).json();
  const saved = await call("alice", group("/opening-balance"), {
    amount: "-50",
    date: "2026-01-01",
  });
  expect(saved.statusCode).toBe(200);
  expect(await settings()).toMatchObject({
    openingBalance: "-50",
    openingBalanceDate: "2026-01-01",
  });
  const after = (await call("alice", group())).json();
  expect(after.members).toEqual(before.members);
  expect(after.totals).toEqual(before.totals);
});
describe("import confirmation", () => {
  const row = () => ({
    date: "2026-01-02",
    description: "Imported hotel",
    kind: "expense",
    amount: "125.50",
    cashMemberId: memberId,
    splitMemberIds: [memberId],
  });
  it("replays a successful import without creating another batch or draft", async () => {
    const key = randomUUID();
    const body = { rows: [row()] };
    const first = await call("alice", group("/import/confirm"), body, key);
    expect(first.statusCode).toBe(201);
    const retry = await call("alice", group("/import/confirm"), body, key);
    expect(retry.json()).toEqual(first.json());
    expect((await call("alice", group("/import/history"))).json()).toHaveLength(
      1,
    );
    const saved = await database.db
      .select()
      .from(drafts)
      .where(eq(drafts.groupId, groupId));
    expect(saved).toHaveLength(1);
    const conflict = await call(
      "alice",
      group("/import/confirm"),
      { rows: [{ ...row(), amount: "10" }] },
      key,
    );
    expect(conflict.statusCode).toBe(409);
  });
  it("rolls back all drafts if a later row has invalid participants", async () => {
    const response = await call("alice", group("/import/confirm"), {
      rows: [row(), { ...row(), cashMemberId: randomUUID() }],
    });
    expect(response.statusCode).toBe(400);
    expect(
      await database.db
        .select()
        .from(drafts)
        .where(eq(drafts.groupId, groupId)),
    ).toHaveLength(0);
    expect((await call("alice", group("/import/history"))).json()).toHaveLength(
      0,
    );
  });
});
async function change(command: Record<string, unknown>) {
  return call("alice", group("/settings"), {
    version: (await settings()).version,
    command,
  });
}
async function invite(role = "viewer") {
  const response = await change({
    action: "invite",
    memberId,
    email: "BOB@example.test",
    role,
  });
  expect(response.statusCode).toBe(200);
  return response.json().id as string;
}
const accept = (id: string, subject = "bob") =>
  call(subject, `/api/invitations/${id}/accept`, {});
const command = () => ({
  action: "post",
  input: {
    kind: "income",
    description: "Club income",
    expression: "100",
    date: "2026-09-08",
    cash: [{ memberId, amount: "10000" }],
    split: { method: "equal", members: [memberId] },
  },
});

describe("group membership and invitations", () => {
  it("links a verified invited account without changing money or creating a member", async () => {
    const id = await invite();
    expect(sent).toEqual([
      {
        email: "bob@example.test",
        groupName: "Shared club",
        url: `https://book.example.test/invitations/${id}`,
      },
    ]);
    const response = await accept(id);
    expect(response.statusCode).toBe(200);
    expect(response.json().role).toBe("viewer");
    const detail = (await call("bob", group())).json();
    expect(detail.members).toHaveLength(2);
    expect(detail.totals).toEqual({
      income: "0",
      expenses: "0",
      unsettled: "0",
    });
    expect(
      detail.members.find((member: { id: string }) => member.id === memberId)
        .linkedSubject,
    ).toBe("bob");
    expect((await accept(id)).statusCode).toBe(200);
    expect((await accept(id, "bob2")).statusCode).toBe(410);
  });
  it("does not disclose invitation details or accept with the wrong or unverified email", async () => {
    const id = await invite();
    expect((await call("mallory", `/api/invitations/${id}`)).statusCode).toBe(
      404,
    );
    expect((await accept(id, "mallory")).statusCode).toBe(404);
    expect((await accept(id, "unverified")).statusCode).toBe(403);
    expect((await call("mallory", group())).statusCode).toBe(404);
  });
  it("rejects expired and revoked links, and replaces older invitations", async () => {
    const first = await invite();
    const second = await invite();
    expect((await accept(first)).statusCode).toBe(410);
    await database.db
      .update(invitations)
      .set({ expiresAt: new Date(0) })
      .where(eq(invitations.id, second));
    expect((await accept(second)).statusCode).toBe(410);
    const third = await invite();
    expect(
      (await change({ action: "revokeInvitation", invitationId: third }))
        .statusCode,
    ).toBe(200);
    expect((await accept(third)).statusCode).toBe(410);
  });
  it("keeps one admin and requires admins for member, role, and invitation changes", async () => {
    expect(
      (await change({ action: "removeAccess", subject: "alice" })).statusCode,
    ).toBe(409);
    expect(
      (await change({ action: "setRole", subject: "alice", role: "viewer" }))
        .statusCode,
    ).toBe(409);
    await accept(await invite("editor"));
    expect((await call("bob", group("/settings"))).statusCode).toBe(403);
    for (const action of [
      { action: "addMember", name: "Third" },
      { action: "setRole", subject: "bob", role: "admin" },
      {
        action: "invite",
        memberId,
        email: "someone@example.test",
        role: "admin",
      },
    ]) {
      expect(
        (await call("bob", group("/settings"), { version: 0, command: action }))
          .statusCode,
      ).toBe(403);
    }
  });
  it("enforces viewer/editor permissions and revokes access before a later financial write", async () => {
    const id = await invite("editor");
    await accept(id);
    const preview = await call("bob", group("/preview"), command());
    expect(preview.statusCode).toBe(200);
    expect(
      (
        await call("bob", group("/entries"), {
          command: command(),
          previewId: preview.json().previewId,
        })
      ).statusCode,
    ).toBe(201);
    await change({ action: "setRole", subject: "bob", role: "viewer" });
    expect((await call("bob", group())).statusCode).toBe(200);
    expect((await call("bob", group("/preview"), command())).statusCode).toBe(
      403,
    );
    expect(
      (
        await call("bob", group("/entries"), {
          command: command(),
          previewId: preview.json().previewId,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call("bob", group("/drafts"), {
          action: "create",
          input: command().input,
        })
      ).statusCode,
    ).toBe(403);
    await change({ action: "removeAccess", subject: "bob" });
    expect((await call("bob", group())).statusCode).toBe(404);
    expect((await accept(id)).statusCode).toBe(410);
    expect(
      (await settings()).members.find(
        (member: { id: string }) => member.id === memberId,
      ).linkedSubject,
    ).toBeNull();
  });
  it("archives members without changing balances and permits closing settlements", async () => {
    const preview = await call("alice", group("/preview"), command());
    await call("alice", group("/entries"), {
      command: command(),
      previewId: preview.json().previewId,
    });
    const before = (await call("alice", group())).json();
    await change({ action: "archiveMember", memberId, archived: true });
    const after = (await call("alice", group())).json();
    expect(after.totals).toEqual(before.totals);
    expect(after.entries).toEqual(before.entries);
    expect((await call("alice", group("/preview"), command())).statusCode).toBe(
      400,
    );
    const other = after.members.find(
      (member: { id: string }) => member.id !== memberId,
    ).id;
    expect(
      (
        await call("alice", group("/preview"), {
          action: "post",
          input: {
            kind: "settlement",
            description: "Closing payment",
            date: "2026-09-08",
            expression: "1",
            fromMemberId: memberId,
            toMemberId: other,
          },
        })
      ).statusCode,
    ).toBe(200);
    await change({ action: "archiveMember", memberId, archived: false });
    expect((await call("alice", group("/preview"), command())).statusCode).toBe(
      200,
    );
  });
  it("invalidates previews when participants change and detects stale settings", async () => {
    const snapshot = await settings();
    const preview = await call("alice", group("/preview"), command());
    await change({ action: "renameMember", memberId, name: "Robert" });
    expect(
      (
        await call("alice", group("/entries"), {
          command: command(),
          previewId: preview.json().previewId,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call("alice", group("/settings"), {
          version: snapshot.version,
          command: { action: "renameMember", memberId, name: "Stale name" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await settings()).members.find(
        (member: { id: string }) => member.id === memberId,
      ).name,
    ).toBe("Robert");
  });
  it("retries invitations once and retains delivery failures for retry", async () => {
    const body = {
      version: (await settings()).version,
      command: {
        action: "invite",
        memberId,
        email: "bob@example.test",
        role: "viewer",
      },
    };
    const key = randomUUID();
    failEmail = true;
    const first = await call("alice", group("/settings"), body, key);
    expect(first.json().delivery).toBe("failed");
    const again = await call("alice", group("/settings"), body, key);
    expect(again.json().id).toBe(first.json().id);
    failEmail = false;
    expect(
      (
        await change({
          action: "resendInvitation",
          invitationId: first.json().id,
        })
      ).json().delivery,
    ).toBe("sent");
    expect(sent).toHaveLength(1);
  });
  it("preserves existing access roles when accepting a new member link", async () => {
    await accept(await invite("viewer"));
    await change({ action: "unlinkMember", memberId });
    const id = await invite("admin");
    expect((await accept(id)).json().role).toBe("viewer");
    expect((await call("bob", group("/settings"))).statusCode).toBe(403);
  });
  it("revokes pending invitations when removing the recipient's existing access", async () => {
    await accept(await invite("viewer"));
    await change({ action: "unlinkMember", memberId });
    const pending = await invite("admin");
    await change({ action: "removeAccess", subject: "bob" });
    expect((await accept(pending)).statusCode).toBe(410);
    expect((await call("bob", group())).statusCode).toBe(404);
  });
  it("keeps membership events immutable and rejects foreign member IDs", async () => {
    await change({ action: "addMember", name: "Carol" });
    expect(
      (
        await change({
          action: "renameMember",
          memberId: randomUUID(),
          name: "Wrong group",
        })
      ).statusCode,
    ).toBe(404);
    await expect(
      database.db
        .delete(managementEvents)
        .where(
          and(
            eq(managementEvents.groupId, groupId),
            eq(managementEvents.action, "addMember"),
          ),
        ),
    ).rejects.toThrow();
  });
  it("serializes concurrent admin demotions so the group retains an admin", async () => {
    await accept(await invite("admin"));
    const snapshot = await settings();
    const results = await Promise.all([
      call("alice", group("/settings"), {
        version: snapshot.version,
        command: { action: "setRole", subject: "alice", role: "viewer" },
      }),
      call("bob", group("/settings"), {
        version: snapshot.version,
        command: { action: "setRole", subject: "bob", role: "viewer" },
      }),
    ]);
    expect(results.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
  });
  it("persists account notification preferences across session reads", async () => {
    const update = await app.inject({
      url: "/api/session/preferences",
      method: "PATCH",
      headers: { "x-test-subject": "alice" },
      payload: {
        notifications: {
          recurring_due: false,
          draft_review: true,
        },
      },
    });
    expect(update.statusCode).toBe(200);
    const session = await call("alice", "/api/session");
    expect(session.json().notifications).toEqual({
      recurring_due: false,
      draft_review: true,
    });
  });
});
