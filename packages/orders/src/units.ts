/** Canonical unit codes and the spellings people use for them in chats and catalogues. */
export const UNIT_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  bag: ["bag", "bags", "bg", "bgs"],
  sqft: ["sq ft", "sq. ft", "sq.ft", "sqft", "sq feet", "square feet", "square foot", "sft"],
  piece: ["piece", "pieces", "pc", "pcs", "nos"],
  box: ["box", "boxes", "bx"],
  roll: ["roll", "rolls"],
  kg: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"],
  ton: ["ton", "tons", "tonne", "tonnes"],
  metre: ["m", "mtr", "mtrs", "meter", "meters", "metre", "metres"],
  litre: ["l", "ltr", "ltrs", "litre", "litres", "liter", "liters"],
  bundle: ["bundle", "bundles"],
  sheet: ["sheet", "sheets"],
};

const normalise = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");

const LOOKUP = new Map<string, string>();
for (const [code, spellings] of Object.entries(UNIT_SYNONYMS)) {
  LOOKUP.set(code, code);
  for (const s of spellings) LOOKUP.set(normalise(s), code);
}

/** Map any known spelling ("Bags", "sq. ft") to its canonical code, or null if unknown. */
export function canonicalUnit(text: string): string | null {
  return LOOKUP.get(normalise(text)) ?? null;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex alternation matching any unit spelling, longest first, spaces/dots flexible. */
export const UNIT_ALTERNATION = [...LOOKUP.keys()]
  .sort((a, b) => b.length - a.length)
  .map((s) => escapeRegExp(s).replace(/\\\./g, "\\.?").replace(/ /g, "\\s*"))
  .join("|");
