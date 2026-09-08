import { z } from "zod";
import {
  entryInput,
  emptyEffect,
  type Effect,
  type PostedEntry,
} from "./ledger.js";
import { allocate, evaluateAmount } from "./money.js";

export const effectFields = [
  "allocatedIncome",
  "allocatedExpense",
  "activityCash",
  "transferCash",
  "settlementCash",
  "obligation",
  "correction",
] as const;
const reason = z.string().trim().min(1).max(300);
export const refundInput = z.object({
  description: reason,
  date: z.iso.date(),
  expression: z.string().min(1).max(256),
  cash: z
    .array(
      z.object({
        memberId: z.string().uuid(),
        amount: z.string().regex(/^(0|[1-9]\d{0,14})$/),
      }),
    )
    .min(1)
    .max(100),
});
export type RefundInput = z.infer<typeof refundInput>;
export const financialCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("post"), input: entryInput }),
  z.object({
    action: z.literal("postDraft"),
    draftId: z.string().uuid(),
    version: z.number().int().positive().max(2_147_483_647),
  }),
  z.object({
    action: z.literal("refund"),
    entryId: z.string().uuid(),
    input: refundInput,
  }),
  z.object({
    action: z.literal("reverse"),
    entryId: z.string().uuid(),
    reason,
    date: z.iso.date(),
  }),
  z.object({
    action: z.literal("correct"),
    entryId: z.string().uuid(),
    reason,
    replacement: entryInput,
  }),
]);
export type FinancialCommand = z.infer<typeof financialCommand>;

export function reverseEffects(effects: Effect[]): Effect[] {
  return effects.map((effect) => {
    const reversed = emptyEffect(effect.memberId);
    for (const field of effectFields) reversed[field] = -effect[field];
    return reversed;
  });
}

/** Refund only remaining resolved shares, so successive tiny refunds cannot over-refund a member. */
export function refundEntry(
  input: RefundInput,
  original: { kind: "income" | "expense"; amount: bigint; effects: Effect[] },
  previous: PostedEntry[],
  members: string[],
): PostedEntry {
  const amount = evaluateAmount(input.expression);
  const remaining =
    original.amount - previous.reduce((sum, entry) => sum + entry.amount, 0n);
  if (amount > remaining)
    throw new Error("Refund exceeds the remaining refundable amount.");
  if (new Set(input.cash.map((row) => row.memberId)).size !== input.cash.length)
    throw new Error("A cash participant may appear only once.");
  if (input.cash.reduce((sum, row) => sum + BigInt(row.amount), 0n) !== amount)
    throw new Error("Refund cash participation must equal the amount.");
  const field =
    original.kind === "income" ? "allocatedIncome" : "allocatedExpense";
  const shares = new Map(
    original.effects.map((effect) => [effect.memberId, effect[field]]),
  );
  for (const entry of previous)
    for (const effect of entry.effects)
      shares.set(
        effect.memberId,
        (shares.get(effect.memberId) ?? 0n) + effect[field],
      );
  if (
    [...shares.values()].some((value) => value < 0n) ||
    [...shares.values()].reduce((sum, value) => sum + value, 0n) !== remaining
  )
    throw new Error(
      "Refund history does not reconcile with the original allocations.",
    );
  const allocation = allocate(
    amount,
    [...shares]
      .filter(([, weight]) => weight > 0n)
      .map(([memberId, weight]) => ({ memberId, weight })),
  );
  const effects = new Map<string, Effect>();
  function get(id: string) {
    if (!members.includes(id))
      throw new Error("Member does not belong to this group.");
    if (!effects.has(id)) effects.set(id, emptyEffect(id));
    return effects.get(id)!;
  }
  for (const [id, value] of allocation) get(id)[field] = -value;
  for (const row of input.cash)
    get(row.memberId).activityCash +=
      BigInt(row.amount) * (original.kind === "income" ? -1n : 1n);
  return { amount, effects: [...effects.values()] };
}

export function combineEffects(rows: Effect[]): Effect[] {
  const result = new Map<string, Effect>();
  for (const row of rows) {
    if (!result.has(row.memberId))
      result.set(row.memberId, emptyEffect(row.memberId));
    const total = result.get(row.memberId)!;
    for (const field of effectFields) total[field] += row[field];
  }
  return [...result.values()];
}
