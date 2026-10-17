import { extractFollowups, type FollowupKind } from "./followups.ts";

/** One labelled message: the kinds a careful shop manager would note, and any payment amount. */
export interface FollowupCase {
  readonly id: string;
  readonly lang: string;
  readonly text: string;
  readonly kinds: readonly FollowupKind[];
  /** Rupees, for payment promises and reports that state one. */
  readonly amount: number | null;
}

export interface KindScore {
  readonly kind: FollowupKind;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly precision: number | null;
  readonly recall: number | null;
}

export interface FollowupEvalReport {
  readonly cases: number;
  /** Messages whose set of kinds is exactly right. */
  readonly exactMessages: number;
  readonly byKind: readonly KindScore[];
  /** Payment messages with a labelled amount where the amount read is exactly right. */
  readonly amounts: { readonly labelled: number; readonly right: number; readonly wrong: number };
  readonly failures: readonly { id: string; expected: readonly string[]; got: readonly string[] }[];
}

const KINDS: readonly FollowupKind[] = [
  "delivery_chase",
  "complaint",
  "payment_promise",
  "payment_report",
  "quote_request",
  "resolution",
];

export function evaluateFollowups(cases: readonly FollowupCase[]): FollowupEvalReport {
  const counts = new Map(KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }]));
  let exact = 0;
  const amounts = { labelled: 0, right: 0, wrong: 0 };
  const failures: { id: string; expected: string[]; got: string[] }[] = [];
  for (const c of cases) {
    const items = extractFollowups({
      id: c.id,
      author: null,
      localDateTime: null,
      startLine: 1,
      body: c.text,
    });
    const got = new Set(items.map((i) => i.kind));
    const want = new Set(c.kinds);
    for (const k of KINDS) {
      const n = counts.get(k);
      if (!n) continue;
      if (got.has(k) && want.has(k)) n.tp++;
      else if (got.has(k)) n.fp++;
      else if (want.has(k)) n.fn++;
    }
    const same = got.size === want.size && [...got].every((k) => want.has(k));
    if (same) exact++;
    else failures.push({ id: c.id, expected: [...want].sort(), got: [...got].sort() });
    if (c.amount !== null) {
      amounts.labelled++;
      const read = items.find((i) => i.amount.value !== null)?.amount.value;
      if (read === Math.round(c.amount * 100)) amounts.right++;
      else if (read !== undefined) amounts.wrong++;
    }
  }
  const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
  return {
    cases: cases.length,
    exactMessages: exact,
    byKind: KINDS.map((kind) => {
      const n = counts.get(kind) ?? { tp: 0, fp: 0, fn: 0 };
      return {
        kind,
        truePositives: n.tp,
        falsePositives: n.fp,
        falseNegatives: n.fn,
        precision: ratio(n.tp, n.tp + n.fp),
        recall: ratio(n.tp, n.tp + n.fn),
      };
    }),
    amounts,
    failures,
  };
}
