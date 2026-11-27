import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isValidOrigin } from "@/lib/auth";
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (request.method !== "GET" && !isValidOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const { path } = await context.params;
  if (
    !["groups", "invitations", "session", "health"].includes(path[0] ?? "") ||
    path.some((part) => !/^[a-zA-Z0-9-]+$/.test(part))
  )
    return new NextResponse(null, { status: 404 });
  const cookieJar = await cookies();
  const token = cookieJar.get("access_token")?.value;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const key = request.headers.get("idempotency-key");
  if (key) headers.set("idempotency-key", key);

  const isAttachmentFile =
    path[0] === "groups" &&
    path[2] === "attachments" &&
    path[4] === "file" &&
    path.length === 5;

  if (isAttachmentFile && request.method === "PUT") {
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.byteLength > 10_485_760)
      return NextResponse.json(
        { error: "Attachment exceeds 10 MB limit." },
        { status: 413 },
      );
    try {
      const response = await fetch(
        `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"}/api/${path.join("/")}`,
        {
          method: "PUT",
          headers,
          body: buffer,
          cache: "no-store",
          signal: AbortSignal.timeout(60_000),
        },
      );
      const responseBody = await response.text();
      return new NextResponse(responseBody, {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return NextResponse.json(
        { error: "The API is unavailable." },
        { status: 503 },
      );
    }
  }

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
    const backendPath =
      path[0] === "health" ? "/health" : `/api/${path.join("/")}`;
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"}${backendPath}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (isAttachmentFile && request.method === "GET" && response.ok) {
      const fileBuffer = await response.arrayBuffer();
      const outHeaders = new Headers({
        "Cache-Control": "private, no-store",
      });
      const contentType = response.headers.get("content-type");
      const contentDisposition = response.headers.get("content-disposition");
      if (contentType) outHeaders.set("Content-Type", contentType);
      if (contentDisposition)
        outHeaders.set("Content-Disposition", contentDisposition);
      return new NextResponse(fileBuffer, {
        status: response.status,
        headers: outHeaders,
      });
    }
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
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
