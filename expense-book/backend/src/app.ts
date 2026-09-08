import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z, ZodError } from "zod";
import type { Database } from "./db/client.js";
import type { Authenticate } from "./auth.js";
import { registerGroupRoutes } from "./routes/groups.js";
export async function createApp(
  db: Database,
  authenticate: Authenticate,
  options: { logging?: boolean } = {},
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
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
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
  app.register(
    async (api) => {
      api.addHook("onRequest", async (request) => {
        request.subject = await authenticate(request);
      });
      registerGroupRoutes(api, db);
    },
    { prefix: "/api" },
  );
  return app;
}
declare module "fastify" {
  interface FastifyRequest {
    subject: string;
  }
}
