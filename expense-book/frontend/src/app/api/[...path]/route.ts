import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !==
      new URL(process.env.APP_URL ?? request.url).origin
  )
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const { path } = await context.params;
  if (
    path[0] !== "groups" ||
    path.some((part) => !/^[a-zA-Z0-9-]+$/.test(part))
  )
    return new NextResponse(null, { status: 404 });
  const token = (await cookies()).get("access_token")?.value;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const key = request.headers.get("idempotency-key");
  if (key) headers.set("idempotency-key", key);
  const body = request.method === "GET" ? undefined : await request.text();
  if (body && Buffer.byteLength(body) > 64 * 1024)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"}/api/${path.join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The API is unavailable. Check that the backend and database are running.",
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
