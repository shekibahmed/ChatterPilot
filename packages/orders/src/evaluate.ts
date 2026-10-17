import type { Catalogue } from "./catalogue.ts";
import { buildOrderDraft, type OrderDraft } from "./draft.ts";
import { looksLikeNonOrder } from "./extract.ts";
import { compileLexicon } from "./lexicon.ts";

/** One labelled message: what a careful clerk would write down. */
export interface EvalCase {
  readonly id: string;
  readonly lang: string;
  readonly tags: readonly string[];
  readonly text: string;
  readonly kind: "order" | "non_order";
  readonly customer: string | null;
  /** product: a product id, or "AMBIGUOUS" / "UNKNOWN"; baseQuantity in the product's base unit. */
  readonly lines: readonly { readonly product: string; readonly baseQuantity: number | null }[];
}

type Outcome =
  | "exact" // right product, right quantity
  | "wrong_quantity" // right product, other quantity (or none)
  | "missed" // expected line not found
  | "spurious" // a resolved line nobody asked for
  | "wrong_product" // resolved to a product where the clerk wrote another / ambiguous / unknown
  | "abstained"; // ambiguous or unknown product correctly left unresolved

export interface LineResult {
  readonly outcome: Outcome;
  readonly expected: string | null;
  readonly predicted: string | null;
  /** The draft flagged this line for review (product, quantity or unit issue). */
  readonly flagged: boolean;
}

export interface CaseResult {
  readonly id: string;
  readonly lang: string;
  readonly tags: readonly string[];
  readonly expectedKind: EvalCase["kind"];
  readonly predictedKind: EvalCase["kind"];
  readonly customer: "right" | "wrong" | "missed" | "n/a";
  readonly lines: readonly LineResult[];
}

export interface Scores {
  readonly cases: number;
  readonly expectedLines: number;
  readonly exact: number;
  /** exact / lines with a known expected product. */
  readonly recall: number | null;
  /** exact / lines the system resolved to a product. */
  readonly precision: number | null;
  /** Wrong resolved lines (wrong product, wrong quantity, spurious) with no review flag. */
  readonly silentErrors: number;
  readonly flaggedErrors: number;
  readonly abstained: number;
  readonly orderDetection: { readonly orders: number; readonly found: number };
  readonly nonOrderDetection: { readonly nonOrders: number; readonly rejected: number };
  readonly customers: { readonly right: number; readonly wrong: number; readonly missed: number };
}

export interface EvalReport {
  readonly overall: Scores;
  readonly byLang: Readonly<Record<string, Scores>>;
  readonly byTag: Readonly<Record<string, Scores>>;
  readonly cases: readonly CaseResult[];
}

const EXTRACTION_ISSUE = /^(?:product_|quantity_|unit_)/;
const SPECIAL = new Set(["AMBIGUOUS", "UNKNOWN"]);

function lineFlags(draft: OrderDraft): boolean[] {
  return draft.lines.map((_, i) =>
    draft.issues.some((x) => x.field.startsWith(`lines[${i}]`) && EXTRACTION_ISSUE.test(x.code)),
  );
}

const sameQuantity = (milli: number | undefined, expected: number | null) =>
  expected !== null && milli !== undefined && Math.abs(milli - Math.round(expected * 1000)) <= 1;

