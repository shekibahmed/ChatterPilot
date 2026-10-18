# Problems this repository solves

This page is for coding agents and developers. Each entry names a business problem, the code that
solves it, the test that proves it, the pattern it follows (see [patterns.md](patterns.md)) and what
is still open (see [roadmap.md](roadmap.md)). All proofs run on synthetic data. Run a proof with
`pnpm exec vitest run <test file> -t "<test name>"`.

Test names are quoted exactly. A name ending in `%j` or `%s` is a table test (`it.each`) whose
cases fill in the placeholder.

---

## 1. A chat export's dates could be day/month or month/day

**Problem.** "05/06/26" is 5 June in one phone and 6 May in another, and a wrong guess moves every order.

**Solved in.** `packages/import-whatsapp`: `detectDateOrder` in
[timestamp.ts](../packages/import-whatsapp/src/timestamp.ts) reports `ambiguous` or `conflict`
instead of guessing, and `scanExport` in [scan.ts](../packages/import-whatsapp/src/scan.ts) uses
one order for the whole export. `importExport` in [apps/local/src/import.ts](../apps/local/src/import.ts)
refuses with `date_order_required` until a person passes `--date-order`.

**Proof.** `packages/import-whatsapp/src/scan.test.ts`: "does not guess an ambiguous day/month
order", "uses one order for the whole export: a single 13 decides it", "reports contradictory
timestamps as a conflict". `apps/local/src/import.test.ts`: "refuses an ambiguous export until the
date order is confirmed, storing nothing".

