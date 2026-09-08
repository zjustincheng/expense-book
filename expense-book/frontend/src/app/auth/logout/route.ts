import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.APP_URL ?? request.url).origin
  )
    return new NextResponse(null, { status: 403 });
  (await cookies()).delete("access_token");
  return NextResponse.redirect(
    new URL("/", process.env.APP_URL ?? request.url),
    303,
  );
}
