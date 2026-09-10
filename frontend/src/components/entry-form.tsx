"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntryFields, readEntryFields } from "@/components/entry-fields";
import { BalancePreview } from "@/components/balance-preview";
import { api, ApiError, type GroupDetail } from "@/lib/api";
import type { Draft, EntryInput } from "@/lib/financial";
import { useFinancialOperation } from "@/lib/use-financial-operation";

export function EntryForm({
  group,
  draft,
  correction,
  onClose,
  onSaved,
}: {
  group: GroupDetail;
  draft?: Draft;
  correction?: { entryId: string; input: EntryInput };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const operation = useFinancialOperation(group.id);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [closing, setClosing] = useState(false);
  const draftAttempt = useRef<{ command: unknown; key: string } | null>(null);
  const draftVersion = useRef(draft?.version);
  const busy = useRef(false);
  const pending = saving || operation.pending;
  const locked =
    pending || uncertain || operation.uncertain || saved || operation.committed;
  const hasUnfinishedWork =
    !saved &&
    !operation.committed &&
    (dirty || uncertain || operation.uncertain);
  useEffect(() => {
    if (!hasUnfinishedWork) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnfinishedWork]);
  async function finish() {
    try {
      await onSaved();
      onClose();
    } catch {
      setError(
        "Saved successfully, but the workspace could not reload. Reload the workspace below.",
      );
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || pending) return;
    setClosing(false);
    setError("");
    if (operation.preview) {
      if (await operation.confirm()) await finish();
      return;
    }
    const form = new FormData(event.currentTarget);
    const saveDraft =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "draft";
    busy.current = true;
    try {
      if (saveDraft || draft) {
        setSaving(true);
        // Replay the saved payload if a response was lost; disabled controls are omitted from FormData.
        if (!draftAttempt.current) {
          const input = readEntryFields(form);
          draftAttempt.current = {
            command: draft
              ? {
                  action: "update",
                  draftId: draft.id,
                  version: draftVersion.current,
                  input,
                }
              : { action: "create", input },
            key: crypto.randomUUID(),
          };
        }
        const result = await api<{ id: string; version: number }>(
          `/groups/${group.id}/drafts`,
          draftAttempt.current.command,
          draftAttempt.current.key,
        );
        draftVersion.current = result.version;
        setUncertain(false);
        if (saveDraft) {
          setSaved(true);
          await finish();
        } else
          await operation.prepare({
            action: "postDraft",
            draftId: result.id,
            version: result.version,
          });
      } else {
        const input = readEntryFields(form);
        await operation.prepare(
          correction
            ? {
                action: "correct",
                entryId: correction.entryId,
                reason: String(form.get("correctionReason")),
                replacement: input,
              }
            : { action: "post", input },
        );
      }
    } catch (e) {
      const ambiguous =
        Boolean(draftAttempt.current) &&
        !(e instanceof ApiError && e.status < 500);
      setUncertain(ambiguous);
      setError(
        ambiguous
          ? "The draft save could not be confirmed. Retry saving to safely check the same draft."
          : e instanceof Error
            ? e.message
            : "Unable to save.",
      );
      if (!ambiguous) draftAttempt.current = null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <section
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
      aria-label={
        correction ? "Correct record" : draft ? "Edit draft" : "New record"
      }
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {correction
            ? "Correct record"
            : draft
              ? "Edit draft"
              : "Every amount, accounted for."}
        </h2>
        <Button
          variant="ghost"
          onClick={() => (dirty ? setClosing(true) : onClose())}
          disabled={locked}
          aria-label="Close entry form"
        >
          <X size={18} />
        </Button>
      </div>
      {closing && (
        <div
          className="mb-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <p className="text-sm">
            Close without saving these edits? Keep editing to save a draft or
            finish posting.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClosing(false)}
            >
              Keep editing
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close without saving
            </Button>
          </div>
        </div>
      )}
      {correction && (
        <p className="mb-4 text-sm text-stone-500">
          The original record stays in history. Confirmation reverses it and
          posts this replacement together.
        </p>
      )}
      {draft && (
        <p className="mb-4 text-sm text-stone-500">
          Drafts do not affect balances. Previewing saves your edits before
          reviewing the draft for posting.
        </p>
      )}
      <form
        onSubmit={submit}
        className="space-y-5"
        onChange={() => {
          if (!locked) {
            draftAttempt.current = null;
            setDirty(true);
            setClosing(false);
          }
        }}
      >
        <fieldset
          disabled={locked || Boolean(operation.preview)}
          className="space-y-5"
        >
          {correction && (
            <label>
              Reason for changing this record
              <input name="correctionReason" required maxLength={300} />
            </label>
          )}
          <EntryFields
            group={group}
            initial={draft?.input ?? correction?.input}
          />
        </fieldset>
        {operation.preview && (
          <BalancePreview
            preview={operation.preview}
            members={group.members}
            currency={group.currency}
          />
        )}
        {(error || operation.error) && (
          <p role="alert" className="text-sm text-red-700">
            {error || operation.error}
            {!locked &&
              " Your entries are still here. Check the details and try again."}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {saved || operation.committed ? (
            <Button type="button" onClick={() => void finish()}>
              Reload workspace
            </Button>
          ) : (
            <>
              {operation.preview && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked}
                  onClick={operation.reset}
                >
                  Edit details
                </Button>
              )}
              {!correction && !operation.preview && (
                <Button
                  type="submit"
                  variant="outline"
                  value="draft"
                  disabled={pending}
                >
                  {uncertain ? "Retry saving draft" : "Save draft"}
                </Button>
              )}
              <Button type="submit" disabled={pending || uncertain}>
                {pending
                  ? "Working…"
                  : operation.preview
                    ? operation.uncertain
                      ? "Retry confirmation"
                      : "Confirm and post"
                    : "Preview balance changes"}
              </Button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
