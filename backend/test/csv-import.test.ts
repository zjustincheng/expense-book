import { describe, expect, it } from "vitest";
import { parseImportCsv } from "../src/services/csv-import.js";

describe("CSV import preview", () => {
  it("parses quoted descriptions and optional labels", () => {
    const result = parseImportCsv(
      'date,description,kind,amount,category\n2026-01-02,"Hotel, downtown",expense,125.50,Lodging',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      description: "Hotel, downtown",
      amount: "125.50",
      category: "Lodging",
    });
  });
  it("reports invalid rows without discarding valid rows", () => {
    const result = parseImportCsv(
      "date,description,kind,amount\n2026-01-02,Coffee,expense,4.25\nnot-a-date,Missing date,expense,2",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.row).toBe(3);
  });
  it("requires the core bookkeeping columns", () => {
    expect(() =>
      parseImportCsv("date,description\n2026-01-01,Missing type"),
    ).toThrow("missing required columns");
  });
});
