# Recipe: add a shop's words (lexicon.json)

## Goal

Make drafting understand the unit words, number words and "not an order" phrases one shop uses,
such as *than* for a bolt of cloth or "sample bhejo" for a sample request. Do it with data, not
code. Pattern: [10. Vocabulary is data, not code](../../patterns.md#10-vocabulary-is-data-not-code).

There are two places words can go:

| Words used by | Put them in | Committed to this repository? |
|---|---|---|
| One shop | `lexicon.json` in that shop's catalogue folder | No. A real shop's catalogue stays on its own computer. |
| Most shops in a region or trade | `DEFAULT_LEXICON` in `packages/orders/src/lexicon.ts` | Yes, with a source and a test. |

## Read first

- [docs/catalogue.md](../../catalogue.md), section "lexicon.json (optional)": the file format.
- `packages/orders/src/lexicon.ts`: the `Lexicon` interface, `DEFAULT_LEXICON`, `mergeLexicon`
  (only adds, never removes) and `validateLexicon`.
- `packages/orders/src/hinglish.test.ts`, describe "business lexicon.json": the tests to copy.
- [docs/research/indian-order-language.md](../../research/indian-order-language.md) and
  [DECISIONS.md](../../../DECISIONS.md) D017, if you change the defaults.

## Steps for one shop

1. Find what drafting misses. With a labelled sample of the shop's messages (kept outside the
   repository; see [add-eval-cases.md](add-eval-cases.md) for the format):

   ```sh
   pnpm chatterpilot eval --cases <shop-sample.json> --catalogue <shop-catalogue-dir> --failures
   ```

2. Write `<shop-catalogue-dir>/lexicon.json`:

   ```json
   {
     "units": { "than": ["than", "thaan", "thann"] },
     "nonOrderPhrases": ["sample bhejo"]
   }
   ```

   Unit codes are lowercase and must match the `unit` and `alt_units` columns of `products.csv`.
   Pack sizes go in `alt_units` (`case:48`), never in the lexicon. Check `DEFAULT_LEXICON` first:
   many words (for example *dus*, *bori*, *peti*) are already there.

3. Check the catalogue. Exit 0 means usable; exit 1 means it has errors, listed by file and code
   (for example `invalid_lexicon`).

   ```sh
   pnpm chatterpilot catalogue check <shop-catalogue-dir>
   ```

4. Load it, so new drafts use it. The lexicon becomes part of the catalogue version, and every draft
   records that version.

   ```sh
   pnpm chatterpilot catalogue load <shop-catalogue-dir>
   ```

5. Score again with the command from step 1 and compare.

## Steps for default words (in the repository)

1. Add the words to `DEFAULT_LEXICON` in `packages/orders/src/lexicon.ts`.
2. Note where the words are used in
   [docs/research/indian-order-language.md](../../research/indian-order-language.md).
3. Add a test (below) and run the development set: `pnpm chatterpilot eval`. Silent errors must
   stay at 0. Then follow [change-a-drafting-rule.md](change-a-drafting-rule.md) for the held-out
   score.

## Test to add

In `packages/orders/src/hinglish.test.ts`, inside describe "business lexicon.json". The file's
`catalogue(lexicon)` helper loads a synthetic catalogue (with a `FAB` cotton product sold by the
`than`) plus your lexicon, and `lines(body, catalogue)` returns
`[productId, quantity milli, unit, base quantity milli, issue codes]` per line.

```ts
it("reads a shop's own spelling of a unit", () => {
  const lexicon = JSON.stringify({ units: { than: ["than", "thaan", "thann"] } });
  expect(lines("4 thann cotton", catalogue(lexicon))).toEqual([["FAB", 4000, "than", 4000, []]]);
});

it("rejects a unit whose spellings are not a list", () => {
  expect(validateLexicon({ units: { than: "than" } }).problems).toEqual([
    'Unit "than" must list words as strings.',
  ]);
});
```

A number word must still raise `quantity_in_words` for a person to confirm. Assert it when you add
number words.

## Done when

```sh
pnpm exec vitest run packages/orders/src/hinglish.test.ts   # exit 0
pnpm chatterpilot eval                                      # exit 0; silent errors still 0
pnpm check                                                  # exit 0
```

For one shop only: `pnpm chatterpilot catalogue check <shop-catalogue-dir>` exits 0.

## Do not

- Do not commit a real shop's `lexicon.json`, catalogue or chat messages. Write synthetic tests.
- Do not remove or rename default words; `mergeLexicon` only adds, and other shops rely on them.
- Do not put pack sizes ("1 peti = 48") in the lexicon. They belong in `alt_units`.
- Do not stop number words from raising `quantity_in_words`.
- Do not tune words against `fixtures/eval/order-messages.heldout.json` or read its failures.
