"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  LayoutDashboard,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntryForm } from "@/components/entry-form";
import { DraftList } from "@/components/draft-list";
import { RecordDetails } from "@/components/record-actions";
import {
  api,
  money,
  type Group,
  type GroupDetail,
  type Member,
} from "@/lib/api";

export function Dashboard({
  authConfigured,
  signedIn,
}: {
  authConfigured: boolean;
  signedIn: boolean;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [explanation, setExplanation] = useState<Member | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const canLoad = !authConfigured || signedIn;
  const refresh = useCallback(async () => {
    if (!selected) return;
    setGroup(await api<GroupDetail>(`/groups/${selected}`));
    setExplanation(null);
  }, [selected]);
  useEffect(() => {
    if (!canLoad) {
      setLoading(false);
      return;
    }
    let active = true;
    api<Group[]>("/groups")
      .then((result) => {
        if (active) {
          setGroups(result);
          const requested = new URLSearchParams(window.location.search).get(
            "group",
          );
          setSelected(
            result.find((item) => item.id === requested)?.id ??
              result[0]?.id ??
              "",
          );
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canLoad]);
  useEffect(() => {
    if (!selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("group", selected);
    window.history.replaceState(null, "", url);
    let active = true;
    setLoading(true);
    setGroup(null);
    setError("");
    setAdding(false);
    setExplanation(null);
    api<GroupDetail>(`/groups/${selected}`)
      .then((result) => {
        if (active) setGroup(result);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);
  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<Group>("/groups", {
        name: data.get("name"),
        currency: data.get("currency"),
        members: String(data.get("members"))
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
      });
      setGroups(await api<Group[]>("/groups"));
      setSelected(result.id);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create group.");
    } finally {
      setLoading(false);
    }
  }
  function exportCsv() {
    if (!group) return;
    const rows = [
      [
        "Member",
        "Currency",
        "Outstanding (minor units)",
        "Allocated income (minor units)",
        "Allocated expense (minor units)",
      ],
      ...group.members.map((m) => [
        m.name,
        group.currency,
        m.outstanding,
        m.allocatedIncome,
        m.allocatedExpense,
      ]),
    ];
    const safe = (value: string) =>
      `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(safe).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "member-balances.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col border-r border-stone-200 bg-[#eef1e9] p-6 lg:sticky lg:top-0 lg:h-screen">
        <a
          href="/"
          className="flex items-center gap-3 text-xl font-semibold tracking-tight"
        >
          <span className="rounded-xl bg-emerald-900 p-2 text-white">
            <BookOpen size={21} />
          </span>
          expense book<span className="sr-only"> home</span>
        </a>
        <p className="mb-5 mt-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          Your workspace
        </p>
        <label className="mb-5">
          <span className="sr-only">Select group</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!groups.length}
          >
            {!groups.length && <option>No groups yet</option>}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <nav className="flex gap-2 lg:flex-col" aria-label="Workspace">
          <a
            href="#overview"
            className="flex items-center gap-3 rounded-lg bg-white px-3 py-3 text-sm font-medium shadow-xs"
          >
            <LayoutDashboard size={17} />
            Overview
          </a>
          <a
            href="#activity"
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-stone-600 hover:bg-white/60"
          >
            <BookOpen size={17} />
            Activity
          </a>
          <a
            href="#balances"
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-stone-600 hover:bg-white/60"
          >
            <Users size={17} />
            Members
          </a>
        </nav>
        <div className="mt-6 lg:mt-auto">
          <p className="text-xs leading-5 text-stone-500">
            Shared money.
            <br />A clear picture for everyone.
          </p>
          {canLoad && (
            <Button
              variant="ghost"
              className="mt-4 !px-0"
              onClick={() => setCreating(true)}
            >
              <Plus size={16} />
              Create a group
            </Button>
          )}
          {signedIn && (
            <form action="/auth/logout" method="post">
              <Button variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          )}
        </div>
      </aside>
      <main
        id="overview"
        className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-10 lg:py-12"
      >
        <div className="mb-9 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs text-stone-500">
              Workspace
              <ChevronRight size={12} />
              {group?.name ?? "Welcome"}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {group
                ? "A little clarity. A lot less math."
                : "Shared money, made clear."}
            </h1>
            <p className="mt-3 text-sm text-stone-500">
              {group
                ? "Income, expenses, and where everyone stands."
                : "Keep track together. Understand every balance."}
            </p>
          </div>
          {group && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCsv}>
                <Download size={16} />
                Export
              </Button>
              {group.role === "admin" && (
                <Button asChild variant="outline">
                  <a href={`/groups/${group.id}/settings`}>Members & access</a>
                </Button>
              )}
              {group.role !== "viewer" && (
                <Button onClick={() => setAdding(!adding)}>
                  <Plus size={16} />
                  Add record
                </Button>
              )}
            </div>
          )}
        </div>
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        )}
        {!canLoad && (
          <section className="rounded-2xl border border-stone-200 bg-white p-10">
            <h2 className="text-2xl font-semibold">
              One place for your shared finances.
            </h2>
            <p className="my-5 max-w-xl leading-7 text-stone-500">
              From a weekend away to an income-sharing club, keep actual
              payments separate from fair shares—and see exactly why someone
              should pay or receive.
            </p>
            <Button asChild>
              <a href="/auth/login">
                Sign in or create an account
                <ArrowUpRight size={16} />
              </a>
            </Button>
          </section>
        )}
        {creating && (
          <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="mb-5 text-xl font-semibold">Start a group</h2>
            <form onSubmit={createGroup} className="grid gap-4 sm:grid-cols-2">
              <label>
                Group name
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="The weekend crew"
                />
              </label>
              <label>
                Currency
                <select name="currency">
                  {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                Member names, separated by commas
                <input
                  name="members"
                  required
                  placeholder="Alex, Jordan, Sam"
                />
              </label>
              <p className="text-sm text-stone-500 sm:col-span-2">
                Every member starts at zero. Choose at least two members.
                Currency is fixed for this group.
              </p>
              <div className="flex gap-2">
                <Button disabled={loading}>Create group</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        )}
        {loading && (
          <p role="status" className="py-10 text-stone-500">
            Loading your workspace…
          </p>
        )}
        {!loading && !groups.length && canLoad && !creating && !error && (
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <Wallet className="mx-auto mb-4 text-emerald-800" size={32} />
            <h2 className="text-xl font-semibold">
              Your first group starts here.
            </h2>
            <p className="my-3 text-sm text-stone-500">
              Add the people you share with. We’ll start everyone at zero.
            </p>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} />
              Create your first group
            </Button>
          </section>
        )}
        {group && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-stone-500">
                All recorded activity
              </p>
              <span className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-500">
                {group.currency} · All time
              </span>
            </div>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Shared income",
                  value: group.totals.income,
                  icon: ArrowDownLeft,
                },
                {
                  label: "Shared expenses",
                  value: group.totals.expenses,
                  icon: ArrowUpRight,
                },
                {
                  label: "Shared net activity",
                  value:
                    BigInt(group.totals.income) - BigInt(group.totals.expenses),
                  icon: Wallet,
                },
                {
                  label: "Still to settle",
                  value: group.totals.unsettled,
                  icon: Users,
                },
              ].map(({ label, value, icon: Icon }, i) => (
                <section
                  key={label}
                  className={`rounded-2xl border p-5 ${i === 3 ? "border-emerald-900 bg-emerald-900 text-white" : "border-stone-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className={
                        i === 3 ? "text-emerald-100" : "text-stone-500"
                      }
                    >
                      {label}
                    </span>
                    <Icon size={17} />
                  </div>
                  <p className="mt-6 text-2xl font-semibold tracking-tight">
                    {money(value, group.currency)}
                  </p>
                  <p
                    className={`mt-3 text-xs ${i === 3 ? "text-emerald-100" : "text-stone-400"}`}
                  >
                    {i === 3
                      ? "Total members should receive"
                      : "Since this group began"}
                  </p>
                </section>
              ))}
            </div>
            {adding && (
              <div className="mb-8">
                <EntryForm
                  group={group}
                  onClose={() => setAdding(false)}
                  onSaved={refresh}
                />
              </div>
            )}
            <DraftList key={group.id} group={group} onSaved={refresh} />
            <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
              <section
                id="activity"
                className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
              >
                <div className="border-b border-stone-100 p-5">
                  <h2 className="text-lg font-semibold">Recent activity</h2>
                  <p className="mb-4 mt-1 text-xs text-stone-500">
                    Latest 100 records · All dates
                  </p>
                  <label>
                    <span className="sr-only">Search recent activity</span>
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Search descriptions or record types"
                    />
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="sr-only">Filter by project</span>
                      <input
                        value={projectFilter}
                        onChange={(e) => setProjectFilter(e.target.value)}
                        placeholder="Filter by project or trip"
                      />
                    </label>
                    <label>
                      <span className="sr-only">Filter by category</span>
                      <input
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        placeholder="Filter by category or tag"
                      />
                    </label>
                  </div>
                </div>
                {group.entries.length === 0 ? (
                  <p className="p-8 text-sm text-stone-500">
                    No activity yet. Add income, an expense, or another record
                    to get started.
                  </p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {group.entries
                      .filter((entry) => {
                        const input =
                          typeof entry.input === "object" && entry.input
                            ? (entry.input as {
                                project?: string;
                                category?: string;
                              })
                            : {};
                        return (
                          `${entry.description} ${entry.kind} ${input.project ?? ""} ${input.category ?? ""}`
                            .toLowerCase()
                            .includes(filter.toLowerCase()) &&
                          (!projectFilter ||
                            (input.project ?? "")
                              .toLowerCase()
                              .includes(projectFilter.toLowerCase())) &&
                          (!categoryFilter ||
                            (input.category ?? "")
                              .toLowerCase()
                              .includes(categoryFilter.toLowerCase()))
                        );
                      })
                      .map((entry) => (
                        <li key={entry.id} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium">
                                {entry.description}
                              </p>
                              <p className="mt-1 text-xs text-stone-500">
                                <span className="capitalize">{entry.kind}</span>{" "}
                                · {entry.date}
                              </p>
                              {typeof entry.input === "object" &&
                                entry.input &&
                                ((entry.input as { project?: string })
                                  .project ||
                                  (entry.input as { category?: string })
                                    .category) && (
                                  <p className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                                    {(entry.input as { project?: string })
                                      .project && (
                                      <span className="rounded-full bg-emerald-50 px-2 py-1">
                                        Project:{" "}
                                        {
                                          (entry.input as { project?: string })
                                            .project
                                        }
                                      </span>
                                    )}
                                    {(entry.input as { category?: string })
                                      .category && (
                                      <span className="rounded-full bg-stone-100 px-2 py-1">
                                        #
                                        {
                                          (entry.input as { category?: string })
                                            .category
                                        }
                                      </span>
                                    )}
                                  </p>
                                )}
                            </div>
                            <p className="shrink-0 text-sm font-medium">
                              {money(entry.amount, group.currency)}
                            </p>
                          </div>
                          <details className="mt-2 text-xs text-stone-500">
                            <summary className="cursor-pointer">
                              Record details
                            </summary>
                            <p className="mt-2 break-all">
                              Recorded by {entry.actor}
                            </p>
                            <RecordDetails
                              key={`${entry.id}-${group.entries[0]?.id}`}
                              group={group}
                              entryId={entry.id}
                              onSaved={refresh}
                            />
                          </details>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
              <div className="space-y-6">
                <section
                  id="balances"
                  className="rounded-2xl border border-stone-200 bg-white p-5"
                >
                  <h2 className="text-lg font-semibold">
                    Where everyone stands
                  </h2>
                  <p className="mb-4 mt-1 text-xs text-stone-500">
                    Cumulative balances · From a zero start
                  </p>
                  {group.members.map((member, index) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 border-b border-stone-100 py-4 last:border-0"
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index % 2 ? "bg-orange-100 text-orange-900" : "bg-emerald-100 text-emerald-900"}`}
                      >
                        {member.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {member.name}
                          {member.archivedAt && (
                            <span className="ml-2 text-xs font-normal text-stone-500">
                              Archived
                            </span>
                          )}
                        </p>
                        <button
                          className="mt-1 flex items-center gap-1 text-xs text-stone-500 underline-offset-2 hover:underline"
                          onClick={() =>
                            setExplanation(
                              explanation?.id === member.id ? null : member,
                            )
                          }
                        >
                          <CircleHelp size={11} />
                          Why this balance?
                        </button>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-semibold ${BigInt(member.outstanding) > 0n ? "text-emerald-700" : ""}`}
                        >
                          {money(
                            BigInt(member.outstanding) < 0n
                              ? -BigInt(member.outstanding)
                              : member.outstanding,
                            group.currency,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {BigInt(member.outstanding) > 0n
                            ? "Should receive"
                            : BigInt(member.outstanding) < 0n
                              ? "Should pay"
                              : "Settled"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {explanation && (
                    <div className="mt-4 rounded-xl bg-stone-50 p-4 text-xs">
                      <h3 className="mb-3 font-semibold">
                        {explanation.name}’s balance explained
                      </h3>
                      {[
                        ["Allocated income", explanation.allocatedIncome],
                        ["Allocated expenses", explanation.allocatedExpense],
                        [
                          "Activity cash (net received)",
                          explanation.activityCash,
                        ],
                        ["Transfers (net received)", explanation.transferCash],
                        [
                          "Settlements (net received)",
                          explanation.settlementCash,
                        ],
                        ["Direct obligations", explanation.obligation],
                        ["Corrections", explanation.correction],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="flex justify-between gap-2 py-1"
                        >
                          <span>{label}</span>
                          <span>{money(value!, group.currency)}</span>
                        </div>
                      ))}
                      <p className="mt-3 leading-5">
                        Outstanding = income share − expense share − cash
                        received net of payments + obligations + corrections.
                      </p>
                    </div>
                  )}
                </section>
                <section className="rounded-2xl border border-[#d9e3cc] bg-[#edf3e5] p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Check size={18} className="text-emerald-800" />
                    <h2 className="font-semibold">A clear path to settled</h2>
                  </div>
                  {group.suggestions.length ? (
                    group.suggestions.map((s) => (
                      <p
                        key={`${s.fromMemberId}-${s.toMemberId}`}
                        className="py-2 text-sm leading-6"
                      >
                        <strong>
                          {
                            group.members.find((m) => m.id === s.fromMemberId)
                              ?.name
                          }
                        </strong>{" "}
                        could pay{" "}
                        <strong>
                          {
                            group.members.find((m) => m.id === s.toMemberId)
                              ?.name
                          }
                        </strong>{" "}
                        {money(s.amount, group.currency)}.
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-stone-600">
                      Everyone is settled up.
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-stone-500">
                    Suggestions only. Record a settlement after the payment is
                    completed.
                  </p>
                </section>
              </div>
            </div>
          </>
        )}
        <footer className="mt-10 border-t border-stone-200 pt-5 text-xs text-stone-400">
          Expense Book · Shared net activity, explained.
        </footer>
      </main>
    </div>
  );
}
