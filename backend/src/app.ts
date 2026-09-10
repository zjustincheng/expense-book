import Fastify from "fastify";
import { sql } from "drizzle-orm";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z, ZodError } from "zod";
import type { Database } from "./db/client.js";
import type { Authenticate, Identity } from "./auth.js";
import { registerGroupRoutes } from "./routes/groups.js";
import { registerManagementRoutes } from "./routes/management.js";
import type { InvitationDelivery } from "./services/invitation-delivery.js";
import type { AttachmentStorage } from "./services/attachments.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
export async function createApp(
  db: Database,
  authenticate: Authenticate,
  options: {
    logging?: boolean;
    invitations?: InvitationDelivery;
    attachments?: AttachmentStorage;
    rateLimit?: { max: number; timeWindow: string };
  } = {},
) {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    logger:
      options.logging === false
        ? false
        : {
            redact: ["req.headers.authorization", "req.headers.cookie"],
            serializers: {
              req: (req) => ({
                method: req.method,
                url: req.url?.split("?")[0],
              }),
            },
          },
  });
  await app.register(helmet);
  await app.register(
    rateLimit,
    options.rateLimit ?? { max: 120, timeWindow: "1 minute" },
  );
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ error: "Invalid request.", details: z.flattenError(error) });
    const status =
      typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : 500;
    if (status >= 500)
      request.log.error(
        { err: { name: error instanceof Error ? error.name : "UnknownError" } },
        "Request failed",
      );
    return reply.code(status).send({
      error:
        status < 500 && error instanceof Error
          ? error.message
          : "The request could not be completed.",
    });
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  app.register(
    async (api) => {
      api.addHook("onRequest", async (request) => {
        request.identity = await authenticate(request);
        request.subject = request.identity.subject;
      });
      registerGroupRoutes(api, db);
      registerManagementRoutes(api, db, options.invitations);
      registerAttachmentRoutes(api, db, options.attachments);
    },
    { prefix: "/api" },
  );
  return app;
}
declare module "fastify" {
  interface FastifyRequest {
    subject: string;
    identity: Identity;
  }
}
