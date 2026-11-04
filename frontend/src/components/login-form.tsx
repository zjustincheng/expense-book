"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          email,
          password,
          ...(mode === "register" && name.trim() ? { name: name.trim() } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Authentication failed. Please try again.");
        return;
      }
      const safeReturnTo =
        returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
      window.location.assign(safeReturnTo);
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <a href="/" className="text-sm font-medium text-emerald-800">
        Expense Book
      </a>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-stone-900">
          {mode === "login" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {mode === "login"
            ? "Sign in with your local Expense Book account."
            : "Create a local account to manage shared group balances."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "register" && (
            <label className="block text-sm font-medium text-stone-700">
              Your name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                maxLength={100}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
          )}
          <label className="block text-sm font-medium text-stone-700">
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Password
            <input
              type="password"
              required
              minLength={8}
              maxLength={200}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <div className="mt-6 border-t border-stone-100 pt-4 text-center text-sm text-stone-600">
          {mode === "login" ? (
            <>
              Need an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className="font-medium text-emerald-800 underline"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className="font-medium text-emerald-800 underline"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
