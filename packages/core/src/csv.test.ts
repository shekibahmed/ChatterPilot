import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.ts";

describe("parseCsv", () => {
  it("parses quoted fields, escaped quotes, embedded commas and newlines", () => {
    expect(parseCsv('id,name\r\nA1,"Tile, 2x2 ""white"""\nA2,"two\nlines"\n')).toEqual({
      ok: true,
      rows: [
        ["id", "name"],
        ["A1", 'Tile, 2x2 "white"'],
        ["A2", "two\nlines"],
      ],
    });
  });

  it("keeps empty fields and drops blank lines and a BOM", () => {
    expect(parseCsv("﻿a,b,c\n\n1,,3\n")).toEqual({
      ok: true,
      rows: [
        ["a", "b", "c"],
        ["1", "", "3"],
      ],
    });
  });

  it("handles a final row without a newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual({
      ok: true,
      rows: [
        ["a", "b"],
        ["1", "2"],
      ],
    });
  });

  it("rejects malformed quoting instead of guessing", () => {
    expect(parseCsv('a,b\n1,"open')).toEqual({ ok: false, reason: "unterminated_quote", line: 2 });
    expect(parseCsv('a,b\n1,ab"c"\n')).toEqual({ ok: false, reason: "stray_quote", line: 2 });
    expect(parseCsv('a,b\n1,"ab"c\n')).toEqual({ ok: false, reason: "stray_quote", line: 2 });
  });
});
