import { parse } from "smol-toml";
import { z } from "zod";
import { evaluateHistoricalAmount } from "../domain/money.js";

export type HistoricalLine = {
  label: string;
  expressions: string[];
  amount: string | null;
};
export type HistoricalSection = { name: string; lines: HistoricalLine[] };
export type HistoricalProperty = {
  name: string;
  sections: HistoricalSection[];
  income: string | null;
  cost: string | null;
  net: string | null;
};
export type HistoricalYear = {
  year: number;
  summaries: HistoricalSection[];
  properties: HistoricalProperty[];
  warnings: string[];
};
export type HistoricalReport = {
  format: "txt" | "toml" | "csv";
  years: HistoricalYear[];
  warnings: string[];
};
const sum = (lines: HistoricalLine[]) =>
  lines.reduce((total, line) => total + BigInt(line.amount ?? "0"), 0n);

function csvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  values.push(value.trim());
  return values;
}

function csvReport(source: string): HistoricalReport {
  const lines = source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2)
    throw new Error("CSV must include a header and at least one row.");
  const headers = csvLine(lines[0]!).map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  const find = (...names: string[]) =>
    names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ??
    -1;
  const yearColumn = find("year", "date", "period");
  const propertyColumn = find("property", "house", "address", "name");
  const kindColumn = find("kind", "type", "category", "class");
  const amountColumn = find("amount", "value", "total", "balance");
  if (yearColumn < 0 || amountColumn < 0)
    throw new Error("CSV needs year (or date) and amount (or value) columns.");
  const report: HistoricalReport = { format: "csv", years: [], warnings: [] };
  for (let index = 1; index < lines.length; index++) {
    try {
      const values = csvLine(lines[index]!);
      const yearValue = values[yearColumn] ?? "";
      const year = Number(/^\d{4}/.exec(yearValue)?.[0] ?? yearValue);
      if (!Number.isInteger(year) || year < 1900 || year > 2200)
        throw new Error("year is invalid");
      const rawAmount = values[amountColumn]!.replace(/[$,]/g, "");
      const amount = evaluateHistoricalAmount(rawAmount).toString();
      const name = values[propertyColumn]?.trim() || "General";
      const kind = (values[kindColumn] ?? "income").toLowerCase();
      const sectionName = /cost|expense|outflow|tax|repair/.test(kind)
        ? "cost"
        : "income";
      let annual = report.years.find((entry) => entry.year === year);
      if (!annual) {
        annual = { year, summaries: [], properties: [], warnings: [] };
        report.years.push(annual);
      }
      let property = annual.properties.find((entry) => entry.name === name);
      if (!property) {
        property = { name, sections: [], income: null, cost: null, net: null };
        annual.properties.push(property);
      }
      let section = property.sections.find(
        (entry) => entry.name === sectionName,
      );
      if (!section) {
        section = { name: sectionName, lines: [] };
        property.sections.push(section);
      }
      section.lines.push({
        label: values[find("description", "what", "item")] || sectionName,
        expressions: [rawAmount],
        amount,
      });
    } catch (error) {
      report.warnings.push(
        `CSV row ${index + 1}: ${error instanceof Error ? error.message : "could not be read."}`,
      );
    }
  }
  for (const annual of report.years) {
    for (const property of annual.properties) {
      for (const kind of ["income", "cost"] as const) {
        const section = property.sections.find((entry) => entry.name === kind);
        if (section) {
          property[kind] = sum(section.lines).toString();
          section.lines.push({
            label: "total",
            expressions: [],
            amount: property[kind],
          });
        }
      }
      if (property.income !== null || property.cost !== null)
        property.net = (
          BigInt(property.income ?? "0") - BigInt(property.cost ?? "0")
        ).toString();
      property.sections.push({
        name: "net",
        lines: [
          {
            label: "total",
            expressions: ["income − costs"],
            amount: property.net,
          },
        ],
      });
    }
  }
  if (!report.years.length)
    throw new Error("CSV did not contain any valid historical rows.");
  return report;
}

