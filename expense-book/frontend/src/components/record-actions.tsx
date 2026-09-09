"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BalancePreview } from "@/components/balance-preview";
import { EntryForm } from "@/components/entry-form";
import { api, minorUnits, money, today, type GroupDetail } from "@/lib/api";
import { decimalAmount, type EntryDetail } from "@/lib/financial";
import { useFinancialOperation } from "@/lib/use-financial-operation";

function RefundOrReversal({
  group,
  entry,
  action,
  onSaved,
  onClose,
}: {
  group: GroupDetail;
  entry: EntryDetail;
  action: "refund" | "reverse";
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const operation = useFinancialOperation(group.id);
  const [error, setError] = useState("");
  async function finish() {
    try {
      await onSaved();
      onClose();
    } catch {
      setError(
        "The record was saved. Reload the workspace to see the updated balances.",
      );
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (operation.preview) {
      if (await operation.confirm()) await finish();
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      const description = String(form.get("reason"));
      const date = String(form.get("date"));
      const expression = String(form.get("amount"));
      await operation.prepare(
        action === "reverse"
          ? { action, entryId: entry.id, reason: description, date }
          : {
              action,
              entryId: entry.id,
              input: {
                description,
                date,
                expression,
                cash: [
                  {
                    memberId: String(form.get("cash")),
                    amount: minorUnits(expression),
                  },
                ],
              },
            },
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to preview this change.",
      );
    }
  }
  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-4 rounded-xl border border-stone-200 p-4"
      aria-label={action === "refund" ? "Record refund" : "Reverse record"}
    >
      <h3 className="text-base font-semibold">
        {action === "refund" ? "Record refund" : "Reverse record"}
      </h3>
      <p className="text-sm leading-6">
        {action === "refund"
          ? `Remaining refundable: ${money(entry.remainingRefundable!, group.currency)}. The refund reduces the original shares proportionally. Record money already ${entry.kind === "expense" ? "received back" : "paid back"} outside Expense Book.`
          : "This adds an opposite entry and keeps the original in history. It does not send money."}
      </p>
      <fieldset
        disabled={
          operation.pending || Boolean(operation.preview) || operation.committed
        }
        className="grid gap-3 sm:grid-cols-2"
      >
        {action === "refund" && (
          <>
            <label>
              Refund amount ({group.currency})
              <input
                name="amount"
                inputMode="decimal"
                required
                pattern="[0-9]+(\.[0-9]{1,2})?"
                defaultValue={decimalAmount(entry.remainingRefundable!)}
              />
            </label>
            <label>
              {entry.kind === "expense"
                ? "Refund received by"
                : "Refund paid by"}
              <select name="cash" required>
                {group.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                    {member.archivedAt ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          {action === "refund" ? "Reason for refund" : "Reason for reversal"}
          <input name="reason" required maxLength={300} />
        </label>
        <label>
          {action === "refund" ? "Refund date" : "Reversal date"}
          <input
            name="date"
            type="date"
            required
            min={entry.date}
            defaultValue={today() < entry.date ? entry.date : today()}
          />
        </label>
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
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {operation.committed ? (
          <Button type="button" onClick={() => void finish()}>
            Reload workspace
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={operation.pending || operation.uncertain}
              onClick={onClose}
            >
              Cancel
            </Button>
            {operation.preview && (
              <Button
                type="button"
                variant="outline"
                disabled={operation.pending || operation.uncertain}
                onClick={operation.reset}
              >
                Edit details
              </Button>
            )}
            <Button disabled={operation.pending}>
              {operation.pending
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
  );
}

export function RecordDetails({
  group,
  entryId,
  onSaved,
}: {
  group: GroupDetail;
  entryId: string;
  onSaved: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<
    { id: string; fileName: string; contentType: string; size: number }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [action, setAction] = useState<"refund" | "reverse" | "correct" | null>(
    null,
  );
  async function load(id: string) {
    setLoading(true);
    setError("");
    setAction(null);
    try {
      setDetail(await api<EntryDetail>(`/groups/${group.id}/entries/${id}`));
      setAttachments(
        await api<typeof attachments>(
          `/groups/${group.id}/entries/${id}/attachments`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load record.");
    } finally {
      setLoading(false);
    }
  }
  const hasRefunds =
    detail?.remainingRefundable !== null &&
    detail?.remainingRefundable !== undefined &&
    BigInt(detail.remainingRefundable) < BigInt(detail.amount);
  return (
    <div className="mt-3 space-y-3">
      {!detail && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void load(entryId)}
        >
          Show member balance changes
        </Button>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {detail && (
        <>
          <p className="text-sm font-medium">
            {detail.description} ·{" "}
            <span className="capitalize">{detail.state}</span>
          </p>
          {detail.effects.map((effect) => (
            <p key={effect.memberId}>
              {
                group.members.find((member) => member.id === effect.memberId)
                  ?.name
              }
              : {money(effect.outstanding, group.currency)}
            </p>
          ))}
          {detail.correctionReason && (
            <p>Correction reason: {detail.correctionReason}</p>
          )}
          <section className="rounded-xl border border-stone-200 p-4">
            <h4 className="font-semibold">Attachments</h4>
            <p className="mt-1 text-xs text-stone-500">
              PDF, PNG, JPEG, WebP, or text files up to 10 MB. Files are
              private.
            </p>
            <label className="mt-3">
              Upload attachment
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,text/plain"
                disabled={uploading}
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setError("");
                  let createdId: string | undefined;
                  try {
                    const created = await api<{
                      id: string;
                      uploadUrl: string;
                    }>(`/groups/${group.id}/entries/${detail.id}/attachments`, {
                      fileName: file.name,
                      contentType: file.type,
                      size: file.size,
                    });
                    createdId = created.id;
                    const response = await fetch(created.uploadUrl, {
                      method: "PUT",
                      headers: { "Content-Type": file.type },
                      body: file,
                    });
                    if (!response.ok)
                      throw new Error("Upload failed. Try again.");
                    setAttachments(
                      await api<typeof attachments>(
                        `/groups/${group.id}/entries/${detail.id}/attachments`,
                      ),
                    );
                  } catch (e) {
                    if (createdId) {
                      await api(
                        `/groups/${group.id}/attachments/${createdId}`,
                        undefined,
                        crypto.randomUUID(),
                        "DELETE",
                      ).catch(() => undefined);
                    }
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Unable to upload attachment.",
                    );
                  } finally {
                    setUploading(false);
                    event.currentTarget.value = "";
                  }
                }}
              />
            </label>
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 text-sm"
              >
                <span className="break-all">
                  {attachment.fileName}{" "}
                  <span className="text-xs text-stone-500">
                    ({Math.ceil(attachment.size / 1024)} KB)
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await api<{ downloadUrl: string }>(
                        `/groups/${group.id}/attachments/${attachment.id}/download`,
                      );
                      window.open(
                        result.downloadUrl,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Unable to download attachment.",
                      );
                    }
                  }}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${attachment.fileName}?`))
                      return;
                    try {
                      await api(
                        `/groups/${group.id}/attachments/${attachment.id}`,
                        undefined,
                        crypto.randomUUID(),
                        "DELETE",
                      );
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Unable to delete attachment.",
                      );
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </section>
          <div className="flex flex-wrap gap-2">
            {[detail.refundOf, detail.corrects, detail.reverses]
              .filter((id): id is string => Boolean(id))
              .map((id) => (
                <Button
                  key={id}
                  size="sm"
                  variant="outline"
                  disabled={loading || Boolean(action)}
                  onClick={() => void load(id)}
                >
                  View original record
                </Button>
              ))}
            {detail.id !== entryId && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading || Boolean(action)}
                onClick={() => void load(entryId)}
              >
                Back to selected record
              </Button>
            )}
          </div>
          {detail.related.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold">Linked history</h4>
              {detail.related.map((record) => (
                <div
                  key={record.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span>
                    {record.kind} · {record.description} ·{" "}
                    {money(record.amount, group.currency)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading || Boolean(action)}
                    onClick={() => void load(record.id)}
                  >
                    View linked record
                  </Button>
                </div>
              ))}
            </div>
          )}
          {group.role !== "viewer" &&
            detail.state === "posted" &&
            detail.kind !== "reversal" &&
            !action && (
              <>
                {hasRefunds && (
                  <p>
                    Reverse active linked refunds before correcting or reversing
                    this record.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {detail.remainingRefundable !== null &&
                    BigInt(detail.remainingRefundable) > 0n && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAction("refund")}
                      >
                        Record refund
                      </Button>
                    )}
                  {!hasRefunds && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAction("reverse")}
                    >
                      Reverse record
                    </Button>
                  )}
                  {!hasRefunds && "kind" in detail.input && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAction("correct")}
                    >
                      Correct record
                    </Button>
                  )}
                </div>
              </>
            )}
          {action === "correct" && "kind" in detail.input && (
            <EntryForm
              group={group}
              correction={{ entryId: detail.id, input: detail.input }}
              onClose={() => setAction(null)}
              onSaved={onSaved}
            />
          )}
          {(action === "refund" || action === "reverse") && (
            <RefundOrReversal
              key={`${detail.id}-${action}`}
              group={group}
              entry={detail}
              action={action}
              onSaved={onSaved}
              onClose={() => setAction(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
