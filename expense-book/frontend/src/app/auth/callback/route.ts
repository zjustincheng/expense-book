import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { cognitoConfig, cookieOptions } from "@/lib/auth";
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const config = cognitoConfig();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const verifier = jar.get("oauth_verifier")?.value;
  const expected = jar.get("oauth_state")?.value;
  const destination = jar.get("oauth_return_to")?.value ?? "/";
  jar.delete("oauth_state");
  jar.delete("oauth_verifier");
  jar.delete("oauth_return_to");
  if (!code || !state || !expected || state !== expected || !verifier)
    return NextResponse.json(
      { error: "Sign-in expired. Please try again." },
      { status: 400 },
    );
  const response = await fetch(new URL("/oauth2/token", config.domain), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    return NextResponse.json(
      { error: "Sign-in failed. Please try again." },
      { status: 401 },
    );
  const tokens = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokens.access_token || !tokens.expires_in)
    return NextResponse.json(
      { error: "Invalid identity-provider response." },
      { status: 502 },
    );
  jar.set("access_token", tokens.access_token, {
    ...cookieOptions,
    maxAge: Math.min(tokens.expires_in, 3600),
  });
  const safeDestination =
    /^\/(invitations\/[0-9a-f-]{36}|groups\/[0-9a-f-]{36}\/settings)$/.test(
      destination,
    )
      ? destination
      : "/";
  return NextResponse.redirect(new URL(safeDestination, config.appUrl));
}