**Pattern.** [2. Unknown stays unknown](patterns.md#2-unknown-stays-unknown-abstain-instead-of-guessing).

**Still open.** Only the Android and iOS formats in `fixtures/synthetic/chats/` are tested. Real
exports from other locales wait for the "Pilots with two or three shops" step.

## 2. A chat export arrives as a broken or hostile ZIP

**Problem.** A ZIP from a phone may be corrupt, huge, or crafted to write files outside the workspace.

**Solved in.** `packages/import-whatsapp`: `openWhatsAppArchive` in
[archive.ts](../packages/import-whatsapp/src/archive.ts) checks size, entry count, paths and
corruption before extracting, and throws `ArchiveRejectedError`. `decodeExportBytes` in
[decode.ts](../packages/import-whatsapp/src/decode.ts) refuses invalid text instead of substituting
characters. `BlobStore` in [packages/storage/src/blobs.ts](../packages/storage/src/blobs.ts) names
stored files only by their SHA-256.

**Proof.** `packages/import-whatsapp/src/archive.test.ts`: "enforces configurable size and count
limits", "refuses a file that is not a ZIP". `packages/import-whatsapp/src/decode.test.ts`: "rejects
invalid UTF-8 instead of substituting characters". `apps/local/src/import.test.ts`: "refuses hostile
archives without recording anything", "removes blobs written before a failure discovered
mid-extraction". `apps/local/src/server.test.ts`: "never turns an upload name into a path".

**Pattern.** [8. Chat text is untrusted input everywhere](patterns.md#8-chat-text-is-untrusted-input-everywhere).

**Still open.** Images and voice notes are stored and linked, but not read. See the "Voice notes"
roadmap step.

## 3. The same group is exported every week, and each export repeats old history

**Problem.** Naive de-duplication either counts last week's orders twice or drops genuine repeats such as "ok", "ok".

**Solved in.** `reconcileSequences` in [packages/core/src/align.ts](../packages/core/src/align.ts),
called by `Workspace.recordImport` in
[packages/storage/src/workspace.ts](../packages/storage/src/workspace.ts). Identical files are a
no-op; overlapping exports add only new messages; changed messages are kept and flagged.

**Proof.** `packages/core/src/align.test.ts`: "keeps genuine repeats: two identical messages in one
minute stay two", "handles a backfill (older export imported after a newer one)", "flags edited or
reordered messages inside the overlap as uncertain instead of dropping them".
`apps/local/src/overlap.test.ts`: "counts repeated history once and adds only new messages", "does
not double-count dashboard activity".

**Pattern.** [7. Re-importing overlapping exports without duplicates or losses](patterns.md#7-re-importing-overlapping-exports-without-duplicates-or-losses).

**Still open.** Removing one person's messages from stored history is the roadmap step "Erasing one
person's data on request", which waits for an owner decision ([DECISIONS.md](../DECISIONS.md) D022).

## 4. Customers write in Hinglish, with number words, Indic digits and the shop's own words

**Problem.** "do bori cement", "२ पेटी साबुन" and "3 than cotton" are orders, but an English-only parser misses them.

**Solved in.** `packages/orders`: `extractOrderLines` in [extract.ts](../packages/orders/src/extract.ts);
`DEFAULT_LEXICON`, `normaliseDigits`, `mergeLexicon` and `validateLexicon` in
[lexicon.ts](../packages/orders/src/lexicon.ts). A shop adds words in `lexicon.json`, which
`loadCatalogue` in [catalogue.ts](../packages/orders/src/catalogue.ts) validates and versions with
the catalogue. Quantities written in words raise `quantity_in_words` for a person to confirm.

**Proof.** `packages/orders/src/hinglish.test.ts`: "keeps the original Devanagari digits in the
evidence text", "does not treat verbs or references as quantities", "adds the business's own unit
words", "is part of the catalogue version", "reports invalid lexicon files as catalogue errors".

**Pattern.** [10. Vocabulary is data, not code](patterns.md#10-vocabulary-is-data-not-code).

**Still open.** "More languages and trade vocabularies (Marathi, Gujarati, Tamil, Bengali; pharmacy,
grocery, textiles)" waits for native speakers and real phrasing.

## 5. A customer corrects an order, in the same message or a later one

**Problem.** "40 bags cement ... make it 45" must end as 45 bags, and the reviewer must see why.

**Solved in.** Same message: `buildOrderDraft` in [packages/orders/src/draft.ts](../packages/orders/src/draft.ts)
applies the correction to a single line, cites the corrected number and marks it `needs_review`.
Later message: a person (or an agent through the `revise_draft` MCP tool) adds a `link_message`
decision in `decide` in [apps/local/src/review.ts](../apps/local/src/review.ts), then excludes the
superseded line with `exclude_line`. Every edit, rejection and reopening needs a reason.

**Proof.** `packages/orders/src/hinglish.test.ts`: "applies a later 'make it N' to a single line,
cites it, and asks a person to confirm", "flags every line when a multi-line message cancels
something". `packages/orders/src/draft.test.ts`: "excludes a superseded line from totals but keeps
it for audit". `apps/local/src/server.test.ts`: "drafts, corrects, accepts and exports an order with
full history".

**Pattern.** [1. Every value cites its source](patterns.md#1-every-value-cites-its-source-field-level-provenance)
and [4. A person accepts; the record freezes](patterns.md#4-a-person-accepts-the-record-freezes).

**Still open.** Linking a later correction is done by a person; no roadmap step automates it. A new
order in the same message as a delivery report is a known limit (`hinglish.test.ts`: "known limit:
a new order in the same message as a delivery report is not suggested").

## 6. A chat quotes a price, or the catalogue price is missing or old

**Problem.** "Cement is 999 per bag" in a chat must not change the price, and a stale price must not slip through.

**Solved in.** `buildOrderDraft` in [packages/orders/src/draft.ts](../packages/orders/src/draft.ts)
takes prices only from the catalogue or a named reviewer. It raises `price_missing`,
`price_unconfirmed`, `price_stale`, `price_not_yet_effective` and `tax_rate_missing` instead of
filling a value. `loadCatalogue` reads `stalePriceDays` from `catalogue.json` (default 30).

**Proof.** `packages/orders/src/draft.test.ts`: "cites catalogue rows for prices and never a chat
message", "never invents a price, unit or tax", "flags stale and not-yet-effective prices relative
to the order date", "lets a reviewer confirm a stale price or supply a missing one".

**Pattern.** [1. Every value cites its source](patterns.md#1-every-value-cites-its-source-field-level-provenance)
and [2. Unknown stays unknown](patterns.md#2-unknown-stays-unknown-abstain-instead-of-guessing).

**Still open.** Checking prices against a real billing tool belongs to "Filling a real billing tool's
form after approval". The synthetic connector already blocks on a difference
(`apps/local/src/execution.test.ts`: "blocks without saving when target prices differ").

## 7. Two customers or products share a name, or a name has a typo

**Problem.** "Kumar" could be two customers, and "cemnt" is probably cement but should not be assumed.

**Solved in.** `matchRecord` in [packages/orders/src/match.ts](../packages/orders/src/match.ts)
returns `resolved`, `fuzzy`, `ambiguous` or `unresolved`. The most specific name wins; equal ties
stay ambiguous; a one-letter typo only gives `fuzzy`, which `buildOrderDraft` flags as
`product_fuzzy`.

**Proof.** `packages/orders/src/draft.test.ts`: "resolves the most specific customer name", "does
not pick between same-name customers", "resolves ambiguous products and customers by reviewer
choice". `packages/orders/src/hinglish.test.ts`: "flags a product match that leaves words
unexplained".

**Pattern.** [2. Unknown stays unknown](patterns.md#2-unknown-stays-unknown-abstain-instead-of-guessing).

**Still open.** `matchRecord` has no test file of its own ([tasks.md](agents/tasks.md) task 4). Real
naming habits wait for "Labelled samples from real chats".

## 8. Totals drift by a paisa, or two currencies are added together

**Problem.** `0.1 + 0.2 !== 0.3` in floating point, and INR plus USD is not a total.

**Solved in.** [packages/core/src/money.ts](../packages/core/src/money.ts): `parseAmountToMinor`
returns integer minor units with a scale, `divideRoundHalfUp` is the one rounding rule and
`toSafeMinor` refuses unsafe integers. `buildOrderDraft` raises `mixed_currency` and leaves the
total unknown.

**Proof.** `packages/core/src/money.test.ts`: "avoids binary float error", "honours scale 0".
`packages/orders/src/draft.test.ts`: "converts alternative units and computes exact amounts",
"refuses to total mixed currencies".

**Pattern.** [3. Money is integers](patterns.md#3-money-is-integers).

**Still open.** Nothing on the roadmap.

## 9. A draft could change after someone accepted it

**Problem.** If an accepted order can still be edited, the acceptance means nothing.

**Solved in.** `decide` in [apps/local/src/review.ts](../apps/local/src/review.ts) refuses to accept
a draft with open issues and stores the accepted draft as a frozen snapshot with its SHA-256
(`snapshotHash`). SQLite triggers in [packages/storage/src/migrations.ts](../packages/storage/src/migrations.ts)
block updates and deletes on the decision log. Exports read only `acceptedOrders`.

**Proof.** `apps/local/src/server.test.ts`: "cannot be edited or deleted, even directly in SQLite",
"will not accept a draft with open issues, and rejects need a reason", "keeps the catalogue files
that each draft was priced with". `packages/exporters/src/exporters.test.ts`: "refuses orders with
unknown values".

**Pattern.** [4. A person accepts; the record freezes](patterns.md#4-a-person-accepts-the-record-freezes).

**Still open.** Erasing one person's data must work with frozen records; the redaction design is
D022 in [DECISIONS.md](../DECISIONS.md) and needs the owner.

## 10. Accepted orders must be typed again into Tally, ERPNext or Zoho Books

**Problem.** Re-typing an order into the billing tool is the work the shop wants to remove.

**Solved in.** `TARGETS` in [packages/exporters/src/targets.ts](../packages/exporters/src/targets.ts)
(`tallyXml`, `erpnextCsv`, `zohoCsv`, `ublOrder`). `flatten` in
[common.ts](../packages/exporters/src/common.ts) throws `ExportRefused` on any unknown value.
`exportOrdersAs` in [apps/local/src/ops.ts](../apps/local/src/ops.ts) serves the CLI and the
`export_orders` MCP tool. A person imports the file; nothing writes to the other tool.

**Proof.** `packages/exporters/src/exporters.test.ts`: "refuses to export without explicit master
names (fails closed)", "puts item rows under the order with blank parent columns, as Data Import
expects", "escapes hostile names instead of breaking the document".
`apps/local/src/server.test.ts`: "lists targets and prepares files only from accepted orders,
refusing Tally without a map".

**Pattern.** [4. A person accepts; the record freezes](patterns.md#4-a-person-accepts-the-record-freezes)
and [8. Chat text is untrusted input everywhere](patterns.md#8-chat-text-is-untrusted-input-everywhere).

**Still open.** The formats are experimental. "Try the import files in real Tally, ERPNext and Zoho
Books test companies" waits for someone with a test company.

## 11. Nobody can see which deliveries, complaints, payments and quotes are still open

**Problem.** "Abhi tak nahi aaya" and "payment kal kar dunga" get lost in a busy group.

**Solved in.** `extractFollowups`, `linkFollowups` and `summariseFollowups` in
[packages/templates/src/followups.ts](../packages/templates/src/followups.ts); `followupItems` in
[apps/local/src/fleet.ts](../apps/local/src/fleet.ts) runs them over a workspace. Links are inferred
and marked `needs_review`. Promised and reported money are kept apart and never verified.

**Proof.** `packages/templates/src/followups.test.ts`: "lists what is still open, with age and
repeats, and never sums promises with payments", "links the repeat chase and the closing message,
marked for review", "reads only money as an amount: %j", "does not regress on the held-out half".
`apps/local/e2e/demo.spec.ts`: "follow-ups show what is still open, as checks rather than facts".

**Pattern.** [1. Every value cites its source](patterns.md#1-every-value-cites-its-source-field-level-provenance)
and [2. Unknown stays unknown](patterns.md#2-unknown-stays-unknown-abstain-instead-of-guessing).

**Still open.** The rules cover English, Hinglish and some Devanagari. Messages the rules miss wait
for "Optional AI reading for messages the rules miss".

## 12. A dashboard hides the days with no data

**Problem.** A chart that skips a missing week looks like a slow week.

**Solved in.** `computeDashboard` in [packages/orders/src/metrics.ts](../packages/orders/src/metrics.ts)
states coverage as the union of export date ranges, lists gaps, sums only accepted orders by
default, and refuses a week-on-week comparison without full coverage and at least
`MIN_ORDERS_FOR_COMPARISON` orders.

**Proof.** `packages/orders/src/metrics.test.ts`: "reports gaps between exports", "refuses a
week-on-week comparison without full coverage", "can include open drafts on request, still
excluding unknown totals". `apps/local/src/server.test.ts`: "defaults money metrics to accepted
orders and states coverage".

**Pattern.** [9. Local-first, with honest gaps](patterns.md#9-local-first-with-honest-gaps).

**Still open.** Nothing on the roadmap.

## 13. A chat message or an agent tries to approve an order

**Problem.** A message saying "approve this order" must not become an accepted order, whoever reads it.

**Solved in.** `createMcpServer` in [apps/local/src/mcp.ts](../apps/local/src/mcp.ts) registers no
tool that accepts, rejects, reopens or submits. Tool descriptions carry `UNTRUSTED_NOTE`, and
`allowedPath` keeps file arguments inside the `--files` folder. `processUpdate` in
[packages/telegram-intake/src/intake.ts](../packages/telegram-intake/src/intake.ts) stores
instructions in messages as plain data.

**Proof.** `apps/local/src/mcp.test.ts`: "lists the tools with honest hints, and no accept or
form-filling tool", "rejects symlinks that escape the allowed folder".
`apps/local/src/agent-reference.test.ts`: "docs/agents/tools.json is the MCP server's own tool list,
with no accept or submit tool". `packages/telegram-intake/src/intake.test.ts`: "stores injected
instructions as plain data and grants nothing". `apps/local/src/agent-session.test.ts`: "still runs,
and still shows that an agent cannot accept or export unaccepted orders".

**Pattern.** [8. Chat text is untrusted input everywhere](patterns.md#8-chat-text-is-untrusted-input-everywhere).

**Still open.** "Optional AI reading for messages the rules miss" waits for a provider and a consent
policy. The offline boundary exists (`packages/providers/src/providers.test.ts`: "runs a consented
batch and keeps only grounded proposals").

## 14. Typing an approved order into another system's form can save it twice

**Problem.** When a save times out, retrying may create a duplicate order and not retrying may lose one.

**Solved in.** `prepareApprovedDraft` in
[packages/order-automation/src/runner.ts](../packages/order-automation/src/runner.ts) runs an
execution ledger with at most one live attempt per document. `createApproval` and `checkApproval` in
[approval.ts](../packages/order-automation/src/approval.ts) bind an approval to the exact payload,
operator, target and catalogue version. `MockBooksConnector` fills a synthetic form and stops before
Submit; `fillForm` in [apps/local/src/ops.ts](../apps/local/src/ops.ts) only allows loopback targets.

**Proof.** `apps/local/src/execution.test.ts`: "never sends the same document twice", "reconciles a
lost response by reference instead of saving again", "invalidates the approval when the catalogue
(prices) changes", "refuses to submit, even with a submit approval".
`packages/order-automation/src/approval.test.ts`: "hashes payloads independently of key order".
`apps/local/e2e/connector.spec.ts`: "the fill-form command shows the document, needs --approve, and
stops before Submit".

**Pattern.** [5. Approval is bound to exact content](patterns.md#5-approval-is-bound-to-exact-content)
and [6. Side effects: write intent first, never blind-retry, reconcile unknowns](patterns.md#6-side-effects-write-intent-first-never-blind-retry-reconcile-unknowns).

**Still open.** "Filling a real billing tool's form after approval" waits for a named target system,
account and permissions. It will still stop before Submit at first.

---

## Problems not solved yet

These come from [roadmap.md](roadmap.md). Each waits for something outside the code.

- **Accuracy on real chats is unknown.** All scores in [evaluation.md](evaluation.md) are on
  synthetic messages. Waits for "Pilots with two or three shops" and "Labelled samples from real
  chats".
- **Voice notes are not transcribed.** A person can attach a transcript they already have
  (`apps/local/src/transcripts.test.ts`: "makes a transcribed voice note draftable, with transcript
  provenance"). Automatic transcription waits for "Voice notes".
- **Erasing one person's data.** Waits for the owner decision on D022.
- **Other languages and trades.** Waits for native speakers ("More languages and trade
  vocabularies").
- **Messages the rules miss.** Waits for "Optional AI reading for messages the rules miss".
- **Real billing tools.** Waits for "Try the import files in real Tally, ERPNext and Zoho Books test
  companies" and "Filling a real billing tool's form after approval".
- **Installing without a developer.** Waits for "A one-click installer for non-developers".
- **Known drafting limits** from [evaluation.md](evaluation.md): an order without a quantity
  ("rockset bhej dena") has no line, and a line without a unit ("2 pvc pipe") is flagged rather than
  assumed.