function reconcile(year: HistoricalYear) {
  for (const summary of year.summaries) {
    const total = summary.lines.find((line) => line.label === "total");
    const rows = summary.lines.filter((line) => line.label !== "total");
    if (
      total?.amount != null &&
      rows.every((row) => row.amount != null) &&
      sum(rows) !== BigInt(total.amount)
    )
      year.warnings.push(
        `${summary.name}: listed amounts differ from the reported total by ${(sum(rows) - BigInt(total.amount)).toString()} minor units.`,
      );
  }
  for (const property of year.properties) {
    for (const [sectionName, field] of [
      ["income", "income"],
      ["cost", "cost"],
      ["net", "net"],
    ] as const) {
      const section = property.sections.find(
        (section) => section.name === sectionName,
      );
      const total = section?.lines.find((line) => line.label === "total");
      property[field] = total?.amount ?? null;
      const rows =
        section?.lines.filter((line) => line.label !== "total") ?? [];
      if (
        sectionName !== "net" &&
        total?.amount != null &&
        rows.length &&
        rows.every((row) => row.amount != null) &&
        sum(rows) !== BigInt(total.amount)
      )
        year.warnings.push(
          `${property.name} ${sectionName}: line items do not match the reported total.`,
        );
    }
    if (
      property.income !== null &&
      property.cost !== null &&
      property.net !== null &&
      BigInt(property.income) - BigInt(property.cost) !== BigInt(property.net)
    )
      year.warnings.push(
        `${property.name}: income minus costs does not match reported net earnings.`,
      );
    if (
      property.name !== "misc" &&
      [property.income, property.cost, property.net].some(
        (value) => value === null,
      )
    )
      year.warnings.push(
        `${property.name}: incomplete totals; missing amounts are shown as unavailable.`,
      );
  }
}

function textReport(source: string): HistoricalReport {
  const report: HistoricalReport = { format: "txt", years: [], warnings: [] };
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  let year: HistoricalYear | undefined;
  let property: HistoricalProperty | undefined;
  let section: HistoricalSection | undefined;
  let item: HistoricalLine | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const annual = /^(\d{4}) balance sheet$/i.exec(line);
    if (annual) {
      year = {
        year: Number(annual[1]),
        summaries: [],
        properties: [],
        warnings: [],
      };
      if (report.years.some((existing) => existing.year === year!.year))
        throw new Error("Duplicate year headings in report.");
      report.years.push(year);
      property = undefined;
      section = undefined;
      item = undefined;
      continue;
    }
    if (!line || /^[*=-]+$/.test(line)) continue;
    if (!year) {
      report.warnings.push(
        `Line ${i + 1}: unrecognized content before the first year.`,
      );
      continue;
    }
    if (
      /^=+$/.test(lines[i - 1]?.trim() ?? "") &&
      /^=+$/.test(lines[i + 1]?.trim() ?? "")
    ) {
      property = {
        name: line,
        sections: [],
        income: null,
        cost: null,
        net: null,
      };
      year.properties.push(property);
      section = undefined;
      item = undefined;
      continue;
    }
    if (/^-+$/.test(lines[i + 1]?.trim() ?? "")) {
      section = { name: line, lines: [] };
      (property ? property.sections : year.summaries).push(section);
      item = undefined;
      continue;
    }
    if (!section) {
      year.warnings.push(
        `Line ${i + 1}: unrecognized content (preserved in source).`,
      );
      continue;
    }
    const summary = /^([+-]?\d+\.\d{2})\s+\((.+)\)$/.exec(line);
    if (summary && !property) {
      section.lines.push({
        label: summary[2]!,
        expressions: [summary[1]!],
        amount: evaluateHistoricalAmount(summary[1]!).toString(),
      });
      continue;
    }
    if (line.startsWith("- ")) {
      item = { label: line.slice(2), expressions: [], amount: null };
      section.lines.push(item);
      continue;
    }
    if (line.startsWith("=")) {
      if (!property) {
        item = { label: "total", expressions: [], amount: null };
        section.lines.push(item);
      }
      if (item) {
        const expression = line.slice(1).trim();
        item.expressions.push(expression);
        try {
          const amount = evaluateHistoricalAmount(expression).toString();
          if (item.amount !== null && item.amount !== amount)
            year.warnings.push(
              `${property?.name ?? section.name} / ${item.label}: calculation and reported value differ.`,
            );
          item.amount = amount;
        } catch {
          item.amount = null;
          year.warnings.push(
            `Line ${i + 1}: calculation could not be interpreted.`,
          );
        }
        continue;
      }
    }
    year.warnings.push(
      `Line ${i + 1}: unrecognized content (preserved in source).`,
    );
  }
  if (!report.years.length)
    throw new Error(
      "No yearly balance sheets found. Expected a heading such as '2015 balance sheet'.",
    );
  for (const value of report.years) reconcile(value);
  return report;
}

