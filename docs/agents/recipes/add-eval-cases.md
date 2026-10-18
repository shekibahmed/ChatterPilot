# Recipe: add evaluation cases

## Goal

Measure the drafting rules (or the follow-ups rules) on more labelled messages, without making the
numbers dishonest. Background and current scores: [docs/evaluation.md](../../evaluation.md).

## The sets

| File | Split | Use |
|---|---|---|
| `fixtures/eval/order-messages.json` | development (115 cases, ids `en-`, `hi-`, `mx-`) | Tune rules on it. Read its failures. |
| `fixtures/eval/order-messages.heldout.json` | held-out (117 cases, ids `ho-en-`, `ho-hi-`, `ho-mx-`) | Score it as a regression check after a change is finished. Never read its failures, never tune on it. |
| `fixtures/eval/followup-messages.json` | `fu-a-` development (39), `fu-b-` held-out (34) | The same rules, by id prefix. The CLI scores the whole file; score `fu-a` alone from a scratch file (below). |

If a held-out set has been used for tuning, it is no longer held out. A new one must be written
(docs/evaluation.md says so).

## Keep held-out output out of sight

Some output lists held-out cases one by one. Never use `--json`, `--failures` or `--tags` on
`fixtures/eval/order-messages.heldout.json`; `--json` prints the outcome of every case. Never run
`pnpm chatterpilot eval --template followups --json` on the full follow-ups file; its `failures`
array lists `fu-b` ids with their expected and found kinds.

To look at follow-up failures, score only the `fu-a` half. Write it to a scratch file outside the
repository, from the repository root:

```sh
dir=$(mktemp -d)
node -e 'const fs = require("node:fs"); const all = JSON.parse(fs.readFileSync("fixtures/eval/followup-messages.json", "utf8")); fs.writeFileSync(process.argv[1], JSON.stringify(all.filter((c) => c.id.startsWith("fu-a-"))));' "$dir/fu-a.json"
pnpm chatterpilot eval --template followups --cases "$dir/fu-a.json" --json
```

## Read first

- `packages/orders/src/evaluate.ts`: `EvalCase`, `evaluate`, `validateEvalCases`.
- `packages/orders/src/evaluate.test.ts`: describes "synthetic evaluation set (development split)"
  and "synthetic evaluation set (held-out split)", with the regression floors.
- `packages/templates/src/followups-eval.ts`: `FollowupCase` and `evaluateFollowups`.
- `fixtures/synthetic/catalogue/products.csv` and `customers.csv`: labels must use these ids.

## Case format

Order messages (`EvalCase`):

```json
{ "id": "en-040", "lang": "en", "tags": ["multi-item", "alt-unit"],
  "text": "3 roll pvc pipe 1 inch and 2 box elbow", "kind": "order", "customer": null,
  "lines": [{ "product": "PVC-P1", "baseQuantity": 3 }, { "product": "PVC-E1", "baseQuantity": 100 }] }
```

- `kind` is `order` or `non_order` (payments, questions, complaints, delivery updates).
- `baseQuantity` is in the product's base unit (2 boxes of 50 elbows is 100).
- `product` may be `AMBIGUOUS` or `UNKNOWN`. Leaving it for a person then counts as abstained, not
  missed.
- `customer` is a customer id or `null`.

Follow-up messages (`FollowupCase`): `id`, `lang`, `text`, `kinds` (any of `delivery_chase`,
`complaint`, `payment_promise`, `payment_report`, `quote_request`, `resolution`) and `amount` in
rupees or `null`.

## Steps

1. Write the messages before you look at the drafting code or its failures, if you can. The
   existing sets were written by agents that saw only the catalogue and the labelling rules.
2. Label each message as a careful order clerk would. Drop any message two careful clerks could
   label differently.
3. Add development cases to `fixtures/eval/order-messages.json` with the next free id.
4. Check the labels and see the score:

   ```sh
   pnpm chatterpilot eval --tags --failures
   ```

   Invalid labels (an unknown product id, a non-positive quantity) make `validateEvalCases` report
   problems, and the test "has valid labels" fails.
5. For held-out cases: write a whole new batch at once, add it to
   `fixtures/eval/order-messages.heldout.json`, and score it once, with no `--json`, `--failures`
   or `--tags`:

   ```sh
   pnpm chatterpilot eval --cases fixtures/eval/order-messages.heldout.json
   ```

   Do not change rules in response to its numbers other than reverting. If the held-out set is
   needed for tuning, write a new held-out set (docs/evaluation.md).
6. Record the new figures, the commit and the case counts in
   [docs/evaluation.md](../../evaluation.md).
7. Harder cases can lower recall below the floor in `evaluate.test.ts` ("does not regress" or "has
   valid labels and does not regress"). Lower a floor only for new cases, never for a code change,
   and write the reason in `PROGRESS.md` and docs/evaluation.md.

## Test to add

New cases in the JSON files are picked up by the existing tests: "has valid labels", "does not
regress", "has valid labels and does not regress", and "agrees with a full draft on every labelled
message". To pin a scoring behaviour, add a unit case to describe "evaluate" in
`packages/orders/src/evaluate.test.ts`, using its `c(...)` helper:

```ts
it("counts an unknown product left for a person as abstained", () => {
  const report = evaluate(
    [c({ id: "u", text: "5 bags mystery powder", lines: [{ product: "UNKNOWN", baseQuantity: 5 }] })],
    catalogue,
  );
  expect(report.cases[0]?.lines.map((l) => l.outcome)).toEqual(["abstained"]);
});
```

## Done when

```sh
pnpm exec vitest run packages/orders/src/evaluate.test.ts    # exit 0
pnpm chatterpilot eval                                       # exit 0
pnpm check                                                   # exit 0
```

For follow-up cases: `pnpm exec vitest run packages/templates/src/followups.test.ts` and
`pnpm chatterpilot eval --template followups` (no `--json`), both exit 0.

## Do not

- Do not copy real chat messages, even with names changed. Write new synthetic ones.
- Do not move a failing held-out case into the development set to fix it.
- Do not run `--json`, `--failures` or `--tags` on the held-out file, or `--json` on the full
  follow-ups file. Do not read held-out cases one by one to choose rules.
- Do not relabel a case to match what the code produces. Labels describe what a clerk would write.
- Do not add held-out cases one at a time after looking at scores; add a batch, score it once.
