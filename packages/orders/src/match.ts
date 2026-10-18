import { matchKey } from "./catalogue.ts";

export type MatchStatus = "resolved" | "fuzzy" | "ambiguous" | "unresolved";

export interface MatchResult<T> {
  readonly status: MatchStatus;
  /** The single matched record for resolved/fuzzy results. */
  readonly record: T | null;
  /** The name or alias that matched, for evidence. */
  readonly matchedKey: string | null;
  /** All equally good candidates (several when ambiguous). */
  readonly candidates: readonly T[];
}

interface Keyed<T> {
  readonly record: T;
  readonly keys: readonly { readonly key: string; readonly tokens: readonly string[] }[];
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function best<T>(
  keyed: readonly Keyed<T>[],
  tokenMatches: (keyToken: string) => boolean,
): { score: number; hits: { record: T; key: string }[] } {
  let score = 0;
  let hits: { record: T; key: string }[] = [];
  for (const { record, keys } of keyed) {
    let recordScore = 0;
    let recordKey = "";
    for (const { key, tokens } of keys) {
      if (tokens.length === 0 || !tokens.every(tokenMatches)) continue;
      // Prefer the most specific key: more tokens, then more characters.
      const keyScore = tokens.length * 1000 + key.length;
      if (keyScore > recordScore) {
        recordScore = keyScore;
        recordKey = key;
      }
    }
    if (recordScore === 0) continue;
    if (recordScore > score) {
      score = recordScore;
      hits = [{ record, key: recordKey }];
    } else if (recordScore === score) {
      hits.push({ record, key: recordKey });
    }
  }
  return { score, hits };
}

// Normalised keys per record list (a catalogue's products or customers), computed once.
const keyCache = new WeakMap<object, WeakMap<object, readonly Keyed<unknown>[]>>();

function keyedRecords<T>(
  records: readonly T[],
  keysOf: (record: T) => readonly string[],
): readonly Keyed<T>[] {
  let byFn = keyCache.get(records);
  if (!byFn) {
    byFn = new WeakMap();
    keyCache.set(records, byFn);
  }
  const cached = byFn.get(keysOf) as readonly Keyed<T>[] | undefined;
  if (cached) return cached;
  const keyed = records.map((record) => ({
    record,
    keys: keysOf(record).map((k) => {
      const key = matchKey(k);
      return { key, tokens: key.split(" ").filter(Boolean) };
    }),
  }));
  byFn.set(keysOf, keyed);
  return keyed;
}

/**
 * Match free text against record names/aliases. A key matches when all of its words occur in the
 * text; the most specific key wins; equally specific matches on different records are ambiguous.
 * Typo tolerance (one edit, words of 5+ letters) only ever yields "fuzzy", which needs review.
 */
export function matchRecord<T>(
  text: string,
  records: readonly T[],
  keysOf: (record: T) => readonly string[],
): MatchResult<T> {
  const tokens = matchKey(text).split(" ").filter(Boolean);
  const tokenSet = new Set(tokens);
  const keyed = keyedRecords(records, keysOf);

  const exact = best(keyed, (t) => tokenSet.has(t));
  const fromHits = (status: MatchStatus, hits: { record: T; key: string }[]): MatchResult<T> => {
    const first = hits[0];
    if (hits.length === 1 && first) {
      return { status, record: first.record, matchedKey: first.key, candidates: [first.record] };
    }
    return {
      status: "ambiguous",
      record: null,
      matchedKey: null,
      candidates: hits.map((h) => h.record),
    };
  };
  if (exact.hits.length > 0) return fromHits("resolved", exact.hits);

  const fuzzy = best(keyed, (k) =>
    k.length >= 5
      ? tokens.some((t) => t.length >= 4 && editDistanceAtMostOne(k, t))
      : tokenSet.has(k),
  );
  if (fuzzy.hits.length > 0) return fromHits("fuzzy", fuzzy.hits);
  return { status: "unresolved", record: null, matchedKey: null, candidates: [] };
}
