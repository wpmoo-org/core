import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMoney,
  formatNumber
} from "../src/data-table/format.js";

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

describe("formatNumber", () => {
  it("formats numbers with a fixed locale and grouping", () => {
    expect(formatNumber(1234567.891)).toBe("1,234,567.89");
  });

  it("rejects non-finite numbers", () => {
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("formatMoney", () => {
  it("formats integer minor units with a fixed currency locale", () => {
    expect(formatMoney(12345, { currency: "USD" })).toBe("$123.45");
    expect(formatMoney(-987, { currency: "EUR" })).toBe("-€9.87");
  });

  it("supports zero-decimal currencies from integer minor units", () => {
    expect(formatMoney(1234, { currency: "JPY", fractionDigits: 0 })).toBe(
      "¥1,234"
    );
  });

  it("rejects fractional minor-unit amounts", () => {
    expect(() => formatMoney(123.45, { currency: "USD" })).toThrow(RangeError);
  });
});
