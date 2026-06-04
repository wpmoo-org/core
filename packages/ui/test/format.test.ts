import { describe, expect, it } from "vitest";
import { formatDate } from "../src/data-table/format.js";

describe("formatDate", () => {
  it("formats dates with a fixed UTC timezone and stable English layout", () => {
    expect(formatDate(new Date("2026-06-04T10:30:00.000Z"))).toBe(
      "Jun 4, 2026 at 10:30 AM"
    );
  });

  it("uses UTC rather than the host timezone for midnight-adjacent values", () => {
    expect(formatDate("2026-01-01T00:05:00.000Z")).toBe(
      "Jan 1, 2026 at 12:05 AM"
    );
  });

  it("rejects invalid date inputs", () => {
    expect(() => formatDate("not-a-date")).toThrow(RangeError);
  });
});
