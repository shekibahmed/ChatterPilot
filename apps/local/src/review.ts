import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { formatMinor, parseAmountToMinor, toCsv } from "@chatterpilot/core";
import type { AcceptedOrder } from "@chatterpilot/exporters";
import {
  buildOrderDraft,
  type Catalogue,
  type CatalogueIssue,
  canonicalUnit,
  compileLexicon,
  computeDashboard,
  type Dashboard,
  type DraftOverrides,
  type LineOverrides,
  loadCatalogue,
  looksLikeNonOrder,
  type MetricScope,
  type OrderDraft,
  OverrideError,
  type SourceMessage,
  suggestsOrder,
} from "@chatterpilot/orders";
import type {
  DecisionRecord,
  DraftRecord,
  DraftStatus,
  StoredMessage,
  Workspace,
} from "@chatterpilot/storage";

/** A request the reviewer must correct (shown to them; never a server fault). */
export class ReviewError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "ReviewError";
    this.status = status;
  }
}

const now = () => new Date().toISOString();

function requireText(value: unknown, what: string, max = 500): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReviewError(400, `${what} is required.`);
  }
  if (value.length > max) throw new ReviewError(400, `${what} is too long.`);
  return value.trim();
}

// ---------------------------------------------------------------------------------------------
// Catalogue versions

const catalogueCache = new Map<string, Catalogue>();

/** Validate a catalogue folder and, if usable, store its files and version in the workspace. */
export async function loadCatalogueIntoWorkspace(
  ws: Workspace,
  dir: string,
): Promise<{ catalogue: Catalogue | null; issues: CatalogueIssue[] }> {
  const read = (name: string) => readFileSync(join(dir, name), "utf8");
  const products = read("products.csv");
  const customers = read("customers.csv");
  const meta = existsSync(join(dir, "catalogue.json")) ? read("catalogue.json") : undefined;
  const lexicon = existsSync(join(dir, "lexicon.json")) ? read("lexicon.json") : undefined;
  const result = loadCatalogue({
    products,
    customers,
    ...(meta === undefined ? {} : { meta }),
    ...(lexicon === undefined ? {} : { lexicon }),
  });
  if (!result.catalogue) return result;
  const put = async (text: string) =>
    (await ws.blobs.put(Readable.from([Buffer.from(text, "utf8")]))).sha256;
  ws.reviews.saveCatalogueVersion({
    version: result.catalogue.version,
    loadedAt: now(),
    maintainer: result.catalogue.maintainer,
    productsSha256: await put(products),
    customersSha256: await put(customers),
    metaSha256: meta === undefined ? null : await put(meta),
    lexiconSha256: lexicon === undefined ? null : await put(lexicon),
  });
  catalogueCache.set(result.catalogue.version, result.catalogue);
  return result;
}

/** Re-load a stored catalogue version from its blobs (exactly as it was when loaded). */
export function catalogueFor(ws: Workspace, version: string): Catalogue {
  const cached = catalogueCache.get(version);
  if (cached) return cached;
  const record = ws.reviews.catalogueVersion(version);
  if (!record) throw new ReviewError(404, `Catalogue version ${version} is not in this workspace.`);
  const text = (sha: string) => readFileSync(ws.blobs.pathFor(sha), "utf8");
  const { catalogue } = loadCatalogue({
    products: text(record.productsSha256),
    customers: text(record.customersSha256),
    ...(record.metaSha256 ? { meta: text(record.metaSha256) } : {}),
    ...(record.lexiconSha256 ? { lexicon: text(record.lexiconSha256) } : {}),
  });
  if (!catalogue || catalogue.version !== version) {
    throw new Error(`Stored catalogue ${version} no longer validates to the same version.`);
  }
  catalogueCache.set(version, catalogue);
  return catalogue;
}

export function activeCatalogue(ws: Workspace): Catalogue | null {
  const latest = ws.reviews.latestCatalogueVersion();
  return latest ? catalogueFor(ws, latest.version) : null;
}

// ---------------------------------------------------------------------------------------------
// Drafts and decisions

export type Decision =
  | { action: "set_customer"; customerId: string }
  | {
      action: "set_line";
      line: number;
      field: "product" | "quantity" | "unit" | "unitPrice" | "taxRate";
      value: string;
    }
  | { action: "exclude_line"; line: number; excluded: boolean }
  | { action: "link_message"; messageId: string }
  | { action: "accept" }
  | { action: "reject" }
  | { action: "reopen" };