/** Score one message: pair expected lines with draft lines, resolved products first. */
export function scoreCase(c: EvalCase, catalogue: Catalogue): CaseResult {
  const draft = buildOrderDraft(
    [
      {
        id: c.id,
        startLine: 1,
        endLine: 1,
        timestampText: "eval",
        localDateTime: "2026-01-12T10:00:00",
        body: c.text,
      },
    ],
    catalogue,
  );
  const nonOrder = looksLikeNonOrder(c.text, compileLexicon(catalogue.lexicon));
  const predictedKind = !nonOrder && draft.lines.length > 0 ? "order" : "non_order";
  const flags = lineFlags(draft);
  const predicted =
    predictedKind === "order"
      ? draft.lines.map((l, i) => ({
          product: l.product.value?.productId ?? null,
          milli: l.baseQuantity.value?.milli,
          flagged: flags[i] ?? false,
          used: false,
        }))
      : [];
  const lines: LineResult[] = [];

  const expectedKnown = c.kind === "order" ? c.lines.filter((l) => !SPECIAL.has(l.product)) : [];
  const expectedSpecial = c.kind === "order" ? c.lines.filter((l) => SPECIAL.has(l.product)) : [];
  for (const e of expectedKnown) {
    const candidates = predicted.filter((p) => !p.used && p.product === e.product);
    const hit = candidates.find((p) => sameQuantity(p.milli, e.baseQuantity)) ?? candidates[0];
    if (!hit) {
      lines.push({ outcome: "missed", expected: e.product, predicted: null, flagged: false });
      continue;
    }
    hit.used = true;
    lines.push({
      outcome: sameQuantity(hit.milli, e.baseQuantity) ? "exact" : "wrong_quantity",
      expected: e.product,
      predicted: hit.product,
      flagged: hit.flagged,
    });
  }
  for (const e of expectedSpecial) {
    const unresolved = predicted.find((p) => !p.used && p.product === null);
    if (unresolved) {
      unresolved.used = true;
      lines.push({ outcome: "abstained", expected: e.product, predicted: null, flagged: true });
      continue;
    }
    const guessed = predicted.find((p) => !p.used && p.product !== null);
    if (guessed) {
      guessed.used = true;
      lines.push({
        outcome: "wrong_product",
        expected: e.product,
        predicted: guessed.product,
        flagged: guessed.flagged,
      });
    } else {
      // Not drafted at all: nothing wrong was written, but the clerk's line is missing.
      lines.push({ outcome: "missed", expected: e.product, predicted: null, flagged: false });
    }
  }
  for (const p of predicted) {
    if (p.used || p.product === null) continue;
    lines.push({ outcome: "spurious", expected: null, predicted: p.product, flagged: p.flagged });
  }

  const got = draft.customer.value?.customerId ?? null;
  const customer =
    c.customer === null
      ? got === null
        ? "n/a"
        : "wrong"
      : got === c.customer
        ? "right"
        : got === null
          ? "missed"
          : "wrong";
  return {
    id: c.id,
    lang: c.lang,
    tags: c.tags,
    expectedKind: c.kind,
    predictedKind,
    customer,
    lines,
  };
}

function scores(results: readonly CaseResult[]): Scores {
  const all = results.flatMap((r) => r.lines);
  const count = (o: Outcome) => all.filter((l) => l.outcome === o).length;
  const exact = count("exact");
  const knownExpected = all.filter((l) => l.expected !== null && !SPECIAL.has(l.expected)).length;
  const resolved = all.filter((l) => l.predicted !== null).length;
  const errors = all.filter((l) =>
    ["wrong_quantity", "spurious", "wrong_product"].includes(l.outcome),
  );
  const orders = results.filter(
    (r) => r.expectedKind === "order" && r.lines.some((l) => l.expected !== null),
  );
  const nonOrders = results.filter((r) => r.expectedKind === "non_order");
  return {
    cases: results.length,
    expectedLines: all.filter((l) => l.expected !== null).length,
    exact,
    recall: knownExpected === 0 ? null : exact / knownExpected,
    precision: resolved === 0 ? null : exact / resolved,
    silentErrors: errors.filter((l) => !l.flagged).length,
    flaggedErrors: errors.filter((l) => l.flagged).length,
    abstained: count("abstained"),
    orderDetection: {
      orders: orders.length,
      found: orders.filter((r) => r.predictedKind === "order").length,
    },
    nonOrderDetection: {
      nonOrders: nonOrders.length,
      rejected: nonOrders.filter((r) => r.predictedKind === "non_order").length,
    },
    customers: {
      right: results.filter((r) => r.customer === "right").length,
      wrong: results.filter((r) => r.customer === "wrong").length,
      missed: results.filter((r) => r.customer === "missed").length,
    },
  };
}

function groupBy(results: readonly CaseResult[], keys: (r: CaseResult) => readonly string[]) {
  const groups = new Map<string, CaseResult[]>();
  for (const r of results) for (const k of keys(r)) groups.set(k, [...(groups.get(k) ?? []), r]);
  return Object.fromEntries(
    [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, scores(v)]),
  );
}

