export type Group = {
  id: string;
  name: string;
  currency: string;
  role: string;
};
export type Member = {
  id: string;
  name: string;
  outstanding: string;
  archivedAt: string | null;
  linkedSubject: string | null;
  allocatedIncome: string;
  allocatedExpense: string;
  activityCash: string;
  transferCash: string;
  settlementCash: string;
  obligation: string;
  correction: string;
};
export type Entry = {
  id: string;
  kind: string;
  description: string;
  date: string;
  amount: string;
  reverses: string | null;
  actor: string;
  input: unknown;
};
export type GroupDetail = Group & {
  members: Member[];
  entries: Entry[];
  totals: { income: string; expenses: string; unsettled: string };
  suggestions: { fromMemberId: string; toMemberId: string; amount: string }[];
};
export type Preview = {
  records: {
    kind: string;
    amount: string;
    description: string;
    date: string;
  }[];
  previewId: string;
  ledgerVersion: string;
  amount: string;
  effects: {
    memberId: string;
    outstanding: string;
    activityCash: string;
    allocatedIncome: string;
    allocatedExpense: string;
  }[];
};
export async function api<T>(
  path: string,
  body?: unknown,
  key?: string,
  method?: "POST" | "PATCH" | "DELETE",
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? (method ?? "GET") : (method ?? "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error ?? "Request failed.", response.status);
  return data as T;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export function money(value: string | bigint, currency: string) {
  // Keep cents exact even when cumulative balances exceed safe Number precision.
  const amount = BigInt(value),
    absolute = amount < 0n ? -amount : amount;
  const whole = new Intl.NumberFormat("en-US", { useGrouping: true }).format(
    absolute / 100n,
  );
  return `${amount < 0n ? "−" : ""}${currency} ${whole}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
export function minorUnits(value: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a positive amount with up to two decimal places.");
  const [whole = "0", decimal = ""] = value.split(".");
  return (BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"))).toString();
}
export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
