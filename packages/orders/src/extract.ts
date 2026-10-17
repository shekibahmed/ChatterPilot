import { canonicalUnit, UNIT_ALTERNATION } from "./units.ts";

/** One quantity + unit + product phrase found in a message body. Nothing is resolved yet. */
export interface ExtractedLine {
  /** Character span of the matched phrase within the message body (end exclusive). */
  readonly span: { readonly start: number; readonly end: number };
  readonly text: string;
  readonly quantityText: string;
  readonly unitText: string | null;
  readonly productText: string;
  readonly productSpan: { readonly start: number; readonly end: number };
}

const QTY = String.raw`(\d+(?:\.\d+)?)`;
const UNIT = `(${UNIT_ALTERNATION})(?=$|[\\s,.;:?!])`;
const STOP = "(?:for|at|@|per|by|to|from|on|rate|price|please|pls|urgent|asap|each)";
// A product phrase starts with a letter or a size token such as "2x2" or "8mm".
const PRODUCT = String.raw`((?:[a-z]|\d+(?:\.\d+)?[a-z×]\w*)(?:[^,;:?!.<\n]|\.(?=\d))*?)`;

// "40 bags cement", "25 elbows", "120 sq ft tiles 2x2 white"
const QTY_FIRST = new RegExp(
  String.raw`(?:^|\s)${QTY}\s*(?:${UNIT})?\s+(?!(?:per|each|only|rs|inr|rupees|x)\b)${PRODUCT}\s*(?=$|[,;:?!<]|\.(?!\d)|\s${STOP}\b)`,
  "i",
);
// "cement 40 bags", "white tiles - 20 boxes"
const PRODUCT_FIRST = new RegExp(
  String.raw`^${PRODUCT}\s*(?:[-:]\s*)?${QTY}\s*${UNIT}\s*(?:[.!?]\s*)?$`,
  "i",
);
// "cement x 40"
const TIMES = new RegExp(
  String.raw`^${PRODUCT}\s+[x×*]\s*${QTY}\s*(?:[.!?]\s*)?(?:<[^>]*>\s*)?$`,
  "i",
);

// Split "3 rolls pipe and 25 elbows" / "40 bags cement, 10 bags sand" only where a quantity
// follows. A comma between digits ("10,000") is a thousands separator, not a break.
const SEGMENT_BREAK = /\s*(?:(?<!\d),|,\s+|;|&|\+|\band\b)\s*(?=\d)/gi;

const LEADING_FILLER =
  /^(?:(?:hi|hello|sir|ji|bhai|pls|please|kindly|need|needs|send|order|want|book|add|also|and|of|required|require|supply|give|i|we|urgent|sorry|make|it)(?:\s+|$))+/i;
const TRAILING_FILLER = /(?:\s+(?:only|please|pls|urgent|asap|sir|ji|thanks|thank you))+$/i;

/** A product phrase needs letters and must not be just a unit word ("45 bags"). */
function isProductLike(text: string): boolean {
  return /[a-z]/i.test(text) && canonicalUnit(text) === null;
}

function segments(body: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let lineStart = 0;
  for (const line of body.split("\n")) {
    let segStart = 0;
    for (const m of line.matchAll(SEGMENT_BREAK)) {
      out.push({ text: line.slice(segStart, m.index), start: lineStart + segStart });
      segStart = m.index + m[0].length;
    }
    out.push({ text: line.slice(segStart), start: lineStart + segStart });
    lineStart += line.length + 1;
  }
  return out;
}

function cleanProduct(raw: string, rawStart: number): { text: string; start: number; end: number } {
  const lead = LEADING_FILLER.exec(raw)?.[0].length ?? 0;
  const withoutLead = raw.slice(lead);
  const trail = TRAILING_FILLER.exec(withoutLead);
  const text = (trail ? withoutLead.slice(0, trail.index) : withoutLead).trimEnd();
  return { text, start: rawStart + lead, end: rawStart + lead + text.length };
}

/**
 * Find order-line phrases in a message. Conservative: a phrase needs a quantity and a product-like
 * word; prices ("410 per bag") and bare numbers ("site 2", "10,000") are not order lines.
 */
export function extractOrderLines(body: string): ExtractedLine[] {
  const lines: ExtractedLine[] = [];
  for (const seg of segments(body)) {
    const trimmedStart = seg.text.length - seg.text.trimStart().length;
    const text = seg.text.trim();
    const base = seg.start + trimmedStart;
    if (!/\d/.test(text)) continue;

    const productFirst = PRODUCT_FIRST.exec(text) ?? TIMES.exec(text);
    if (productFirst) {
      const [whole, product = "", qty = "", unit] = productFirst;
      const cleaned = cleanProduct(product, base);
      if (isProductLike(cleaned.text)) {
        lines.push({
          span: { start: base, end: base + whole.replace(/\s*(?:<[^>]*>)?\s*$/, "").length },
          text: whole.replace(/\s*(?:<[^>]*>)?\s*$/, ""),
          quantityText: qty,
          unitText: unit ?? null,
          productText: cleaned.text,
          productSpan: { start: cleaned.start, end: cleaned.end },
        });
        continue;
      }
    }

    const qtyFirst = QTY_FIRST.exec(text);
    if (qtyFirst) {
      const [whole, qty = "", unit, product = ""] = qtyFirst;
      const leading = whole.length - whole.trimStart().length;
      const matchStart = qtyFirst.index + leading;
      const productStart = qtyFirst.index + whole.lastIndexOf(product);
      const cleaned = cleanProduct(product, base + productStart);
      if (isProductLike(cleaned.text)) {
        lines.push({
          span: { start: base + matchStart, end: base + qtyFirst.index + whole.trimEnd().length },
          text: whole.trim(),
          quantityText: qty,
          unitText: unit ?? null,
          productText: cleaned.text,
          productSpan: { start: cleaned.start, end: cleaned.end },
        });
      }
    }
  }
  return lines;
}
