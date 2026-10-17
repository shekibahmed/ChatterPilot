export type CsvParseResult =
  | { ok: true; rows: string[][] }
  | { ok: false; reason: "unterminated_quote" | "stray_quote"; line: number };

/**
 * Strict RFC 4180 CSV parser: comma separated, double-quote escaping, CRLF or LF line endings.
 * A UTF-8 byte order mark is ignored. Blank lines are dropped. Malformed quoting is an error
 * rather than a best guess, because catalogue prices must not shift between columns.
 */
export function parseCsv(input: string): CsvParseResult {
  const text = input.startsWith("﻿") ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let line = 1;

  const endRow = () => {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
    field = "";
    fieldStarted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          const next = text[i + 1];
          if (next !== undefined && next !== "," && next !== "\n" && next !== "\r") {
            return { ok: false, reason: "stray_quote", line };
          }
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      if (fieldStarted) return { ok: false, reason: "stray_quote", line };
      inQuotes = true;
      fieldStarted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      fieldStarted = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (inQuotes) return { ok: false, reason: "unterminated_quote", line };
  if (field !== "" || row.length > 0) endRow();
  return { ok: true, rows };
}
