import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client.js";
import {
  drafts,
  draftRequests,
  draftRevisions,
  members,
} from "../db/schema.js";
import { entryInput, postEntry } from "../domain/ledger.js";
import { fail, validateDomain } from "../lib/errors.js";
import { requestHash } from "../lib/json.js";
import { lockGroup } from "./access.js";

const version = z.number().int().positive().max(2_147_483_646);
export const draftCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), input: entryInput }),
  z.object({
    action: z.literal("update"),
    draftId: z.string().uuid(),
    version,
    input: entryInput,
  }),
  z.object({
    action: z.literal("discard"),
    draftId: z.string().uuid(),
    version,
  }),
]);
export async function changeDraft(
  db: Database,
  groupId: string,
  actor: string,
  command: z.infer<typeof draftCommand>,
  key: string,
) {
  return db.transaction(async (tx) => {
    await lockGroup(tx, groupId, actor);
    const hash = requestHash(command);
    const [retry] = await tx
      .select()
      .from(draftRequests)
      .where(
        and(eq(draftRequests.groupId, groupId), eq(draftRequests.key, key)),
      );
    if (retry) {
      if (retry.actor !== actor || retry.requestHash !== hash)
        fail("Request key conflict.", 409);
      return retry.result;
    }
    if ("input" in command) {
      const groupMembers = await tx
        .select({ id: members.id })
        .from(members)
        .where(eq(members.groupId, groupId));
      validateDomain(() =>
        postEntry(
          command.input,
          groupMembers.map((member) => member.id),
        ),
      );
    }
    let saved: typeof drafts.$inferSelect | undefined;
    if (command.action === "create") {
      [saved] = await tx
        .insert(drafts)
        .values({
          groupId,
          input: command.input,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();
    } else {
      const [current] = await tx
        .select()
        .from(drafts)
        .where(
          and(eq(drafts.groupId, groupId), eq(drafts.id, command.draftId)),
        );
      if (!current) fail("Draft not found.", 404);
      if (current.state !== "draft" || current.version !== command.version)
        fail(
          "This draft changed or was already posted. Reload it before continuing.",
          409,
        );
      [saved] = await tx
        .update(drafts)
        .set({
          input: command.action === "update" ? command.input : current.input,
          state: command.action === "discard" ? "discarded" : "draft",
          version: current.version + 1,
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(and(eq(drafts.groupId, groupId), eq(drafts.id, current.id)))
        .returning();
    }
    if (!saved) throw new Error("Draft write returned no record.");
    await tx.insert(draftRevisions).values({
      groupId,
      draftId: saved.id,
      version: saved.version,
      input: saved.input,
      state: saved.state,
      actor,
    });
    const result = { id: saved.id, version: saved.version, state: saved.state };
    await tx
      .insert(draftRequests)
      .values({ groupId, key, actor, requestHash: hash, result });
    return result;
  });
}
