export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">
        Expense Book
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-stone-500">
        That link does not point to an available page.
      </p>
      <a
        className="mt-6 inline-block rounded-lg bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
        href="/"
      >
        Back to workspace
      </a>
    </main>
  );
}
