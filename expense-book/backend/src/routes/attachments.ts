import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { attachments, entries } from "../db/schema.js";
import { fail } from "../lib/errors.js";
import { authorize } from "../services/access.js";
import {
  downloadUrl,
  objectKey,
  uploadUrl,
  type AttachmentStorage,
} from "../services/attachments.js";

const params = z.object({
  groupId: z.string().uuid(),
  entryId: z.string().uuid(),
});
const allowed = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);
export function registerAttachmentRoutes(
  app: FastifyInstance,
  db: Database,
  storage?: AttachmentStorage,
) {
  app.get("/groups/:groupId/entries/:entryId/attachments", async (request) => {
    const { groupId, entryId } = params.parse(request.params);
    await authorize(db, groupId, request.subject);
    return db
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        contentType: attachments.contentType,
        size: attachments.size,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(
        and(eq(attachments.groupId, groupId), eq(attachments.entryId, entryId)),
      );
  });
  app.post(
    "/groups/:groupId/entries/:entryId/attachments",
    async (request, reply) => {
      if (!storage) fail("Attachment storage is not configured.", 503);
      const { groupId, entryId } = params.parse(request.params);
      await authorize(db, groupId, request.subject);
      const input = z
        .object({
          fileName: z.string().trim().min(1).max(180),
          contentType: z.string().max(100),
          size: z.number().int().positive().max(10_485_760),
        })
        .parse(request.body);
      if (!allowed.has(input.contentType))
        fail("Unsupported attachment type.", 400);
      const [entry] = await db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.groupId, groupId), eq(entries.id, entryId)));
      if (!entry) fail("Entry not found.", 404);
      const key = objectKey(groupId, entryId, input.fileName);
      const [created] = await db
        .insert(attachments)
        .values({
          groupId,
          entryId,
          objectKey: key,
          fileName: input.fileName,
          contentType: input.contentType,
          size: input.size,
          createdBy: request.subject,
        })
        .returning({
          id: attachments.id,
          fileName: attachments.fileName,
          contentType: attachments.contentType,
          size: attachments.size,
        });
      return reply.code(201).send({
        ...created,
        uploadUrl: await uploadUrl(storage, key, input.contentType),
        expiresIn: 300,
      });
    },
  );
  app.get(
    "/groups/:groupId/attachments/:attachmentId/download",
    async (request) => {
      if (!storage) fail("Attachment storage is not configured.", 503);
      const { groupId, attachmentId } = z
        .object({ groupId: z.string().uuid(), attachmentId: z.string().uuid() })
        .parse(request.params);
      await authorize(db, groupId, request.subject);
      const [attachment] = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.groupId, groupId),
            eq(attachments.id, attachmentId),
          ),
        );
      if (!attachment) fail("Attachment not found.", 404);
      return {
        downloadUrl: await downloadUrl(
          storage,
          attachment.objectKey,
          attachment.fileName,
        ),
        expiresIn: 300,
      };
    },
  );
}
