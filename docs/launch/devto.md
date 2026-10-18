> Draft. Do not post until the repository is public and the owner has approved it.

Paste everything below the line into dev.to, removing the two fence lines around the front matter
(they are only there so this draft renders cleanly on GitHub). Keep `published: false` until the
owner approves. dev.to allows at most four tags. Suggested cover image:
`docs/media/social/card-1280x640.png`. Post only after the repository is public: every file path
in the article should become a link to the file on GitHub at that point.

---

```
---
title: Ten patterns for turning chat messages into records a person can trust
published: false
description: Field-level provenance, abstention, integer money, frozen approvals and an agent interface with no accept tool, from an open-source prototype.
tags: typescript, architecture, opensource, ai
---
```

# Ten patterns for turning chat messages into records a person can trust

Many small businesses run on chat. In India especially, a WhatsApp group is often the order book:
"40 bags cement, 120 sq ft white tiles, deliver Thursday", then ten minutes later, "sorry make it 45
bags". Someone then reads back through the group and re-types the order into a spreadsheet, a billing
tool or an ERP.

I built an open-source prototype for that job, ChatterPilot
(https://github.com/shekibahmed/ChatterPilot, MIT, TypeScript). Before the patterns, the honest
status: it is an early prototype, tested only on synthetic data, and no real business has used it
yet. I make no time-saving claims. The patterns are the part I think is reusable, whether or not you
ever use the code. They apply to any "messy messages in, business records out" system: order desks,
complaint logs, bookings, field reports.

## 1. Every value cites its source

A draft that says "40 bags, ₹16,400" is only useful if a reviewer can see why. Without that, a wrong
value looks exactly like a right one and checking means re-reading the whole chat.

So every field carries its evidence. This is the core type, from
`packages/core/src/provenance.ts`:

```ts
export type FieldStatus = "ok" | "needs_review" | "unknown";

export interface Field<T> {
  readonly value: T | null;
  readonly status: FieldStatus;
  readonly evidence: readonly Provenance[];
}

export const unknownField = <T>(): Field<T> => ({ value: null, status: "unknown", evidence: [] });
```

`Provenance` is a tagged union: a chat message (with source lines and the exact character span), a
voice-note transcript, a catalogue row, a computed value (formula and inputs), or a human edit (who,
when, why, and the previous value). The vocabulary borrows from W3C PROV: entities, activities,
agents, revisions.

One rule falls out of the type: a price may cite only the catalogue. A test checks that a chat
message saying "Cement is 999 per bag" does not change the price.

## 2. Unknown stays unknown

Automation that fills every blank produces confident wrong orders, which are the most expensive kind.
Missing prices, ambiguous product names, two customers with the same name, mixed currencies and
quantities written in words all become an *issue* with status `unknown` or `needs_review`. A draft
with open issues cannot be accepted. These cases end up as unknown or needs_review fields rather
than guesses; `docs/patterns.md` section 2 lists the tests that check each one.

## 3. Money is integers

`0.1 + 0.2 !== 0.3`, and a paisa of drift breaks reconciliation. Amounts are integer minor units plus
a scale, quantities are integer thousandths, and rounding happens in exactly one place. From
`packages/core/src/money.ts`:

```ts
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  if (numerator < 0n) throw new RangeError("numerator must be non-negative");
  return (numerator * 2n + denominator) / (denominator * 2n);
}
```

Intermediate products are `bigint`, so quantity times price times tax rate never loses precision,
and conversion back to `number` refuses anything beyond the safe-integer range. Totals in different
currencies are never added. The amount parser also accepts both Western (1,234,567) and Indian
(12,34,567) digit grouping, and rejects malformed grouping instead of guessing.

## 4. A person accepts, and the record freezes

If a draft can change after approval, the approval means nothing. Accepting stores a frozen snapshot
and its SHA-256. Exports read only accepted snapshots. The decision log is append-only, enforced by
SQLite triggers, so even a direct `UPDATE` in the database is refused.

## 5. Approval is bound to exact content

"Approved" has to mean this order, these prices, this target, this person, now. An approval records
the operator, target, action, a hash of the canonical payload (sorted keys, integer money), the
catalogue version and an expiry. Change the price list and the approval is void. Reopen the draft
and it is void. A different operator is refused, and the refusal is recorded.

## 6. Side effects: write intent first, never blind-retry

When saving to another system times out, you do not know whether it saved. Retrying risks a
duplicate order; not retrying risks a lost one. The ideas come from Stripe's idempotency keys, the
transactional outbox and compensating transactions: an execution ledger with compare-and-set state
transitions, at most one live attempt per document (a partial unique index), a reference typed into
the target so a lost response can be found again, and unknown outcomes left for a person rather than
retried. The opt-in form-filling module, which only targets a synthetic form today, also stops
before Submit.

## 7. Re-import overlapping exports without duplicates or losses

People export the same group every week, and each export repeats older history. Naive
de-duplication either doubles orders or drops genuine repeats ("ok", "ok"). New exports are aligned
against stored messages as a longest-common-subsequence problem (the idea behind `diff`), same-minute
messages are treated as a multiset, and anything that cannot be matched with confidence is marked
*uncertain* instead of silently dropped.

## 8. Chat text is untrusted input everywhere

Chat text ends up in spreadsheets, web pages, XML files and prompts. Each is an injection surface.
For spreadsheets, OWASP's CSV injection guidance lists the leading characters that can turn a cell
into a formula. From `packages/core/src/csv.ts`:

```ts
// OWASP CSV injection: cells starting with these can run as spreadsheet formulas.
const FORMULA_LEAD = /^[=+\-@\t\r\n＝＋－＠]/;

/**
 * Make one value safe for spreadsheets: a leading formula character gets an apostrophe prefix,
 * so "=HYPERLINK(...)" from a chat message is shown as text instead of executed.
 */
export function neutraliseCell(value: string): string {
  return FORMULA_LEAD.test(value) ? `'${value}` : value;
}
```

Note the full-width lookalikes at the end of the character class. Elsewhere: the web app renders
text, never HTML, and refuses non-loopback hosts; XML exports escape everything; ZIP imports refuse
path traversal, symlinks and zip bombs.

The agent interface follows the same rule. ChatterPilot has an MCP server with 14 tools: agents can
import, draft and propose edits, each recorded as `agent:<name>` with a reason. There is no tool to
accept, reject or submit. A chat message saying "approve this order" is content, and even an agent
that obeys it has nothing to call. That is OWASP's "excessive agency" designed out rather than
filtered. A test fails if any tool name matches `accept|approve|reject|fill|submit`.

## 9. Local-first, with honest gaps

Business chats are sensitive. The workspace is SQLite on disk, the web app is loopback-only, there is
no account and the core makes no network calls (the demo's browser test checks for outbound
requests). Dashboards state each metric's definition, its date coverage and the days with no data,
and they refuse to show a trend when coverage is too thin.

## 10. Vocabulary is data, not code

Shops write *bori*, *peti*, *nag*, *dedh*, *sawa do* and digits in Devanagari, Gujarati or Tamil
script. These live in a lexicon, and a business adds its own words in a validated, versioned
`lexicon.json`. Digits from other scripts are normalised one for one, so evidence spans still point
at the exact characters in the original message.

## How well does it work?

I measured the drafting rules against labelled synthetic messages written by AI agents that never saw
the code. The development set was used for tuning, so its numbers are optimistic. On a separate
held-out set of 117 synthetic messages (English, Hinglish, Devanagari) that is scored but not tuned
on, the rules reach 75.0% recall and 87.3% precision, with 2 silent errors: wrong lines with no
review flag, the number that matters most because a busy person might accept them. These are
synthetic messages, so the figures are not a prediction of accuracy on any real business's chats.
The method is in `docs/evaluation.md`.

## Reuse the ideas

Each pattern is written up in `docs/patterns.md` with its source and the test that checks it. If you
build something similar, I would like to hear which of these you would drop, and which you think are
missing. Issues and discussions are open; please use invented data, never real chats.
