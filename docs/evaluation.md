# Measuring the drafting rules

"It works on my examples" is not a measurement. ChatterPilot ships a labelled set of synthetic
order messages and a command that scores the real drafting code against it:

```sh
pnpm chatterpilot eval                 # summary by language
pnpm chatterpilot eval --tags          # also by difficulty tag (alt units, corrections, …)
pnpm chatterpilot eval --failures      # every message that was not drafted exactly right
pnpm chatterpilot eval --cases my-labelled.json --catalogue my-catalogue/   # your own set
```

## How the set was made

`fixtures/eval/order-messages.json` was written on 2026-10-17 by three AI agents that were given only
the synthetic catalogue and labelling rules, **not** the drafting code: one wrote English messages,
one Hinglish, one harder mixed and Devanagari messages. A fourth step re-checked every label (kind,
customer, product, quantity converted to the base unit) and dropped messages two careful clerks
could disagree on. Each message is labelled with what a careful order clerk would write down:

```json
{ "id": "en-005", "lang": "en", "tags": ["multi-item", "alt-unit"],
  "text": "3 roll pvc pipe 1 inch and 2 box elbow", "kind": "order", "customer": null,
  "lines": [{ "product": "PVC-P1", "baseQuantity": 3 }, { "product": "PVC-E1", "baseQuantity": 100 }] }
```

`product` may be `AMBIGUOUS` or `UNKNOWN`. The right behaviour there is to leave the product for a
person, which counts as *abstained*, not as a miss.

## What the numbers mean

| Column | Meaning |
|---|---|
| recall | Share of the clerk's lines (known products) that the draft got exactly right: product and base quantity. |
| prec. | Share of the drafted lines with a product that are exactly right. |
| silent | Wrong lines (wrong product, wrong quantity, a line nobody asked for) **without** a review flag. This is the number that matters most: a flagged error is caught by the reviewer, a silent one may be accepted. |
| flagged | Wrong lines that the draft did flag for review. |
| abstained | Ambiguous or unknown products correctly left unresolved. |
| orders | Order messages with at least one line that were suggested as orders. |
| non-ord. | Payment notes, questions, complaints and updates that were correctly *not* suggested. |

## Results

Baseline, 2026-10-17, commit after the lexicon slice (115 messages, 114 expected lines):

| | cases | recall | precision | silent errors | non-orders rejected |
|---|---|---|---|---|---|
| overall | 115 | 81.7% | 85.0% | 11 | 23/37 |
| English | 47 | 78.4% | 80.6% | 7 | 12/15 |
| Hinglish | 63 | 87.7% | 89.3% | 4 | 11/21 |
| Devanagari | 5 | 60.0% | 75.0% | 0 | 0/1 |

After the first round of rule changes (same day; tuned on this set, so optimistic):

| | cases | recall | precision | silent errors | non-orders rejected |
|---|---|---|---|---|---|
| overall | 115 | 90.4% | 93.1% | 0 | 37/37 |
| English | 47 | 94.6% | 94.6% | 0 | 15/15 |
| Hinglish | 63 | 91.2% | 92.9% | 0 | 21/21 |
| Devanagari | 5 | 70.0% | 87.5% | 0 | 1/1 |

What changed: corrections in the same message are applied (single line) or flagged (several
lines); a product match that leaves words unexplained ("**white** cement" via the alias "cement")
is flagged `product_partial`; stock questions, delivery reports, complaints and past-order
cancellations are not suggested as orders; product-first lists split at commas; "8 mm" matches
"8mm"; Devanagari unit and number words were added. Polite orders phrased as questions ("bhej doge
kya?") are still suggested (tested).

Known limits after this round: a new order in the same message as a delivery report ("last order
mil gaya, ab 5 box bhejo") is not suggested; an order without a quantity ("rockset bhej dena") has
no line; a line without a unit ("2 pvc pipe") is flagged rather than assumed to be in the base unit.

Baseline gaps (fixed above): corrections inside one message ("40 bags … make it 45") are drafted with the first
quantity and no flag; complaints and delivery updates that mention quantities are suggested as
orders; product names not in the catalogue are sometimes matched to a near alias.

A test (`packages/orders/src/evaluate.test.ts`) fails if recall or precision drops below, or silent
errors rise above, the recorded figures. Improvements raise the floors.

## Limits, stated plainly

- The messages are synthetic. Real chats are messier, and these figures are **not** a prediction of
  accuracy on any real business's chats. Measure on your own labelled sample (with consent) before
  relying on the drafts.
- The set is small (115 messages; 5 in Devanagari script) and comes from one catalogue.
- The same set is used to improve the rules (it is the development set). A separate held-out set,
  written the same way and never used for tuning, is the fairer measure; see below once it exists.
- Labels were checked by an AI agent, not by native-speaking shop staff.

## Label your own sample

Export a chat you are allowed to process, pick 50–100 messages, and write the JSON above for each
(your coding agent can draft labels from your catalogue for you to correct; never commit real
messages to a public repository). Then run `pnpm chatterpilot eval --cases yours.json --catalogue
your-catalogue/ --failures` and fix the misses with `lexicon.json` entries and catalogue aliases first.
