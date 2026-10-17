import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type Field, formatMinor, type Provenance } from "@chatterpilot/core";
import type { OrderDraft } from "@chatterpilot/orders";
import type { ImportSummary } from "@chatterpilot/storage";
import type { IntakePolicy } from "@chatterpilot/telegram-intake";
import { terminalSafe } from "./format.ts";
import { importExport } from "./import.ts";
import {
  asDateOrder,
  checkCatalogue,
  DEFAULT_WORKSPACE,
  dashboardData,
  draftShow,
  draftsList,
  exportOrders,
  fillForm,
  fleet,
  importFile,
  initWorkspace,
  intake,
  loadCatalogue,
  OpError,
  parseFile,
  suggestDrafts,
  transcriptAdd,
  withWorkspace,
  workspaceStatus,
} from "./ops.ts";
import { loadCatalogueIntoWorkspace } from "./review.ts";
import { DEFAULT_PORT, startServer } from "./server.ts";

const WEB_ROOT = new URL("../dist/web/", import.meta.url).pathname;
const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
const DEMO_WORKSPACE = "workspaces/demo";

const USAGE = `Usage (every command accepts --json for machine-readable output):
  chatterpilot parse <export.txt> [--date-order dmy|mdy|ymd] [--json]
      Preview how every line of a TXT export is interpreted. Stores nothing.
  chatterpilot init --timezone <IANA zone> [--name <name>] [--workspace <dir>]
      Create a local workspace (default ${DEFAULT_WORKSPACE}).
  chatterpilot status [--workspace <dir>] [--json]
      Imports, catalogue, drafts and pending suggestions in a workspace.
  chatterpilot import <export.txt|export.zip> [--date-order dmy|mdy|ymd] [--chat <name>] [--workspace <dir>] [--json]
      Import a WhatsApp export into the workspace. Re-importing the same file changes nothing;
      a later export of the same chat (same file name or --chat) only adds what is new.
  chatterpilot catalogue check <dir> [--json]
      Validate products.csv, customers.csv and catalogue.json in a catalogue folder.
  chatterpilot catalogue load <dir> [--workspace <dir>] [--json]
      Validate and store a catalogue version in the workspace (used for new drafts).
  chatterpilot draft [--catalogue <dir>] [--workspace <dir>] [--json]
      Suggest order messages and show preview drafts with the source of every value (stores nothing).
      Uses the loaded catalogue, or --catalogue for this preview only.
  chatterpilot drafts list [--workspace <dir>] [--json]
  chatterpilot drafts show <id> [--workspace <dir>] [--json]
      Saved drafts and their review status (review and accept them in the app: chatterpilot serve).
  chatterpilot export --format csv|json [--output <file>] [--workspace <dir>]
      Accepted orders only, from their frozen snapshots.
  chatterpilot dashboard [--scope accepted|all] [--workspace <dir>] [--json]
      Deterministic metrics with coverage and exclusions.
  chatterpilot events --vehicles <vehicles.csv> [--chat <name>] [--workspace <dir>] [--json]
      Fleet/travel template: bookings, faults, quotes and reported payments with their links.
  chatterpilot intake --updates <updates.jsonl> --policy <policy.json> [--workspace <dir>] [--json]
      Offline Telegram intake: apply sender/chat allowlists, dedupe and repeat checks to saved
      Bot API updates (one JSON object per line) and show draft lines. No bot or network is used.
  chatterpilot transcript add --audio <exported file name> --text-file <file> --by <name> [--language <code>] [--workspace <dir>] [--json]
      Attach a transcript you already have to a voice-note message (no AI, nothing leaves the computer).
  chatterpilot fill-form --draft <id> --operator <name> --approve [--target http://127.0.0.1:4330] [--workspace <dir>] [--json]
      Type an ACCEPTED draft into the synthetic MockBooks form on this computer, read it back, and
      stop before Submit. --approve is your approval of exactly the document shown (15 minutes).
  chatterpilot serve [--workspace <dir>] [--port ${DEFAULT_PORT}]
      Open the review app on http://127.0.0.1 (this computer only).
  chatterpilot demo [--port ${DEFAULT_PORT}] [--workspace ${DEMO_WORKSPACE}]
      Seed ${DEMO_WORKSPACE} with synthetic chats and a catalogue, then serve it. No network needed.
  chatterpilot mcp [--workspace <dir>] [--files <dir>] [--agent <name>]
      Run as a Model Context Protocol server on stdio for agent harnesses (Claude Code, Codex, ...).
      File arguments must be inside --files (default: current folder). Accepting drafts stays human.

Everything runs locally. Nothing is sent anywhere.`;

