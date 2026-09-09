"use client";
import { useEffect, useState } from "react";
import { api, money, type Entry, type GroupDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DraftList } from "@/components/draft-list";
import { RecordDetails } from "@/components/record-actions";

type Queue = "drafts" | "uncategorized" | "missing_attachment";
const queues: { value: Queue; label: string }[] = [
  { value: "drafts", label: "Saved drafts" },
  { value: "uncategorized", label: "Uncategorized" },
  { value: "missing_attachment", label: "Expenses without attachments" },
];

export function AttentionInbox({
  group,
  onSaved,
}: {
  group: GroupDetail;
  onSaved: () => Promise<void>;
}) {
  const [queue, setQueue] = useState<Queue>("drafts");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    records: Entry[];
    hasMore: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (queue === "drafts") return;
    let active = true;
    setResult(null);
    setError("");
    api<{ records: Entry[]; hasMore: boolean }>(
      `/groups/${group.id}/attention?reason=${queue}&page=${page}`,
    )
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [group, queue, page, revision]);
  return (
    <section
      aria-label="Needs attention"
      className="mb-8 min-w-0 space-y-4 rounded-2xl border border-stone-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Needs attention</h2>
          <p className="mt-1 text-sm text-stone-500">
            Review unfinished work and optional bookkeeping details.
          </p>
        </div>
        <a
          className="text-sm text-emerald-800 underline"
          href={`/groups/${group.id}/recurring`}
        >
          Review recurring schedules
        </a>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Review queues">
        {queues.map(({ value, label }) => (
          <Button
            key={value}
            variant={queue === value ? "default" : "outline"}
            aria-pressed={queue === value}
            onClick={() => {
              setQueue(value);
              setPage(1);
              setResult(null);
              setError("");
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {queue === "drafts" ? (
        <DraftList group={group} onSaved={onSaved} />
      ) : (
        <>
          <p className="text-sm text-stone-500">
            {queue === "uncategorized"
              ? "Posted income and expenses without a category. Review a record and use Correct record to add a category with an audit trail."
              : "Posted expenses with no attached files. Attach a receipt if you need one; attachments are optional."}
          </p>
          {error ? (
            <div role="alert" className="space-y-2 text-sm text-red-700">
              <p>{error}</p>
              <Button
                variant="outline"
                onClick={() => setRevision((value) => value + 1)}
              >
                Retry loading queue
              </Button>
            </div>
          ) : !result ? (
            <p role="status">Loading review queue…</p>
          ) : (
            <>
              {result.records.length === 0 && (
                <p className="text-sm text-stone-500">
                  No records in this queue.
                </p>
              )}
              <ul className="divide-y divide-stone-100">
                {result.records.map((entry) => (
                  <li key={entry.id} className="min-w-0 py-3">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="min-w-0 break-words font-medium">
                        {entry.description}
                      </span>
                      <span className="shrink-0">
                        {money(entry.amount, group.currency)}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500">
                      {entry.kind} · {entry.date}
                    </p>
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-emerald-800">
                        Review record
                      </summary>
                      <RecordDetails
                        group={group}
                        entryId={entry.id}
                        onSaved={onSaved}
                      />
                    </details>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm">Page {page}</span>
                <Button
                  variant="outline"
                  disabled={!result.hasMore}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Refresh queue
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
