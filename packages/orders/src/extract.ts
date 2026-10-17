import { type CompiledLexicon, DEFAULT_COMPILED, normaliseDigits } from "./lexicon.ts";

/** One quantity + unit + product phrase found in a message body. Nothing is resolved yet. */
export interface ExtractedLine {
  /** Character span of the matched phrase within the message body (end exclusive). */
  readonly span: { readonly start: number; readonly end: number };
  readonly text: string;
  readonly quantityText: string;
  /** Set when the quantity was written in words ("do", "sawa do"); a person should confirm it. */
  readonly quantityFromWords: number | null;
  readonly unitText: string | null;
  readonly productText: string;
  readonly productSpan: { readonly start: number; readonly end: number };
}

const QTY = String.raw`(\d+(?:\.\d+)?)`;
const STOP =
  "(?:for|at|@|per|by|to|from|on|rate|price|please|pls|urgent|asap|each|kal|aaj|parso|bhej\\w*|dena|chahiye|chaiye|bhi|ke\\s+liye|चाहिए|भेज|कल)";
// A product phrase starts with a letter (any script) or a size token such as "2x2" or "8mm".
const PRODUCT = String.raw`((?:\p{L}|\d+(?:\.\d+)?[\p{L}×][\p{L}\p{M}\d]*)(?:[^,;:?!.<\n]|\.(?=\d))*?)`;
const END = String.raw`(?=$|[\s,.;:?!])`;
const MARKER = String.raw`(?:<[^>]*>\s*)?`;

// Leading words that are not part of the product ("need", "pls", "sorry make it").
const LEADING_FILLER =
  /^(?:(?:hi|hello|sir|ji|bhai|bhaiya|pls|please|kindly|need|needs|send|order|want|book|add|also|and|aur|of|ka|ki|ke|required|require|supply|give|i|we|urgent|sorry|make|it|mujhe|hume|humein)(?:\s+|$))+/iu;
// Trailing words that are not part of the product: courtesy, delivery time and Hinglish verbs.
const TAIL_WORD =
  "(?:only|please|pls|plz|urgent|asap|sir|ji|bhai|thanks|thank you|jaldi|abhi|today|tomorrow|aaj|kal|parso|subah|shaam|bhej|bhejo|bhejna|bhejiye|bhej\\s+dena|bhej\\s+do|dena|de\\s+do|de|do|chahiye|chaiye|lagega|lagenge|mangta|mangwana|dispatch|deliver)";
const TRAILING_FILLER = new RegExp(String.raw`(?:\s+${TAIL_WORD})+$`, "iu");
const TAIL = String.raw`(?:\s+${TAIL_WORD})*`;

/**
 * Messages reporting a payment, a delivery or a price quote mention products and quantities but are
 * not orders. English keyword rules plus the lexicon's phrases; a person can still draft any
 * message deliberately.
 */
const NON_ORDER =
  /^\s*(?:paid|payment|delivered|dispatched|received|quote|quotation|rate|price|prices|bhav)\b|\b(?:paid|payment (?:done|made|received|sent)|has been delivered|delivered today|dispatched|payment kar diya|paise bhej diye)\b/i;

/**
 * Questions about stock, reports about past deliveries and complaints often quote quantities
 * ("do you have 50 bags?", "40 bheje the, 35 mile", "2 box toot gaye") but ask for nothing new.
 */
const NOT_A_NEW_ORDER =
  /\b(?:do you have|available\?|in stock\?|stock (?:me|mein|hai) kya|milega kya|milegi kya|mil (?:jayega|jaayega|jaega|jayegi|jaayegi|jaegi|sakta|sakti)|delivered only|\d+ (?:short|missing|kam)|(?:only|sirf) \d+ (?:aaye|aaya|mile|mila|aayi)|kam (?:tha|the|thi|aaya|aaye|aayi|hai)|bhej(?:a|e|i) (?:tha|the|thi)|aa(?:ya|ye|yi) (?:tha|the|thi)|mil gaya|mil gaye|sahi aaye|reached|received|toot|tut gaye|broken|damaged|cancel[^.?!\n]{0,30}\border\b|replace karo|replace kar do|wapas|return karna|bill chahiye|bill bhejo|invoice|baki hai|baaki hai|kab tak doge|kuch nahi chahiye|abhi nahi chahiye|band rahegi|happy (?:diwali|holi|new year))(?!\p{L})|(?:मिल जाएगी|मिल जाएगा|मिलेगा क्या|मिलेगी क्या)/iu;