class UsageError extends Error {}

const json = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const emit = (value: unknown, code: number) => {
  json(value);
  return code;
};
const n = (record: Readonly<Record<string, number>>, key: string) => record[key] ?? 0;

// ---------------------------------------------------------------------------------------------
// Text presenters

function sourceTag(p: Provenance): string {
  switch (p.kind) {
    case "message":
      return p.startLine === p.endLine
        ? `chat L${p.startLine}`
        : `chat L${p.startLine}-${p.endLine}`;
    case "transcript":
      return `voice note L${p.startLine} (${p.origin} transcript)`;
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
    console.log(
      `  Line ${i + 1}    "${terminalSafe(line.sourceText, 50)}"${line.excluded ? " (excluded)" : ""}`,
    );
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
  if (draft.issues.length === 0)
    console.log("  No open issues. A person must still review before use.");
  for (const issue of draft.issues) console.log(`  To review: ${terminalSafe(issue.message, 200)}`);
}

function printSummary(summary: ImportSummary): void {
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
    `Overlap:      chat "${terminalSafe(summary.chatKey, 80)}": ${o.new} new, ${o.duplicate} already imported, ${o.uncertain} changed (kept for review)`,
  );
  if (summary.skippedEntries > 0)
    console.log(`Skipped:      ${summary.skippedEntries} unsupported archive entries`);
  for (const warning of summary.warnings)
    console.log(`Warning:      ${terminalSafe(warning, 200)}`);
}

// ---------------------------------------------------------------------------------------------
// Commands

type Command = (args: string[]) => Promise<number> | number;

const ws = { type: "string", default: DEFAULT_WORKSPACE } as const;
const asJson = { type: "boolean", default: false } as const;