const cashItem = z
  .object({
    amount: z.union([z.string().max(256), z.number().finite()]),
    what: z.string(),
    who: z.string().optional(),
  })
  .passthrough();
const flow = z
  .object({
    year: z.number().int().min(1900).max(2200),
    income: z.array(cashItem).default([]),
    cost: z.array(cashItem).default([]),
  })
  .passthrough();
const propertySchema = z
  .object({
    id: z.string().optional(),
    address: z.string().optional(),
    keeper: z.string().optional(),
    cash_flow: z.array(flow).default([]),
  })
  .passthrough();

function tomlReport(source: string): HistoricalReport {
  const input = z
    .object({
      houses: z.array(propertySchema).min(1),
      shared: propertySchema.optional(),
      misc: z.unknown().optional(),
    })
    .passthrough()
    .parse(parse(source));
  const report: HistoricalReport = {
    format: "toml",
    years: [],
    warnings: [
      "Owner balances are not inferred from TOML ownership shares. Use the TXT balance sheet for reported owner balances. Ownership, notes, and other source fields remain available in the original source.",
    ],
  };
  const properties = [
    ...input.houses,
    ...(input.shared ? [{ ...input.shared, id: "shared" }] : []),
  ];
  for (const [index, property] of properties.entries()) {
    for (const cash of property.cash_flow) {
      let year = report.years.find((year) => year.year === cash.year);
      if (!year) {
        year = { year: cash.year, summaries: [], properties: [], warnings: [] };
        report.years.push(year);
      }
      const row: HistoricalProperty = {
        name: property.address ?? property.id ?? `Property ${index + 1}`,
        sections: [],
        income: null,
        cost: null,
        net: null,
      };
      if (year.properties.some((existing) => existing.name === row.name))
        throw new Error(`Duplicate property/year: ${row.name}, ${cash.year}.`);
      for (const kind of ["income", "cost"] as const) {
        const items = cash[kind].map((entry) => {
          const expression = String(entry.amount);
          return {
            label: `${entry.what}${(entry.who ?? property.keeper) ? ` (${entry.who ?? property.keeper})` : ""}`,
            expressions: [expression],
            amount: evaluateHistoricalAmount(expression).toString(),
          };
        });
        row[kind] = sum(items).toString();
        row.sections.push({
          name: kind,
          lines: [
            ...items,
            { label: "total", expressions: [], amount: row[kind] },
          ],
        });
      }
      row.net = (BigInt(row.income!) - BigInt(row.cost!)).toString();
      row.sections.push({
        name: "net",
        lines: [
          { label: "total", expressions: ["income − costs"], amount: row.net },
        ],
      });
      year.properties.push(row);
    }
  }
  if (input.misc)
    report.warnings.push(
      "Miscellaneous payment records are preserved in the source but excluded from income, costs, and balances because their meaning needs review.",
    );
  if (!report.years.length)
    throw new Error("No annual cash-flow records found.");
  return report;
}

export function parseHistoricalReport(
  source: string,
  format: "txt" | "toml" | "csv",
) {
  if (!source.trim() || Buffer.byteLength(source) > 1_000_000)
    throw new Error("Choose a nonempty file up to 1 MB.");
  const report =
    format === "txt"
      ? textReport(source)
      : format === "toml"
        ? tomlReport(source)
        : csvReport(source);
  report.years.sort((a, b) => a.year - b.year);
  return report;
}
