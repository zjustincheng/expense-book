import { describe, expect, it } from "vitest";
import { advanceDate } from "../src/routes/recurring.js";

describe("recurring schedule dates", () => {
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