export interface DraftView {
  readonly record: DraftRecord;
  readonly draft: OrderDraft;
  readonly messages: readonly StoredMessage[];
  readonly decisions: readonly DecisionRecord[];
  /** True when a newer catalogue than the draft's has been loaded. */
  readonly newerCatalogueAvailable: boolean;
  /** For accepted drafts: SHA-256 of the exact draft that was accepted. */
  readonly acceptedSnapshotSha256: string | null;
}

/** The text a draft is built from: typed text, or the latest transcript of a voice note. */
const draftText = (m: StoredMessage) =>
  m.kind === "media" && m.transcriptText !== null ? m.transcriptText : m.body;

const toSource = (m: StoredMessage): SourceMessage => ({
  id: m.id,
  startLine: m.startLine,
  endLine: m.endLine,
  timestampText: m.timestampText,
  localDateTime: m.localDateTime,
  body: draftText(m),
  ...(m.kind === "media" && m.transcriptId && m.transcriptOrigin
    ? { transcript: { id: m.transcriptId, origin: m.transcriptOrigin } }
    : {}),
});

/** Fold the decision log into overrides and linked messages. Later decisions win. */
function fold(decisions: readonly DecisionRecord[]): {
  overrides: DraftOverrides;
  linked: string[];
} {
  let customer: DraftOverrides["customer"];
  const lines: Record<number, LineOverrides> = {};
  const linked: string[] = [];
  for (const d of decisions) {
    const mark = { reviewer: d.reviewer, at: d.at, reason: d.reason };
    const p = d.payload as Record<string, unknown>;
    if (d.action === "set_customer") customer = { ...mark, value: p.customerId as string };
    if (d.action === "link_message") linked.push(p.messageId as string);
    if (d.action === "set_line" || d.action === "exclude_line") {
      const line = p.line as number;
      const current = lines[line] ?? {};
      lines[line] =
        d.action === "exclude_line"
          ? { ...current, excluded: { ...mark, value: p.excluded as boolean } }
          : { ...current, [p.field as string]: { ...mark, value: p.value } };
    }
  }
  return { overrides: { ...(customer ? { customer } : {}), lines }, linked };
}

function compute(
  ws: Workspace,
  record: DraftRecord,
  decisions: readonly DecisionRecord[],
): { draft: OrderDraft; messages: StoredMessage[] } {
  const { overrides, linked } = fold(decisions);
  const messages = ws.reviews.messages([...record.sourceMessageIds, ...linked]);
  return {
    draft: buildOrderDraft(
      messages.map(toSource),
      catalogueFor(ws, record.catalogueVersion),
      overrides,
    ),
    messages,
  };
}

export const snapshotHash = (draft: OrderDraft) =>
  createHash("sha256").update(JSON.stringify(draft)).digest("hex");

export function createDraft(
  ws: Workspace,
  messageIds: readonly string[],
  reviewer: string,
): DraftView {
  const by = requireText(reviewer, "Reviewer name", 80);
  if (messageIds.length === 0) throw new ReviewError(400, "Choose at least one message.");
  if (new Set(messageIds).size !== messageIds.length) {
    throw new ReviewError(400, "The same message was chosen twice.");
  }
  const messages = ws.reviews.messages(messageIds);
  if (messages.length !== messageIds.length) throw new ReviewError(404, "Unknown message.");
  for (const m of messages) assertDraftable(ws, m);
  const catalogue = activeCatalogue(ws);
  if (!catalogue) throw new ReviewError(409, "Load a catalogue before drafting orders.");
  const id = randomUUID();
  ws.reviews.insertDraft({
    id,
    createdAt: now(),
    createdBy: by,
    catalogueVersion: catalogue.version,
    sourceMessageIds: [...messageIds],
  });
  return getDraft(ws, id);
}

export function getDraft(ws: Workspace, id: string): DraftView {
  const record = ws.reviews.draft(id);
  if (!record) throw new ReviewError(404, "Draft not found.");
  const decisions = ws.reviews.decisions(id);
  const latest = ws.reviews.latestCatalogueVersion();
  if (record.status === "accepted") {
    // An accepted draft is the frozen snapshot that was approved.
    const acceptance = [...decisions].reverse().find((d) => d.action === "accept");
    const payload = acceptance?.payload as { snapshot: OrderDraft; snapshotSha256: string };
    return {
      record,
      draft: payload.snapshot,
      messages: ws.reviews.messages(payload.snapshot.sourceMessageIds),
      decisions,
      newerCatalogueAvailable: latest?.version !== record.catalogueVersion,
      acceptedSnapshotSha256: payload.snapshotSha256,
    };
  }
  const { draft, messages } = compute(ws, record, decisions);
  return {
    record,
    draft,
    messages,
    decisions,
    newerCatalogueAvailable: latest?.version !== record.catalogueVersion,
    acceptedSnapshotSha256: null,
  };
}

