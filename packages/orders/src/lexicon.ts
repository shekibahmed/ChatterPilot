/**
 * The words people use for units and quantities in order messages. The default covers English and
 * common romanised Hindi (Hinglish) terms; a business adds its own words in `lexicon.json` next to
 * its catalogue (see docs/catalogue.md). Everything here is data, so an agent harness can extend
 * it without touching the extraction code.
 *
 * Provenance: assembled from general knowledge and the 2026-10-17 research notes
 * (docs/research/indian-order-language.md); not validated against real exports yet. Number words
 * always need a unit after them ("do bori" = 2 bags; "bhej do" = "send it") and are flagged for a
 * person to confirm.
 */

export interface Lexicon {
  /** Canonical unit code -> spellings (any script). */
  readonly units: Readonly<Record<string, readonly string[]>>;
  /** Units that are a fixed count of another unit, e.g. dozen = 12 piece. */
  readonly multipliers: Readonly<
    Record<string, { readonly unit: string; readonly factor: number }>
  >;
  /** Number words -> value (may be fractional, e.g. dedh = 1.5). */
  readonly numbers: Readonly<Record<string, number>>;
  /** Words that adjust the following number: sawa +0.25, paune -0.25, sadhe +0.5. */
  readonly modifiers: Readonly<Record<string, number>>;
  /** Words that multiply the preceding number: hazaar 1000, lakh 100000. */
  readonly scales: Readonly<Record<string, number>>;
  /** Phrases that mark a message as not an order (questions about rates, references). */
  readonly nonOrderPhrases: readonly string[];
}

export const DEFAULT_LEXICON: Lexicon = {
  units: {
    bag: [
      "bag",
      "bags",
      "bg",
      "bgs",
      "bori",
      "bora",
      "bore",
      "boriya",
      "katta",
      "katte",
      "kattha",
      "sack",
      "sacks",
      "बोरी",
      "बोरा",
    ],
    sqft: ["sq ft", "sq. ft", "sq.ft", "sqft", "sq feet", "square feet", "square foot", "sft"],
    piece: ["piece", "pieces", "pc", "pcs", "nos", "nag", "nug", "unit", "units", "नग"],
    box: ["box", "boxes", "bx", "बॉक्स", "डिब्बा"],
    case: ["case", "cases", "carton", "cartons", "ctn", "ctns", "peti", "petti", "पेटी"],
    pack: ["pack", "packs", "packet", "packets", "pkt", "pkts", "पैकेट"],
    strip: ["strip", "strips", "patta", "patte"],
    tablet: ["tab", "tabs", "tablet", "tablets"],
    capsule: ["cap", "caps", "capsule", "capsules"],
    bottle: ["bottle", "bottles", "btl", "btls", "shishi"],
    tin: ["tin", "tins", "jar", "jars", "dabba", "dibba", "dabbe", "डब्बा"],
    roll: ["roll", "rolls", "coil", "coils", "रोल"],
    bundle: ["bundle", "bundles", "bndl", "gaddi", "बंडल", "गड्डी"],
    sheet: ["sheet", "sheets"],
    pair: ["pair", "pairs", "jodi", "jodiya"],
    set: ["set", "sets"],
    kg: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "किलो"],
    gram: ["g", "gm", "gms", "gram", "grams"],
    quintal: ["quintal", "quintals", "qtl"],
    ton: ["ton", "tons", "tonne", "tonnes", "टन"],
    metre: ["m", "mtr", "mtrs", "meter", "meters", "metre", "metres", "मीटर"],
    foot: ["ft", "feet", "foot"],
    litre: ["l", "ltr", "ltrs", "litre", "litres", "liter", "liters", "लीटर"],
    ml: ["ml"],
    dozen: ["dozen", "dozens", "dz", "doz", "darjan", "दर्जन"],
    gross: ["gross"],
  },
  multipliers: {
    dozen: { unit: "piece", factor: 12 },
    gross: { unit: "piece", factor: 144 },
  },
  numbers: {
    ek: 1,
    aik: 1,
    do: 2,
    teen: 3,
    char: 4,
    chaar: 4,
    paanch: 5,
    panch: 5,
    paach: 5,
    chhe: 6,
    chah: 6,
    saat: 7,
    aath: 8,
    nau: 9,
    das: 10,
    dus: 10,
    gyarah: 11,
    barah: 12,
    terah: 13,
    chaudah: 14,
    pandrah: 15,
    pandra: 15,
    solah: 16,
    satrah: 17,
    atharah: 18,
    unnis: 19,
    bees: 20,
    pachees: 25,
    pachchis: 25,
    tees: 30,
    chalis: 40,
    chaalis: 40,
    pachas: 50,
    pachaas: 50,
    saath: 60,
    sattar: 70,
    assi: 80,
    nabbe: 90,
    sau: 100,
    dedh: 1.5,
    dhai: 2.5,
    dhaai: 2.5,
    aadha: 0.5,
    adha: 0.5,
    aadhi: 0.5,
    paav: 0.25,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    fifteen: 15,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    hundred: 100,
    half: 0.5,
    // Devanagari
    एक: 1,
    दो: 2,
    तीन: 3,
    चार: 4,
    पाँच: 5,
    पांच: 5,
    छह: 6,
    सात: 7,
    आठ: 8,
    नौ: 9,
    दस: 10,
    बीस: 20,
    पच्चीस: 25,
    तीस: 30,
    चालीस: 40,
    पचास: 50,
    सौ: 100,
    डेढ़: 1.5,
    ढाई: 2.5,
    आधा: 0.5,
  },
  modifiers: { sawa: 0.25, paune: -0.25, sadhe: 0.5, saadhe: 0.5, सवा: 0.25, साढ़े: 0.5 },
  scales: { hazaar: 1000, hazar: 1000, hajar: 1000, thousand: 1000, lakh: 100000, lac: 100000 },
  nonOrderPhrases: [
    "rate kya",
    "kya rate",
    "bhav kya",
    "kitna hai",
    "kitne ka",
    "kal wala maal",
    "how much",
    "price list",
  ],
};

