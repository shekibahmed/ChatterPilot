import { describe, expect, it } from "vitest";
import { divideRoundHalfUp, formatMinor, parseAmountToMinor } from "./money.ts";

describe("parseAmountToMinor", () => {
  it.each([
    ["2400", 240000],
    ["2,400", 240000],
    ["2,400.5", 240050],
    ["1,20,000", 12000000],
    ["12,34,567.89", 123456789],
    ["1,234,567", 123456700],
    ["0.01", 1],
    ["  99.90 ", 9990],
  ])("parses %j exactly", (text, minor) => {
    expect(parseAmountToMinor(text)).toEqual({ ok: true, minor, scale: 2 });
  });

  it("avoids binary float error", () => {
    // 0.1 + 0.2 style inputs must stay exact.
    expect(parseAmountToMinor("1000000.10")).toEqual({ ok: true, minor: 100000010, scale: 2 });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["-5", "invalid_format"],
    ["₹500", "invalid_format"],
    ["5 lakh", "invalid_format"],
    ["2.400,50", "invalid_format"],
    ["1,00", "invalid_grouping"],
    ["12,3456", "invalid_format"],
    ["1234,567", "invalid_format"],
    ["1,2,345", "invalid_format"],
    ["10.005", "too_many_decimals"],
    ["99999999999999999", "out_of_range"],
  ])("rejects %j as %s", (text, reason) => {
    expect(parseAmountToMinor(text)).toEqual({ ok: false, reason });
  });

  it("honours scale 0", () => {
    expect(parseAmountToMinor("2,400", 0)).toEqual({ ok: true, minor: 2400, scale: 0 });
    expect(parseAmountToMinor("2400.5", 0)).toEqual({ ok: false, reason: "too_many_decimals" });
  });
});

describe("formatMinor", () => {
  it.each([
    [240050, 2, "2400.50"],
    [1, 2, "0.01"],
    [0, 2, "0.00"],
    [-150, 2, "-1.50"],
    [2400, 0, "2400"],
  ])("formats %d at scale %d as %s", (minor, scale, text) => {
    expect(formatMinor(minor, scale)).toBe(text);
  });
});

describe("divideRoundHalfUp", () => {
  it.each([
    [10n, 4n, 3n], // 2.5 -> 3
    [9n, 4n, 2n], // 2.25 -> 2
    [11n, 4n, 3n], // 2.75 -> 3
    [8n, 4n, 2n],
    [0n, 7n, 0n],
  ])("%d / %d = %d", (n, d, q) => {
    expect(divideRoundHalfUp(n, d)).toBe(q);
  });

  it("rejects negative or zero inputs it does not support", () => {
    expect(() => divideRoundHalfUp(1n, 0n)).toThrow(RangeError);
    expect(() => divideRoundHalfUp(-1n, 2n)).toThrow(RangeError);
  });
});
