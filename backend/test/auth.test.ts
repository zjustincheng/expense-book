import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { FastifyRequest } from "fastify";
import { createApp } from "../src/app.js";
import { createAuthenticator } from "../src/auth.js";
import { testDatabase } from "./test-database.js";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;
const env = {
  JWT_ISSUER: "https://issuer.example.test",
  JWT_AUDIENCE: "client-id",
  JWT_JWKS_URL: "https://issuer.example.test/jwks",
  COGNITO_DOMAIN: "https://cognito.example.test",
};
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(keys.publicKey)), kid: "test" }],
  });
});
async function token(claims: Record<string, unknown> = {}) {
  return new SignJWT({ token_use: "access", client_id: "client-id", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(env.JWT_ISSUER)
    .setSubject("alice")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(keys.privateKey);
}
const request = (token: string) =>
  ({ headers: { authorization: `Bearer ${token}` } }) as FastifyRequest;
function profileFetch(profile: unknown) {
  return (async () => Response.json(profile)) as typeof fetch;
}
describe("Cognito identity verification", () => {
  it("verifies signed access tokens and Cognito string email_verified", async () => {
    const authenticate = createAuthenticator(env, {
      jwks,
      fetch: profileFetch({
        sub: "alice",
        email: "Alice@Example.test",
        email_verified: "true",
      }),
    });
    const identity = await authenticate(request(await token()));
    expect(identity.subject).toBe("alice");
    expect(await identity.verifiedEmail()).toBe("alice@example.test");
  });
  it.each([{ token_use: "id" }, { client_id: "another-app" }])(
    "rejects incompatible access claims %j",
    async (claims) => {
      await expect(
        createAuthenticator(env, { jwks })(request(await token(claims))),
      ).rejects.toMatchObject({ statusCode: 401 });
    },
  );
  it("rejects expired tokens and tokens from another issuer", async () => {
    const expired = await new SignJWT({
      token_use: "access",
      client_id: "client-id",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("alice")
      .setIssuer(env.JWT_ISSUER)
      .setIssuedAt()
      .setExpirationTime(1)
      .sign(keys.privateKey);
    await expect(
      createAuthenticator(env, { jwks })(request(expired)),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      createAuthenticator(
        { ...env, JWT_ISSUER: "https://other.test" },
        { jwks },
      )(request(await token())),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
  it("never accepts an unverified email or a mismatched profile subject", async () => {
    const signed = await token();
    const unverified = await createAuthenticator(env, {
      jwks,
      fetch: profileFetch({
        sub: "alice",
        email: "alice@example.test",
        email_verified: "false",
      }),
    })(request(signed));
    expect(await unverified.verifiedEmail()).toBeNull();
    const mismatch = await createAuthenticator(env, {
      jwks,
      fetch: profileFetch({
        sub: "mallory",
        email: "alice@example.test",
        email_verified: true,
      }),
    })(request(signed));
    await expect(mismatch.verifiedEmail()).rejects.toMatchObject({
      statusCode: 401,
    });
  });
  it("fails closed when the identity provider is unavailable", async () => {
    const identity = await createAuthenticator(env, {
      jwks,
      fetch: (async () => {
        throw new Error("offline");
      }) as typeof fetch,
    })(request(await token()));
    await expect(identity.verifiedEmail()).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});

describe("Local SQLite account authentication", () => {
  it("registers, signs in, verifies session identity, and revokes on logout", async () => {
    const database = await testDatabase();
    const authenticate = createAuthenticator(
      { AUTH_MODE: "local" },
      { db: database.db },
    );
    const app = await createApp(database.db, authenticate, { logging: false });
    try {
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "Alice@Example.test",
          password: "correct-horse-battery",
          name: "Alice",
        },
      });
      expect(reg.statusCode).toBe(201);
      const { token: regToken, user } = reg.json();
      expect(user.email).toBe("alice@example.test");

      const dup = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "alice@example.test",
          password: "another-password-123",
        },
      });
      expect(dup.statusCode).toBe(409);

      const sessionRes = await app.inject({
        url: "/api/session",
        headers: { authorization: `Bearer ${regToken}` },
      });
      expect(sessionRes.statusCode).toBe(200);
      expect(sessionRes.json()).toMatchObject({
        subject: user.id,
        verifiedEmail: "alice@example.test",
      });

      const badLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "alice@example.test",
          password: "wrong-password-123",
        },
      });
      expect(badLogin.statusCode).toBe(401);

      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "ALICE@example.test",
          password: "correct-horse-battery",
        },
      });
      expect(login.statusCode).toBe(200);
      const loginToken = login.json().token as string;

      await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${loginToken}` },
      });

      const afterLogout = await app.inject({
        url: "/api/session",
        headers: { authorization: `Bearer ${loginToken}` },
      });
      expect(afterLogout.statusCode).toBe(401);
    } finally {
      await app.close();
      await database.close();
    }
  });
});
