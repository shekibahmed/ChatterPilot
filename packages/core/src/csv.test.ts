import { describe, expect, it } from "vitest";
import { neutraliseCell, parseCsv, toCsv } from "./csv.ts";

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

describe("toCsv / neutraliseCell", () => {
  it.each([
    ['=HYPERLINK("http://x")', '\'=HYPERLINK("http://x")'],
    ["+1+2", "'+1+2"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\t=1", "'\t=1"],
    ["\r=1", "'\r=1"],
    ["\n=1", "'\n=1"],
    ["＝1+1", "'＝1+1"],
    ["＋1", "'＋1"],
    ["－1", "'－1"],
    ["＠x", "'＠x"],
    ["Cement 40 bags", "Cement 40 bags"],
    ["", ""],
  ])("neutralises %j", (input, output) => {
    expect(neutraliseCell(input)).toBe(output);
  });

  it("quotes text, escapes quotes, keeps numbers and nulls plain, and round-trips", () => {
    const csv = toCsv([
      ["name", "amount", "note"],
      ['Tile, 2x2 "white"', 1640000, null],
      ["=cmd|' /C calc'!A0", 5, "line\nbreak"],
    ]);
    expect(csv).toBe(
      '﻿"name","amount","note"\r\n"Tile, 2x2 ""white""",1640000,\r\n"\'=cmd|\' /C calc\'!A0",5,"line\nbreak"\r\n',
    );
    expect(parseCsv(csv)).toEqual({
      ok: true,
      rows: [
        ["name", "amount", "note"],
        ['Tile, 2x2 "white"', "1640000", ""],
        ["'=cmd|' /C calc'!A0", "5", "line\nbreak"],
      ],
    });
  });
});
