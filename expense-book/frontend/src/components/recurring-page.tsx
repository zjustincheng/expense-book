"use client";
import { useCallback, useEffect, useState } from "react";
import { EntryFields, readEntryFields } from "@/components/entry-fields";
import { Button } from "@/components/ui/button";
import { api, type GroupDetail } from "@/lib/api";
import type { EntryInput } from "@/lib/financial";

type Recurring = {
  id: string;
  name: string;
  input: EntryInput;
  frequency: string;
  nextRun: string;
  active: number;
};
export function RecurringPage({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [rows, setRows] = useState<Recurring[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [detail, recurring] = await Promise.all([
      api<GroupDetail>(`/groups/${groupId}`),
      api<Recurring[]>(`/groups/${groupId}/recurring`),
    ]);
    setGroup(detail);
    setRows(recurring);
  }, [groupId]);
  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(
        `/groups/${groupId}/recurring`,
        {
          name: String(form.get("name")),
          frequency: String(form.get("frequency")),
          nextRun: String(form.get("nextRun")),
          input: readEntryFields(form),
        },
        crypto.randomUUID(),
      );
      event.currentTarget.reset();
      setShowForm(false);
      setNotice("Recurring transaction saved.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save recurring transaction.",
      );
    }
  }
  async function archive(id: string) {
    try {
      await api(
        `/groups/${groupId}/recurring/${id}/archive`,
        {},
        crypto.randomUUID(),
      );
      setNotice("Recurring transaction archived.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to archive recurring transaction.",
      );
    }
  }
  async function toggle(row: Recurring) {
    try {
      await api(
        `/groups/${groupId}/recurring/${row.id}/toggle`,
        { active: !row.active },
        crypto.randomUUID(),
      );
      setNotice(
        row.active
          ? "Recurring transaction paused."
          : "Recurring transaction resumed.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to update recurring transaction.",
      );
    }
  }
  async function generate(row: Recurring) {
    try {
      await api(
        `/groups/${groupId}/recurring/${row.id}/generate`,
        {},
        crypto.randomUUID(),
      );
      setNotice(`Draft created from ${row.name}.`);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to create recurring draft.",
      );
    }
  }
  if (!group)
    return (
      <main className="mx-auto max-w-5xl px-5 py-10">
        <p>Loading recurring transactions…</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <a href={`/?group=${groupId}`} className="text-sm text-emerald-800">
        ← Back to group
      </a>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Recurring transactions</h1>
          <p className="mt-2 text-sm text-stone-500">
            Keep regular bills and income ready for review on their next run
            date.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add recurring"}
        </Button>
      </header>
      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={`rounded-xl p-4 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {error || notice}
        </p>
      )}
      {showForm && (
        <form
          onSubmit={create}
          className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <label>
              Name
              <input name="name" required maxLength={100} placeholder="Rent" />
            </label>
            <label>
              Frequency
              <select name="frequency" defaultValue="monthly">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label>
              Next run
              <input type="date" name="nextRun" required />
            </label>
          </div>
          <EntryFields group={group} />
          <Button type="submit">Save recurring transaction</Button>
        </form>
      )}
      <section className="space-y-3">
        {rows.map((row) => (
          <article
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5"
          >
            <div>
              <h2 className="font-semibold">{row.name}</h2>
              <p className="text-sm text-stone-500">
                {row.input.description} · {row.frequency} · next run{" "}
                {row.nextRun} · {row.active ? "active" : "paused"}
              </p>
            </div>
            <div className="flex gap-2">
              {row.active && (
                <Button variant="outline" onClick={() => generate(row)}>
                  Create draft
                </Button>
              )}
              <Button variant="outline" onClick={() => toggle(row)}>
                {row.active ? "Pause" : "Resume"}
              </Button>
              {row.active && (
                <Button variant="outline" onClick={() => archive(row.id)}>
                  Archive
                </Button>
              )}
            </div>
          </article>
        ))}
        {!rows.length && (
          <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-sm text-stone-500">
            No recurring transactions yet.
          </p>
        )}
      </section>
    </main>
  );
}
