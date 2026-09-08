import { money, type Member, type Preview } from "@/lib/api";

export function BalancePreview({
  preview,
  members,
  currency,
}: {
  preview: Preview;
  members: Member[];
  currency: string;
}) {
  return (
    <div className="rounded-xl bg-emerald-50 p-4" aria-live="polite">
      <h3 className="mb-3 font-medium">
        Review balance changes · {money(preview.amount, currency)}
      </h3>
      <ul className="mb-3 space-y-1 text-sm">
        {preview.records.map((record, index) => (
          <li key={index}>
            <span className="capitalize">{record.kind}</span> ·{" "}
            {record.description} · {record.date} ·{" "}
            {money(record.amount, currency)}
          </li>
        ))}
      </ul>
      {preview.effects.map((effect) => (
        <div
          key={effect.memberId}
          className="flex justify-between gap-3 py-1 text-sm"
        >
          <span>
            {members.find((member) => member.id === effect.memberId)?.name}
          </span>
          <span>
            {BigInt(effect.outstanding) > 0n ? "+" : ""}
            {money(effect.outstanding, currency)}
          </span>
        </div>
      ))}
      <p className="mt-3 text-xs text-emerald-900">
        Positive changes increase what a member should receive. Negative changes
        increase what they should pay. Review again if the group changes or this
        preview expires.
      </p>
    </div>
  );
}
