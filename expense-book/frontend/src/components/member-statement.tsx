"use client";
import { useEffect, useState } from "react";
import { api, money, type GroupDetail } from "@/lib/api";
type Statement = {
  member: { name: string; outstanding: string };
  records: (GroupDetail["entries"][number] & {
    effect: Record<string, string>;
  })[];
};
export function MemberStatement({
  groupId,
  memberId,
}: {
  groupId: string;
  memberId: string;
}) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<GroupDetail>(`/groups/${groupId}`),
      api<Statement>(`/groups/${groupId}/statements/${memberId}`),
    ])
      .then(([g, s]) => {
        setGroup(g);
        setStatement(s);
      })
      .catch((e: Error) => setError(e.message));
  }, [groupId, memberId]);
  if (error)
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <p role="alert">{error}</p>
      </main>
    );
  if (!group || !statement)
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <p role="status">Loading statement…</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
      <a href={`/?group=${groupId}`} className="text-sm text-emerald-800">
        ← Back to group
      </a>
      <header>
        <h1 className="text-3xl font-semibold">
          {statement.member.name}’s statement
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Every posted record affecting this member, with its balance effect.
        </p>
        <p className="mt-4 text-2xl font-semibold">
          {money(statement.member.outstanding, group.currency)}{" "}
          <span className="text-sm font-normal text-stone-500">
            current outstanding
          </span>
        </p>
      </header>
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="border-b border-stone-100 p-5">
          <h2 className="font-semibold">Contributing records</h2>
        </div>
        {!statement.records.length ? (
          <p className="p-8 text-sm text-stone-500">
            No posted records affect this member.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {statement.records.map((record) => (
              <div
                key={record.id}
                className="flex flex-wrap items-start justify-between gap-4 p-5"
              >
                <div>
                  <p className="font-medium">{record.description}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    <span className="capitalize">{record.kind}</span> ·{" "}
                    {record.date}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {money(record.amount, group.currency)}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Balance effect:{" "}
                    {money(
                      ((effect) =>
                        BigInt(effect.allocatedIncome ?? 0) -
                        BigInt(effect.allocatedExpense ?? 0) -
                        BigInt(effect.activityCash ?? 0) -
                        BigInt(effect.transferCash ?? 0) -
                        BigInt(effect.settlementCash ?? 0) +
                        BigInt(effect.obligation ?? 0) +
                        BigInt(effect.correction ?? 0))(record.effect),
                      group.currency,
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
