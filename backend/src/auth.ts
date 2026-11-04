import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database } from "./db/client.js";
import { users, userSessions } from "./db/schema.js";
import { fail } from "./lib/errors.js";

const scrypt = promisify(scryptCallback);
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [scheme, salt, keyHex] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createLocalSession(db: Database, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000);
  await db
    .delete(userSessions)
    .where(
      and(eq(userSessions.userId, userId), lt(userSessions.expiresAt, now)),
    );
  await db.insert(userSessions).values({
    userId,
    tokenHash,
    expiresAt,
  });
  return { token, expiresIn: SESSION_LIFETIME_SECONDS };
}

export type Identity = {
  subject: string;
  verifiedEmail: () => Promise<string | null>;
};
export type Authenticate = (request: FastifyRequest) => Promise<Identity>;
export function createAuthenticator(
  env: NodeJS.ProcessEnv,
  dependencies: {
    jwks?: JWTVerifyGetKey;
    fetch?: typeof fetch;
    db?: Database;
  } = {},
): Authenticate {
  if (env.AUTH_MODE === "development") {
    if (
      env.NODE_ENV === "production" ||
      (env.HOST && env.HOST !== "127.0.0.1" && env.HOST !== "localhost")
    )
      throw new Error(
        "Development identity requires a non-production loopback server.",
      );
    const email = z
      .email()
      .parse(env.DEV_USER_EMAIL ?? "developer@example.test")
      .toLowerCase();
    return async () => ({
      subject: "local-developer",
      verifiedEmail: async () => email,
    });
  }
  if (env.AUTH_MODE === "local") {
    const db = dependencies.db;
    if (!db) {
      throw new Error("Local authentication requires a database connection.");
    }
    return async (request) => {
      const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      if (!token)
        throw Object.assign(new Error("Sign in to continue."), {
          statusCode: 401,
        });
      const tokenHash = hashSessionToken(token);
      const [row] = await db
        .select({
          userId: users.id,
          email: users.email,
        })
        .from(userSessions)
        .innerJoin(users, eq(users.id, userSessions.userId))
        .where(
          and(
            eq(userSessions.tokenHash, tokenHash),
            gt(userSessions.expiresAt, new Date()),
          ),
        );
      if (!row) {
        throw Object.assign(new Error("Your session is invalid or expired."), {
          statusCode: 401,
        });
      }
      return {
        subject: row.userId,
        verifiedEmail: async () => row.email,
      };
    };
  }
  const {
    JWT_ISSUER: issuer,
    JWT_AUDIENCE: audience,
    JWT_JWKS_URL: jwksUrl,
    COGNITO_DOMAIN: domain,
  } = env;
  if (!issuer || !audience || !jwksUrl || !domain)
    throw new Error(
      "Configure Cognito issuer, client ID, JWKS URL, and domain, or set AUTH_MODE=local / AUTH_MODE=development.",
    );
  if (
    [issuer, jwksUrl, domain].some((url) => new URL(url).protocol !== "https:")
  )
    throw new Error("Cognito endpoints must use HTTPS.");
  const jwks = dependencies.jwks ?? createRemoteJWKSet(new URL(jwksUrl));
  const get = dependencies.fetch ?? fetch;
  return async (request) => {
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token)
      throw Object.assign(new Error("Sign in to continue."), {
        statusCode: 401,
      });
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "exp", "iat"],
      });
      if (
        payload.token_use !== "access" ||
        payload.client_id !== audience ||
        !payload.sub
      )
        throw new Error("Invalid access token.");
      const subject = payload.sub;
      // Cognito access tokens do not normally contain email. Resolve it lazily
      // from the trusted userInfo endpoint only when accepting an invitation.
      return {
        subject,
        verifiedEmail: async () => {
          let response: Response;
          try {
            response = await get(new URL("/oauth2/userInfo", domain), {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(10_000),
              redirect: "error",
            });
          } catch {
            fail(
              "Email verification is temporarily unavailable. Try again.",
              503,
            );
          }
          if (!response.ok)
            fail("Sign in again to verify your email address.", 401);
          const profile = (await response.json()) as Record<string, unknown>;
          if (profile.sub !== subject)
            fail("The email identity does not match your session.", 401);
          if (
            profile.email_verified !== true &&
            profile.email_verified !== "true"
          )
            return null;
          const email = z.email().safeParse(profile.email);
          return email.success ? email.data.toLowerCase() : null;
        },
      };
    } catch {
      throw Object.assign(new Error("Your session is invalid or expired."), {
        statusCode: 401,
      });
    }
  };
}