export function looksLikeNonOrder(
  body: string,
  lexicon: CompiledLexicon = DEFAULT_COMPILED,
): boolean {
  const text = normaliseDigits(body);
  return (
    NON_ORDER.test(text) || NOT_A_NEW_ORDER.test(text) || (lexicon.nonOrder?.test(text) ?? false)
  );
}

interface Patterns {
  readonly qtyFirst: RegExp;
  readonly productFirst: RegExp;
  readonly times: RegExp;
  readonly wordsFirst: RegExp;
  readonly productWords: RegExp;
  /** A quantity + unit inside a product phrase means the match started too early. */
  readonly nestedQuantity: RegExp;
  readonly segmentBreak: RegExp;
}

const patternCache = new WeakMap<CompiledLexicon, Patterns>();

function patternsFor(lex: CompiledLexicon): Patterns {
  const cached = patternCache.get(lex);
  if (cached) return cached;
  // A unit is either a word of 2+ letters (spaces allowed before it) or a single letter glued to the
  // number ("5m", "500g"), never a stray single letter.
  const UNIT = String.raw`(?:\s*(${lex.longUnitAlternation})${END}|(${lex.shortUnitAlternation})${END})`;
  const WORD_UNIT = String.raw`\s+(${lex.longUnitAlternation})${END}`;
  const NUM = `(${lex.numberPhraseAlternation})`;
  const patterns: Patterns = {
    // "40 bags cement", "25 elbows", "120 sq ft tiles 2x2 white", "50 bori cement kal bhej dena"
    qtyFirst: new RegExp(
      String.raw`(?:^|\s)${QTY}${UNIT}?\s+(?!(?:per|each|only|rs|inr|rupees|x)\b)${PRODUCT}\s*(?=$|[,;:?!<]|\.(?!\d)|\s${STOP}\b)`,
      "giu",
    ),
    // "cement 40 bags", "white tiles - 20 boxes", "ACC cement 50 bori kal bhej dena"
    productFirst: new RegExp(
      String.raw`^${PRODUCT}\s*(?:[-:]\s*)?${QTY}${UNIT}${TAIL}\s*(?:[.!?]\s*)?${MARKER}$`,
      "iu",
    ),
    // "cement x 40"
    times: new RegExp(
      String.raw`^${PRODUCT}\s+[x×*]\s*${QTY}${TAIL}\s*(?:[.!?]\s*)?${MARKER}$`,
      "iu",
    ),
    // "do bori cement", "bees nag switch"
    wordsFirst: new RegExp(
      String.raw`(?:^|\s)${NUM}${WORD_UNIT}\s+${PRODUCT}\s*(?=$|[,;:?!<]|\.(?!\d)|\s${STOP}\b)`,
      "giu",
    ),
    nestedQuantity: new RegExp(
      String.raw`(?:^|\s)(?:\d+(?:\.\d+)?${UNIT}|${NUM}${WORD_UNIT})`,
      "iu",
    ),
    // "cement do bori", "wire pachas mtr"
    productWords: new RegExp(
      String.raw`^${PRODUCT}\s+${NUM}${WORD_UNIT}${TAIL}\s*(?:[.!?]\s*)?${MARKER}$`,
      "iu",
    ),
    // Split "3 rolls pipe and 25 elbows", "2 peti Parle-G aur ek peti Maggi" only where a quantity
    // follows. A comma between digits ("10,000") is a thousands separator, not a break.
    segmentBreak: new RegExp(
      String.raw`\s*(?:(?<!\d),|,\s+|;|&|\+|\band\b|\baur\b)\s*(?=\d|(?:${lex.numberPhraseAlternation})\s)`,
      "giu",
    ),
  };
  patternCache.set(lex, patterns);
  return patterns;
}

// A comma between digits ("10,000") is a thousands separator, not a break.
const LOOSE_BREAK = /\s*(?:(?<!\d),|,(?!\d)|;|\+|&|\band\b|\baur\b)\s*/giu;

