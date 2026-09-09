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
});