const commands: Record<string, Command> = {
  parse(args) {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { "date-order": { type: "string" }, json: asJson },
    });
    const [file] = positionals;
    if (!file) throw new UsageError();
    const { encoding, scan } = parseFile(file, asDateOrder(values["date-order"]));
    if (values.json) return emit(scan, 0);
    const count = (pred: (m: (typeof scan.messages)[number]) => boolean) =>
      scan.messages.filter(pred).length;
    console.log(`File:         ${file} (${encoding}, ${scan.lineCount} lines)`);
    console.log(`Format:       ${scan.formats.join(", ") || "none recognised"}`);
    console.log(
      `Date order:   detected ${scan.detectedDateOrder}, applied ${scan.appliedDateOrder ?? "none"}`,
    );
    console.log(
      `Messages:     ${scan.messages.length} (text ${count((m) => m.kind === "text")}, media ${count((m) => m.kind === "media")}, system ${count((m) => m.kind === "system")}, deleted ${count((m) => m.kind === "deleted")})`,
    );
    console.log(
      `Timestamps:   ok ${count((m) => m.status === "ok")}, needs date order ${count((m) => m.status === "needs_date_order")}, invalid ${count((m) => m.status === "invalid_timestamp")}`,
    );
    if (scan.unattached) {
      console.log(
        `Unattached:   lines ${scan.unattached.startLine}-${scan.unattached.endLine} precede the first message`,
      );
    }
    for (const warning of scan.warnings) console.log(`Warning:      ${warning}`);
    console.log("");
    for (const m of scan.messages) {
      const lines = m.startLine === m.endLine ? `${m.startLine}` : `${m.startLine}-${m.endLine}`;
      const flags = [m.kind !== "text" ? m.kind : "", m.edited ? "edited" : ""].filter(Boolean);
      console.log(
        `${lines.padStart(7)}  ${(m.localDateTime ?? m.status).padEnd(19)}  ${terminalSafe(m.author ?? "(system)", 24).padEnd(24)}  ${flags.join(",").padEnd(12)}  ${terminalSafe(m.body)}`,
      );
    }
    return 0;
  },

  init(args) {
    const { values } = parseArgs({
      args,
      options: {
        timezone: { type: "string" },
        name: { type: "string", default: "My workspace" },
        workspace: ws,
        json: asJson,
      },
    });
    if (!values.timezone)
      throw new OpError(
        "bad_timezone",
        "Give the business time zone, e.g. --timezone Asia/Kolkata.",
        2,
      );
    const info = initWorkspace({
      workspace: values.workspace,
      timezone: values.timezone,
      name: values.name,
    });
    if (values.json) return emit(info, 0);
    console.log(`Created workspace "${info.name}" (${info.timezone}) in ${values.workspace}`);
    return 0;
  },

  async status(args) {
    const { values } = parseArgs({ args, options: { workspace: ws, json: asJson } });
    const s = await workspaceStatus(values.workspace);
    if (values.json) return emit(s, 0);
    console.log(
      `Workspace:    ${terminalSafe(s.workspace.name, 60)} (${s.workspace.timezone}), schema v${s.workspace.schemaVersion}`,
    );
    console.log(
      `Catalogue:    ${s.catalogue ? `${s.catalogue.version}: ${s.catalogue.products} products, ${s.catalogue.customers} customers` : "none loaded"}`,
    );
    console.log(`Imports:      ${s.imports.length}`);
    for (const i of s.imports) {
      console.log(
        `  ${terminalSafe(i.sourceName, 50)}: ${i.messages} messages, ${i.coverage.first ?? "?"} → ${i.coverage.last ?? "?"}`,
      );
    }
    const by = (status: string) => s.drafts.filter((d) => d.status === status).length;
    console.log(
      `Drafts:       ${by("open")} open, ${by("accepted")} accepted, ${by("rejected")} rejected`,
    );
    console.log(
      `Suggestions:  ${s.pendingSuggestions} messages look like orders and are not drafted yet`,
    );
    return 0;
  },

  async import(args) {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        "date-order": { type: "string" },
        chat: { type: "string" },
        workspace: ws,
        json: asJson,
      },
    });
    const [file] = positionals;
    if (!file) throw new UsageError();
    const outcome = await importFile({
      workspace: values.workspace,
      file,
      dateOrder: asDateOrder(values["date-order"]),
      chat: values.chat,
    });
    if (values.json) return emit(outcome, 0);
    if (outcome.status === "duplicate")
      console.log(`Already imported on ${outcome.importedAt}; nothing changed.`);
    else printSummary(outcome.summary);
    return 0;
  },

  async catalogue(args) {
    const [sub, ...rest] = args;
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { workspace: ws, json: asJson },
    });
    const [dir] = positionals;
    if ((sub !== "check" && sub !== "load") || !dir) throw new UsageError();
    const result =
      sub === "check"
        ? checkCatalogue(dir)
        : await loadCatalogue({ workspace: values.workspace, dir });
    if (values.json) return emit(result, result.usable ? 0 : 1);
    for (const i of result.issues) {
      const where = [i.file, i.row === null ? null : `line ${i.row}`, i.column]
        .filter(Boolean)
        .join(", ");
      console.log(
        `${i.severity === "error" ? "Error  " : "Warning"}  ${where}: ${terminalSafe(i.message, 200)}`,
      );
    }
    if (!result.usable) {
      console.log("Catalogue is not usable until the errors above are fixed.");
      return 1;
    }
    if (sub === "load") console.log(`Loaded catalogue ${result.version} into ${values.workspace}.`);
    else {
      console.log(
        `Catalogue ${result.version}: ${result.products} products, ${result.customers} customers; prices older than ${result.stalePriceDays} days need review. Maintainer: ${result.maintainer ?? "not recorded"}.`,
      );
    }
    return 0;
  },

  async draft(args) {
    const { values } = parseArgs({
      args,
      options: { catalogue: { type: "string" }, workspace: ws, json: asJson },
    });
    const suggested = await suggestDrafts(values.workspace, values.catalogue);
    if (values.json) return emit(suggested, 0);
    console.log(`${suggested.length} suggested order messages.`);
    console.log("Legend: ? needs review, ! unknown; [sources] show where each value came from.\n");
    for (const s of suggested) {
      console.log(
        `${terminalSafe(s.sourceName, 40)} lines ${s.startLine}-${s.endLine}, ${s.localDateTime ?? "date unknown"}, from ${terminalSafe(s.author ?? "?", 30)}:`,
      );
      printDraft(s.draft);
      console.log("");
    }
    return 0;
  },

  async drafts(args) {
    const [sub, ...rest] = args;
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { workspace: ws, json: asJson },
    });
    if (sub === "list") {
      const list = await draftsList(values.workspace);
      if (values.json) return emit(list, 0);
      for (const d of list) {
        console.log(
          `${d.id}  ${d.status.padEnd(8)}  ${terminalSafe(d.customer ?? "customer unknown", 30).padEnd(30)}  ${d.orderDate ?? "?"}  ${d.total ?? "total unknown"}  ${d.openIssues} open issues`,
        );
      }
      return 0;
    }
    const [id] = positionals;
    if (sub !== "show" || !id) throw new UsageError();
    const view = await draftShow(values.workspace, id);
    if (values.json) return emit(view, 0);
    console.log(
      `Draft ${view.record.id}: ${view.record.status} (created by ${terminalSafe(view.record.createdBy, 40)})`,
    );
    printDraft(view.draft);
    for (const d of view.decisions)
      console.log(
        `  ${d.at}  ${d.action} by ${terminalSafe(d.reviewer, 40)}: ${terminalSafe(d.reason, 120)}`,
      );
    return 0;
  },

  async export(args) {
    const { values } = parseArgs({
      args,
      options: { format: { type: "string" }, output: { type: "string" }, workspace: ws },
    });
    if (values.format !== "csv" && values.format !== "json") throw new UsageError();
    const text = await exportOrders(values.workspace, values.format);
    if (values.output) {
      writeFileSync(values.output, text);
      console.error(`Wrote ${values.output}`);
    } else process.stdout.write(text);
    return 0;
  },

  async dashboard(args) {
    const { values } = parseArgs({
      args,
      options: { scope: { type: "string", default: "accepted" }, workspace: ws, json: asJson },
    });
    if (values.scope !== "accepted" && values.scope !== "all") throw new UsageError();
    const d = await dashboardData(values.workspace, values.scope);
    if (values.json) return emit(d, 0);
    const cov = d.coverage;
    console.log(
      `Coverage:   ${cov.window ? `${cov.window.from} → ${cov.window.to}, ${cov.value.coveredDays}/${cov.value.days} days` : "no imports"}`,
    );
    console.log(
      `Pipeline:   ${d.pipeline.value.suggested} suggested, ${d.pipeline.value.open} open, ${d.pipeline.value.accepted} accepted, ${d.pipeline.value.rejected} rejected`,
    );
    for (const r of d.orderValueByDay.value)
      console.log(
        `Value:      ${r.date}  ${r.currency} ${formatMinor(r.totalMinor)} (${r.orders} orders)`,
      );
    for (const x of d.orderValueByDay.excluded) console.log(`Excluded:   ${x.count} ${x.reason}`);
    const cmp = d.weekComparison.value;
    console.log(
      `Trend:      ${cmp.status === "ok" ? `${cmp.changePercent ?? "n/a"}% vs previous 7 days` : `insufficient comparable data. ${cmp.reason}`}`,
    );
    for (const i of d.openIssues.value)
      console.log(`Open work:  ${i.count} × ${i.code.replaceAll("_", " ")}`);
    return 0;
  },

  async events(args) {
    const { values } = parseArgs({
      args,
      options: {
        vehicles: { type: "string" },
        chat: { type: "string" },
        workspace: ws,
        json: asJson,
      },
    });
    if (!values.vehicles) throw new UsageError();
    const r = await fleet({
      workspace: values.workspace,
      vehiclesCsv: values.vehicles,
      chat: values.chat,
    });
    if (values.json) return emit(r, 0);
    for (const i of r.registryIssues)
      console.log(`Warning: vehicles.csv line ${i.row ?? "?"}: ${i.message}`);
    for (const e of r.events) {
      const parts = [
        e.occurredAt ?? "time unknown",
        e.type.replaceAll("_", " ").padEnd(20),
        e.bookingRef.value ?? "",
        e.vehicle.value?.registration ?? "",
        e.amount.value
          ? `${e.amount.value.kind === "quoted" ? "quoted" : "reported paid"} ${formatMinor(e.amount.value.minor)}`
          : "",
        ...e.relations.map(
          (x) => `${x.type} ${x.eventId}${x.strength === "needs_review" ? " (check)" : ""}`,
        ),
        ...e.notes,
      ].filter(Boolean);
      console.log(`${e.id.padEnd(48)} ${terminalSafe(parts.join("  "), 200)}`);
    }
    console.log("");
    for (const b of r.summary.bookings)
      console.log(`Booking ${b.ref}: ${b.status} (${b.eventIds.length} messages)`);
    for (const f of r.summary.faults)
      console.log(`Fault on ${f.vehicle ?? "unknown vehicle"}: ${f.status}`);
    console.log(
      `Quoted ${formatMinor(r.summary.quotedMinor)}; reported paid ${formatMinor(r.summary.reportedPaidMinor)} (reports, not verified payments).`,
    );
    return 0;
  },

  async intake(args) {
    const { values } = parseArgs({
      args,
      options: {
        updates: { type: "string" },
        policy: { type: "string" },
        workspace: ws,
        json: asJson,
      },
    });
    if (!values.updates || !values.policy) throw new UsageError();
    const run = await intake({
      workspace: values.workspace,
      updatesText: readFileSync(values.updates, "utf8"),
      policy: JSON.parse(readFileSync(values.policy, "utf8")) as IntakePolicy,
    });
    if (values.json) return emit(run, 0);
    for (const s of run.skippedLines)
      console.log(`line ${s.line}  skipped: ${terminalSafe(s.reason, 80)}`);
    if (run.gapWarning) console.log(`Warning: ${run.gapWarning}`);
    for (const r of run.results) {
      console.log(`update ${r.updateId}  ${r.outcome}${"reason" in r ? `: ${r.reason}` : ""}`);
      for (const l of r.draftLines ?? []) {
        console.log(
          `    ${terminalSafe(l.text, 40).padEnd(40)} → ${l.product ?? "unknown product"}`,
        );
      }
    }
    return 0;
  },

  async transcript(args) {
    const [sub, ...rest] = args;
    const { values } = parseArgs({
      args: rest,
      options: {
        audio: { type: "string" },
        "text-file": { type: "string" },
        by: { type: "string" },
        language: { type: "string" },
        workspace: ws,
        json: asJson,
      },
    });
    if (sub !== "add" || !values.audio || !values["text-file"] || !values.by)
      throw new UsageError();
    const t = await transcriptAdd({
      workspace: values.workspace,
      audio: values.audio,
      text: readFileSync(values["text-file"], "utf8"),
      by: values.by,
      language: values.language,
    });
    if (values.json) return emit(t, 0);
    console.log(`Added transcript version ${t.version} to ${terminalSafe(values.audio, 80)}.`);
    return 0;
  },

  async "fill-form"(args) {
    const { values } = parseArgs({
      args,
      options: {
        draft: { type: "string" },
        operator: { type: "string" },
        approve: { type: "boolean", default: false },
        target: { type: "string", default: "http://127.0.0.1:4330" },
        workspace: ws,
        json: asJson,
      },
    });
    if (!values.draft || !values.operator) throw new UsageError();
    const r = await fillForm({
      workspace: values.workspace,
      draftId: values.draft,
      operator: values.operator,
      approve: values.approve,
      target: values.target,
    });
    if (values.json)
      return emit(r, r.sent && r.result?.state !== "awaiting_submit_approval" ? 1 : 0);
    const p = r.payload;
    console.log(
      `Document for ${terminalSafe(p.customerName, 60)} (${p.customerId}), ${p.orderDate}:`,
    );
    for (const l of p.lines) {
      console.log(
        `  ${l.quantity} ${l.unit} ${terminalSafe(l.productName, 40)} @ ${l.unitPrice} = ${l.amount} + tax ${l.tax}`,
      );
    }
    console.log(
      `  Total ${p.currency} ${p.total} → ${r.target} (synthetic MockBooks), action: prepare draft only`,
    );
    if (!r.sent || !r.result) {
      console.log(
        "Nothing sent. Re-run with --approve to approve exactly this document for 15 minutes.",
      );
      return 0;
    }
    console.log(
      `Result: ${r.result.state}${r.result.remoteRef ? ` (${r.result.remoteRef})` : ""}. ${r.result.message}`,
    );
    for (const d of r.result.diff)
      console.log(`  ${d.field}: expected ${d.expected}, target has ${d.actual}`);
    return r.result.state === "awaiting_submit_approval" ? 0 : 1;
  },

  async serve(args) {
    const { values } = parseArgs({
      args,
      options: { workspace: ws, port: { type: "string", default: String(DEFAULT_PORT) } },
    });
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new OpError("bad_port", "Port must be a number between 1024 and 65535.", 2);
    const { Workspace } = await import("@chatterpilot/storage");
    if (!Workspace.exists(values.workspace)) {
      throw new OpError(
        "no_workspace",
        `No workspace in ${values.workspace}. Run: chatterpilot init --timezone <zone>`,
      );
    }
    const w = Workspace.open(values.workspace);
    const server = await startServer(w, { port, webRoot: WEB_ROOT });
    console.log(
      `ChatterPilot is running at ${server.url} (this computer only). Press Ctrl+C to stop.`,
    );
    return new Promise((resolve) => {
      const stop = () => {
        server.close();
        w.close();
        resolve(0);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  },

  async demo(args) {
    const { values } = parseArgs({
      args,
      options: {
        port: { type: "string", default: String(DEFAULT_PORT) },
        workspace: { type: "string", default: DEMO_WORKSPACE },
      },
    });
    const { Workspace } = await import("@chatterpilot/storage");
    if (!Workspace.exists(values.workspace)) {
      Workspace.create(values.workspace, {
        name: "ChatterPilot demo (synthetic data)",
        timezone: "Asia/Kolkata",
      }).close();
    }
    await withWorkspace(values.workspace, async (w) => {
      await loadCatalogueIntoWorkspace(w, `${FIXTURES}catalogue`);
      for (const chat of [
        "android-dmy-hardware-orders.txt",
        "ios-mdy-plumbing-orders.txt",
        "android-hinglish-orders.txt",
      ]) {
        await importExport(w, `${FIXTURES}chats/${chat}`);
      }
    });
    console.log(`Demo workspace ready in ${values.workspace} (synthetic chats and catalogue).`);
    return commands.serve?.(["--workspace", values.workspace, "--port", values.port]) ?? 1;
  },

  async mcp(args) {
    const { values } = parseArgs({
      args,
      options: {
        workspace: ws,
        files: { type: "string" },
        agent: { type: "string", default: "mcp" },
      },
    });
    const { runMcpServer } = await import("./mcp.ts");
    await runMcpServer({
      workspace: values.workspace,
      agentName: values.agent,
      ...(values.files ? { filesRoot: values.files } : {}),
    });
    return new Promise<number>(() => {
      // Runs until the client closes stdin.
    });
  },
};

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const run = command ? commands[command] : undefined;
  if (!run) {
    console.error(USAGE);
    return 2;
  }
  try {
    return await run(rest);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(USAGE);
      return 2;
    }
    if (err instanceof OpError) {
      if (argv.includes("--json")) json({ error: { code: err.code, message: err.message } });
      console.error(
        err.code === "not_sendable" || err.code.startsWith("no_")
          ? err.message
          : `Not done (${err.code}): ${err.message}`,
      );
      return err.exitCode;
    }
    if (err instanceof TypeError && /parseArgs|Unknown option/i.test(err.message)) {
      console.error(err.message);
      console.error(USAGE);
      return 2;
    }
    throw err;
  }
}

process.exitCode = await main(process.argv.slice(2));
