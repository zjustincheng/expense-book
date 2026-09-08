"use client";
import { useState } from "react";
import { minorUnits, today, type GroupDetail } from "@/lib/api";
import {
  decimalAmount,
  entryKinds,
  type EntryInput,
  type EntryKind,
  type Split,
} from "@/lib/financial";

export function readEntryFields(form: FormData): EntryInput {
  const kind = String(form.get("kind")) as EntryKind;
  const common = {
    description: String(form.get("description")),
    date: String(form.get("date")),
    expression: String(form.get("amount")),
  };
  if (kind !== "income" && kind !== "expense")
    return {
      ...common,
      kind,
      fromMemberId: String(form.get("from")),
      toMemberId: String(form.get("to")),
    };
  const advanced = form.get("advanced") === "on";
  const cash = advanced
    ? [...form.entries()]
        .filter(
          ([key, value]) =>
            key.startsWith("cash:") && String(value).trim() !== "",
        )
        .map(([key, value]) => ({
          memberId: key.slice(5),
          amount: minorUnits(String(value)),
        }))
    : [
        {
          memberId: String(form.get("cash")),
          amount: minorUnits(common.expression),
        },
      ];
  const method = advanced
    ? (String(form.get("splitMethod")) as Split["method"])
    : "equal";
  const selected = form.getAll("shared").map(String);
  const split: Split =
    method === "equal"
      ? { method, members: selected }
      : method === "exact"
        ? {
            method,
            shares: selected.map((memberId) => ({
              memberId,
              amount: minorUnits(String(form.get(`share:${memberId}`))),
            })),
          }
        : {
            method,
            shares: selected.map((memberId) => ({
              memberId,
              weight:
                method === "percentages"
                  ? minorUnits(String(form.get(`share:${memberId}`)))
                  : String(form.get(`share:${memberId}`)),
            })),
          };
  return { ...common, kind, cash, split };
}

