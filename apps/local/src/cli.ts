import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type Field, formatMinor, type Provenance } from "@chatterpilot/core";
import { type DateOrder, decodeExportBytes, scanExport } from "@chatterpilot/import-whatsapp";
import type { OrderDraft } from "@chatterpilot/orders";
import { type ImportSummary, isValidTimeZone, Workspace } from "@chatterpilot/storage";
import { loadVehicles } from "@chatterpilot/templates";
import { draftFor, readCatalogueDir, suggestOrderMessages } from "./drafts.ts";
import { fleetEvents } from "./fleet.ts";
import { terminalSafe } from "./format.ts";
import { ImportError, importExport } from "./import.ts";
import { loadCatalogueIntoWorkspace } from "./review.ts";
import { DEFAULT_PORT, startServer } from "./server.ts";

const WEB_ROOT = new URL("../dist/web/", import.meta.url).pathname;
const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
const DEMO_WORKSPACE = "workspaces/demo";

const DEFAULT_WORKSPACE = "workspaces/default";

const USAGE = `Usage:
  chatterpilot parse <export.txt> [--date-order dmy|mdy|ymd] [--json]
      Preview how every line of a TXT export is interpreted. Stores nothing.
  chatterpilot init --timezone <IANA zone> [--name <name>] [--workspace <dir>]
      Create a local workspace (default ${DEFAULT_WORKSPACE}).
  chatterpilot import <export.txt|export.zip> [--date-order dmy|mdy|ymd] [--chat <name>] [--workspace <dir>]
      Import a WhatsApp export into the workspace. Re-importing the same file changes nothing;
      a later export of the same chat (same file name or --chat) only adds what is new.
  chatterpilot catalogue check <dir>
      Validate products.csv, customers.csv and catalogue.json in a catalogue folder.
  chatterpilot catalogue load <dir> [--workspace <dir>]
      Validate and store a catalogue version in the workspace (used for new drafts).
  chatterpilot events --vehicles <vehicles.csv> [--chat <name>] [--workspace <dir>]
      Fleet/travel template: bookings, faults, quotes and reported payments with their links.
  chatterpilot serve [--workspace <dir>] [--port ${DEFAULT_PORT}]
      Open the review app on http://127.0.0.1 (this computer only).
  chatterpilot demo [--port ${DEFAULT_PORT}] [--workspace ${DEMO_WORKSPACE}]
      Seed ${DEMO_WORKSPACE} with synthetic chats and a catalogue, then serve it. No network needed.
  chatterpilot draft --catalogue <dir> [--workspace <dir>]
      Suggest order messages and show draft orders with the source of every value.

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
  const o = summary.overlap;
  console.log(
    `Overlap:      chat "${summary.chatKey}": ${o.new} new, ${o.duplicate} already imported, ${o.uncertain} changed (kept for review)`,
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
      chat: { type: "string" },
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
    const outcome = await importExport(ws, file, {
      ...(dateOrder === undefined ? {} : { dateOrder: dateOrder as DateOrder }),
      ...(values.chat ? { chat: values.chat } : {}),
    });
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

async function catalogueLoad(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { workspace: { type: "string", default: DEFAULT_WORKSPACE } },
  });
  const [dir] = positionals;
  if (!dir) {
    console.error(USAGE);
    return 2;
  }
  if (!Workspace.exists(values.workspace)) {
    console.error(`No workspace in ${values.workspace}.`);
    return 1;
  }
  const ws = Workspace.open(values.workspace);
  try {
    const { catalogue, issues } = await loadCatalogueIntoWorkspace(ws, dir);
    for (const i of issues) console.log(`${i.severity}: ${terminalSafe(i.message, 200)}`);
    if (!catalogue) {
      console.error("Catalogue not loaded: fix the errors above first.");
      return 1;
    }
    console.log(`Loaded catalogue ${catalogue.version} into ${values.workspace}.`);
    return 0;
  } finally {
    ws.close();
  }
}

function waitForShutdown(close: () => void): Promise<number> {
  return new Promise((resolve) => {
    const stop = () => {
      close();
      resolve(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function serveCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: "string", default: DEFAULT_WORKSPACE },
      port: { type: "string", default: String(DEFAULT_PORT) },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error("Port must be a number between 1024 and 65535.");
    return 2;
  }
  if (!Workspace.exists(values.workspace)) {
    console.error(`No workspace in ${values.workspace}. Run: chatterpilot init --timezone <zone>`);
    return 1;
  }
  const ws = Workspace.open(values.workspace);
  const server = await startServer(ws, { port, webRoot: WEB_ROOT });
  console.log(
    `ChatterPilot is running at ${server.url} (this computer only). Press Ctrl+C to stop.`,
  );
  return waitForShutdown(() => {
    server.close();
    ws.close();
  });
}

async function demoCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", default: String(DEFAULT_PORT) },
      workspace: { type: "string", default: DEMO_WORKSPACE },
    },
  });
  const dir = values.workspace;
  if (!Workspace.exists(dir)) {
    Workspace.create(dir, {
      name: "ChatterPilot demo (synthetic data)",
      timezone: "Asia/Kolkata",
    }).close();
  }
  const ws = Workspace.open(dir);
  try {
    await loadCatalogueIntoWorkspace(ws, `${FIXTURES}catalogue`);
    for (const chat of ["android-dmy-hardware-orders.txt", "ios-mdy-plumbing-orders.txt"]) {
      await importExport(ws, `${FIXTURES}chats/${chat}`);
    }
  } finally {
    ws.close();
  }
  console.log(`Demo workspace ready in ${dir} (synthetic chats and catalogue).`);
  return serveCommand(["--workspace", dir, "--port", values.port]);
}

function catalogueCommand(args: string[]): number | Promise<number> {
  const [sub, dir] = args;
  if (sub === "load") return catalogueLoad(args.slice(1));
  if (sub !== "check" || !dir) {
    console.error(USAGE);
    return 2;
  }
  const { catalogue, issues } = readCatalogueDir(dir);
  for (const i of issues) {
    const where = [i.file, i.row === null ? null : `line ${i.row}`, i.column]
      .filter(Boolean)
      .join(", ");
    console.log(
      `${i.severity === "error" ? "Error  " : "Warning"}  ${where}: ${terminalSafe(i.message, 200)}`,
    );
  }
  if (!catalogue) {
    console.log("Catalogue is not usable until the errors above are fixed.");
    return 1;
  }
  console.log(
    `Catalogue ${catalogue.version}: ${catalogue.products.length} products, ${catalogue.customers.length} customers; prices older than ${catalogue.stalePriceDays} days need review. Maintainer: ${catalogue.maintainer ?? "not recorded"}.`,
  );
  return 0;
}

function sourceTag(p: Provenance): string {
  switch (p.kind) {
    case "message":
      return p.startLine === p.endLine
        ? `chat L${p.startLine}`
        : `chat L${p.startLine}-${p.endLine}`;
    case "catalogue":
      return `${p.table}.csv:${p.row} ${p.column}`;
    case "computed":
      return "calculated";
    case "human":
      return `edited by ${p.reviewer}`;
  }
}

function show<T>(field: Field<T>, render: (value: T) => string): string {
  const mark = field.status === "ok" ? " " : field.status === "needs_review" ? "?" : "!";
  const value = field.value === null ? "unknown" : render(field.value);
  const sources = field.evidence.map(sourceTag).join("; ");
  return `${mark} ${value}${sources ? `  [${sources}]` : ""}`;
}

function printDraft(draft: OrderDraft): void {
  const money = (minor: number) => `${draft.currency.value ?? ""} ${formatMinor(minor)}`.trim();
  const qty = (milli: number) => formatMinor(milli, 3).replace(/\.?0+$/, "");
  console.log(`  Date      ${show(draft.orderDate, (d) => d)}`);
  console.log(`  Customer  ${show(draft.customer, (c) => `${c.name} (${c.customerId})`)}`);
  draft.lines.forEach((line, i) => {
    console.log(`  Line ${i + 1}    "${terminalSafe(line.sourceText, 50)}"`);
    console.log(`    product   ${show(line.product, (p) => `${p.name} (${p.productId})`)}`);
    console.log(
      `    quantity  ${show(line.quantity, (q) => qty(q.milli))} ${line.unit.value ?? ""}`,
    );
    console.log(`    price     ${show(line.unitPrice, money)}`);
    console.log(`    amount    ${show(line.amount, money)}`);
    console.log(`    tax       ${show(line.tax, money)}`);
  });
  console.log(`  Subtotal  ${show(draft.subtotal, money)}`);
  console.log(`  Tax       ${show(draft.taxTotal, money)}`);
  console.log(`  Total     ${show(draft.total, money)}`);
  if (draft.issues.length === 0) {
    console.log("  No open issues. A person must still review before use.");
  }
  for (const issue of draft.issues) console.log(`  To review: ${terminalSafe(issue.message, 200)}`);
}

function draftCommand(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: {
      catalogue: { type: "string" },
      workspace: { type: "string", default: DEFAULT_WORKSPACE },
    },
  });
  if (!values.catalogue) {
    console.error(USAGE);
    return 2;
  }
  const { catalogue } = readCatalogueDir(values.catalogue);
  if (!catalogue) {
    console.error(
      `The catalogue has errors. Run: chatterpilot catalogue check ${values.catalogue}`,
    );
    return 1;
  }
  if (!Workspace.exists(values.workspace)) {
    console.error(`No workspace in ${values.workspace}.`);
    return 1;
  }
  const ws = Workspace.open(values.workspace);
  try {
    const candidates = suggestOrderMessages(ws, catalogue);
    console.log(`${candidates.length} suggested order messages (catalogue ${catalogue.version}).`);
    console.log("Legend: ? needs review, ! unknown; [sources] show where each value came from.\n");
    for (const c of candidates) {
      console.log(
        `${terminalSafe(c.sourceName, 40)} lines ${c.message.startLine}-${c.message.endLine}, ${c.message.localDateTime ?? "date unknown"}, from ${terminalSafe(c.author ?? "?", 30)}:`,
      );
      printDraft(draftFor(c, catalogue));
      console.log("");
    }
    return 0;
  } finally {
    ws.close();
  }
}

function eventsCommand(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: {
      vehicles: { type: "string" },
      chat: { type: "string" },
      workspace: { type: "string", default: DEFAULT_WORKSPACE },
    },
  });
  if (!values.vehicles) {
    console.error(USAGE);
    return 2;
  }
  const registry = loadVehicles(readFileSync(values.vehicles, "utf8"));
  for (const i of registry.issues)
    console.log(`Warning: vehicles.csv line ${i.row ?? "?"}: ${i.message}`);
  if (!Workspace.exists(values.workspace)) {
    console.error(`No workspace in ${values.workspace}.`);
    return 1;
  }
  const ws = Workspace.open(values.workspace);
  try {
    const { events, summary } = fleetEvents(ws, registry, values.chat?.toLowerCase());
    for (const e of events) {
      const parts = [
        e.occurredAt ?? "time unknown",
        e.type.replaceAll("_", " ").padEnd(20),
        e.bookingRef.value ?? "",
        e.vehicle.value?.registration ?? "",
        e.amount.value
          ? `${e.amount.value.kind === "quoted" ? "quoted" : "reported paid"} ${formatMinor(e.amount.value.minor)}`
          : "",
        ...e.relations.map(
          (r) => `${r.type} ${r.eventId}${r.strength === "needs_review" ? " (check)" : ""}`,
        ),
        ...e.notes,
      ].filter(Boolean);
      console.log(`${e.id.padEnd(48)} ${terminalSafe(parts.join("  "), 200)}`);
    }
    console.log("");
    for (const b of summary.bookings)
      console.log(`Booking ${b.ref}: ${b.status} (${b.eventIds.length} messages)`);
    for (const f of summary.faults)
      console.log(`Fault on ${f.vehicle ?? "unknown vehicle"}: ${f.status}`);
    console.log(
      `Quoted ${formatMinor(summary.quotedMinor)}; reported paid ${formatMinor(summary.reportedPaidMinor)} (reports, not verified payments).`,
    );
    return 0;
  } finally {
    ws.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "parse") return parseCommand(rest);
  if (command === "init") return initCommand(rest);
  if (command === "import") return importCommand(rest);
  if (command === "catalogue") return catalogueCommand(rest);
  if (command === "draft") return draftCommand(rest);
  if (command === "serve") return serveCommand(rest);
  if (command === "events") return eventsCommand(rest);
  if (command === "demo") return demoCommand(rest);
  console.error(USAGE);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
