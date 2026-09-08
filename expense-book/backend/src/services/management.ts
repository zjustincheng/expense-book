import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Identity } from "../auth.js";
import type { Database } from "../db/client.js";
import {
  access,
  groups,
  invitations,
  managementEvents,
  managementRequests,
  members,
} from "../db/schema.js";
import { fail } from "../lib/errors.js";
import { requestHash } from "../lib/json.js";
import { authorize, lockGroup, type Transaction } from "./access.js";
import type { InvitationDelivery } from "./invitation-delivery.js";

const id = z.string().uuid();
const name = z.string().trim().min(1).max(100);
const role = z.enum(["admin", "editor", "viewer"]);
export const managementCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addMember"), name }),
  z.object({ action: z.literal("renameMember"), memberId: id, name }),
  z.object({
    action: z.literal("archiveMember"),
    memberId: id,
    archived: z.boolean(),
  }),
  z.object({ action: z.literal("linkSelf"), memberId: id }),
  z.object({ action: z.literal("unlinkMember"), memberId: id }),
  z.object({
    action: z.literal("setRole"),
    subject: z.string().min(1).max(200),
    role,
  }),
  z.object({
    action: z.literal("removeAccess"),
    subject: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("invite"),
    memberId: id,
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    role,
  }),
  z.object({ action: z.literal("revokeInvitation"), invitationId: id }),
  z.object({ action: z.literal("resendInvitation"), invitationId: id }),
]);
export const managementInput = z.object({
  version: z.number().int().nonnegative(),
  command: managementCommand,
});

export async function requireAdmin(
  tx: Database | Transaction,
  groupId: string,
  actor: string,
) {
  const grant = await authorize(tx, groupId, actor);
  if (grant.role !== "admin")
    fail("Only a group admin can manage members and access.", 403);
}
async function advance(tx: Transaction, groupId: string) {
  await tx
    .update(groups)
    .set({
      managementVersion: sql`${groups.managementVersion} + 1`,
      ledgerVersion: sql`${groups.ledgerVersion} + 1`,
    })
    .where(eq(groups.id, groupId));
}
async function event(
  tx: Transaction,
  groupId: string,
  actor: string,
  action: string,
  details: Record<string, unknown>,
) {
  await tx.insert(managementEvents).values({ groupId, actor, action, details });
}

