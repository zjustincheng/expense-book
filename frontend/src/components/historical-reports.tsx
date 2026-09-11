"use client";

import { useEffect, useRef, useState } from "react";
import { api, money, type GroupDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Line = { label: string; expressions: string[]; amount: string | null };
type Section = { name: string; lines: Line[] };
type Property = {
  name: string;
  income: string | null;
  cost: string | null;
  net: string | null;
  sections: Section[];
};
type Year = {
  year: number;
  properties: Property[];
  summaries: Section[];
  warnings: string[];
};
type Report = {
  format: "txt" | "toml" | "csv";
  years: Year[];
  warnings: string[];
};
type Sheet = {
  id?: string;
  title: string;
  fileName: string;
  source: string;
  currency: string;
  report: Report;
  reviewHash?: string;
};
type Saved = { id: string; title: string; fileName: string; createdAt: string };
const panel = "rounded-2xl border border-stone-200 bg-white p-5 sm:p-7";
const label = (value: string) => value.replaceAll("_", " ");

export function HistoricalReports({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [year, setYear] = useState("");
  const [property, setProperty] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const busy = useRef(false);
  const reportElement = useRef<HTMLElement>(null);
  const path = `/groups/${groupId}/historical-reports`;
  useEffect(() => {
    let active = true;
    Promise.all([api<GroupDetail>(`/groups/${groupId}`), api<Saved[]>(path)])
      .then(([group, saved]) => {
        if (active) {
          setGroup(group);
          setSaved(saved);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load historical reports.",
          );
      });
    return () => {
      active = false;
    };
  }, [groupId, path]);
  function show(value: Sheet) {
    setSheet(value);
    setYear(String(value.report.years[0]?.year ?? ""));
    setProperty("");
    setReviewed(false);
  }
  async function work(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this request.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function preview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file") as File;
    await work(async () => {
      if (!file?.size || file.size > 1_000_000)
        throw new Error("Choose a TXT or TOML file up to 1 MB.");
      const format = file.name.toLowerCase().endsWith(".toml")
        ? "toml"
        : file.name.toLowerCase().endsWith(".txt")
          ? "txt"
          : file.name.toLowerCase().endsWith(".csv")
            ? "csv"
            : null;
      if (!format) throw new Error("Choose a .txt, .toml, or .csv file.");
      show(
        await api<Sheet>(`${path}/preview`, {
          title:
            String(data.get("title")).trim() ||
            file.name.replace(/\.(txt|toml|csv)$/i, ""),
          fileName: file.name,
          source: await file.text(),
          format,
        }),
      );
    });
  }
  function print() {
    const closed = Array.from(
      reportElement.current?.querySelectorAll("details:not([open])") ?? [],
    ) as HTMLDetailsElement[];
    closed.forEach((detail) => {
      detail.open = true;
    });
    window.addEventListener(
      "afterprint",
      () =>
        closed.forEach((detail) => {
          detail.open = false;
        }),
      { once: true },
    );
    window.print();
  }
  function downloadCsv() {
    if (!annual || !visible.length) return;
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["Year", "Property", "Income", "Costs", "Net earnings"],
      ...visible.map((row) => [
        String(annual.year),
        row.name,
        row.income === null ? "" : money(row.income, sheet?.currency ?? "USD"),
        row.cost === null ? "" : money(row.cost, sheet?.currency ?? "USD"),
        row.net === null ? "" : money(row.net, sheet?.currency ?? "USD"),
      ]),
    ];
    const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sheet?.title ?? "historical-report"}-${annual.year}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  const annual = sheet?.report.years.find(
    (value) => String(value.year) === year,
  );
  const visible =
    annual?.properties.filter(
      (value) => !property || value.name === property,
    ) ?? [];
  const amount = (value: string | null) =>
    value === null ? "Not available" : money(value, sheet?.currency ?? "USD");
  const total = (rows: Property[], field: "income" | "cost" | "net") =>
    rows.some((row) => row[field] === null)
      ? null
      : rows.reduce((sum, row) => sum + BigInt(row[field]!), 0n).toString();
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <a className="text-sm text-emerald-800" href={`/?group=${groupId}`}>
        ← Back to group
      </a>
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
          Historical archive
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Historical archive</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
          Turn annual rental records into a readable sheet. Imported archives
          never change live transactions, member balances, or settlement
          suggestions. Figures remain historical and unverified.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-emerald-900"
        >
          {notice}
        </p>
      )}
      {!group && !error && <p role="status">Loading historical archive…</p>}
      {group && group.role !== "viewer" && (
        <form className={`${panel} print:hidden`} onSubmit={preview}>
          <fieldset
            disabled={pending}
            className="grid items-end gap-4 sm:grid-cols-3"
          >
            <label>
              Report title
              <input
                name="title"
                maxLength={120}
                placeholder="Rental properties, 2015–2024"
              />
            </label>
            <label>
              Historical file
              <input
                name="file"
                type="file"
                accept=".txt,.toml,.csv"
                required
              />
            </label>
            <Button>
              {pending ? "Working…" : "Preview historical report"}
            </Button>
          </fieldset>
          <p className="mt-3 text-xs text-stone-500">
            Supports yearly TXT, rental-house TOML, and CSV files with year and
            amount columns. Maximum 1 MB. Currency uses the group’s{" "}
            {group.currency} setting; no currency conversion is performed.
          </p>
        </form>
      )}
      <section className={`${panel} print:hidden`}>
        <h2 className="font-semibold">Saved reports</h2>
        {!saved.length ? (
          <p className="mt-2 text-sm text-stone-500">
            No historical reports saved yet.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-stone-100">
            {saved.map((value) => (
              <button
                key={value.id}
                disabled={pending}
                onClick={() =>
                  void work(async () =>
                    show(await api<Sheet>(`${path}/${value.id}`)),
                  )
                }
                className="flex w-full flex-wrap justify-between gap-2 py-3 text-left text-sm hover:text-emerald-800"
              >
                <span className="font-medium">{value.title}</span>
                <span className="text-stone-500">
                  {value.fileName} ·{" "}
                  {new Date(value.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {sheet && (
        <article ref={reportElement} className="space-y-6">
          <div className={`${panel} border-t-4 border-t-emerald-800`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-stone-500">
                  {sheet.id ? "Saved historical report" : "Import preview"} ·{" "}
                  {sheet.report.format.toUpperCase()}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{sheet.title}</h2>
                <p className="mt-2 text-sm text-stone-500">
                  Source: {sheet.fileName} · {sheet.currency} · Unverified
                  historical figures
                </p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button
                  variant="outline"
                  onClick={downloadCsv}
                  disabled={!visible.length}
                >
                  Download CSV
                </Button>
                <Button variant="outline" onClick={print}>
                  Print / Save PDF
                </Button>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 print:hidden">
              <label>
                Report year
                <select
                  value={year}
                  onChange={(event) => {
                    setYear(event.target.value);
                    setProperty("");
                  }}
                >
                  {sheet.report.years.map((value) => (
                    <option key={value.year}>{value.year}</option>
                  ))}
                </select>
              </label>
              <label>
                Property
                <select
                  value={property}
                  onChange={(event) => setProperty(event.target.value)}
                >
                  <option value="">All properties</option>
                  {annual?.properties.map((value) => (
                    <option key={value.name} value={value.name}>
                      {label(value.name)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-4 text-sm font-medium">
              Showing {year} · {property ? label(property) : "All properties"}
            </p>
          </div>
          {(sheet.report.warnings.length > 0 ||
            (annual?.warnings.length ?? 0) > 0) && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <h3 className="font-semibold">Review notes</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {[...sheet.report.warnings, ...(annual?.warnings ?? [])].map(
                  (warning, index) => (
                    <li key={index}>{warning}</li>
                  ),
                )}
              </ul>
            </section>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {(["income", "cost", "net"] as const).map((field) => (
              <section key={field} className={panel}>
                <h3 className="text-sm text-stone-500">
                  {field === "income"
                    ? "Income"
                    : field === "cost"
                      ? "Costs"
                      : "Net earnings"}
                </h3>
                <p className="mt-3 text-xl font-semibold tabular-nums">
                  {amount(
                    visible.length
                      ? total(
                          visible.filter((row) => row.name !== "misc"),
                          field,
                        )
                      : null,
                  )}
                </p>
                <p className="mt-2 text-xs text-stone-500">
                  Selected year and properties · excludes misc
                </p>
              </section>
            ))}
          </div>
          <section className={panel}>
            <h3 className="text-lg font-semibold">
              Property overview · {year}
            </h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-50">
                  <tr>
                    {["Property", "Income", "Costs", "Net earnings"].map(
                      (value) => (
                        <th key={value} className="p-3">
                          {value}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.name} className="border-b border-stone-100">
                      <th className="p-3 font-medium">{label(row.name)}</th>
                      {(["income", "cost", "net"] as const).map((field) => (
                        <td
                          key={field}
                          className="whitespace-nowrap p-3 tabular-nums"
                        >
                          {amount(row[field])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {!!annual?.summaries.length && (
            <section className={panel}>
              <h3 className="text-lg font-semibold">
                Reported owner balances & earnings · {year}
              </h3>
              <p className="mt-2 text-sm text-stone-500">
                Source signs are preserved; these figures are not current
                amounts to settle. Totals below cover all properties in the
                source year.
              </p>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {annual.summaries.map((section, index) => (
                  <section key={index}>
                    <h4 className="mb-2 font-semibold">
                      {label(section.name)}
                    </h4>
                    <dl className="divide-y divide-stone-100">
                      {section.lines.map((line, index) => (
                        <div
                          key={index}
                          className={`flex justify-between gap-4 py-2 text-sm ${line.label === "total" ? "font-bold" : ""}`}
                        >
                          <dt>{label(line.label)}</dt>
                          <dd className="whitespace-nowrap tabular-nums">
                            {amount(line.amount)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </section>
          )}
          <section className={panel}>
            <h3 className="text-lg font-semibold">Details & calculations</h3>
            {visible.map((row) => (
              <details
                key={row.name}
                className="mt-4 border-t border-stone-100 pt-4"
              >
                <summary className="cursor-pointer font-medium text-emerald-900">
                  {label(row.name)}
                </summary>
                <div className="mt-3 grid gap-5 md:grid-cols-2">
                  {row.sections.map((section, index) => (
                    <section key={index}>
                      <h4 className="mb-2 font-semibold capitalize">
                        {section.name}
                      </h4>
                      {section.lines.map((line, index) => (
                        <div
                          key={index}
                          className="border-b border-stone-100 py-2 text-sm"
                        >
                          <div className="flex justify-between gap-4">
                            <span>{line.label}</span>
                            <span className="whitespace-nowrap tabular-nums">
                              {amount(line.amount)}
                            </span>
                          </div>
                          {line.expressions.length > 0 && (
                            <p className="mt-1 break-words font-mono text-xs text-stone-500">
                              {line.expressions.join(" = ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              </details>
            ))}
          </section>
          <section className={panel}>
            <h3 className="font-semibold">
              Year comparison · all properties, excluding misc
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Year",
                      "Income",
                      "Costs",
                      "Net earnings",
                      "Review notes",
                    ].map((value) => (
                      <th key={value} className="p-3">
                        {value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.report.years.map((value) => (
                    <tr key={value.year} className="border-t border-stone-100">
                      <th className="p-3">{value.year}</th>
                      {(["income", "cost", "net"] as const).map((field) => (
                        <td
                          className="whitespace-nowrap p-3 tabular-nums"
                          key={field}
                        >
                          {amount(
                            total(
                              value.properties.filter(
                                (row) => row.name !== "misc",
                              ),
                              field,
                            ),
                          )}
                        </td>
                      ))}
                      <td className="p-3">{value.warnings.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {!sheet.id && (
            <section className={`${panel} print:hidden`}>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                I have reviewed the source figures and review notes across all
                years. Save this as a historical reference only.
              </label>
              <Button
                className="mt-4"
                disabled={!reviewed || pending}
                onClick={() =>
                  void work(async () => {
                    const result = await api<{ id: string; existing: boolean }>(
                      path,
                      {
                        title: sheet.title,
                        fileName: sheet.fileName,
                        source: sheet.source,
                        format: sheet.report.format,
                        reviewHash: sheet.reviewHash,
                        reviewed: true,
                      },
                    );
                    setSheet({ ...sheet, id: result.id });
                    setNotice(
                      result.existing
                        ? "This source is already saved. Open it from Saved reports."
                        : "Historical report saved. Live balances have not changed.",
                    );
                    setSaved(await api<Saved[]>(path));
                  })
                }
              >
                {pending ? "Saving…" : "Save historical report"}
              </Button>
            </section>
          )}
        </article>
      )}
      {sheet && (
        <details className={`${panel} print:hidden`}>
          <summary className="cursor-pointer text-sm font-medium">
            Original source
          </summary>
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">
            {sheet.source}
          </pre>
        </details>
      )}
    </main>
  );
}
