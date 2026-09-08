"use client";
import { useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  api,
  minorUnits,
  money,
  today,
  type GroupDetail,
  type Preview,
} from "@/lib/api";
const types = [
  "expense",
  "income",
  "obligation",
  "transfer",
  "settlement",
  "adjustment",
] as const;
type Kind = (typeof types)[number];
export function EntryForm({
  group,
  onClose,
  onSaved,
}: {
  group: GroupDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<Kind>("expense");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submission = useRef<{
    command: unknown;
    key: string;
    previewId: string;
  } | null>(null);
  const activity = kind === "income" || kind === "expense";
  const availableMembers = ["transfer", "settlement", "adjustment"].includes(
    kind,
  )
    ? group.members
    : group.members.filter((member) => !member.archivedAt);
  const names = new Map(group.members.map((m) => [m.id, m.name]));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      if (preview && submission.current) {
        await api(
          `/groups/${group.id}/entries`,
          {
            command: submission.current.command,
            previewId: submission.current.previewId,
          },
          submission.current.key,
        );
        await onSaved();
        onClose();
        return;
      }
      const form = new FormData(event.currentTarget);
      const amount = String(form.get("amount"));
      const common = {
        kind,
        description: String(form.get("description")),
        expression: amount,
        date: String(form.get("date")),
      };
      const input = activity
        ? {
            ...common,
            cash: [
              {
                memberId: String(form.get("cash")),
                amount: minorUnits(amount),
              },
            ],
            split: { method: "equal", members: form.getAll("shared") },
          }
        : {
            ...common,
            fromMemberId: String(form.get("from")),
            toMemberId: String(form.get("to")),
          };
      const command = { action: "post", input };
      const result = await api<Preview>(`/groups/${group.id}/preview`, command);
      submission.current = {
        command,
        key: crypto.randomUUID(),
        previewId: result.previewId,
      };
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
      aria-labelledby="entry-heading"
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            New record
          </p>
          <h2 id="entry-heading" className="mt-1 text-xl font-semibold">
            Every amount, accounted for.
          </h2>
        </div>
        <Button
          variant="ghost"
          onClick={onClose}
          disabled={pending}
          aria-label="Close entry form"
        >
          <X size={18} />
        </Button>
      </div>
      <form
        onSubmit={submit}
        onChange={() => {
          setPreview(null);
          submission.current = null;
        }}
        className="space-y-5"
      >
        <fieldset disabled={pending} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Record type
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type[0]!.toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount ({group.currency})
              <input
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
                pattern="[0-9]+(\.[0-9]{1,2})?"
              />
            </label>
          </div>
          <label>
            {kind === "adjustment" ? "Reason for correction" : "Description"}
            <input
              name="description"
              required
              maxLength={300}
              placeholder="What is this for?"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Date
              <input name="date" type="date" defaultValue={today()} required />
            </label>
            {activity ? (
              <label>
                {kind === "income" ? "Received by" : "Paid by"}
                <select name="cash">
                  {availableMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {kind === "obligation" || kind === "adjustment"
                  ? "Member who should pay"
                  : "Sent by"}
                <select name="from">
                  {availableMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {activity ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Shared equally with
              </legend>
              <div className="flex flex-wrap gap-3">
                {availableMembers.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2"
                  >
                    <input
                      className="!w-auto accent-emerald-800"
                      type="checkbox"
                      name="shared"
                      value={m.id}
                      defaultChecked
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <label>
              {kind === "obligation" || kind === "adjustment"
                ? "Member who should receive"
                : "Received by"}
              <select name="to" defaultValue={availableMembers[1]?.id}>
                {availableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs leading-5 text-stone-500">
            {kind === "settlement"
              ? "Record a payment already completed outside Expense Book. This does not send money or verify a bank transfer."
              : kind === "transfer"
                ? "Record money already moved between members. This changes cash positions without creating income or expenses."
                : kind === "obligation"
                  ? "Record an amount owed. No money movement is recorded."
                  : kind === "adjustment"
                    ? "A non-cash balance correction. Include a clear reason; to undo an existing entry, use its reversal action."
                    : "Cash participation and fair shares are tracked separately. Preview the balance changes before posting."}
          </p>
        </fieldset>
        {preview && (
          <div className="rounded-xl bg-emerald-50 p-4">
            <h3 className="mb-3 font-medium">
              Review balance changes · {money(preview.amount, group.currency)}
            </h3>
            {preview.effects.map((effect) => (
              <div
                key={effect.memberId}
                className="flex justify-between gap-3 py-1 text-sm"
              >
                <span>{names.get(effect.memberId)}</span>
                <span>
                  {BigInt(effect.outstanding) > 0n ? "+" : ""}
                  {money(effect.outstanding, group.currency)}
                </span>
              </div>
            ))}
            <p className="mt-3 text-xs text-emerald-900">
              Positive changes increase what a member should receive. Negative
              changes increase what they should pay.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">
            {pending
              ? "Working…"
              : preview
                ? "Confirm and post"
                : "Preview balance changes"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </section>
  );
}
