import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import {
  access,
  groups,
  invitations,
  managementEvents,
  members,
} from "../db/schema.js";
import { json } from "../lib/json.js";
import {
  manageGroup,
  managementInput,
  requireAdmin,
  deliverInvitation,
  reviewInvitation,
} from "../services/management.js";
import type { InvitationDelivery } from "../services/invitation-delivery.js";

const groupParams = z.object({ groupId: z.string().uuid() });
export function registerManagementRoutes(
  app: FastifyInstance,
  db: Database,
  delivery?: InvitationDelivery,
) {
  app.get("/session", async (request) => ({ subject: request.subject }));
  app.get("/groups/:groupId/settings", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    await requireAdmin(db, groupId, request.subject);
    return db.transaction(
      async (tx) => {
        const [group] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, groupId));
        const groupMembers = await tx
          .select()
          .from(members)
          .where(eq(members.groupId, groupId))
          .orderBy(members.name);
        const grants = await tx
          .select()
          .from(access)
          .where(eq(access.groupId, groupId))
          .orderBy(access.subject);
        const invites = await tx
          .select()
          .from(invitations)
          .where(eq(invitations.groupId, groupId))
          .orderBy(desc(invitations.createdAt))
          .limit(100);
        const events = await tx
          .select()
          .from(managementEvents)
          .where(eq(managementEvents.groupId, groupId))
          .orderBy(desc(managementEvents.createdAt))
          .limit(50);
        return json({
          version: group!.managementVersion,
          currentSubject: request.subject,
          members: groupMembers,
          grants,
          invitations: invites,
          events,
          emailEnabled: Boolean(delivery?.send),
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  });
  app.post("/groups/:groupId/settings", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    const input = managementInput.parse(request.body);
    const result = await manageGroup(
      db,
      groupId,
      request.subject,
      input,
      z.string().uuid().parse(request.headers["idempotency-key"]),
    );
    if (
      result.id &&
      delivery &&
      ["invite", "resendInvitation"].includes(input.command.action)
    )
      await deliverInvitation(
        db,
        groupId,
        request.subject,
        result.id,
        delivery,
      );
    if (
      result.id &&
      ["invite", "resendInvitation"].includes(input.command.action)
    ) {
      const [invitation] = await db
        .select({ delivery: invitations.delivery })
        .from(invitations)
        .where(
          and(eq(invitations.groupId, groupId), eq(invitations.id, result.id)),
        );
      return {
        ...result,
        invitationPath: `/invitations/${result.id}`,
        delivery: invitation?.delivery,
      };
    }
    return result;
  });
  app.get("/invitations/:invitationId", async (request) =>
    reviewInvitation(
      db,
      z.object({ invitationId: z.string().uuid() }).parse(request.params)
        .invitationId,
      request.identity,
      false,
    ),
  );
  app.post("/invitations/:invitationId/accept", async (request) =>
    reviewInvitation(
      db,
      z.object({ invitationId: z.string().uuid() }).parse(request.params)
        .invitationId,
      request.identity,
      true,
    ),
  );
}
