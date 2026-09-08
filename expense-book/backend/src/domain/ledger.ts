import { z } from "zod";
import { allocate, evaluateAmount } from "./money.js";

const memberId = z.string().uuid();
const minor = z.string().regex(/^(0|[1-9]\d{0,14})$/);
const row = z.object({ memberId, amount: minor });
const split = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("equal"),
    members: z.array(memberId).min(1).max(100),
  }),
  z.object({
    method: z.enum(["weights", "percentages"]),
    shares: z
      .array(z.object({ memberId, weight: z.string().regex(/^[1-9]\d{0,8}$/) }))
      .min(1)
      .max(100),
  }),
  z.object({
    method: z.literal("exact"),
    shares: z.array(row).min(1).max(100),
  }),
]);
const common = {
  description: z.string().trim().min(1).max(300),
  date: z.iso.date(),
  expression: z.string().min(1).max(256),
};
export const entryInput = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.enum(["income", "expense"]),
    cash: z.array(row).min(1).max(100),
    split,
  }),
  z.object({
    ...common,
    kind: z.enum(["obligation", "transfer", "settlement", "adjustment"]),
    fromMemberId: memberId,
    toMemberId: memberId,
  }),
]);
export type EntryInput = z.infer<typeof entryInput>;
export type Effect = {
  memberId: string;
  allocatedIncome: bigint;
  allocatedExpense: bigint;
  activityCash: bigint;
  transferCash: bigint;
  settlementCash: bigint;
  obligation: bigint;
  correction: bigint;
};
export type PostedEntry = { amount: bigint; effects: Effect[] };
export function outstanding(effect: Effect): bigint {
  return (
    effect.allocatedIncome -
    effect.allocatedExpense -
    effect.activityCash -
    effect.transferCash -
    effect.settlementCash +
    effect.obligation +
    effect.correction
  );
}
export function emptyEffect(memberId: string): Effect {
  return {
    memberId,
    allocatedIncome: 0n,
    allocatedExpense: 0n,
    activityCash: 0n,
    transferCash: 0n,
    settlementCash: 0n,
    obligation: 0n,
    correction: 0n,
  };
}
function unique(rows: { memberId: string }[]) {
  if (new Set(rows.map((r) => r.memberId)).size !== rows.length)
    throw new Error("A member may appear only once per list.");
}
export function postEntry(
  input: EntryInput,
  members: string[],
  precision = 2,
): PostedEntry {
  const amount = evaluateAmount(input.expression, precision);
  const effects = new Map<string, Effect>();
  const get = (id: string) => {
    if (!members.includes(id))
      throw new Error("Member does not belong to this group.");
    if (!effects.has(id)) effects.set(id, emptyEffect(id));
    return effects.get(id)!;
  };
  if ("cash" in input) {
    unique(input.cash);
    if (input.cash.reduce((s, r) => s + BigInt(r.amount), 0n) !== amount)
      throw new Error("Cash participation must equal the amount.");
    const rule = input.split;
    let allocations: Map<string, bigint>;
    if (rule.method === "exact") {
      unique(rule.shares);
      allocations = new Map(
        rule.shares.map((s) => [s.memberId, BigInt(s.amount)]),
      );
      if ([...allocations.values()].reduce((s, n) => s + n, 0n) !== amount)
        throw new Error("Exact shares must equal the amount.");
    } else {
      const shares =
        rule.method === "equal"
          ? rule.members.map((memberId) => ({ memberId, weight: 1n }))
          : rule.shares.map((s) => ({
              memberId: s.memberId,
              weight: BigInt(s.weight),
            }));
      // Percentage weights are integer basis points: 10,000 = 100%.
      if (
        rule.method === "percentages" &&
        shares.reduce((s, r) => s + r.weight, 0n) !== 10_000n
      )
        throw new Error("Percentages must total 100% (10,000 basis points).");
      allocations = allocate(amount, shares);
    }
    for (const row of input.cash)
      get(row.memberId).activityCash +=
        BigInt(row.amount) * (input.kind === "income" ? 1n : -1n);
    for (const [id, value] of allocations)
      get(id)[
        input.kind === "income" ? "allocatedIncome" : "allocatedExpense"
      ] += value;
  } else {
    if (input.fromMemberId === input.toMemberId)
      throw new Error("Choose two different members.");
    const from = get(input.fromMemberId);
    const to = get(input.toMemberId);
    const field =
      input.kind === "obligation"
        ? "obligation"
        : input.kind === "adjustment"
          ? "correction"
          : input.kind === "transfer"
            ? "transferCash"
            : "settlementCash";
    from[field] -= amount;
    to[field] += amount;
  }
  const result = [...effects.values()];
  if (result.reduce((s, e) => s + outstanding(e), 0n) !== 0n)
    throw new Error("Ledger is not balanced.");
  return { amount, effects: result };
}

export function suggestSettlements(
  balances: { memberId: string; outstanding: bigint }[],
) {
  if (balances.reduce((s, b) => s + b.outstanding, 0n) !== 0n)
    throw new Error("Balances must sum to zero.");
  const sorted = [...balances].sort((a, b) =>
    a.memberId < b.memberId ? -1 : 1,
  );
  const debtors = sorted
    .filter((b) => b.outstanding < 0n)
    .map((b) => ({ id: b.memberId, remaining: -b.outstanding }));
  const creditors = sorted
    .filter((b) => b.outstanding > 0n)
    .map((b) => ({ id: b.memberId, remaining: b.outstanding }));
  const result: { fromMemberId: string; toMemberId: string; amount: string }[] =
    [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const from = debtors[i]!,
      to = creditors[j]!;
    const amount =
      from.remaining < to.remaining ? from.remaining : to.remaining;
    result.push({
      fromMemberId: from.id,
      toMemberId: to.id,
      amount: amount.toString(),
    });
    from.remaining -= amount;
    to.remaining -= amount;
    if (!from.remaining) i++;
    if (!to.remaining) j++;
  }
  return result;
}
