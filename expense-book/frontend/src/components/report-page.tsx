"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, money, type GroupDetail } from "@/lib/api";

type Report = {
  records: GroupDetail["entries"];
  totals: Record<string, string>;
  count: number;
  page?: number;
  hasMore?: boolean;
};
const kinds = [
  "income",
  "expense",
  "obligation",
  "transfer",
  "settlement",
  "adjustment",
  "refund",
  "reversal",
];
export function ReportPage({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    from: "",
    to: "",
    project: "",
    category: "",
    kind: "",
    memberId: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [savedFilters, setSavedFilters] = useState<string[]>([]);
  useEffect(() => {
    try {
      setSavedFilters(JSON.parse(localStorage.getItem(`expense-book:report-filters:${groupId}`) ?? "[]"));
    } catch { setSavedFilters([]); }
  }, [groupId]);
  function saveCurrentFilter() {
    const value = JSON.stringify(filters);
    const next = savedFilters.includes(value) ? savedFilters : [...savedFilters, value].slice(-5);
    setSavedFilters(next);
    localStorage.setItem(`expense-book:report-filters:${groupId}`, JSON.stringify(next));
  }
  const load = useCallback(
    async (next = filters) => {
      setLoading(true);
      setError("");
      const query = new URLSearchParams(
        Object.entries({ ...next, page: String(page), pageSize: "50" }).filter(
          ([, value]) => value,
        ),
      );
      try {
        setReport(await api<Report>(`/groups/${groupId}/reports?${query}`));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load report.");
      } finally {
        setLoading(false);
      }
    },
    [filters, groupId, page],
  );
  useEffect(() => {
    api<GroupDetail>(`/groups/${groupId}`)
      .then(setGroup)
      .then(() => load())
      .catch((e: Error) => setError(e.message));
  }, [groupId, load]);
  function exportCsv() {
    if (!report || !group) return;
    const rows = [
      ["Date", "Type", "Description", "Project", "Category", "Amount"],
      ...report.records.map((record) => {
        const input =
          typeof record.input === "object" && record.input
            ? (record.input as { project?: string; category?: string })
            : {};
        return [
          record.date,
          record.kind,
          record.description,
          input.project ?? "",
          input.category ?? "",
          money(record.amount, group.currency),
        ];
      }),
    ];
    const safe = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(safe).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${group.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (!group)
    return (
      <main className="mx-auto max-w-5xl px-5 py-10">
        <p role="status">Loading report…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <a href={`/?group=${groupId}`} className="text-sm text-emerald-800">
        ← Back to group
      </a>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Reports</h1>
          <p className="mt-2 text-sm text-stone-500">
            Filter posted activity and see each financial concept separately.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!report}>
          Export CSV
        </Button>
      </header>
      <form
        className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="sm:col-span-2 lg:col-span-3">
          Search activity
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Description, project, or category"
          />
        </label>
        <label>
          From
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <label>
          Record type
          <select
            value={filters.kind}
            onChange={(e) => setFilters({ ...filters, kind: e.target.value })}
          >
            <option value="">All types</option>
            {kinds.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label>
          Project or trip
          <input
            value={filters.project}
            onChange={(e) =>
              setFilters({ ...filters, project: e.target.value })
            }
            placeholder="Weekend away"
          />
        </label>
        <label>
          Category or tag
          <input
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value })
            }
            placeholder="Food"
          />
        </label>
        <label>
          Member
          <select
            value={filters.memberId}
            onChange={(e) =>
              setFilters({ ...filters, memberId: e.target.value })
            }
          >
            <option value="">All members</option>
            {group.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const reset = {
                search: "",
                from: "",
                to: "",
                project: "",
                category: "",
                kind: "",
                memberId: "",
              };
              setFilters(reset);
              void load(reset);
            }}
          >
            Clear
          </Button>
          <Button type="button" variant="outline" onClick={saveCurrentFilter}>
            Save filter
          </Button>
        </div>
      </form>
      {savedFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-500">Saved filters:</span>
          {savedFilters.map((saved, index) => (
            <Button
              key={saved}
              type="button"
              variant="outline"
              onClick={() => {
                const parsed = JSON.parse(saved) as typeof filters;
                setFilters(parsed);
                setPage(1);
                void load(parsed);
              }}
            >
              Filter {index + 1}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {report && (
        <>
          <p className="text-sm text-stone-500">
            {report.count} matching records · page {report.page ?? page}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kinds
              .filter((kind) => report.totals[kind])
              .map((kind) => (
                <section
                  key={kind}
                  className="rounded-2xl border border-stone-200 bg-white p-4"
                >
                  <p className="text-xs uppercase tracking-wide text-stone-500">
                    {kind}
                  </p>
                  <p className="mt-3 text-xl font-semibold">
                    {money(report.totals[kind]!, group.currency)}
                  </p>
                </section>
              ))}
          </div>
          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="border-b border-stone-100 p-5">
              <h2 className="text-lg font-semibold">Matching activity</h2>
            </div>
            {!report.records.length ? (
              <p className="p-8 text-sm text-stone-500">
                No records match these filters.
              </p>
            ) : (
              <div className="divide-y divide-stone-100">
                {report.records.map((record) => {
                  const input =
                    typeof record.input === "object" && record.input
                      ? (record.input as {
                          project?: string;
                          category?: string;
                        })
                      : {};
                  return (
                    <div
                      key={record.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-5"
                    >
                      <div>
                        <p className="font-medium">{record.description}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          <span className="capitalize">{record.kind}</span> ·{" "}
                          {record.date}
                          {input.project ? ` · ${input.project}` : ""}
                          {input.category ? ` · #${input.category}` : ""}
                        </p>
                      </div>
                      <p className="font-medium">
                        {money(record.amount, group.currency)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!report.hasMore || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
