import { describe, expect, it } from "vitest";
import { advanceDate, advanceAnchoredDate } from "../src/routes/recurring.js";

describe("recurring schedule dates", () => {
  it("preserves the original 31st across six production schedule advances", () => {
    let date = "2026-01-31";
    const dates: string[] = [];
    for (let index = 0; index < 6; index++) {
      date = advanceAnchoredDate(date, "monthly", 31);
      dates.push(date);
    }
    expect(dates).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
    ]);
  });
  it("retains quarterly and leap-day anchors and ignores them for weekly schedules", () => {
    const february = advanceAnchoredDate("2026-11-30", "quarterly", 30);
    expect(february).toBe("2027-02-28");
    expect(advanceAnchoredDate(february, "quarterly", 30)).toBe("2027-05-30");
    let date = "2024-02-29";
    for (let index = 0; index < 4; index++) {
      date = advanceAnchoredDate(date, "yearly", 29);
    }
    expect(date).toBe("2028-02-29");
    expect(advanceAnchoredDate("2026-01-31", "weekly", 1)).toBe("2026-02-07");
  });
  it("advances supported frequencies", () => {
    expect(advanceDate("2026-01-15", "weekly")).toBe("2026-01-22");
    expect(advanceDate("2026-01-15", "monthly")).toBe("2026-02-15");
    expect(advanceDate("2026-01-15", "quarterly")).toBe("2026-04-15");
    expect(advanceDate("2026-01-15", "yearly")).toBe("2027-01-15");
  });
  it("handles year boundaries", () => {
    expect(advanceDate("2026-12-31", "weekly")).toBe("2027-01-07");
    expect(advanceDate("2026-12-15", "monthly")).toBe("2027-01-15");
  });
  it("clamps month-end schedules without skipping the target month", () => {
    expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceDate("2026-08-31", "monthly")).toBe("2026-09-30");
    expect(advanceDate("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(advanceDate("2024-02-29", "yearly")).toBe("2025-02-28");
  });
});
