import { z } from "zod";

const rowSchema = z.object({
  date: z.iso.date(),
  description: z.string().trim().min(1).max(300),
  kind: z.enum([
    "income",
    "expense",
    "obligation",
    "transfer",
    "settlement",
    "adjustment",
  ]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  project: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
});
export type ImportRow = z.infer<typeof rowSchema>;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
      continue;
    }
    value += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  values.push(value.trim());
  return values;
}
export function parseImportCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim());
  if (headerIndex < 0)
    throw new Error("CSV must include a header and at least one row.");
  const header = lines[headerIndex]!;
  const dataLines = lines.slice(headerIndex + 1).filter((line) => line.trim());
  if (dataLines.length < 1)
    throw new Error("CSV must include a header and at least one row.");
  const headers = parseCsvLine(header).map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  const required = ["date", "description", "kind", "amount"];
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length)
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}.`);
  const rows: ImportRow[] = [];
  const errors: { row: number; message: string }[] = [];
  for (let index = headerIndex + 1; index < lines.length; index++) {
    if (!lines[index]?.trim()) continue;
    try {
      const values = parseCsvLine(lines[index]!);
      const raw = Object.fromEntries(
        headers.map((header, column) => [header, values[column] ?? ""]),
      );
      const parsed = rowSchema.parse(raw);
      rows.push(parsed);
    } catch (error) {
      errors.push({
        row: index + 1,
        message:
          error instanceof z.ZodError
            ? (error.issues[0]?.message ?? "Invalid row.")
            : error instanceof Error
              ? error.message
              : "Invalid row.",
      });
    }
  }
  return { rows, errors, total: dataLines.length };
}
