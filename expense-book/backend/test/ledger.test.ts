import { describe, expect, it } from "vitest";
import { allocate, evaluateAmount } from "../src/domain/money.js";
import {
  entryInput,
  outstanding,
  postEntry,
  suggestSettlements,
  type EntryInput,
} from "../src/domain/ledger.js";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
function input(
  kind: "income" | "expense",
  expression: string,
  memberId = A,
): EntryInput {
  return {
    kind,
    expression,
    description: "Test activity",
    date: "2026-09-07",
    cash: [{ memberId, amount: evaluateAmount(expression).toString() }],
    split: { method: "equal", members: [A, B] },
  };
}
function balances(entry: EntryInput) {
  return new Map(
    postEntry(entry, [A, B, C]).effects.map((e) => [
      e.memberId,
      outstanding(e),
    ]),
  );
}
describe("exact arithmetic", () => {
  it("evaluates arithmetic and rounds half-up once", () => {
    expect(evaluateAmount("1200 * 12")).toBe(1440000n);
    expect(evaluateAmount("(0.1 + 0.2) / 3")).toBe(10n);
    expect(evaluateAmount("1.005")).toBe(101n);
    expect(evaluateAmount("1 / 3 * 3")).toBe(100n);
  });
  it.each([
    "",
    "1 / 0",
    "process.exit()",
    "2 ** 3",
    "1;2",
    "-5",
    "0.001",
    "(".repeat(20) + "1" + ")".repeat(20),
  ])("rejects unsafe or invalid expression %s", (expression) =>
    expect(() => evaluateAmount(expression)).toThrow(),
  );
  it("assigns leftover cents deterministically", () => {
    expect(
      allocate(
        1000n,
        [C, B, A].map((memberId) => ({ memberId, weight: 1n })),
      ),
    ).toEqual(
      new Map([
        [A, 334n],
        [B, 333n],
        [C, 333n],
      ]),
    );
  });
  it("preserves every minor unit over a range of amounts and weights", () => {
    for (let amount = 1n; amount < 500n; amount++) {
      const shares = allocate(amount, [
        { memberId: A, weight: 7n },
        { memberId: B, weight: 13n },
        { memberId: C, weight: 1n },
      ]);
      expect([...shares.values()].reduce((s, v) => s + v, 0n)).toBe(amount);
      expect([...shares.values()].every((v) => v >= 0n)).toBe(true);
    }
  });
});
describe("ledger rules", () => {
  it("separates income receipts from entitlement", () =>
    expect(balances(input("income", "100"))).toEqual(
      new Map([
        [A, -5000n],
        [B, 5000n],
      ]),
    ));
  it("separates expenses paid from responsibility", () =>
    expect(balances(input("expense", "100"))).toEqual(
      new Map([
        [A, 5000n],
        [B, -5000n],
      ]),
    ));
  it("reproduces mixed activity and partial settlement", () => {
    const income = balances(input("income", "1000")),
      expense = balances(input("expense", "200", B));
    expect(income.get(A)! + expense.get(A)!).toBe(-60000n);
    const paid = balances({
      kind: "settlement",
      description: "Paid",
      date: "2026-09-07",
      expression: "250",
      fromMemberId: A,
      toMemberId: B,
    });
    expect(income.get(A)! + expense.get(A)! + paid.get(A)!).toBe(-35000n);
  });
  it("handles unequal allocations and multiple payers", () => {
    const entry = input("expense", "100");
    if (entry.kind !== "expense") throw new Error("Invalid fixture");
    entry.cash = [
      { memberId: A, amount: "6000" },
      { memberId: B, amount: "4000" },
    ];
    entry.split = {
      method: "percentages",
      shares: [
        { memberId: A, weight: "2500" },
        { memberId: B, weight: "7500" },
      ],
    };
    expect(balances(entry)).toEqual(
      new Map([
        [A, 3500n],
        [B, -3500n],
      ]),
    );
  });
  it.each(["transfer", "settlement", "obligation", "adjustment"] as const)(
    "keeps %s outside income and expenses",
    (kind) => {
      const entry = postEntry(
        {
          kind,
          expression: "150",
          description: "Reason",
          date: "2026-09-07",
          fromMemberId: A,
          toMemberId: B,
        },
        [A, B],
      );
      expect(
        entry.effects.every(
          (e) => e.allocatedIncome === 0n && e.allocatedExpense === 0n,
        ),
      ).toBe(true);
      expect(outstanding(entry.effects[0]!)).toBe(
        kind === "transfer" || kind === "settlement" ? 15000n : -15000n,
      );
    },
  );
  it("rejects foreign members and mismatched cash", () => {
    expect(() => postEntry(input("income", "100"), [A])).toThrow(
      "Member does not belong",
    );
    const entry = input("income", "100");
    if (entry.kind !== "income") throw new Error("Invalid fixture");
    entry.cash[0]!.amount = "1";
    expect(() => balances(entry)).toThrow("Cash participation");
  });
  it("validates dates and duplicate participants", () => {
    expect(
      entryInput.safeParse({ ...input("income", "100"), date: "2026-02-30" })
        .success,
    ).toBe(false);
    const entry = input("income", "100");
    if (entry.kind !== "income") throw new Error("Invalid fixture");
    entry.split = { method: "equal", members: [A, A] };
    expect(() => balances(entry)).toThrow("only once");
  });
  it("suggests payments that clear each balance", () => {
    expect(
      suggestSettlements([
        { memberId: A, outstanding: -5000n },
        { memberId: B, outstanding: 3000n },
        { memberId: C, outstanding: 2000n },
      ]),
    ).toEqual([
      { fromMemberId: A, toMemberId: B, amount: "3000" },
      { fromMemberId: A, toMemberId: C, amount: "2000" },
    ]);
  });
});
