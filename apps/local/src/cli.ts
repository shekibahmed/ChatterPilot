import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type DateOrder, decodeExportBytes, scanExport } from "@chatterpilot/import-whatsapp";
import { terminalSafe } from "./format.ts";

const USAGE = `Usage:
  chatterpilot parse <export.txt> [--date-order dmy|mdy|ymd] [--json]

Reads a WhatsApp TXT export locally and reports how every line was interpreted.
Nothing is stored or sent anywhere.`;

const DATE_ORDERS: readonly string[] = ["dmy", "mdy", "ymd"];

function parseCommand(args: string[]): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { "date-order": { type: "string" }, json: { type: "boolean", default: false } },
  });
  const [file] = positionals;
  const dateOrder = values["date-order"];
  if (!file || (dateOrder !== undefined && !DATE_ORDERS.includes(dateOrder))) {
    console.error(USAGE);
    return 2;
  }

  const decoded = decodeExportBytes(readFileSync(file));
  if (!decoded.ok) {
    console.error(`Cannot read ${file}: not valid UTF-8/UTF-16 text.`);
    return 1;
  }
  const result = scanExport(
    decoded.text,
    dateOrder === undefined ? {} : { dateOrder: dateOrder as DateOrder },
  );

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  const count = (pred: (m: (typeof result.messages)[number]) => boolean) =>
    result.messages.filter(pred).length;
  console.log(`File:         ${file} (${decoded.encoding}, ${result.lineCount} lines)`);
  console.log(`Format:       ${result.formats.join(", ") || "none recognised"}`);
  console.log(
    `Date order:   detected ${result.detectedDateOrder}, applied ${result.appliedDateOrder ?? "none"}`,
  );
  console.log(
    `Messages:     ${result.messages.length} (text ${count((m) => m.kind === "text")}, media ${count((m) => m.kind === "media")}, system ${count((m) => m.kind === "system")}, deleted ${count((m) => m.kind === "deleted")})`,
  );
  console.log(
    `Timestamps:   ok ${count((m) => m.status === "ok")}, needs date order ${count((m) => m.status === "needs_date_order")}, invalid ${count((m) => m.status === "invalid_timestamp")}`,
  );
  if (result.unattached) {
    console.log(
      `Unattached:   lines ${result.unattached.startLine}-${result.unattached.endLine} precede the first message`,
    );
  }
  for (const warning of result.warnings) console.log(`Warning:      ${warning}`);
  console.log("");
  for (const m of result.messages) {
    const lines = m.startLine === m.endLine ? `${m.startLine}` : `${m.startLine}-${m.endLine}`;
    const when = m.localDateTime ?? m.status;
    const who = terminalSafe(m.author ?? "(system)", 24);
    const flags = [m.kind !== "text" ? m.kind : "", m.edited ? "edited" : ""].filter(Boolean);
    console.log(
      `${lines.padStart(7)}  ${when.padEnd(19)}  ${who.padEnd(24)}  ${flags.join(",").padEnd(12)}  ${terminalSafe(m.body)}`,
    );
  }
  return 0;
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command === "parse") return parseCommand(rest);
  console.error(USAGE);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
