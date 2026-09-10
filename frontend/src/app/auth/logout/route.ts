import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { cognitoConfig } from "@/lib/auth";
export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.APP_URL ?? request.url).origin
  )
    return new NextResponse(null, { status: 403 });
  (await cookies()).delete("access_token");
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
