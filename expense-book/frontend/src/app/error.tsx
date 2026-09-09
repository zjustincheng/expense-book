"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">
        Expense Book
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-stone-500">
        The page could not finish loading. Try again or return to your
        workspace.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
          onClick={reset}
        >
          Try again
        </button>
        <a
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium"
          href="/"
        >
          Back to workspace
        </a>
      </div>
    </main>
  );
}
