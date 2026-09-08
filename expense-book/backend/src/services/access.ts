import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { access, groups } from "../db/schema.js";
import { fail } from "../lib/errors.js";
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function authorize(
  db: Database | Transaction,
  groupId: string,
  subject: string,
  write = false,
) {
  const [grant] = await db
    .select()
    .from(access)
    .where(and(eq(access.groupId, groupId), eq(access.subject, subject)));
  if (!grant) fail("Group not found.", 404);
  if (write && grant.role === "viewer")
    fail("You have read-only access to this group.", 403);
  return grant;
}

/** Every financial/draft writer locks in the same order: group, then access grant. */
export async function lockGroup(
  tx: Transaction,
  groupId: string,
  subject: string,
) {
  // Check before taking a lock so guessed group IDs cannot block another tenant's writes.
  await authorize(tx, groupId, subject, true);
  const [group] = await tx
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .for("update");
  if (!group) fail("Group not found.", 404);
  const [grant] = await tx
    .select()
    .from(access)
    .where(and(eq(access.groupId, groupId), eq(access.subject, subject)))
    .for("share");
  if (!grant) fail("Group not found.", 404);
  if (grant.role === "viewer")
    fail("You have read-only access to this group.", 403);
  return group;
}