export async function manageGroup(
  db: Database,
  groupId: string,
  actor: string,
  input: z.infer<typeof managementInput>,
  key: string,
) {
  return db.transaction(async (tx) => {
    const group = await lockGroup(tx, groupId, actor);
    await requireAdmin(tx, groupId, actor);
    const hash = requestHash(input);
    const [retry] = await tx
      .select()
      .from(managementRequests)
      .where(
        and(
          eq(managementRequests.groupId, groupId),
          eq(managementRequests.key, key),
        ),
      );
    if (retry) {
      if (retry.actor !== actor || retry.requestHash !== hash)
        fail("Request key conflict.", 409);
      return retry.result;
    }
    if (input.version !== group.managementVersion)
      fail("Group settings changed. Reload them before saving.", 409);
    const command = input.command;
    const groupMembers = await tx
      .select()
      .from(members)
      .where(eq(members.groupId, groupId));
    const grants = await tx
      .select()
      .from(access)
      .where(eq(access.groupId, groupId));
    const result: { id?: string } = {};
    if (
      "name" in command &&
      groupMembers.some(
        (member) =>
          member.name.toLowerCase() === command.name.toLowerCase() &&
          (command.action === "addMember" || member.id !== command.memberId),
      )
    )
      fail("A member already has this name.", 409);
    if (command.action === "addMember") {
      if (groupMembers.length >= 100)
        fail("This group has reached the 100-member limit.", 400);
      const [member] = await tx
        .insert(members)
        .values({ groupId, name: command.name })
        .returning();
      result.id = member!.id;
    } else if (
      command.action === "setRole" ||
      command.action === "removeAccess"
    ) {
      const grant = grants.find((item) => item.subject === command.subject);
      if (!grant) fail("Access grant not found.", 404);
      if (
        grant.role === "admin" &&
        (command.action === "removeAccess" || command.role !== "admin") &&
        grants.filter((item) => item.role === "admin").length === 1
      )
        fail("Keep at least one admin in this group.", 409);
      if (command.action === "setRole")
        await tx
          .update(access)
          .set({ role: command.role })
          .where(
            and(
              eq(access.groupId, groupId),
              eq(access.subject, command.subject),
            ),
          );
      else {
        const linkedMembers = groupMembers
          .filter((member) => member.linkedSubject === command.subject)
          .map((member) => member.id);
        await tx
          .update(members)
          .set({ linkedSubject: null })
          .where(
            and(
              eq(members.groupId, groupId),
              eq(members.linkedSubject, command.subject),
            ),
          );
        await tx
          .update(invitations)
          .set({ state: "revoked" })
          .where(
            and(
              eq(invitations.groupId, groupId),
              or(
                eq(invitations.acceptedBy, command.subject),
                grant.email ? eq(invitations.email, grant.email) : undefined,
                linkedMembers.length
                  ? inArray(invitations.memberId, linkedMembers)
                  : undefined,
              ),
            ),
          );
        await tx
          .delete(access)
          .where(
            and(
              eq(access.groupId, groupId),
              eq(access.subject, command.subject),
            ),
          );
      }
    } else if (
      command.action === "revokeInvitation" ||
      command.action === "resendInvitation"
    ) {
      const [invitation] = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.groupId, groupId),
            eq(invitations.id, command.invitationId),
          ),
        );
      if (!invitation || invitation.state !== "pending")
        fail("Pending invitation not found.", 404);
      if (
        command.action === "resendInvitation" &&
        invitation.expiresAt.getTime() <= Date.now()
      )
        fail("This invitation expired. Create a new invitation.", 409);
      if (
        command.action === "resendInvitation" &&
        invitation.delivery === "sending"
      )
        fail(
          "Email delivery is still in progress. You can copy the invitation link.",
          409,
        );
      await tx
        .update(invitations)
        .set(
          command.action === "revokeInvitation"
            ? { state: "revoked" }
            : { delivery: "link" },
        )
        .where(eq(invitations.id, invitation.id));
      result.id = invitation.id;
    } else {
      const member = groupMembers.find((item) => item.id === command.memberId);
      if (!member) fail("Member not found.", 404);
      if (command.action === "renameMember")
        await tx
          .update(members)
          .set({ name: command.name })
          .where(eq(members.id, member.id));
      if (command.action === "archiveMember") {
        await tx
          .update(members)
          .set({ archivedAt: command.archived ? new Date() : null })
          .where(eq(members.id, member.id));
        if (command.archived)
          await tx
            .update(invitations)
            .set({ state: "revoked" })
            .where(
              and(
                eq(invitations.groupId, groupId),
                eq(invitations.memberId, member.id),
                eq(invitations.state, "pending"),
              ),
            );
      }
      if (command.action === "linkSelf") {
        if (member.archivedAt || member.linkedSubject)
          fail("Choose an active, unlinked member.", 409);
        if (groupMembers.some((item) => item.linkedSubject === actor))
          fail("Your account is already linked to a member.", 409);
        await tx
          .update(members)
          .set({ linkedSubject: actor })
          .where(eq(members.id, member.id));
      }
      if (command.action === "unlinkMember")
        await tx
          .update(members)
          .set({ linkedSubject: null })
          .where(eq(members.id, member.id));
      if (command.action === "invite") {
        if (member.archivedAt || member.linkedSubject)
          fail("Choose an active, unlinked member.", 409);
        // Reinviting the same person replaces earlier links; it never creates an economic member.
        await tx
          .update(invitations)
          .set({ state: "revoked" })
          .where(
            and(
              eq(invitations.groupId, groupId),
              eq(invitations.memberId, member.id),
              eq(invitations.state, "pending"),
            ),
          );
        await tx.insert(invitations).values({
          id: key,
          groupId,
          memberId: member.id,
          email: command.email,
          role: command.role,
          createdBy: actor,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        result.id = key;
      }
    }
    await advance(tx, groupId);
    await event(tx, groupId, actor, command.action, { ...command, ...result });
    await tx
      .insert(managementRequests)
      .values({ groupId, key, actor, requestHash: hash, result });
    return result;
  });
}

