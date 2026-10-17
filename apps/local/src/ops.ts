/**
 * Operations shared by the CLI, the MCP server and any other harness. Each returns plain,
 * JSON-serialisable data and throws `OpError` for problems the caller should show to a person.
 * Nothing here talks to the network except `fillForm`, which only reaches a loopback target.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ExportFile,
  type ExportMap,
  ExportRefused,
  TARGETS,
  targetById,
} from "@chatterpilot/exporters";
import {
  type DateOrder,
  decodeExportBytes,
  type ScanResult,
  scanExport,
} from "@chatterpilot/import-whatsapp";
import {
  createApproval,
  currentAcceptedSnapshot,
  type ExecutionPayload,
  MockBooksConnector,
  PayloadError,
  payloadFromAcceptedDraft,
  prepareApprovedDraft,
  type RunResult,
  storeApproval,
} from "@chatterpilot/order-automation";
import {
  buildOrderDraft,
  type CatalogueIssue,
  type EvalReport,
  evaluate,
  type OrderDraft,
  validateEvalCases,
} from "@chatterpilot/orders";
import {
  type ImportSummary,
  isValidTimeZone,
  Workspace,
  type WorkspaceInfo,
} from "@chatterpilot/storage";
import {
  type IntakePolicy,
  type IntakeResult,
  intakeGapWarning,
  processUpdate,
  type TgUpdate,
} from "@chatterpilot/telegram-intake";
import { type FleetEvent, type FleetSummary, loadVehicles } from "@chatterpilot/templates";
import { readCatalogueDir, suggestOrderMessages } from "./drafts.ts";
import { fleetEvents } from "./fleet.ts";
import { ImportError, type ImportOutcome, importExport } from "./import.ts";
import {
  acceptedOrders,
  activeCatalogue,
  addTranscript,
  type DraftSummary,
  type DraftView,
  dashboard,
  exportCsv,
  exportJson,
  getDraft,
  listDrafts,
  loadCatalogueIntoWorkspace,
  ReviewError,
  suggestions,
} from "./review.ts";

export const DEFAULT_WORKSPACE = "workspaces/default";
export const DATE_ORDERS: readonly DateOrder[] = ["dmy", "mdy", "ymd"];

/** A problem to report to the person; `exitCode` 2 = wrong usage, 1 = could not do it. */
export class OpError extends Error {
  readonly code: string;
  readonly exitCode: 1 | 2;
  constructor(code: string, message: string, exitCode: 1 | 2 = 1) {
    super(message);
    this.name = "OpError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function asDateOrder(value: string | undefined): DateOrder | undefined {
  if (value === undefined) return undefined;
  if (!(DATE_ORDERS as readonly string[]).includes(value)) {
    throw new OpError("bad_date_order", "Date order must be dmy, mdy or ymd.", 2);
  }
  return value as DateOrder;
}

/** Open an existing workspace for the duration of `fn`. */
export async function withWorkspace<T>(
  dir: string,
  fn: (ws: Workspace) => T | Promise<T>,
): Promise<T> {
  if (!Workspace.exists(dir)) {
    throw new OpError(
      "no_workspace",
      `No workspace in ${dir}. Run: chatterpilot init --timezone <zone>`,
    );
  }
  const ws = Workspace.open(dir);
  try {
    return await fn(ws);
  } catch (err) {
    if (err instanceof ReviewError) throw new OpError("review", err.message, 1);
    if (err instanceof ImportError) throw new OpError(err.code, err.message, 1);
    throw err;
  } finally {
    ws.close();
  }
}

// ---------------------------------------------------------------------------------------------

export interface ParseResult {
  readonly file: string;
  readonly encoding: string;
  readonly scan: ScanResult;
}

export function parseFile(file: string, dateOrder?: DateOrder): ParseResult {
  const decoded = decodeExportBytes(readFileSync(file));
  if (!decoded.ok)
    throw new OpError("invalid_encoding", `Cannot read ${file}: not valid UTF-8/UTF-16 text.`);
  return {
    file,
    encoding: decoded.encoding,
    scan: scanExport(decoded.text, dateOrder ? { dateOrder } : {}),
  };
}

export function initWorkspace(options: {
  workspace: string;
  timezone: string;
  name: string;
}): WorkspaceInfo {
  if (!isValidTimeZone(options.timezone)) {
    throw new OpError(
      "bad_timezone",
      "Give the business time zone as an IANA name, e.g. Asia/Kolkata.",
      2,
    );
  }
  if (Workspace.exists(options.workspace)) {
    throw new OpError("exists", `A workspace already exists in ${options.workspace}.`);
  }
  const ws = Workspace.create(options.workspace, {
    name: options.name,
    timezone: options.timezone,
  });
  try {
    return ws.info();
  } finally {
    ws.close();
  }
}

export interface WorkspaceStatus {
  readonly workspace: WorkspaceInfo;
  readonly catalogue: {
    version: string;
    products: number;
    customers: number;
    maintainer: string | null;
  } | null;
  readonly imports: readonly ImportSummary[];
  readonly drafts: readonly DraftSummary[];
  readonly pendingSuggestions: number;
}

export function workspaceStatus(dir: string): Promise<WorkspaceStatus> {
  return withWorkspace(dir, (ws) => {
    const catalogue = activeCatalogue(ws);
    return {
      workspace: ws.info(),
      catalogue: catalogue && {
        version: catalogue.version,
        products: catalogue.products.length,
        customers: catalogue.customers.length,
        maintainer: catalogue.maintainer,
      },
      imports: ws.importSummaries(),
      drafts: listDrafts(ws),
      pendingSuggestions: suggestions(ws).length,
    };
  });
}

export function importFile(options: {
  workspace: string;
  file: string;
  dateOrder?: DateOrder | undefined;
  chat?: string | undefined;
}): Promise<ImportOutcome> {
  return withWorkspace(options.workspace, (ws) =>
    importExport(ws, options.file, {
      ...(options.dateOrder ? { dateOrder: options.dateOrder } : {}),
      ...(options.chat ? { chat: options.chat } : {}),
    }),
  );
}

export interface CatalogueCheck {
  readonly usable: boolean;
  readonly version: string | null;
  readonly products: number;
  readonly customers: number;
  readonly maintainer: string | null;
  readonly stalePriceDays: number | null;
  readonly issues: readonly CatalogueIssue[];
}

export function checkCatalogue(dir: string): CatalogueCheck {
  const { catalogue, issues } = readCatalogueDir(dir);
  return {
    usable: catalogue !== null,
    version: catalogue?.version ?? null,
    products: catalogue?.products.length ?? 0,
    customers: catalogue?.customers.length ?? 0,
    maintainer: catalogue?.maintainer ?? null,
    stalePriceDays: catalogue?.stalePriceDays ?? null,
    issues,
  };
}

export function loadCatalogue(options: {
  workspace: string;
  dir: string;
}): Promise<CatalogueCheck> {
  return withWorkspace(options.workspace, async (ws) => {
    const { catalogue, issues } = await loadCatalogueIntoWorkspace(ws, options.dir);
    return {
      usable: catalogue !== null,
      version: catalogue?.version ?? null,
      products: catalogue?.products.length ?? 0,
      customers: catalogue?.customers.length ?? 0,
      maintainer: catalogue?.maintainer ?? null,
      stalePriceDays: catalogue?.stalePriceDays ?? null,
      issues,
    };
  });
}

/**
 * Score the drafting rules against a labelled message set (default: the synthetic set in
 * fixtures/eval) with a catalogue folder. Needs no workspace; stores nothing.
 */
export function evaluateDrafting(options: { cases: string; catalogue: string }): EvalReport {
  const { catalogue, issues } = readCatalogueDir(options.catalogue);
  if (!catalogue) {
    throw new OpError(
      "bad_catalogue",
      `The catalogue is not usable: ${issues.map((i) => i.message).join(" ")}`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(options.cases, "utf8"));
  } catch {
    throw new OpError("bad_cases", `${options.cases} is not readable JSON.`);
  }
  const { cases, problems } = validateEvalCases(raw, catalogue);
  if (problems.length > 0) throw new OpError("bad_cases", problems.slice(0, 10).join(" "));
  return evaluate(cases, catalogue);
}

export interface SuggestedDraft {
  readonly messageId: string;
  readonly sourceName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly localDateTime: string | null;
  readonly author: string | null;
  readonly text: string;
  readonly draft: OrderDraft;
}

/**
 * Messages that look like orders, each with a preview draft (nothing is stored). Uses the
 * workspace's loaded catalogue, or a catalogue folder given for this preview only.
 */
export function suggestDrafts(dir: string, catalogueDir?: string): Promise<SuggestedDraft[]> {
  return withWorkspace(dir, (ws) => {
    let catalogue = activeCatalogue(ws);
    let messages = suggestions(ws);
    if (catalogueDir) {
      const read = readCatalogueDir(catalogueDir);
      if (!read.catalogue) {
        throw new OpError(
          "bad_catalogue",
          `The catalogue has errors. Run: chatterpilot catalogue check ${catalogueDir}`,
        );
      }
      catalogue = read.catalogue;
      messages = suggestOrderMessages(ws, catalogue).flatMap((c) =>
        ws.reviews.messages([c.message.id]),
      );
    }
    if (!catalogue)
      throw new OpError(
        "no_catalogue",
        "Load a catalogue first: chatterpilot catalogue load <dir>",
      );
    const cat = catalogue;
    return messages.map((m) => {
      const text = m.kind === "media" && m.transcriptText !== null ? m.transcriptText : m.body;
      return {
        messageId: m.id,
        sourceName: m.sourceName,
        startLine: m.startLine,
        endLine: m.endLine,
        localDateTime: m.localDateTime,
        author: m.author,
        text,
        draft: buildOrderDraft(
          [
            {
              id: m.id,
              startLine: m.startLine,
              endLine: m.endLine,
              timestampText: m.timestampText,
              localDateTime: m.localDateTime,
              body: text,
              ...(m.kind === "media" && m.transcriptId && m.transcriptOrigin
                ? { transcript: { id: m.transcriptId, origin: m.transcriptOrigin } }
                : {}),
            },
          ],
          cat,
        ),
      };
    });
  });
}

export function draftsList(dir: string): Promise<DraftSummary[]> {
  return withWorkspace(dir, (ws) => listDrafts(ws));
}

export function draftShow(dir: string, id: string): Promise<DraftView> {
  return withWorkspace(dir, (ws) => getDraft(ws, id));
}

export const EXPORT_FORMATS = ["csv", "json", ...TARGETS.map((t) => t.id)] as const;

export interface ExportOutput {
  readonly format: string;
  readonly files: readonly ExportFile[];
  readonly warnings: readonly string[];
  readonly notes: string | null;
}

/** Read an export map: the explicit file, else export-map.json in the workspace folder. */
function readExportMap(ws: Workspace, mapPath?: string): ExportMap | undefined {
  const path = mapPath ?? join(ws.dir, "export-map.json");
  if (!existsSync(path)) {
    if (mapPath) throw new OpError("bad_map", `${path} does not exist.`);
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new OpError("bad_map", `${path} is not valid JSON.`);
  }
  const problems = exportMapProblems(value);
  if (problems.length > 0) throw new OpError("bad_map", `${path}: ${problems.join(" ")}`);
  return value as ExportMap;
}

/** Shape check for export-map.json: every name must be text. */
export function exportMapProblems(value: unknown): string[] {
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObject(value)) return ["It must be a JSON object."];
  const problems: string[] = [];
  for (const key of ["customers", "products", "units"] as const) {
    const table = value[key];
    if (table === undefined) continue;
    if (!isObject(table)) {
      problems.push(`"${key}" must map ids to names.`);
      continue;
    }
    for (const [id, name] of Object.entries(table)) {
      if (typeof name !== "string" || name.trim() === "")
        problems.push(`"${key}.${id}" must be a non-empty name.`);
    }
  }
  for (const key of ["seller", "tallyCompany", "tallyVoucherType", "erpnextSeries"] as const) {
    const v = value[key];
    if (v !== undefined && (typeof v !== "string" || v.trim() === ""))
      problems.push(`"${key}" must be a non-empty name.`);
  }
  return problems;
}

