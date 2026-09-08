import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { cognitoConfig, cookieOptions } from "@/lib/auth";
export async function GET(request: NextRequest) {
  const config = cognitoConfig();
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set("oauth_verifier", verifier, { ...cookieOptions, maxAge: 300 });
  jar.set("oauth_state", state, { ...cookieOptions, maxAge: 300 });
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
  jar.set(
    "oauth_return_to",
    /^\/(invitations\/[0-9a-f-]{36}|groups\/[0-9a-f-]{36}\/settings)$/.test(
      returnTo,
    )
      ? returnTo
      : "/",
    { ...cookieOptions, maxAge: 300 },
  );
  const url = new URL("/oauth2/authorize", config.domain);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid email profile",
    state,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  return NextResponse.redirect(url);
}
