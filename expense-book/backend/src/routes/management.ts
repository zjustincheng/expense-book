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
  projects,
  categories,
} from "../db/schema.js";
import { json } from "../lib/json.js";
import { fail } from "../lib/errors.js";
import {
  manageGroup,
  managementInput,
  requireAdmin,
  deliverInvitation,
  reviewInvitation,
} from "../services/management.js";
import type { InvitationDelivery } from "../services/invitation-delivery.js";
import { authorize } from "../services/access.js";

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
  app.get("/groups/:groupId/labels", async (request) => {
    const { groupId } = groupParams.parse(request.params);
    await authorize(db, groupId, request.subject);
    const [projectRows, categoryRows] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(eq(projects.groupId, groupId))
        .orderBy(projects.name),
      db
        .select()
        .from(categories)
        .where(eq(categories.groupId, groupId))
        .orderBy(categories.name),
    ]);
    return { projects: projectRows, categories: categoryRows };
  });
  app.post("/groups/:groupId/labels", async (request, reply) => {
    const { groupId } = groupParams.parse(request.params);
    await requireAdmin(db, groupId, request.subject);
    const input = z
      .object({
        kind: z.enum(["project", "category"]),
        name: z.string().trim().min(1).max(80),
      })
      .parse(request.body);
    try {
      const [created] =
        input.kind === "project"
          ? await db
              .insert(projects)
              .values({ groupId, name: input.name })
              .returning()
          : await db
              .insert(categories)
              .values({ groupId, name: input.name })
              .returning();
      return reply.code(201).send(created);
    } catch (error) {
      if (error instanceof Error && error.message.includes("group_name"))
        fail("A label with this name already exists.", 409);
      throw error;
    }
  });
  app.post(
    "/groups/:groupId/labels/:kind/:labelId/archive",
    async (request) => {
      const { groupId } = groupParams.parse(request.params);
      const params = z
        .object({
          kind: z.enum(["project", "category"]),
          labelId: z.string().uuid(),
        })
        .parse(request.params);
      await requireAdmin(db, groupId, request.subject);
      const table = params.kind === "project" ? projects : categories;
      await db
        .update(table)
        .set({ archivedAt: new Date() })
        .where(and(eq(table.groupId, groupId), eq(table.id, params.labelId)));
      return { archived: true };
    },
  );
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
