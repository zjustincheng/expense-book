export default function Loading() {
  return (
    <main
      className="mx-auto max-w-5xl px-5 py-20"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="animate-pulse space-y-5">
        <div className="h-4 w-28 rounded bg-stone-200" />
        <div className="h-9 w-72 rounded bg-stone-200" />
        <div className="h-4 w-full max-w-xl rounded bg-stone-200" />
        <div className="grid gap-4 pt-6 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 rounded-2xl bg-stone-200" />
          ))}
        </div>
      </div>
      <p className="sr-only">Loading Expense Book</p>
    </main>
  );
}
