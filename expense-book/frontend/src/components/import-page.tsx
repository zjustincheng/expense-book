"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type GroupDetail } from "@/lib/api";
type Preview = {
  total: number;
  errors: { row: number; message: string }[];
  rows: {
    date: string;
    description: string;
    kind: string;
    amount: string;
    project?: string;
    category?: string;
    duplicate: boolean;
  }[];
};
export function ImportPage({ groupId }: { groupId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [payer, setPayer] = useState("");
  const [rowPayers, setRowPayers] = useState<Record<number, string>>({});
  const [splitMembers, setSplitMembers] = useState<string[]>([]);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [confirmed, setConfirmed] = useState(0);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [history, setHistory] = useState<
    { id: string; createdBy: string; rowCount: number; createdAt: string }[]
  >([]);
  useEffect(() => {
    api<GroupDetail>(`/groups/${groupId}`)
      .then((value) => {
        setGroup(value);
        setPayer(value.members.find((member) => !member.archivedAt)?.id ?? "");
        const first =
          value.members.find((member) => !member.archivedAt)?.id ?? "";
        setTransferFrom(first);
        setTransferTo(first);
        setSplitMembers(
          value.members
            .filter((member) => !member.archivedAt)
            .map((member) => member.id),
        );
      })
      .catch(() => undefined);
  }, [groupId]);
  useEffect(() => {
    api<typeof history>(`/groups/${groupId}/import/history`)
      .then(setHistory)
      .catch(() => undefined);
  }, [groupId]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file") as File | null;
    if (!file || file.size === 0) {
      setError("Choose a CSV file first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextPreview = await api<Preview>(
          `/groups/${groupId}/import/preview`,
          { csv: await file.text() },
          crypto.randomUUID(),
        );
      setPreview(nextPreview);
      setSelectedRows(
        nextPreview.rows
          .map((row, index) => (!row.duplicate ? index : -1))
          .filter((index) => index >= 0),
      );
      setRowPayers({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to preview this CSV.");
    } finally {
      setLoading(false);
    }
  }
  function downloadTemplate() {
    const csv =
      "date,description,kind,amount,project,category\n" +
      "2026-01-02,Hotel,expense,125.50,Trip,Lodging\n" +
      "2026-01-03,Paycheck,income,2000,,Salary\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "expense-book-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  function selectReadyRows() {
    if (!preview) return;
    setSelectedRows(
      preview.rows
        .map((row, index) =>
          includeDuplicates || !row.duplicate ? index : -1,
        )
        .filter((index) => index >= 0),
    );
  }
  async function confirmImport() {
    if (!preview || !group || !payer) return;
    const splitMemberIds = splitMembers;
    try {
      const result = await api<{ count: number }>(
        `/groups/${groupId}/import/confirm`,
        {
          rows: preview.rows
            .map((row, index) => ({
              ...row,
              selected: selectedRows.includes(index),
              cashMemberId: rowPayers[index] ?? payer,
            }))
            .filter(
              (row) =>
                row.selected &&
                (includeDuplicates || !row.duplicate) &&
                (row.kind === "income" ||
                  row.kind === "expense" ||
                  (transferFrom && transferTo && transferFrom !== transferTo)),
            )
            .map((row) => ({
              ...row,
              splitMemberIds,
              fromMemberId: transferFrom,
              toMemberId: transferTo,
            })),
        },
        crypto.randomUUID(),
      );
      setConfirmed(result.count);
      setHistory(
        await api<typeof history>(`/groups/${groupId}/import/history`),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to create import drafts.",
      );
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <a href={`/?group=${groupId}`} className="text-sm text-emerald-800">
        ← Back to group
      </a>
      <header>
        <h1 className="text-3xl font-semibold">Import historical records</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-500">
          Upload a CSV to validate it before anything changes. Required columns:
          date, description, kind, amount. This preview never posts records.
        </p>
      </header>
      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-4 rounded-2xl border border-stone-200 bg-white p-6"
      >
        <label className="min-w-64">
          CSV file
          <input name="file" type="file" accept=".csv,text/csv" required />
        </label>
        <Button type="button" variant="outline" onClick={downloadTemplate}>
          Download template
        </Button>
        <Button disabled={loading}>
          {loading ? "Checking…" : "Preview CSV"}
        </Button>
      </form>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {preview && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-stone-100 p-4">
              <b>{preview.total}</b>
              <span className="ml-2 text-sm text-stone-600">rows found</span>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <b>{preview.rows.length}</b>
              <span className="ml-2 text-sm text-emerald-800">valid rows</span>
            </div>
            <div className="rounded-xl bg-red-50 p-4">
              <b>{preview.errors.length}</b>
              <span className="ml-2 text-sm text-red-800">
                rows with errors
              </span>
            </div>
          </div>
          {preview.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <h2 className="font-semibold">Fix these rows and upload again</h2>
              <ul className="mt-2 list-inside list-disc">
                {preview.errors.map((item) => (
                  <li key={item.row}>
                    Row {item.row}: {item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className="w-12 px-4 py-3 font-medium">Include</th>
                  {[
                    "Date",
                    "Description",
                    "Type",
                    "Amount",
                    "Payer",
                    "Status",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr
                    key={`${row.date}-${row.description}-${index}`}
                    className="border-b border-stone-100"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Include row ${index + 1}`}
                        checked={selectedRows.includes(index)}
                        onChange={(event) =>
                          setSelectedRows(
                            event.target.checked
                              ? [...selectedRows, index]
                              : selectedRows.filter((value) => value !== index),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">{row.description}</td>
                    <td className="px-4 py-3">{row.kind}</td>
                    <td className="px-4 py-3">{row.amount}</td>
                    <td className="px-4 py-3">
                      {group &&
                      (row.kind === "income" || row.kind === "expense") ? (
                        <select
                          aria-label={`Payer for row ${index + 1}`}
                          value={rowPayers[index] ?? payer}
                          onChange={(event) =>
                            setRowPayers({
                              ...rowPayers,
                              [index]: event.target.value,
                            })
                          }
                        >
                          {group.members
                            .filter((member) => !member.archivedAt)
                            .map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.duplicate ? (
                        <span className="text-amber-700">
                          Possible duplicate
                        </span>
                      ) : (
                        <span className="text-emerald-700">
                          Ready for review
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-stone-500">
            {confirmed > 0
              ? `${confirmed} draft records created. Review them before posting.`
              : "Choose who paid each imported activity row. Valid, non-duplicate income and expense rows will become drafts for review."}
          </p>
          {group && confirmed === 0 && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-stone-50 p-4">
              <div className="flex w-full flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <b>{selectedRows.length}</b> of {preview.rows.length} rows selected
                </span>
                <Button type="button" size="sm" variant="outline" onClick={selectReadyRows}>
                  Select ready rows
                </Button>
              </div>
              <label>
                Payer for imported rows
                <select
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                >
                  {group.members
                    .filter((member) => !member.archivedAt)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeDuplicates}
                  onChange={(event) =>
                    setIncludeDuplicates(event.target.checked)
                  }
                />
                Include possible duplicates
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Shared by:</span>
                {group.members
                  .filter((member) => !member.archivedAt)
                  .map((member) => (
                    <label key={member.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={splitMembers.includes(member.id)}
                        onChange={(event) =>
                          setSplitMembers(
                            event.target.checked
                              ? [...splitMembers, member.id]
                              : splitMembers.filter((id) => id !== member.id),
                          )
                        }
                      />
                      {member.name}
                    </label>
                  ))}
              </div>
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label>
                  From for direct rows
                  <select
                    value={transferFrom}
                    onChange={(event) => setTransferFrom(event.target.value)}
                  >
                    {group.members
                      .filter((member) => !member.archivedAt)
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  To
                  <select
                    value={transferTo}
                    onChange={(event) => setTransferTo(event.target.value)}
                  >
                    {group.members
                      .filter((member) => !member.archivedAt)
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <Button
                onClick={() => void confirmImport()}
                disabled={
                  splitMembers.length === 0 || selectedRows.length === 0
                }
              >
                Create review drafts
              </Button>
            </div>
          )}
        </section>
      )}
      {history.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-semibold">Import history</h2>
          <div className="mt-3 divide-y divide-stone-100 text-sm">
            {history
              .slice()
              .reverse()
              .map((batch) => (
                <div
                  key={batch.id}
                  className="flex flex-wrap justify-between gap-2 py-3"
                >
                  <span>
                    {batch.rowCount} draft{batch.rowCount === 1 ? "" : "s"}{" "}
                    created
                  </span>
                  <span className="text-stone-500">
                    {new Date(batch.createdAt).toLocaleString()} ·{" "}
                    {batch.createdBy}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
    </main>
  );
}
