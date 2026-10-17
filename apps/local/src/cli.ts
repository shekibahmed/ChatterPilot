import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type DateOrder, decodeExportBytes, scanExport } from "@chatterpilot/import-whatsapp";
import { type ImportSummary, isValidTimeZone, Workspace } from "@chatterpilot/storage";
import { terminalSafe } from "./format.ts";
import { ImportError, importExport } from "./import.ts";

const DEFAULT_WORKSPACE = "workspaces/default";

const USAGE = `Usage:
  chatterpilot parse <export.txt> [--date-order dmy|mdy|ymd] [--json]
      Preview how every line of a TXT export is interpreted. Stores nothing.
  chatterpilot init --timezone <IANA zone> [--name <name>] [--workspace <dir>]
      Create a local workspace (default ${DEFAULT_WORKSPACE}).
  chatterpilot import <export.txt|export.zip> [--date-order dmy|mdy|ymd] [--workspace <dir>]
      Import a WhatsApp export into the workspace. Re-importing the same file changes nothing.

Everything runs locally. Nothing is sent anywhere.`;

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

function initCommand(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: {
      timezone: { type: "string" },
      name: { type: "string", default: "My workspace" },
      workspace: { type: "string", default: DEFAULT_WORKSPACE },
    },
  });
  if (!values.timezone || !isValidTimeZone(values.timezone)) {
    console.error("Give the business time zone as an IANA name, e.g. --timezone Asia/Kolkata.");
    return 2;
  }
  if (Workspace.exists(values.workspace)) {
    console.error(`A workspace already exists in ${values.workspace}.`);
    return 1;
  }
  const ws = Workspace.create(values.workspace, { name: values.name, timezone: values.timezone });
  ws.close();
  console.log(`Created workspace "${values.name}" (${values.timezone}) in ${values.workspace}`);
  return 0;
}

function printSummary(summary: ImportSummary): void {
  const n = (record: Readonly<Record<string, number>>, key: string) => record[key] ?? 0;
  console.log(`Imported:     ${terminalSafe(summary.sourceName, 80)} (${summary.lineCount} lines)`);
  console.log(
    `Messages:     ${summary.messages} (text ${n(summary.byKind, "text")}, media ${n(summary.byKind, "media")}, system ${n(summary.byKind, "system")}, deleted ${n(summary.byKind, "deleted")})`,
  );
  console.log(
    `Timestamps:   ok ${n(summary.byStatus, "ok")}, invalid ${n(summary.byStatus, "invalid_timestamp")}`,
  );
  console.log(
    `Coverage:     ${summary.coverage.first ?? "?"} → ${summary.coverage.last ?? "?"} (local time)`,
  );
  const m = summary.media;
  console.log(
    `Media:        ${m.linked} linked, ${m.missingFiles} named but not in export, ${m.omitted} omitted by WhatsApp, ${m.unlinkedFiles} unlinked files`,
  );
  if (summary.skippedEntries > 0)
    console.log(`Skipped:      ${summary.skippedEntries} unsupported archive entries`);
  for (const warning of summary.warnings)
    console.log(`Warning:      ${terminalSafe(warning, 200)}`);
}

async function importCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "date-order": { type: "string" },
      workspace: { type: "string", default: DEFAULT_WORKSPACE },
    },
  });
  const [file] = positionals;
  const dateOrder = values["date-order"];
  if (!file || (dateOrder !== undefined && !DATE_ORDERS.includes(dateOrder))) {
    console.error(USAGE);
    return 2;
  }
  if (!Workspace.exists(values.workspace)) {
    console.error(`No workspace in ${values.workspace}. Run: chatterpilot init --timezone <zone>`);
    return 1;
  }
  const ws = Workspace.open(values.workspace);
  try {
    const outcome = await importExport(
      ws,
      file,
      dateOrder === undefined ? {} : { dateOrder: dateOrder as DateOrder },
    );
    if (outcome.status === "duplicate") {
      console.log(`Already imported on ${outcome.importedAt}; nothing changed.`);
    } else {
      printSummary(outcome.summary);
    }
    return 0;
  } catch (err) {
    if (err instanceof ImportError) {
      console.error(`Not imported (${err.code}): ${err.message}`);
      return 1;
    }
    throw err;
  } finally {
    ws.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "parse") return parseCommand(rest);
  if (command === "init") return initCommand(rest);
  if (command === "import") return importCommand(rest);
  console.error(USAGE);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
