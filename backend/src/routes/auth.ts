import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createLocalSession,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "../auth.js";
import type { Database } from "../db/client.js";
import { isUniqueConstraintError } from "../db/errors.js";
import { users, userSessions } from "../db/schema.js";
import { fail } from "../lib/errors.js";

const registerInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200),
  name: z.string().trim().min(1).max(100).optional(),
});

const loginInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

export function registerAuthRoutes(app: FastifyInstance, db: Database) {
  app.post("/register", async (request, reply) => {
    const input = registerInput.parse(request.body);
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email));
    if (existing) {
      fail("An account with this email already exists. Sign in instead.", 409);
    }
    const passwordHash = await hashPassword(input.password);
    const displayName = input.name ?? input.email.split("@")[0] ?? "User";
    let created: typeof users.$inferSelect | undefined;
    try {
      [created] = await db
        .insert(users)
        .values({
          email: input.email,
          name: displayName,
          passwordHash,
        })
        .returning();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        fail(
          "An account with this email already exists. Sign in instead.",
          409,
        );
      }
      throw error;
    }
    const session = await createLocalSession(db, created!.id);
    return reply.code(201).send({
      token: session.token,
      expiresIn: session.expiresIn,
      user: {
        id: created!.id,
        email: created!.email,
        name: created!.name,
      },
    });
  });

  app.post("/login", async (request) => {
    const input = loginInput.parse(request.body);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email));
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      fail("Invalid email or password.", 401);
    }
    const session = await createLocalSession(db, user.id);
    return {
      token: session.token,
      expiresIn: session.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  });

  app.post("/logout", async (request) => {
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (token) {
      await db
        .delete(userSessions)
        .where(eq(userSessions.tokenHash, hashSessionToken(token)));
    }
    return { loggedOut: true };
  });
}
