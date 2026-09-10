import { describe, expect, it } from "vitest";
import { parseHistoricalReport } from "../src/services/historical-report.js";

describe("historical report import", () => {
  it("parses text balance sheets and preserves calculation checks", () => {
    const report = parseHistoricalReport(
      `2015 balance sheet\n\njcheng\n------\n+75.00 (House)\n= +75.00\n\n=====\nHouse\n=====\nincome\n------\n- rent\n= 1200 * 12\n= +14400.00\n- total\n= 14400.00\ncost\n----\n- repairs\n= 100.00\n- total\n= 100.00\nnet\n---\n- total\n= 14300.00`,
      "txt",
    );
    expect(report.years).toHaveLength(1);
    expect(report.years[0]?.summaries[0]?.lines[0]).toMatchObject({
      label: "House",
      amount: "7500",
    });
    expect(report.years[0]?.properties[0]).toMatchObject({
      name: "House",
      income: "1440000",
      cost: "10000",
      net: "1430000",
    });
    expect(report.warnings).toEqual([]);
  });

  it("parses TOML cash flow and flags excluded or inferred data", () => {
    const report = parseHistoricalReport(
      `misc = { note = "review later" }\n[shared]\nkeeper = "Justin"\n\n[[houses]]\naddress = "12 Main St"\nkeeper = "Justin"\n[[houses.cash_flow]]\nyear = 2024\nincome = [{ what = "Rent", amount = "1200 * 12" }]\ncost = [{ what = "Tax", amount = 100.25 }]`,
      "toml",
    );
    expect(report.years[0]?.properties[0]).toMatchObject({
      name: "12 Main St",
      income: "1440000",
      cost: "10025",
      net: "1429975",
    });
    expect(report.warnings.length).toBeGreaterThanOrEqual(1);
    expect(report.warnings.join(" ")).toContain("Owner balances");
    expect(report.warnings.join(" ")).toContain("Miscellaneous");
  });

  it("rejects unsupported text without a yearly heading", () => {
    expect(() => parseHistoricalReport("notes only", "txt")).toThrow(
      "No yearly balance sheets",
    );
  });

  it("detects common CSV columns and groups rows by year and property", () => {
    const report = parseHistoricalReport(
      "Date,House,Type,Description,Amount\n2024-01-01,Main St,expense,Tax,$100.25\n2024-02-01,Main St,income,Rent,1200",
      "csv",
    );
    expect(report.years[0]?.properties[0]).toMatchObject({
      name: "Main St",
      income: "120000",
      cost: "10025",
      net: "109975",
    });
    expect(report.warnings).toEqual([]);
  });
});