/**
 * Accepted orders as CSV/JSON (ChatterPilot's own formats) or as an import file for another tool
 * (Tally, ERPNext, Zoho Books, UBL). Experimental formats say so in `warnings`.
 */
export function exportOrdersAs(options: {
  workspace: string;
  format: string;
  mapPath?: string | undefined;
}): Promise<ExportOutput> {
  return withWorkspace(options.workspace, (ws) => {
    if (options.format === "csv" || options.format === "json") {
      const content = options.format === "csv" ? exportCsv(ws) : exportJson(ws);
      return {
        format: options.format,
        files: [
          {
            fileName: `chatterpilot-orders.${options.format}`,
            mediaType: options.format === "csv" ? "text/csv" : "application/json",
            content,
          },
        ],
        warnings: [],
        notes: null,
      };
    }
    const target = targetById(options.format);
    if (!target)
      throw new OpError(
        "bad_format",
        `Unknown format. Use one of: ${EXPORT_FORMATS.join(", ")}.`,
        2,
      );
    const orders = acceptedOrders(ws);
    if (orders.length === 0)
      throw new OpError("nothing_accepted", "No accepted orders to export yet.");
    try {
      const result = target.render(orders, readExportMap(ws, options.mapPath));
      return {
        format: target.id,
        files: result.files,
        warnings: result.warnings,
        notes: target.notes,
      };
    } catch (err) {
      if (err instanceof ExportRefused) throw new OpError("export_refused", err.problems.join(" "));
      throw err;
    }
  });
}

