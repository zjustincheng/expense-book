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
    !["groups", "invitations", "session"].includes(path[0] ?? "") ||
    path.some((part) => !/^[a-zA-Z0-9-]+$/.test(part))
  )
    return new NextResponse(null, { status: 404 });
  const cookieJar = await cookies();
  const token = cookieJar.get("access_token")?.value;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const key = request.headers.get("idempotency-key");
  if (key) headers.set("idempotency-key", key);
  const rawBody = request.method === "GET" ? "" : await request.text();
  // Fastify's JSON parser rejects an empty body when an older browser tab
  // still sends application/json for a DELETE. DELETE handlers ignore the
  // payload, so normalize it to a valid empty JSON object at the proxy.
  const body =
    request.method === "DELETE" && !rawBody ? "{}" : rawBody || undefined;
  if (body) headers.set("Content-Type", "application/json");
  const historicalUpload =
    request.method === "POST" &&
    path[0] === "groups" &&
    path[2] === "historical-reports" &&
    (path.length === 3 || (path.length === 4 && path[3] === "preview"));
  if (
    body &&
    Buffer.byteLength(body) > (historicalUpload ? 2_000_000 : 64 * 1024)
  )
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
    const responseBody = await response.text();
    if (response.status === 401) cookieJar.delete("access_token");
    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(response.status === 401 ? { "x-session-expired": "1" } : {}),
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
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
