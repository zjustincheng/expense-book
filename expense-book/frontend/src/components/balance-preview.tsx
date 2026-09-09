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
      <p className="mb-2 text-xs text-emerald-900">
        Change to each member’s balance
      </p>
      {preview.effects.map((effect) => {
        const member = members.find((member) => member.id === effect.memberId);
        const change = BigInt(effect.outstanding);
        return (
          <div
            key={effect.memberId}
            className="flex flex-wrap justify-between gap-3 py-1 text-sm"
          >
            <span>{member?.name}</span>
            <span>
              {money(change < 0n ? -change : change, currency)}
              {change === 0n
                ? " · No change"
                : change > 0n
                  ? " toward receiving more / owing less"
                  : " toward owing more / receiving less"}
            </span>
          </div>
        );
      })}
      <p className="mt-3 text-xs text-emerald-900">
        Nothing is posted until you confirm. Changes apply to existing balances;
        they are not the final amounts owed. Review again if the group changes
        or this preview expires.
      </p>
    </div>
  );
}