/** Run every case through the real drafting code and score it against the labels. */
export function evaluate(cases: readonly EvalCase[], catalogue: Catalogue): EvalReport {
  const results = cases.map((c) => scoreCase(c, catalogue));
  return {
    overall: scores(results),
    byLang: groupBy(results, (r) => [r.lang]),
    byTag: groupBy(results, (r) => r.tags),
    cases: results,
  };
}

/** Validate a labelled set loaded from JSON; returns problems instead of throwing on the first. */
export function validateEvalCases(
  input: unknown,
  catalogue: Catalogue,
): { cases: EvalCase[]; problems: string[] } {
  const problems: string[] = [];
  if (!Array.isArray(input))
    return { cases: [], problems: ["The evaluation file must be a JSON array."] };
  const ids = new Set<string>();
  const products = new Set(catalogue.products.map((p) => p.id));
  const customers = new Set(catalogue.customers.map((c) => c.id));
  const cases: EvalCase[] = [];
  for (const [i, raw] of input.entries()) {
    const c = raw as Partial<EvalCase>;
    const where = `case ${i + 1}${typeof c.id === "string" ? ` (${c.id})` : ""}`;
    if (typeof c.id !== "string" || ids.has(c.id))
      problems.push(`${where}: missing or duplicate id.`);
    if (typeof c.text !== "string" || c.text.trim() === "")
      problems.push(`${where}: text is empty.`);
    if (c.kind !== "order" && c.kind !== "non_order")
      problems.push(`${where}: kind must be order or non_order.`);
    if (c.customer !== null && (typeof c.customer !== "string" || !customers.has(c.customer)))
      problems.push(`${where}: unknown customer ${String(c.customer)}.`);
    if (!Array.isArray(c.lines)) problems.push(`${where}: lines must be an array.`);
    for (const l of c.lines ?? []) {
      if (!SPECIAL.has(l.product) && !products.has(l.product))
        problems.push(`${where}: unknown product ${l.product}.`);
      if (l.baseQuantity !== null && !(typeof l.baseQuantity === "number" && l.baseQuantity > 0))
        problems.push(`${where}: baseQuantity must be a positive number or null.`);
    }
    if (c.kind === "non_order" && (c.lines?.length ?? 0) > 0)
      problems.push(`${where}: a non_order has no lines.`);
    if (typeof c.id === "string") ids.add(c.id);
    cases.push({ lang: "en", tags: [], ...c } as EvalCase);
  }
  return { cases, problems };
}

const pct = (x: number | null) => (x === null ? "  –  " : `${(x * 100).toFixed(1).padStart(5)}%`);

/** A plain-text table for people. */
export function formatEvalReport(report: EvalReport, options: { tags?: boolean } = {}): string {
  const row = (name: string, s: Scores) =>
    [
      name.padEnd(22),
      String(s.cases).padStart(5),
      String(s.expectedLines).padStart(6),
      pct(s.recall),
      pct(s.precision),
      String(s.silentErrors).padStart(7),
      String(s.flaggedErrors).padStart(8),
      String(s.abstained).padStart(9),
      `${s.orderDetection.found}/${s.orderDetection.orders}`.padStart(8),
      `${s.nonOrderDetection.rejected}/${s.nonOrderDetection.nonOrders}`.padStart(9),
    ].join(" ");
  const header = [
    "".padEnd(22),
    "cases".padStart(5),
    "lines".padStart(6),
    "recall",
    " prec.",
    " silent".padStart(7),
    " flagged".padStart(8),
    "abstained".padStart(9),
    "orders".padStart(8),
    "non-ord.".padStart(9),
  ].join(" ");
  const out = [header, row("overall", report.overall)];
  for (const [k, s] of Object.entries(report.byLang)) out.push(row(`lang:${k}`, s));
  if (options.tags) for (const [k, s] of Object.entries(report.byTag)) out.push(row(`tag:${k}`, s));
  return `${out.join("\n")}\n`;
}
