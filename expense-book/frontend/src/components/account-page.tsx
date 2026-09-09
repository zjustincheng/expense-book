"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
export function AccountPage() {
  const [session, setSession] = useState<{
    subject: string;
    verifiedEmail: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<typeof session>("/session")
      .then(setSession)
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <a href="/" className="text-sm text-emerald-800">
        ← Back to workspace
      </a>
      <h1 className="text-3xl font-semibold">Account</h1>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {session && (
        <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">
              Verified email
            </p>
            <p className="mt-1 font-medium">{session.verifiedEmail}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">
              Account subject
            </p>
            <p className="mt-1 break-all text-sm text-stone-600">
              {session.subject}
            </p>
          </div>
          <form action="/auth/logout" method="post">
            <Button variant="outline">Sign out</Button>
          </form>
        </section>
      )}
    </main>
  );
}