function parseDecision(
  input: Decision,
  catalogue: Catalogue,
): { payload: Record<string, unknown> } {
  switch (input.action) {
    case "set_customer":
      return { payload: { customerId: requireText(input.customerId, "Customer", 64) } };
    case "link_message":
      return { payload: { messageId: requireText(input.messageId, "Message", 128) } };
    case "exclude_line":
      if (!Number.isInteger(input.line)) throw new ReviewError(400, "Line is required.");
      return { payload: { line: input.line, excluded: input.excluded === true } };
    case "set_line": {
      if (!Number.isInteger(input.line)) throw new ReviewError(400, "Line is required.");
      const text = requireText(input.value, "Value", 64);
      let value: string | number;
      if (input.field === "product") {
        if (!catalogue.products.some((p) => p.id === text)) {
          throw new ReviewError(400, `Product ${text} is not in the catalogue.`);
        }
        value = text;
      } else if (input.field === "unit") {
        const unit = canonicalUnit(text, compileLexicon(catalogue.lexicon));
        if (!unit) throw new ReviewError(400, `Unknown unit "${text}".`);
        value = unit;
      } else {
        const scale = input.field === "unitPrice" ? 2 : 3;
        const parsed = parseAmountToMinor(text, scale);
        if (!parsed.ok) throw new ReviewError(400, `"${text}" is not a valid amount.`);
        if (input.field === "quantity" && parsed.minor === 0) {
          throw new ReviewError(400, "Quantity must be more than zero.");
        }
        value = parsed.minor;
      }
      return { payload: { line: input.line, field: input.field, value } };
    }
    default:
      return { payload: {} };
  }
}

const LINE_FIELDS = new Set(["product", "quantity", "unit", "unitPrice", "taxRate"]);

/** Validate and append one reviewer decision. Returns the updated draft view. */
export function decide(
  ws: Workspace,
  id: string,
  input: Decision,
  reviewer: string,
  reasonInput: string | undefined,
): DraftView {
  const view = getDraft(ws, id);
  const by = requireText(reviewer, "Reviewer name", 80);
  const at = now();
  const { record } = view;

  if (input.action === "reopen") {
    if (record.status === "open") throw new ReviewError(409, "The draft is already open.");
    const reason = requireText(reasonInput, "Reason");
    ws.reviews.appendDecision(
      { draftId: id, at, reviewer: by, action: "reopen", payload: {}, reason },
      "open",
    );
    return getDraft(ws, id);
  }
  if (record.status !== "open") {
    throw new ReviewError(409, `The draft is ${record.status}; reopen it to make changes.`);
  }
  if (input.action === "accept") {
    if (view.draft.issues.length > 0) {
      throw new ReviewError(
        409,
        `Resolve the ${view.draft.issues.length} open issue(s) before accepting.`,
      );
    }
    const reason = reasonInput?.trim() || "Reviewed and accepted";
    const snapshot = view.draft;
    ws.reviews.appendDecision(
      {
        draftId: id,
        at,
        reviewer: by,
        action: "accept",
        payload: { snapshot, snapshotSha256: snapshotHash(snapshot) },
        reason,
      },
      "accepted",
    );
    return getDraft(ws, id);
  }
  if (input.action === "reject") {
    const reason = requireText(reasonInput, "Reason");
    ws.reviews.appendDecision(
      { draftId: id, at, reviewer: by, action: "reject", payload: {}, reason },
      "rejected",
    );
    return getDraft(ws, id);
  }
  if (input.action === "set_line" && !LINE_FIELDS.has(input.field)) {
    throw new ReviewError(400, "Unknown field.");
  }
  if (!["set_customer", "set_line", "exclude_line", "link_message"].includes(input.action)) {
    throw new ReviewError(400, "Unknown action.");
  }
  const reason = requireText(reasonInput, "Reason");
  const { payload } = parseDecision(input, catalogueFor(ws, record.catalogueVersion));
  if (input.action === "link_message") {
    const [message] = ws.reviews.messages([payload.messageId as string]);
    if (!message) throw new ReviewError(404, "Unknown message.");
    if (view.messages.some((m) => m.id === message.id)) {
      throw new ReviewError(409, "That message is already part of this draft.");
    }
    assertDraftable(ws, message);
  }
  if (
    "line" in payload &&
    ((payload.line as number) < 0 || (payload.line as number) >= view.draft.lines.length)
  ) {
    throw new ReviewError(400, "No such line.");
  }

  // Dry-run: the decision must apply cleanly before it is recorded.
  const candidate: DecisionRecord = {
    seq: -1,
    draftId: id,
    at,
    reviewer: by,
    action: input.action,
    payload,
    reason,
  };
  try {
    compute(ws, record, [...view.decisions, candidate]);
  } catch (err) {
    if (err instanceof OverrideError) throw new ReviewError(400, err.message);
    throw err;
  }
  ws.reviews.appendDecision({
    draftId: id,
    at,
    reviewer: by,
    action: input.action,
    payload,
    reason,
  });
  return getDraft(ws, id);
}

