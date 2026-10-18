import type { ExtractionItem, ProposedLine, ProposedSpan, RawExtraction } from "./contract.ts";

export type ValidatedExtraction =
  | { readonly id: string; readonly ok: true; readonly lines: readonly ProposedLine[] }
  | { readonly id: string; readonly ok: false; readonly reason: string };

const MAX_LINES = 50;

function span(value: unknown, text: string, what: string): ProposedSpan | string {
  if (typeof value !== "object" || value === null) return `${what} is not a span`;
  const { start, end } = value as { start?: unknown; end?: unknown };
  if (!Number.isInteger(start) || !Number.isInteger(end)) return `${what} has non-integer offsets`;
  if (
    (start as number) < 0 ||
    (end as number) > text.length ||
    (start as number) >= (end as number)
  ) {
    return `${what} points outside the message`;
  }
  return { start: start as number, end: end as number };
}

/**
 * Accept a provider's proposal only if it is well-formed and grounded: every span must lie inside
 * the item's own text, quantities must be digits in that text, and the item id must be one we sent.
 * Anything else is quarantined with a reason; nothing ungrounded reaches a draft.
 */
export function validateExtraction(
  items: readonly ExtractionItem[],
  raw: readonly RawExtraction[],
): ValidatedExtraction[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const results: ValidatedExtraction[] = [];
  for (const r of raw) {
    const item = byId.get(r.id);
    if (!item) {
      results.push({
        id: String(r.id),
        ok: false,
        reason: "refers to a message that was not sent",
      });
      continue;
    }
    if (seen.has(r.id)) {
      results.push({ id: r.id, ok: false, reason: "duplicate result for the same message" });
      continue;
    }
    seen.add(r.id);
    if (!Array.isArray(r.lines) || r.lines.length > MAX_LINES) {
      results.push({ id: r.id, ok: false, reason: "lines is not a list of at most 50 entries" });
      continue;
    }
    const lines: ProposedLine[] = [];
    let failure: string | null = null;
    for (const [n, l] of (r.lines as unknown[]).entries()) {
      const line = (l ?? {}) as { quantity?: unknown; unit?: unknown; product?: unknown };
      const q = span(line.quantity, item.text, `line ${n + 1} quantity`);
      const p = span(line.product, item.text, `line ${n + 1} product`);
      const u =
        line.unit === null || line.unit === undefined
          ? null
          : span(line.unit, item.text, `line ${n + 1} unit`);
      const bad = [q, p, u].find((s) => typeof s === "string");
      if (bad) {
        failure = bad as string;
        break;
      }
      const qs = q as ProposedSpan;
      if (!/^\d+(?:\.\d+)?$/.test(item.text.slice(qs.start, qs.end))) {
        failure = `line ${n + 1} quantity is not a number in the message`;
        break;
      }
      lines.push({ quantity: qs, product: p as ProposedSpan, unit: u as ProposedSpan | null });
    }
    results.push(
      failure ? { id: r.id, ok: false, reason: failure } : { id: r.id, ok: true, lines },
    );
  }
  for (const item of items) {
    if (!seen.has(item.id) && !results.some((r) => r.id === item.id)) {
      results.push({ id: item.id, ok: false, reason: "no result returned" });
    }
  }
  return results;
}
