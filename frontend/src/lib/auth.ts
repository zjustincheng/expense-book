import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const cookieOptions = {
  httpOnly: true,
  secure:
    (process.env.APP_URL ?? "").startsWith("https://") ||
    (process.env.NODE_ENV === "production" &&
      !(process.env.APP_URL ?? "").startsWith("http://")),
  sameSite: "lax" as const,
  path: "/",
};

export function isAuthConfigured() {
  return Boolean(
    process.env.COGNITO_CLIENT_ID || process.env.AUTH_MODE === "local",
  );
}

export function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set<string>();
  if (process.env.APP_URL) {
    try {
      allowed.add(new URL(process.env.APP_URL).origin);
    } catch {
      /* ignore invalid APP_URL */
    }
  }
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    /* ignore */
  }
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  return allowed.has(origin);
}

export function cognitoConfig() {
  const {
    COGNITO_DOMAIN: domain,
    COGNITO_CLIENT_ID: clientId,
    APP_URL: appUrl,
  } = process.env;
  if (!domain || !clientId || !appUrl)
    throw new Error("Cognito sign-in is not configured.");
  return { domain, clientId, appUrl, redirectUri: `${appUrl}/auth/callback` };
}

export async function isSignedIn() {
  return Boolean((await cookies()).get("access_token")?.value);
}