/** Combine the default lexicon with a business's additions (additions extend, never remove). */
export function mergeLexicon(base: Lexicon, extra: Partial<Lexicon>): Lexicon {
  const units: Record<string, string[]> = Object.fromEntries(
    Object.entries(base.units).map(([k, v]) => [k, [...v]]),
  );
  for (const [code, spellings] of Object.entries(extra.units ?? {})) {
    units[code] = [...(units[code] ?? []), ...spellings];
  }
  return {
    units,
    multipliers: { ...base.multipliers, ...(extra.multipliers ?? {}) },
    numbers: { ...base.numbers, ...(extra.numbers ?? {}) },
    modifiers: { ...base.modifiers, ...(extra.modifiers ?? {}) },
    scales: { ...base.scales, ...(extra.scales ?? {}) },
    nonOrderPhrases: [...base.nonOrderPhrases, ...(extra.nonOrderPhrases ?? [])],
  };
}

/** Validate a business lexicon.json; returns problems in plain language. */
export function validateLexicon(value: unknown): {
  lexicon: Partial<Lexicon> | null;
  problems: string[];
} {
  const problems: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { lexicon: null, problems: ["lexicon.json must be a JSON object."] };
  }
  const v = value as Record<string, unknown>;
  const isWordList = (x: unknown) =>
    Array.isArray(x) && x.every((w) => typeof w === "string" && w.trim().length > 0);
  if (v.units !== undefined) {
    if (typeof v.units !== "object" || v.units === null)
      problems.push('"units" must map unit codes to word lists.');
    else {
      for (const [code, words] of Object.entries(v.units)) {
        if (!/^[a-z][a-z0-9_]{0,23}$/.test(code))
          problems.push(`Unit code "${code}" must be lowercase letters/digits.`);
        if (!isWordList(words)) problems.push(`Unit "${code}" must list words as strings.`);
      }
    }
  }
  for (const key of ["numbers", "modifiers", "scales"] as const) {
    const table = v[key];
    if (table === undefined) continue;
    if (typeof table !== "object" || table === null) {
      problems.push(`"${key}" must map words to numbers.`);
      continue;
    }
    for (const [word, n] of Object.entries(table)) {
      if (typeof n !== "number" || !Number.isFinite(n))
        problems.push(`"${key}.${word}" must be a number.`);
    }
  }
  if (v.multipliers !== undefined) {
    for (const [code, m] of Object.entries((v.multipliers ?? {}) as Record<string, unknown>)) {
      const mm = m as { unit?: unknown; factor?: unknown };
      if (typeof mm?.unit !== "string" || typeof mm?.factor !== "number" || mm.factor <= 0) {
        problems.push(`Multiplier "${code}" needs a unit and a positive factor.`);
      }
    }
  }
  if (v.nonOrderPhrases !== undefined && !isWordList(v.nonOrderPhrases)) {
    problems.push('"nonOrderPhrases" must be a list of phrases.');
  }
  return { lexicon: problems.length === 0 ? (v as Partial<Lexicon>) : null, problems };
}

// ---------------------------------------------------------------------------------------------
// Compiled form

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const normaliseWord = (text: string) =>
  text.trim().toLowerCase().normalize("NFKC").replace(/\s+/g, " ").replace(/\.$/, "");

