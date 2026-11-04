import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { cookieOptions, isValidOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isValidOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }
  let body: {
    mode?: string;
    email?: string;
    password?: string;
    name?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const endpoint =
    body.mode === "register" ? "/api/auth/register" : "/api/auth/login";
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"}${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: body.email,
          password: body.password,
          ...(body.name ? { name: body.name } : {}),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      token?: string;
      expiresIn?: number;
      user?: unknown;
      error?: string;
    };
    if (!response.ok || !data.token) {
      return NextResponse.json(
        { error: data.error ?? "Authentication failed." },
        { status: response.status || 401 },
      );
    }
    const jar = await cookies();
    jar.set("access_token", data.token, {
      ...cookieOptions,
      maxAge: Math.min(data.expiresIn ?? 604800, 604800),
    });
    return NextResponse.json({ ok: true, user: data.user });
  } catch {
    return NextResponse.json(
      { error: "The authentication service is unavailable." },
      { status: 503 },
    );
  }
}