export interface DraftSummary {
  readonly id: string;
  readonly status: DraftStatus;
  readonly createdAt: string;
  readonly customer: string | null;
  readonly orderDate: string | null;
  readonly total: string | null;
  readonly openIssues: number;
}

export function listDrafts(ws: Workspace): DraftSummary[] {
  return ws.reviews.drafts().map((record) => {
    const { draft } = getDraft(ws, record.id);
    return {
      id: record.id,
      status: record.status,
      createdAt: record.createdAt,
      customer: draft.customer.value?.name ?? null,
      orderDate: draft.orderDate.value,
      total:
        draft.total.value === null
          ? null
          : `${draft.currency.value ?? ""} ${formatMinor(draft.total.value)}`.trim(),
      openIssues: draft.issues.length,
    };
  });
}

/** Text messages that look like orders and are not yet part of any draft. */
/** Message ids already used by a draft that is not rejected (as a source or a linked message). */
function usedMessageIds(ws: Workspace): Set<string> {
  return new Set(
    ws.reviews
      .drafts()
      .filter((d) => d.status !== "rejected")
      .flatMap((d) => [
        ...d.sourceMessageIds,
        ...ws.reviews
          .decisions(d.id)
          .filter((x) => x.action === "link_message")
          .map((x) => (x.payload as { messageId: string }).messageId),
      ]),
  );
}

/** One message can feed only one live draft, and only canonical text messages are drafted. */
function assertDraftable(ws: Workspace, m: StoredMessage): void {
  if (m.kind !== "text" && !(m.kind === "media" && m.transcriptId)) {
    throw new ReviewError(
      400,
      "Only text messages and transcribed voice notes can become order drafts.",
    );
  }
  if (m.duplicateOf) {
    throw new ReviewError(
      409,
      "This message repeats one from an earlier export; use that one instead.",
    );
  }
  if (usedMessageIds(ws).has(m.id)) {
    throw new ReviewError(409, "This message is already part of another order draft.");
  }
}

export function suggestions(ws: Workspace): StoredMessage[] {
  const catalogue = activeCatalogue(ws);
  if (!catalogue) return [];
  const used = usedMessageIds(ws);
  const lexicon = compileLexicon(catalogue.lexicon);
  return ws.reviews.allTextMessages().filter((m) => {
    const text = draftText(m);
    return !used.has(m.id) && !looksLikeNonOrder(text, lexicon) && suggestsOrder(text, catalogue);
  });
}

// ---------------------------------------------------------------------------------------------
// Export (accepted drafts only, from their frozen snapshots)

const CSV_HEADER = [
  "draft_id",
  "accepted_at",
  "accepted_by",
  "order_date",
  "customer_id",
  "customer_name",
  "line_no",
  "product_id",
  "product_name",
  "quantity",
  "unit",
  "base_quantity",
  "unit_price",
  "currency",
  "amount",
  "tax_rate_percent",
  "tax",
  "chat_source",
  "human_edits",
  "catalogue_version",
  "formula_version",
  "snapshot_sha256",
];

function accepted(ws: Workspace) {
  return ws.reviews
    .drafts()
    .filter((d) => d.status === "accepted")
    .map((d) => {
      const view = getDraft(ws, d.id);
      const acceptance = [...view.decisions].reverse().find((x) => x.action === "accept");
      return { view, acceptance };
    });
}

/** Accepted orders as frozen at acceptance, for file exporters. */
export function acceptedOrders(ws: Workspace): AcceptedOrder[] {
  return accepted(ws).map(({ view, acceptance }) => ({
    id: view.record.id,
    acceptedAt: acceptance?.at ?? null,
    acceptedBy: acceptance?.reviewer ?? null,
    snapshotSha256: view.acceptedSnapshotSha256 ?? "",
    draft: view.draft,
  }));
}

