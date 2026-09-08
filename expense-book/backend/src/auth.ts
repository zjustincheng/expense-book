import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
export type Authenticate = (request: FastifyRequest) => Promise<string>;
export function createAuthenticator(env: NodeJS.ProcessEnv): Authenticate {
  if (env.AUTH_MODE === "development") {
    if (
      env.NODE_ENV === "production" ||
      (env.HOST && env.HOST !== "127.0.0.1" && env.HOST !== "localhost")
    )
      throw new Error(
        "Development identity requires a non-production loopback server.",
      );
    return async () => "local-developer";
  }
  const {
    JWT_ISSUER: issuer,
    JWT_AUDIENCE: audience,
    JWT_JWKS_URL: jwksUrl,
  } = env;
  if (!issuer || !audience || !jwksUrl)
    throw new Error(
      "Configure Cognito issuer, client ID, and JWKS URL, or explicitly enable local development authentication.",
    );
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
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
      });
      if (
        payload.token_use !== "access" ||
        payload.client_id !== audience ||
        !payload.sub
      )
        throw new Error("Invalid access token.");
      return payload.sub;
    } catch {
      throw Object.assign(new Error("Your session is invalid or expired."), {
        statusCode: 401,
      });
    }
  };
}