function segments(body: string, breaks: RegExp): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let lineStart = 0;
  for (const line of body.split("\n")) {
    let segStart = 0;
    for (const m of line.matchAll(breaks)) {
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
 * word; prices ("410 per bag") and bare numbers ("site 2", "10,000") are not order lines. Digits
 * from other scripts are read as digits; quantities in words need a unit after them.
 */
export function extractOrderLines(
  body: string,
  lexicon: CompiledLexicon = DEFAULT_COMPILED,
): ExtractedLine[] {
  const p = patternsFor(lexicon);
  // Same length as the original, so every span below also indexes the original body.
  const normalised = normaliseDigits(body);
  const isProductLike = (text: string) =>
    /\p{L}/u.test(text) && lexicon.canonicalUnit(text) === null;
  const lines: ExtractedLine[] = [];

  const extractSegment = (seg: { text: string; start: number }): boolean => {
    const trimmedStart = seg.text.length - seg.text.trimStart().length;
    const text = seg.text.trim();
    const base = seg.start + trimmedStart;
    const push = (
      whole: string,
      matchStart: number,
      qty: string,
      words: number | null,
      unit: string | null,
      product: string,
      productStart: number,
    ) => {
      const cleaned = cleanProduct(product, productStart);
      if (!isProductLike(cleaned.text)) return false;
      const end = matchStart + whole.replace(/\s*(?:<[^>]*>)?\s*$/, "").length;
      lines.push({
        span: { start: matchStart, end },
        text: body.slice(matchStart, end),
        quantityText: qty,
        quantityFromWords: words,
        unitText: unit,
        productText: cleaned.text,
        productSpan: { start: cleaned.start, end: cleaned.end },
      });
      return true;
    };

    // Anchored forms cover the whole segment: "cement 40 bags", "cement x 40", "cement do bori".
    if (/\d/.test(text)) {
      const pf = p.productFirst.exec(text) ?? p.times.exec(text);
      if (pf) {
        const [whole, product = "", qty = "", longUnit, shortUnit] = pf;
        if (push(whole, base, qty, null, longUnit ?? shortUnit ?? null, product, base)) return true;
      }
    }
    const pw = p.productWords.exec(text);
    if (pw) {
      const [whole, product = "", qty = "", unit = ""] = pw;
      const value = lexicon.wordsToNumber(qty);
      if (value !== null && push(whole, base, qty, value, unit, product, base)) return true;
    }

    // Quantity-first forms: take the earliest candidate (digits or words) whose product phrase does
    // not itself contain another quantity, so "site 2 ... 20 bori cement" reads 20, not 2.
    const candidates: { index: number; run: () => boolean }[] = [];
    const collect = (re: RegExp, words: boolean) => {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const match = m;
        re.lastIndex = match.index + 1; // allow overlapping candidates
        const whole = match[0];
        const leading = whole.length - whole.trimStart().length;
        const index = match.index + leading;
        if (words) {
          const [, qty = "", unit = "", product = ""] = match;
          const value = lexicon.wordsToNumber(qty);
          if (value === null || p.nestedQuantity.test(product)) continue;
          candidates.push({
            index,
            run: () =>
              push(
                whole.trimStart(),
                base + index,
                qty,
                value,
                unit,
                product,
                base + match.index + whole.lastIndexOf(product),
              ),
          });
        } else {
          const [, qty = "", longUnit, shortUnit, product = ""] = match;
          if (p.nestedQuantity.test(product)) continue;
          candidates.push({
            index,
            run: () =>
              push(
                whole.trimStart(),
                base + index,
                qty,
                null,
                longUnit ?? shortUnit ?? null,
                product,
                base + match.index + whole.lastIndexOf(product),
              ),
          });
        }
      }
    };
    if (/\d/.test(text)) collect(p.qtyFirst, false);
    collect(p.wordsFirst, true);
    candidates.sort((a, b) => a.index - b.index);
    for (const c of candidates) if (c.run()) return true;
    return false;
  };

  for (const seg of segments(normalised, p.segmentBreak)) {
    if (extractSegment(seg)) continue;
    // Nothing found in the whole segment: try its comma/"and"/"+" parts on their own, for lists
    // such as "white tiles 10 box, ivory tiles 4 box" where a product name follows the comma.
    const parts = segments(seg.text, LOOSE_BREAK);
    if (parts.length > 1) {
      for (const part of parts) extractSegment({ text: part.text, start: seg.start + part.start });
    }
  }
  return lines.sort((a, b) => a.span.start - b.span.start);
}
