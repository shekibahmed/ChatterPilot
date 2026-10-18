import { type CompiledLexicon, DEFAULT_COMPILED, DEFAULT_LEXICON } from "./lexicon.ts";

/** Canonical unit codes and their default spellings (see lexicon.ts to extend them). */
export const UNIT_SYNONYMS = DEFAULT_LEXICON.units;

/** Map any known spelling ("Bags", "sq. ft", "bori", "पेटी") to its canonical code, or null. */
export function canonicalUnit(
  text: string,
  lexicon: CompiledLexicon = DEFAULT_COMPILED,
): string | null {
  return lexicon.canonicalUnit(text);
}
