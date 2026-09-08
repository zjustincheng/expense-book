import type { Entry } from "./api";

export const entryKinds = [
  "expense",
  "income",
  "obligation",
  "transfer",
  "settlement",
  "adjustment",
] as const;
export type EntryKind = (typeof entryKinds)[number];
type CashRow = { memberId: string; amount: string };
export type Split =
  | { method: "equal"; members: string[] }
  | { method: "exact"; shares: CashRow[] }
  | {
      method: "weights" | "percentages";
      shares: { memberId: string; weight: string }[];
    };
export type EntryInput = {
  description: string;
  date: string;
  expression: string;
} & (
  | { kind: "income" | "expense"; cash: CashRow[]; split: Split }
  | {
      kind: "obligation" | "transfer" | "settlement" | "adjustment";
      fromMemberId: string;
      toMemberId: string;
    }
);
export type FinancialCommand =
  | { action: "post"; input: EntryInput }
  | { action: "postDraft"; draftId: string; version: number }
  | {
      action: "correct";
      entryId: string;
      reason: string;
      replacement: EntryInput;
    }
  | {
      action: "refund";
      entryId: string;
      input: {
        description: string;
        date: string;
        expression: string;
        cash: CashRow[];
      };
    }
  | { action: "reverse"; entryId: string; reason: string; date: string };
export type Draft = {
  id: string;
  version: number;
  state: "draft" | "posted" | "discarded";
  input: EntryInput;
  updatedAt: string;
  updatedBy: string;
};
export type EntryDetail = Entry & {
  state: "posted" | "reversed";
  input:
    | EntryInput
    | { description: string; date: string; expression: string; cash: CashRow[] }
    | { reverses: string; reason: string };
  refundOf: string | null;
  corrects: string | null;
  correctionReason: string | null;
  remainingRefundable: string | null;
  related: Entry[];
  effects: { memberId: string; outstanding: string }[];
};

export function decimalAmount(minor: string) {
  const value = BigInt(minor);
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