export function EntryFields({
  group,
  initial,
}: {
  group: GroupDetail;
  initial?: EntryInput;
}) {
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? "expense");
  const initialActivity = initial && "cash" in initial ? initial : undefined;
  const [advanced, setAdvanced] = useState(
    Boolean(
      initialActivity &&
      (initialActivity.cash.length !== 1 ||
        initialActivity.split.method !== "equal" ||
        !/^\d+(\.\d{1,2})?$/.test(initialActivity.expression)),
    ),
  );
  const [method, setMethod] = useState<Split["method"]>(
    initialActivity?.split.method ?? "equal",
  );
  const activity = kind === "income" || kind === "expense";
  const originalIds = new Set(
    initialActivity
      ? [
          ...initialActivity.cash.map((row) => row.memberId),
          ...(initialActivity.split.method === "equal"
            ? initialActivity.split.members
            : initialActivity.split.shares.map((row) => row.memberId)),
        ]
      : initial && "fromMemberId" in initial
        ? [initial.fromMemberId, initial.toMemberId]
        : [],
  );
  // Keep archived original participants visible until the user explicitly changes them.
  const available = group.members.filter(
    (member) =>
      ["transfer", "settlement", "adjustment"].includes(kind) ||
      !member.archivedAt ||
      originalIds.has(member.id),
  );
  const initialShared =
    initialActivity?.split.method === "equal"
      ? initialActivity.split.members
      : initialActivity?.split.shares.map((row) => row.memberId);
  function shareValue(id: string) {
    const split = initialActivity?.split;
    if (!split || split.method === "equal" || split.method !== method)
      return method === "weights" ? "1" : "";
    const row = split.shares.find((row) => row.memberId === id);
    return (
      row &&
      ("amount" in row
        ? decimalAmount(row.amount)
        : method === "percentages"
          ? decimalAmount(row.weight)
          : row.weight)
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Record type
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as EntryKind)}
          >
            {entryKinds.map((type) => (
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
            required
            defaultValue={initial?.expression}
            placeholder="0.00"
            pattern={
              advanced || !activity ? undefined : "[0-9]+(\\.[0-9]{1,2})?"
            }
            maxLength={256}
          />
        </label>
      </div>
      <label>
        {kind === "adjustment" ? "Reason for correction" : "Description"}
        <input
          name="description"
          required
          maxLength={300}
          defaultValue={initial?.description}
          placeholder="What is this for?"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Date
          <input
            name="date"
            type="date"
            defaultValue={initial?.date ?? today()}
            required
          />
        </label>
        {activity ? (
          !advanced && (
            <label>
              {kind === "income" ? "Received by" : "Paid by"}
              <select
                name="cash"
                defaultValue={initialActivity?.cash[0]?.memberId}
                required
              >
                {available.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                    {member.archivedAt ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : (
          <label>
            {kind === "obligation" || kind === "adjustment"
              ? "Member who should pay"
              : "Sent by"}
            <select
              name="from"
              defaultValue={
                initial && "fromMemberId" in initial
                  ? initial.fromMemberId
                  : undefined
              }
              required
            >
              {available.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.archivedAt ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {activity ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              className="!w-auto"
              type="checkbox"
              name="advanced"
              checked={advanced}
              onChange={(e) => setAdvanced(e.target.checked)}
            />
            Detailed cash and split amounts
          </label>
          {advanced && (
            <>
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-medium">
                  {kind === "income"
                    ? "Cash received by each member"
                    : "Cash paid by each member"}
                </legend>
                <p className="text-xs text-stone-500">
                  Leave non-participants blank. Cash amounts must add up to the
                  total.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {available.map((member) => (
                    <label key={member.id}>
                      {member.name} cash ({group.currency})
                      <input
                        name={`cash:${member.id}`}
                        inputMode="decimal"
                        pattern="[0-9]+(\.[0-9]{1,2})?"
                        defaultValue={
                          initialActivity?.cash.some(
                            (row) => row.memberId === member.id,
                          )
                            ? decimalAmount(
                                initialActivity.cash.find(
                                  (row) => row.memberId === member.id,
                                )!.amount,
                              )
                            : ""
                        }
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                Split method
                <select
                  name="splitMethod"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as Split["method"])}
                >
                  <option value="equal">Equal</option>
                  <option value="exact">Exact amounts</option>
                  <option value="weights">Weights</option>
                  <option value="percentages">Percentages</option>
                </select>
              </label>
              {method === "percentages" && (
                <p className="text-xs text-stone-500">
                  Enter each member’s percentage with up to two decimal places.
                  Shares must total 100%.
                </p>
              )}
            </>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              {!advanced || method === "equal"
                ? "Shared equally with"
                : "Allocated shares"}
            </legend>
            <div className="flex flex-wrap gap-3">
              {available.map((member) => (
                <div
                  key={member.id}
                  className="rounded-lg border border-stone-200 px-3 py-2"
                >
                  <label className="flex items-center gap-2">
                    <input
                      className="!w-auto accent-emerald-800"
                      type="checkbox"
                      name="shared"
                      value={member.id}
                      defaultChecked={
                        initialShared ? initialShared.includes(member.id) : true
                      }
                    />
                    {member.name}
                    {member.archivedAt ? " (archived)" : ""}
                  </label>
                  {advanced && method !== "equal" && (
                    <label className="mt-2">
                      {member.name}{" "}
                      {method === "exact"
                        ? "share"
                        : method === "weights"
                          ? "weight"
                          : "percentage"}
                      <input
                        key={method}
                        name={`share:${member.id}`}
                        inputMode="decimal"
                        defaultValue={shareValue(member.id)}
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <label>
          {kind === "obligation" || kind === "adjustment"
            ? "Member who should receive"
            : "Received by"}
          <select
            name="to"
            defaultValue={
              initial && "toMemberId" in initial
                ? initial.toMemberId
                : available[1]?.id
            }
            required
          >
            {available.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-xs leading-5 text-stone-500">
        {kind === "settlement" || kind === "transfer"
          ? "Record money already moved outside Expense Book. This does not send money or verify a bank transfer."
          : kind === "obligation"
            ? "Record an amount owed. No money movement is recorded."
            : kind === "adjustment"
              ? "A balanced non-cash adjustment. Include a clear reason."
              : "Cash participation and fair shares are tracked separately. Archived members cannot receive new income, expense, or obligation entries."}
      </p>
    </div>
  );
}
