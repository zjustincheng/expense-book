import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { attachments, entries } from "../db/schema.js";
import { fail } from "../lib/errors.js";
import { authorize } from "../services/access.js";
import {
  deleteObject,
  downloadUrl,
  objectKey,
  uploadUrl,
  inspectObject,
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
        and(
          eq(attachments.groupId, groupId),
          eq(attachments.entryId, entryId),
          eq(attachments.uploadState, "ready"),
        ),
      );
  });
  app.post(
    "/groups/:groupId/entries/:entryId/attachments",
    async (request, reply) => {
      const { groupId, entryId } = params.parse(request.params);
      await authorize(db, groupId, request.subject, true);
      if (!storage) fail("Attachment storage is not configured.", 503);
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
          uploadState: "pending",
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
        uploadUrl: await uploadUrl(storage, key, input.contentType, input.size),
        expiresIn: 300,
      });
    },
  );
  app.post(
    "/groups/:groupId/attachments/:attachmentId/complete",
    async (request) => {
      const { groupId, attachmentId } = z
        .object({
          groupId: z.string().uuid(),
          attachmentId: z.string().uuid(),
        })
        .parse(request.params);
      await authorize(db, groupId, request.subject, true);
      if (!storage) fail("Attachment storage is not configured.", 503);
      return db.transaction(async (tx) => {
        const [attachment] = await tx
          .select()
          .from(attachments)
          .where(
            and(
              eq(attachments.groupId, groupId),
              eq(attachments.id, attachmentId),
            ),
          )
          .for("update");
        if (!attachment) fail("Attachment not found.", 404);
        if (attachment.uploadState === "ready") return { ready: true };
        let object;
        try {
          object = await inspectObject(storage, attachment.objectKey);
        } catch (error) {
          if (error instanceof Error && error.name === "NotFound")
            fail(
              "Upload has not finished. Try again after uploading the file.",
              409,
            );
          fail("Unable to verify the upload. Please try again.", 503);
        }
        if (
          object.ContentLength !== attachment.size ||
          object.ContentType !== attachment.contentType
        )
          fail(
            "Uploaded file size or type does not match the reserved attachment.",
            409,
          );
        const updated = await tx
          .update(attachments)
          .set({ uploadState: "ready" })
          .where(
            and(
              eq(attachments.groupId, groupId),
              eq(attachments.id, attachmentId),
            ),
          )
          .returning({ id: attachments.id });
        if (!updated.length) fail("Attachment was removed during upload.", 409);
        return { ready: true };
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
      if (attachment.uploadState !== "ready")
        fail("Upload has not been completed.", 409);
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
  app.delete(
    "/groups/:groupId/attachments/:attachmentId",
    async (request, reply) => {
      const { groupId, attachmentId } = z
        .object({ groupId: z.string().uuid(), attachmentId: z.string().uuid() })
        .parse(request.params);
      await authorize(db, groupId, request.subject, true);
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
      if (!storage) fail("Attachment storage is not configured.", 503);
      try {
        await deleteObject(storage, attachment.objectKey);
      } catch (error) {
        request.log.error(
          {
            attachmentId,
            errorName: error instanceof Error ? error.name : "UnknownError",
          },
          "Attachment storage deletion failed",
        );
        return reply.code(503).send({
          error:
            "The file could not be deleted from storage. The attachment has been kept; please try again.",
        });
      }
      await db
        .delete(attachments)
        .where(
          and(
            eq(attachments.groupId, groupId),
            eq(attachments.id, attachmentId),
          ),
        );
      return { deleted: true };
    },
  );
}
