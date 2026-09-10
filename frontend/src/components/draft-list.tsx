"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EntryForm } from "@/components/entry-form";
import { api, ApiError, type GroupDetail } from "@/lib/api";
import type { Draft } from "@/lib/financial";

export function DraftList({
  group,
  onSaved,
}: {
  group: GroupDetail;
  onSaved: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [discard, setDiscard] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [revision, setRevision] = useState(0);
  const attempt = useRef<{ command: unknown; key: string } | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    api<Draft[]>(`/groups/${group.id}/drafts`)
      .then((result) => {
        if (active) {
          setDrafts(result);
          setError("");
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [group, revision]);
  async function remove() {
    if (!discard || busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    if (!attempt.current)
      attempt.current = {
        command: {
          action: "discard",
          draftId: discard.id,
          version: discard.version,
        },
        key: crypto.randomUUID(),
      };
    try {
      await api(
        `/groups/${group.id}/drafts`,
        attempt.current.command,
        attempt.current.key,
      );
      attempt.current = null;
      setUncertain(false);
      setDiscard(null);
      setRevision((value) => value + 1);
    } catch (e) {
      const ambiguous = !(e instanceof ApiError && e.status < 500);
      setUncertain(ambiguous);
      setError(
        ambiguous
          ? "Discard could not be confirmed. Retry to safely check the same request."
          : e instanceof Error
            ? e.message
            : "Unable to discard draft.",
      );
      if (!ambiguous) {
        attempt.current = null;
        setDiscard(null);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section
      className="mb-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-5"
      aria-label="Drafts"
    >
      <h2 className="text-lg font-semibold">Drafts</h2>
      <p className="text-xs text-stone-500">
        Latest 100 drafts · Planned activity does not affect balances.
      </p>
      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
          <Button
            className="ml-2"
            size="sm"
            variant="outline"
            disabled={pending || uncertain}
            onClick={() => setRevision((value) => value + 1)}
          >
            Reload drafts
          </Button>
        </div>
      )}
      {!drafts.length && !error && (
        <p className="text-sm text-stone-500">No saved drafts.</p>
      )}
      {!selected &&
        drafts.map((draft) => (
          <div
            key={draft.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3"
          >
            <div>
              <p className="break-words text-sm font-medium">
                {draft.input.description}
              </p>
              <p className="text-xs text-stone-500">
                {draft.input.kind} · {draft.input.date} · Revision{" "}
                {draft.version}
              </p>
            </div>
            {group.role !== "viewer" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(discard)}
                  onClick={() => setSelected(draft)}
                >
                  Edit draft
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(discard)}
                  onClick={() => setDiscard(draft)}
                >
                  Discard draft
                </Button>
              </div>
            )}
          </div>
        ))}
      {discard && (
        <div className="rounded-xl bg-stone-50 p-4 text-sm">
          <p>
            Discard “{discard.input.description}”? Its draft history stays
            recorded and balances remain unchanged.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => void remove()}>
              {uncertain ? "Retry discard" : "Confirm discard"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || uncertain}
              onClick={() => setDiscard(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {selected && (
        <EntryForm
          key={selected.id}
          group={group}
          draft={selected}
          onClose={() => {
            setSelected(null);
            setRevision((value) => value + 1);
          }}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
