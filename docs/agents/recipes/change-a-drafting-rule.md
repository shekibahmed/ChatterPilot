# Recipe: change a drafting rule and measure it

## Goal

Make drafting read more order messages correctly, and show honestly whether it did. Measure on the
development set before and after, then score the held-out set once as a regression check. Patterns:
[2. Unknown stays unknown](../../patterns.md#2-unknown-stays-unknown-abstain-instead-of-guessing)
and [10. Vocabulary is data, not code](../../patterns.md#10-vocabulary-is-data-not-code).

Try data first. Many misses are fixed by a catalogue alias or a `lexicon.json` word
([add-shop-words.md](add-shop-words.md)) without changing code.

## Read first

- [docs/evaluation.md](../../evaluation.md): what recall, precision and silent errors mean, the
  current scores and the known limits.
- `packages/orders/src/extract.ts`: `extractOrderLines` and `looksLikeNonOrder`.
- `packages/orders/src/draft.ts`: `buildOrderDraft`, `suggestsOrder`, the `IssueCode` list and
  `DRAFT_FORMULA_VERSION`.
- `packages/orders/src/match.ts`: `matchRecord`, if the change is about product or customer names.
- `packages/orders/src/evaluate.test.ts`: the floors in "does not regress" (development) and "has
  valid labels and does not regress" (held-out).

## Steps

1. Record the baseline on the development set. Keep the files outside the repository, in a scratch
   directory you own (your scratchpad directory, or a new one from `mktemp -d`). Do not write to the
   repository's parent directory; other projects may live there.

   ```sh
   dir=$(mktemp -d)
   pnpm chatterpilot eval --json > "$dir/eval-before.json"
   pnpm chatterpilot eval --tags --failures
   ```

2. Pick misses from the development failures only. Write a failing test first (below) with new
   synthetic text. Do not copy text from either evaluation file into the test.

3. Change the rule in `extract.ts`, `draft.ts` or `lexicon.ts`. When a rule is unsure, raise an
   issue (for example `product_partial` or `quantity_in_words`) and set the field to
   `needs_review` or `unknown`. A flagged error is caught by a reviewer; a silent one may be
   accepted.

4. Run the package tests, then measure the development set again (same `$dir`):

   ```sh
   pnpm exec vitest run packages/orders/src
   pnpm chatterpilot eval --json > "$dir/eval-after.json"
   pnpm chatterpilot eval --tags
   ```

   Compare `overall.recall`, `overall.precision`, `overall.silentErrors` and
   `overall.nonOrderDetection` in the two JSON files. Silent errors on the development set must
   stay 0.

5. Score the held-out set once, as a regression check, after you have finished changing rules:

   ```sh
   pnpm chatterpilot eval --cases fixtures/eval/order-messages.heldout.json
   ```

   Never add `--json`, `--failures` or `--tags` here: each prints held-out cases or a per-tag
   breakdown of them. Do not change rules in response to its numbers other than reverting. If the
   held-out set is needed for tuning, write a new held-out set (docs/evaluation.md).

6. Raise the floors in `packages/orders/src/evaluate.test.ts` to the new figures if they went up.
   Floors only move up for code changes.

7. Record the before and after figures for both sets, with the commit, in
   [docs/evaluation.md](../../evaluation.md), and the commands and exit codes in `PROGRESS.md`.

8. `suggestsOrder` must still agree with `buildOrderDraft` (test "agrees with a full draft on every
   labelled message"). If your rule changes what counts as an order line, check both paths.

## Test to add

For a single line, add a row to the `CASES` table used by describe "buildOrderDraft: adversarial
order lines" in `packages/orders/src/draft.test.ts`, or to a table in
`packages/orders/src/hinglish.test.ts`. For behaviour across a message, add a named test, as in
describe "corrections, partial matches and lists" in `hinglish.test.ts`, whose `draft(body)` helper
drafts one message against the synthetic catalogue:

```ts
it("asks a person to confirm a corrected quantity", () => {
  const d = draft("40 bags ultrabond cement\nmake it 45");
  expect(d.lines).toHaveLength(1);
  expect(d.lines[0]?.quantity).toMatchObject({ value: { milli: 45000 }, status: "needs_review" });
});
```

That example already passes (it is part of "applies a later 'make it N' to a single line, cites it,
and asks a person to confirm"). Your new test should fail before your change and pass after it.

## Done when

```sh
pnpm exec vitest run packages/orders/src        # exit 0
pnpm chatterpilot eval                          # exit 0; silent errors 0; recall and precision not lower
pnpm chatterpilot eval --cases fixtures/eval/order-messages.heldout.json   # exit 0, run once at the end, figures recorded
pnpm check                                      # exit 0
```

`pnpm chatterpilot eval` exits 0 whatever the score; the floors in `evaluate.test.ts` are what fail.

## Do not

- Do not tune on the held-out set, run `--json`, `--failures` or `--tags` on it, or copy its
  messages into tests.
- Do not lower a floor in `evaluate.test.ts` to make a code change pass.
- Do not trade a flagged error for a silent one. Silent errors on the development set stay 0.
- Do not fill a value the message does not state (a price, a unit, a customer). Leave it unknown
  with an issue.
- Do not let chat text change a price. Prices come only from the catalogue or a named reviewer.
