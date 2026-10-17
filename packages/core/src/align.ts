/**
 * Reconcile a new export of a chat against messages already stored for that chat.
 *
 * Exports are snapshots that overlap: a later export repeats older history, an older one may be
 * imported after a newer one (backfill). Matching on hash + timestamp alone would merge genuine
 * repeats ("ok" twice in one minute) or miss them, so we align the two ordered sequences inside their
 * shared time window with a longest-common-subsequence match on content fingerprints:
 *
 * - matched incoming messages are duplicates of the stored ones (counted once);
 * - incoming messages outside the shared window are new;
 * - unmatched incoming messages inside the window are "uncertain" when an unmatched stored message
 *   sits in the same gap (possibly edited or deleted), otherwise new; uncertain ones are kept for a
 *   person to review, never dropped.
 */

export interface StoredItem {
  readonly id: string;
  readonly fingerprint: string;
  /** Floating local date-time, or null when unknown. */
  readonly time: string | null;
}

export interface IncomingItem {
  readonly fingerprint: string;
  readonly time: string | null;
}

export type Reconciliation =
  | { readonly status: "new" }
  | { readonly status: "duplicate"; readonly of: string }
  | { readonly status: "uncertain" };

/** Above this many cell comparisons the exact LCS is skipped for prefix/suffix matching only. */
const MAX_LCS_CELLS = 25_000_000;

function lcsPairs(a: readonly string[], b: readonly string[]): [number, number][] {
  // Trim identical prefix/suffix first; real overlaps are usually long identical runs.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length > 0 && midB.length > 0 && midA.length * midB.length <= MAX_LCS_CELLS) {
    const n = midA.length;
    const m = midB.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      const row = table[i] as Uint32Array;
      const next = table[i + 1] as Uint32Array;
      for (let j = m - 1; j >= 0; j--) {
        row[j] =
          midA[i] === midB[j]
            ? (next[j + 1] as number) + 1
            : Math.max(next[j] as number, row[j + 1] as number);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        pairs.push([start + i, start + j]);
        i++;
        j++;
      } else if (
        ((table[i + 1] as Uint32Array)[j] as number) >= ((table[i] as Uint32Array)[j + 1] as number)
      ) {
        i++;
      } else {
        j++;
      }
    }
  }
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

export function reconcileSequences(
  stored: readonly StoredItem[],
  incoming: readonly IncomingItem[],
): Reconciliation[] {
  const result: Reconciliation[] = incoming.map(() => ({ status: "new" }));
  const storedTimes = stored.flatMap((s) => (s.time ? [s.time] : [])).sort();
  const incomingTimes = incoming.flatMap((s) => (s.time ? [s.time] : [])).sort();
  const sFirst = storedTimes[0];
  const sLast = storedTimes.at(-1);
  const iFirst = incomingTimes[0];
  const iLast = incomingTimes.at(-1);
  if (!sFirst || !sLast || !iFirst || !iLast) return result;
  const from = sFirst > iFirst ? sFirst : iFirst;
  const to = sLast < iLast ? sLast : iLast;
  if (from > to) return result; // no shared window: everything is new

  // Items without a time are kept with their neighbours (treated as inside the window).
  const inWindow = (t: string | null) => t === null || (t >= from && t <= to);
  // Exports have minute (sometimes second) resolution, and stored messages from different batches
  // can interleave within one timestamp. Compare same-timestamp runs as multisets: order each side
  // by (time, fingerprint), carrying the previous time forward for items without one.
  const ordered = <T extends { fingerprint: string; time: string | null }>(items: readonly T[]) => {
    let last = "";
    return items
      .map((item, i) => {
        if (item.time) last = item.time;
        return { i, key: last, fp: item.fingerprint };
      })
      .filter(({ i }) => inWindow((items[i] as T).time))
      .sort((a, b) => a.key.localeCompare(b.key) || a.fp.localeCompare(b.fp) || a.i - b.i)
      .map(({ i }) => i);
  };
  const sIdx = ordered(stored);
  const iIdx = ordered(incoming);
  const pairs = lcsPairs(
    sIdx.map((i) => (stored[i] as StoredItem).fingerprint),
    iIdx.map((i) => (incoming[i] as IncomingItem).fingerprint),
  );

  for (const [a, b] of pairs) {
    result[iIdx[b] as number] = {
      status: "duplicate",
      of: (stored[sIdx[a] as number] as StoredItem).id,
    };
  }

  // An unmatched incoming item is "uncertain" only if some stored item in the same gap between
  // matches is also unmatched (a possible edited or deleted counterpart). Otherwise it is new: for
  // example messages after the stored export ended, or in a hole between two earlier exports.
  const bounds: [number, number][] = [[-1, -1], ...pairs, [sIdx.length, iIdx.length]];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const [sA, iA] = bounds[k] as [number, number];
    const [sB, iB] = bounds[k + 1] as [number, number];
    const storedGap = sB - sA - 1 > 0;
    for (let b = iA + 1; b < iB; b++) {
      result[iIdx[b] as number] = { status: storedGap ? "uncertain" : "new" };
    }
  }
  return result;
}