export interface CompiledLexicon {
  readonly lexicon: Lexicon;
  /** Canonical unit code for a spelling, or null. */
  canonicalUnit(text: string): string | null;
  /** Spellings of 2+ characters, longest first (regex alternation). */
  readonly longUnitAlternation: string;
  /** Single-character spellings (m, l, g): only valid directly after a digit. */
  readonly shortUnitAlternation: string;
  /** Regex alternation for a quantity written in words (modifier? number scale?). */
  readonly numberPhraseAlternation: string;
  /** Value of a quantity in words ("sawa do" -> 2.25), or null. */
  wordsToNumber(text: string): number | null;
  readonly nonOrder: RegExp | null;
}

const cache = new WeakMap<Lexicon, CompiledLexicon>();

export function compileLexicon(lexicon: Lexicon): CompiledLexicon {
  const cached = cache.get(lexicon);
  if (cached) return cached;
  const lookup = new Map<string, string>();
  for (const [code, spellings] of Object.entries(lexicon.units)) {
    lookup.set(code, code);
    for (const s of spellings) lookup.set(normaliseWord(s), code);
  }
  const toAlt = (words: string[]) =>
    words
      .sort((a, b) => b.length - a.length)
      .map((s) => escapeRegExp(s).replace(/\\\./g, "\\.?").replace(/ /g, "\\s*"))
      .join("|");
  const spellings = [...lookup.keys()];
  const words = (o: Readonly<Record<string, number>>) => toAlt(Object.keys(o).map(normaliseWord));
  const numberAlt = words(lexicon.numbers);
  const modifierAlt = words(lexicon.modifiers);
  const scaleAlt = words(lexicon.scales);
  const numberPhrase = numberAlt
    ? `(?:(?:${modifierAlt || "(?!)"})\\s+)?(?:${numberAlt})(?:\\s+(?:${scaleAlt || "(?!)"}))?`
    : "(?!)";
  const phrases = lexicon.nonOrderPhrases.map((p) =>
    escapeRegExp(normaliseWord(p)).replace(/ /g, "\\s+"),
  );
  const compiled: CompiledLexicon = {
    lexicon,
    canonicalUnit: (text) => lookup.get(normaliseWord(text)) ?? null,
    longUnitAlternation: toAlt(spellings.filter((s) => s.length > 1)) || "(?!)",
    shortUnitAlternation: toAlt(spellings.filter((s) => s.length === 1)) || "(?!)",
    numberPhraseAlternation: numberPhrase,
    wordsToNumber(text) {
      const parts = normaliseWord(text).split(" ");
      let modifier = 0;
      if (parts.length > 1 && parts[0] !== undefined && parts[0] in lexicon.modifiers) {
        modifier = lexicon.modifiers[parts.shift() as string] ?? 0;
      }
      const base = parts[0] !== undefined ? lexicon.numbers[parts[0]] : undefined;
      if (base === undefined) return null;
      const scale = parts[1] !== undefined ? lexicon.scales[parts[1]] : 1;
      if (scale === undefined || parts.length > 2) return null;
      const value = (base + modifier) * scale;
      return value > 0 ? value : null;
    },
    nonOrder:
      phrases.length > 0
        ? new RegExp(`(?:^|[^\\p{L}])(?:${phrases.join("|")})(?![\\p{L}])`, "iu")
        : null,
  };
  cache.set(lexicon, compiled);
  return compiled;
}

export const DEFAULT_COMPILED = compileLexicon(DEFAULT_LEXICON);

/** First code point ("zero") of each BMP decimal-digit block: Arabic-Indic to Fullwidth. */
const DIGIT_ZEROS = [
  0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66,
  0x0de6, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0xff10,
];

/**
 * Replace decimal digits from other scripts (Devanagari ०-९, Bengali/Assamese ০-৯, Gujarati,
 * Gurmukhi, Tamil, Telugu, Kannada, Malayalam, Arabic-Indic, Fullwidth, ...) with ASCII digits.
 * One UTF-16 unit maps to one, so the text keeps its length and every character offset.
 */
export function normaliseDigits(text: string): string {
  return text.replace(
    /[\u0660-\u0669\u06f0-\u06f9\u07c0-\u07c9\u0966-\u096f\u09e6-\u09ef\u0a66-\u0a6f\u0ae6-\u0aef\u0b66-\u0b6f\u0be6-\u0bef\u0c66-\u0c6f\u0ce6-\u0cef\u0d66-\u0d6f\u0de6-\u0def\u0e50-\u0e59\u0ed0-\u0ed9\u0f20-\u0f29\u1040-\u1049\u1090-\u1099\u17e0-\u17e9\u1810-\u1819\u1946-\u194f\u19d0-\u19d9\uff10-\uff19]/g,
    (d) => {
      const code = d.charCodeAt(0);
      const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9);
      return zero === undefined ? d : String(code - zero);
    },
  );
}
