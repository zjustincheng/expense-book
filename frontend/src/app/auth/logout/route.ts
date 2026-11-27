import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { cognitoConfig, isValidOrigin } from "@/lib/auth";
export async function POST(request: NextRequest) {
  if (!isValidOrigin(request)) return new NextResponse(null, { status: 403 });
  const jar = await cookies();
  const token = jar.get("access_token")?.value;
  jar.delete("access_token");
  if (token) {
    await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"}/api/auth/logout`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      },
    ).catch(() => undefined);
  }
  if (!process.env.COGNITO_DOMAIN || !process.env.COGNITO_CLIENT_ID)
    return NextResponse.redirect(
      new URL("/", process.env.APP_URL ?? request.url),
      303,
    );
  const config = cognitoConfig();
  const logout = new URL("/logout", config.domain);
  logout.search = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.appUrl,
  }).toString();
  return NextResponse.redirect(logout, 303);
}