export function exportOrders(dir: string, format: "csv" | "json"): Promise<string> {
  return withWorkspace(dir, (ws) => (format === "csv" ? exportCsv(ws) : exportJson(ws)));
}

export function dashboardData(dir: string, scope: "accepted" | "all") {
  return withWorkspace(dir, (ws) => dashboard(ws, scope));
}

export interface FleetResult {
  readonly registryIssues: readonly { row: number | null; message: string }[];
  readonly events: readonly FleetEvent[];
  readonly summary: FleetSummary;
}

export function fleet(options: {
  workspace: string;
  vehiclesCsv: string;
  chat?: string | undefined;
}): Promise<FleetResult> {
  const registry = loadVehicles(readFileSync(options.vehiclesCsv, "utf8"));
  return withWorkspace(options.workspace, (ws) => ({
    registryIssues: registry.issues,
    ...fleetEvents(ws, registry, options.chat?.toLowerCase()),
  }));
}

export interface IntakeRun {
  readonly gapWarning: string | null;
  readonly skippedLines: readonly { line: number; reason: string }[];
  readonly results: readonly (IntakeResult & {
    readonly draftLines?: readonly { text: string; product: string | null }[];
  })[];
}

export function intake(options: {
  workspace: string;
  updatesText: string;
  policy: IntakePolicy;
}): Promise<IntakeRun> {
  const updates: TgUpdate[] = [];
  const skippedLines: { line: number; reason: string }[] = [];
  for (const [n, line] of options.updatesText.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const u = JSON.parse(line) as TgUpdate;
      if (!Number.isSafeInteger(u?.update_id)) throw new Error("no numeric update_id");
      updates.push(u);
    } catch (err) {
      skippedLines.push({ line: n + 1, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return withWorkspace(options.workspace, (ws) => {
    const now = new Date();
    const gapWarning = intakeGapWarning(ws.intake.lastSeenAt(), now);
    const resolver = { acceptedSnapshot: (id: string) => currentAcceptedSnapshot(ws, id) };
    const catalogue = activeCatalogue(ws);
    const results = updates.map((u) => {
      const r = processUpdate(ws.intake, u, options.policy, resolver, now);
      if ((r.outcome === "accepted" || r.outcome === "edit") && catalogue) {
        const env = ws.intake.envelopes().find((e) => e.id === r.envelopeId);
        if (env) {
          const draft = buildOrderDraft(
            [
              {
                id: env.id,
                startLine: 1,
                endLine: 1,
                timestampText: env.forwardDate ?? env.receivedAt,
                localDateTime: null,
                body: env.text,
              },
            ],
            catalogue,
          );
          return {
            ...r,
            draftLines: draft.lines.map((l) => ({
              text: l.sourceText,
              product: l.product.value?.name ?? null,
            })),
          };
        }
      }
      return r;
    });
    return { gapWarning, skippedLines, results };
  });
}

export function transcriptAdd(options: {
  workspace: string;
  audio: string;
  text: string;
  by: string;
  language?: string | undefined;
}) {
  return withWorkspace(options.workspace, (ws) => {
    const matches = ws.db
      .prepare("SELECT id FROM message WHERE media_file_name = ? AND duplicate_of IS NULL")
      .all(options.audio) as { id: string }[];
    if (matches.length !== 1 || !matches[0]) {
      throw new OpError(
        "audio_not_found",
        matches.length === 0
          ? `No voice-note message names ${options.audio}.`
          : `${matches.length} messages name ${options.audio}; it is ambiguous.`,
      );
    }
    return addTranscript(ws, {
      messageId: matches[0].id,
      text: options.text.trim(),
      language: options.language ?? null,
      by: options.by,
    });
  });
}

export interface FillFormResult {
  readonly payload: ExecutionPayload;
  readonly target: string;
  readonly sent: boolean;
  readonly result: RunResult | null;
}

/**
 * Type an accepted draft into the synthetic MockBooks form on this computer. Without `approve`
 * nothing is sent and the document is returned for a person to check.
 */
export async function fillForm(options: {
  workspace: string;
  draftId: string;
  operator: string;
  approve: boolean;
  target: string;
}): Promise<FillFormResult> {
  const target = new URL(options.target);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname)) {
    throw new OpError(
      "target_not_allowed",
      "Only the synthetic MockBooks form on this computer is supported in this release.",
      2,
    );
  }
  return withWorkspace(options.workspace, async (ws) => {
    const view = getDraft(ws, options.draftId);
    let payload: ExecutionPayload;
    try {
      payload = payloadFromAcceptedDraft({
        draftId: view.record.id,
        status: view.record.status,
        snapshotSha256: view.acceptedSnapshotSha256,
        draft: view.draft,
      });
    } catch (err) {
      if (err instanceof PayloadError)
        throw new OpError("not_sendable", `Not sent: ${err.message}`);
      throw err;
    }
    if (!options.approve) return { payload, target: target.origin, sent: false, result: null };
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const connector = new MockBooksConnector({ page, origin: target.origin, account: "demo" });
      const approval = createApproval({
        id: crypto.randomUUID(),
        operator: options.operator,
        target: { connectorId: connector.id, origin: connector.origin, account: connector.account },
        action: "prepare_draft",
        payload,
        now: new Date(),
        minutes: 15,
      });
      storeApproval(ws, approval, payload.sourceDraftId, payload);
      const result = await prepareApprovedDraft({
        ws,
        approvalId: approval.id,
        operator: options.operator,
        connector,
        currentCatalogueVersion: activeCatalogue(ws)?.version ?? "",
      });
      return { payload, target: target.origin, sent: true, result };
    } finally {
      await browser.close();
    }
  });
}