export async function deliverInvitation(
  db: Database,
  groupId: string,
  actor: string,
  id: string,
  delivery: InvitationDelivery,
) {
  if (!delivery.send) return;
  // Claim a delivery once. External email cannot be part of a database transaction.
  const claimed = await db.transaction(async (tx) => {
    await lockGroup(tx, groupId, actor);
    await requireAdmin(tx, groupId, actor);
    const [invitation] = await tx
      .update(invitations)
      .set({ delivery: "sending" })
      .where(
        and(
          eq(invitations.groupId, groupId),
          eq(invitations.id, id),
          eq(invitations.state, "pending"),
          eq(invitations.delivery, "link"),
        ),
      )
      .returning();
    const [group] = await tx
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));
    return invitation ? { invitation, groupName: group!.name } : null;
  });
  if (!claimed) return;
  let status: "sent" | "failed" = "sent";
  try {
    await delivery.send({
      email: claimed.invitation.email,
      groupName: claimed.groupName,
      url: `${delivery.appUrl}/invitations/${id}`,
    });
  } catch {
    status = "failed";
  }
  await db
    .update(invitations)
    .set({ delivery: status })
    .where(
      and(
        eq(invitations.groupId, groupId),
        eq(invitations.id, id),
        eq(invitations.delivery, "sending"),
      ),
    );
}

export async function reviewInvitation(
  db: Database,
  id: string,
  identity: Identity,
  accept: boolean,
) {
  const email = await identity.verifiedEmail();
  if (!email)
    fail("Verify your account email before accepting an invitation.", 403);
  return db.transaction(async (tx) => {
    const [lookup] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, id));
    if (!lookup || lookup.email !== email)
      fail(
        "Invitation not found for this account. Sign in with the invited email.",
        404,
      );
    // Acceptors do not have access yet. Lock the group before the invitation to match admin writers.
    const [group] = await tx
      .select()
      .from(groups)
      .where(eq(groups.id, lookup.groupId))
      .for("update");
    const [invitation] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, id));
    if (!invitation || invitation.state === "revoked")
      fail("This invitation is no longer available.", 410);
    const [grant] = await tx
      .select()
      .from(access)
      .where(
        and(
          eq(access.groupId, invitation.groupId),
          eq(access.subject, identity.subject),
        ),
      );
    if (invitation.state === "accepted") {
      if (invitation.acceptedBy !== identity.subject || !grant)
        fail("This invitation has already been used.", 410);
      return {
        groupId: invitation.groupId,
        groupName: group!.name,
        role: grant.role,
        accepted: true,
      };
    }
    if (invitation.expiresAt.getTime() <= Date.now())
      fail("This invitation expired. Ask an admin for a new one.", 410);
    const [member] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.groupId, invitation.groupId),
          eq(members.id, invitation.memberId),
        ),
      );
    if (
      !member ||
      member.archivedAt ||
      (member.linkedSubject && member.linkedSubject !== identity.subject)
    )
      fail("This member is no longer available for linking.", 409);
    const [existingLink] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.groupId, invitation.groupId),
          eq(members.linkedSubject, identity.subject),
        ),
      );
    if (existingLink && existingLink.id !== member.id)
      fail(
        "Your account is already linked to another member in this group.",
        409,
      );
    const result = {
      groupId: invitation.groupId,
      groupName: group!.name,
      memberName: member.name,
      role: grant?.role ?? invitation.role,
      accepted: accept,
    };
    if (!accept) return result;
    if (!grant)
      await tx.insert(access).values({
        groupId: invitation.groupId,
        subject: identity.subject,
        email,
        role: invitation.role,
      });
    await tx
      .update(members)
      .set({ linkedSubject: identity.subject })
      .where(eq(members.id, member.id));
    await tx
      .update(invitations)
      .set({ state: "accepted", acceptedBy: identity.subject })
      .where(eq(invitations.id, id));
    await advance(tx, invitation.groupId);
    await event(tx, invitation.groupId, identity.subject, "acceptInvitation", {
      invitationId: id,
      memberId: member.id,
      role: result.role,
    });
    return result;
  });
}