export function exportCsv(ws: Workspace): string {
  const rows: (string | number | null)[][] = [CSV_HEADER];
  for (const { view, acceptance } of accepted(ws)) {
    const { draft } = view;
    const sourceName = new Map(view.messages.map((m) => [m.id, m.sourceName]));
    let lineNo = 0;
    for (const line of draft.lines) {
      if (line.excluded) continue;
      lineNo++;
      const fields = [
        draft.customer,
        line.product,
        line.quantity,
        line.unit,
        line.unitPrice,
        line.taxRate,
      ];
      const chat = line.quantity.evidence.find(
        (e) => e.kind === "message" || e.kind === "transcript",
      );
      const edits = fields.flatMap((f) =>
        f.evidence.flatMap((e) => (e.kind === "human" ? [`${e.reviewer}: ${e.reason}`] : [])),
      );
      rows.push([
        view.record.id,
        acceptance?.at ?? null,
        acceptance?.reviewer ?? null,
        draft.orderDate.value,
        draft.customer.value?.customerId ?? null,
        draft.customer.value?.name ?? null,
        lineNo,
        line.product.value?.productId ?? null,
        line.product.value?.name ?? null,
        line.quantity.value ? formatMinor(line.quantity.value.milli, 3) : null,
        line.unit.value,
        line.baseQuantity.value ? formatMinor(line.baseQuantity.value.milli, 3) : null,
        line.unitPrice.value === null ? null : formatMinor(line.unitPrice.value),
        draft.currency.value,
        line.amount.value === null ? null : formatMinor(line.amount.value),
        line.taxRate.value === null ? null : formatMinor(line.taxRate.value, 3),
        line.tax.value === null ? null : formatMinor(line.tax.value),
        chat?.kind === "message"
          ? `${sourceName.get(chat.messageId) ?? ""} line ${chat.startLine}: ${chat.text}`
          : chat?.kind === "transcript"
            ? `${sourceName.get(chat.messageId) ?? ""} line ${chat.startLine} (voice note, ${chat.origin} transcript): ${chat.text}`
            : null,
        edits.join("; ") || null,
        draft.catalogueVersion,
        draft.formulaVersion,
        view.acceptedSnapshotSha256,
      ]);
    }
  }
  return toCsv(rows);
}

export function exportJson(ws: Workspace): string {
  const drafts = accepted(ws).map(({ view, acceptance }) => ({
    id: view.record.id,
    acceptedAt: acceptance?.at ?? null,
    acceptedBy: acceptance?.reviewer ?? null,
    snapshotSha256: view.acceptedSnapshotSha256,
    draft: view.draft,
    decisions: view.decisions.map(({ seq, at, reviewer, action, reason }) => ({
      seq,
      at,
      reviewer,
      action,
      reason,
    })),
  }));
  return `${JSON.stringify({ exportedAt: now(), format: "chatterpilot-orders/1", drafts }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------------------------
// Dashboard

export function dashboard(ws: Workspace, scope: MetricScope): Dashboard {
  const perDay = ws.db
    .prepare(
      `SELECT substr(local_datetime, 1, 10) AS date, COUNT(*) AS count FROM message
       WHERE kind = 'text' AND local_datetime IS NOT NULL AND duplicate_of IS NULL
       GROUP BY date ORDER BY date`,
    )
    .all() as { date: string; count: number }[];
  return computeDashboard({
    coverage: ws.importSummaries().map((s) => ({
      sourceName: s.sourceName,
      first: s.coverage.first,
      last: s.coverage.last,
    })),
    messagesPerDay: perDay,
    pendingSuggestions: suggestions(ws).length,
    drafts: ws.reviews
      .drafts()
      .map((d) => ({ id: d.id, status: d.status, draft: getDraft(ws, d.id).draft })),
    scope,
  });
}

// ---------------------------------------------------------------------------------------------
// Transcripts (no key needed: a person supplies the text)

/** Attach a person-supplied transcript to a voice-note message (a new version each time). */
export function addTranscript(
  ws: Workspace,
  input: {
    messageId: string;
    text: string;
    language?: string | null;
    by: string;
    note?: string | null;
  },
) {
  const by = requireText(input.by, "Name", 80);
  const text = requireText(input.text, "Transcript text", 20_000);
  const [m] = ws.reviews.messages([input.messageId]);
  if (!m) throw new ReviewError(404, "Unknown message.");
  if (m.kind !== "media" || !["audio", "unknown"].includes(m.mediaType ?? "unknown")) {
    throw new ReviewError(400, "Transcripts can only be added to voice-note (audio) messages.");
  }
  return ws.transcripts.add({
    messageId: m.id,
    text,
    language: input.language?.trim() || null,
    origin: "manual",
    createdBy: by,
    note: input.note ?? null,
    at: now(),
  });
}
