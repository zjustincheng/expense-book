"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
type Preview = {
  total: number;
  errors: { row: number; message: string }[];
  rows: {
    date: string;
    description: string;
    kind: string;
    amount: string;
    project?: string;
    category?: string;
    duplicate: boolean;
  }[];
};
export function ImportPage({ groupId }: { groupId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file") as File | null;
    if (!file || file.size === 0) {
      setError("Choose a CSV file first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setPreview(
        await api<Preview>(
          `/groups/${groupId}/import/preview`,
          { csv: await file.text() },
          crypto.randomUUID(),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to preview this CSV.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <a href={`/?group=${groupId}`} className="text-sm text-emerald-800">
        ← Back to group
      </a>
      <header>
        <h1 className="text-3xl font-semibold">Import historical records</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-500">
          Upload a CSV to validate it before anything changes. Required columns:
          date, description, kind, amount. This preview never posts records.
        </p>
      </header>
      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-4 rounded-2xl border border-stone-200 bg-white p-6"
      >
        <label className="min-w-64">
          CSV file
          <input name="file" type="file" accept=".csv,text/csv" required />
        </label>
        <Button disabled={loading}>
          {loading ? "Checking…" : "Preview CSV"}
        </Button>
      </form>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {preview && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-stone-100 p-4">
              <b>{preview.total}</b>
              <span className="ml-2 text-sm text-stone-600">rows found</span>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <b>{preview.rows.length}</b>
              <span className="ml-2 text-sm text-emerald-800">valid rows</span>
            </div>
            <div className="rounded-xl bg-red-50 p-4">
              <b>{preview.errors.length}</b>
              <span className="ml-2 text-sm text-red-800">
                rows with errors
              </span>
            </div>
          </div>
          {preview.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <h2 className="font-semibold">Fix these rows and upload again</h2>
              <ul className="mt-2 list-inside list-disc">
                {preview.errors.map((item) => (
                  <li key={item.row}>
                    Row {item.row}: {item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  {["Date", "Description", "Type", "Amount", "Status"].map(
                    (heading) => (
                      <th key={heading} className="px-4 py-3 font-medium">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr
                    key={`${row.date}-${row.description}-${index}`}
                    className="border-b border-stone-100"
                  >
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">{row.description}</td>
                    <td className="px-4 py-3">{row.kind}</td>
                    <td className="px-4 py-3">{row.amount}</td>
                    <td className="px-4 py-3">
                      {row.duplicate ? (
                        <span className="text-amber-700">
                          Possible duplicate
                        </span>
                      ) : (
                        <span className="text-emerald-700">
                          Ready for review
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-stone-500">
            Import confirmation and member allocation mapping will be the next
            step. No rows have been added.
          </p>
        </section>
      )}
    </main>
  );
}
