import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { fail } from "./lib/errors.js";

export type Identity = {
  subject: string;
  verifiedEmail: () => Promise<string | null>;
};
export type Authenticate = (request: FastifyRequest) => Promise<Identity>;
export function createAuthenticator(
  env: NodeJS.ProcessEnv,
  dependencies: { jwks?: JWTVerifyGetKey; fetch?: typeof fetch } = {},
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
  const {
    JWT_ISSUER: issuer,
    JWT_AUDIENCE: audience,
    JWT_JWKS_URL: jwksUrl,
    COGNITO_DOMAIN: domain,
  } = env;
  if (!issuer || !audience || !jwksUrl || !domain)
    throw new Error(
      "Configure Cognito issuer, client ID, JWKS URL, and domain, or explicitly enable local development authentication.",
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
