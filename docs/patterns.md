# Patterns: the ideas behind ChatterPilot

ChatterPilot is small, but it uses ideas that apply to any "messy messages in, business records out"
system: order desks, service complaints, bookings, attendance, field reports. Each pattern below has
the problem it solves, where the idea comes from, how this repository applies it, and the test that
proves it. Reuse the ideas even if you never use this code.

Sources were read on 2026-10-17. Where only part of a source was read, that is said.

---

## 1. Every value cites its source (field-level provenance)

**Problem.** A draft that says "40 bags, ₹16,400" is only useful if someone can see *why*. Without
that, a reviewer has to re-read the whole chat, and a wrong value looks the same as a right one.

**Idea.** W3C PROV (Recommendation, 30 April 2013) models *entities* (a chat message), *activities*
(an extraction run) and *agents* (the parser, a reviewer), linked by relations such as
`wasDerivedFrom` and `wasAttributedTo`; an edit is a *revision*.
<https://www.w3.org/TR/prov-dm/>. Applying it per field is our framing, not a PROV term.

**Here.** Every draft field is `{ value, status, evidence[] }`
([`packages/core/src/provenance.ts`](../packages/core/src/provenance.ts)). Evidence is one of:
a chat line range with the exact text span, a voice-note transcript, a catalogue row, a calculation
over other fields, or a named person's edit with a reason. Prices may only cite the catalogue, never
a chat message.

**Proof.** `packages/orders/src/draft.test.ts`: "cites the exact message text and source lines for
chat-derived fields", "cites catalogue rows for prices and never a chat message" (a chat saying
"Cement is 999 per bag" does not change the price).

## 2. Unknown stays unknown (abstain instead of guessing)

**Problem.** Automation that fills every blank produces confident wrong orders, the most expensive
kind of error.

**Here.** Missing prices, ambiguous product names, two customers with the same name, mixed
currencies and quantities written in words all produce an *issue* with `status: unknown` or
`needs_review`. A draft with open issues cannot be accepted.

**Proof.** `draft.test.ts`: "never invents a price, unit or tax", "does not pick between same-name
customers", "refuses to total mixed currencies", plus 54 adversarial order lines;
`hinglish.test.ts`: quantities in words raise `quantity_in_words`.

## 3. Money is integers

**Problem.** `0.1 + 0.2 !== 0.3` in floating point; totals drift by a paisa and reconciliation fails.

**Idea.** Martin Fowler's *Money* pattern: amounts carry their currency and rounding is explicit
(<https://martinfowler.com/eaaCatalog/money.html>). Integer minor units (paise) is the common
implementation.

**Here.** [`packages/core/src/money.ts`](../packages/core/src/money.ts): quantities in thousandths,
money in minor units, half-up rounding in one function, safe-integer checks; totals in different
currencies are never added.

**Proof.** `packages/core/src/money.test.ts`: "avoids binary float error".

## 4. A person accepts; the record freezes

**Problem.** If a draft can change after someone approves it, the approval means nothing.

**Here.** Accepting stores a frozen snapshot and its SHA-256. Exports and form-filling read only
accepted snapshots. The decision log is append-only, enforced by SQLite triggers, not just by code.

**Proof.** `apps/local/src/server.test.ts`: "cannot be edited or deleted, even directly in SQLite",
"will not accept a draft with open issues, and rejects need a reason";
`packages/exporters/src/exporters.test.ts`: exporters refuse anything with an unknown value.

## 5. Approval is bound to exact content

**Problem.** "Approved" must mean *this* order, *these* prices, *this* target, *this* person,
*now*. Otherwise a later edit or price change rides on an old approval.

**Here.** An approval records operator, target, action, a hash of the canonical payload (sorted
keys, integer money), the catalogue version and an expiry
([`packages/order-automation/src/approval.ts`](../packages/order-automation/src/approval.ts)). Any
change voids it.

**Proof.** `approval.test.ts`: "hashes payloads independently of key order", "caps approval
lifetime and requires a named operator"; `apps/local/src/execution.test.ts`: "invalidates the
approval when the catalogue (prices) changes", "voids an approval when the draft is reopened after
approval", "refuses a different operator and records why".

## 6. Side effects: write intent first, never blind-retry, reconcile unknowns

**Problem.** When saving to another system times out, you do not know whether it saved. Retrying
can create a duplicate order; not retrying can lose one.

**Idea.** Stripe stores the first result for an idempotency key and replays it on retry, and treats
reusing a key with different parameters as an error (<https://docs.stripe.com/api/idempotent_requests>).
The transactional outbox writes the intended message in the same transaction as the state change
and expects consumers to handle duplicates (<https://microservices.io/patterns/data/transactional-outbox.html>).
Azure's compensating-transaction guidance puts irreversible steps after all validation and pauses
for human review in ambiguous cases
(<https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction>).

**Here.** An execution ledger with a state machine and compare-and-set transitions, at most one
live attempt per document (a partial unique index), a reference typed into the target so a lost
response can be found again, and a hard stop before Submit. See
[docs/order-automation.md](order-automation.md).

**Proof.** `execution.test.ts`: "never sends the same document twice", "reconciles a lost response
by reference instead of saving again", "leaves an unknown outcome for a person when nothing can be
found", "refuses to submit, even with a submit approval", "keeps execution history append-only".
`packages/providers/src/providers.test.ts`: "treats a timeout as an uncertain charge and never marks
it safe to retry" (the same idea for paid AI calls).

## 7. Re-importing overlapping exports without duplicates or losses

**Problem.** People export the same group every week; each export repeats older history. Naive
de-duplication either doubles orders or drops genuine repeats ("ok", "ok").

**Idea.** Align the new export against stored messages as a longest-common-subsequence problem,
the basis of `diff` (Myers, "An O(ND) Difference Algorithm and Its Variations", 1986).

**Here.** [`packages/core/src/align.ts`](../packages/core/src/align.ts) aligns fingerprints in
time order, treats same-minute messages as a multiset, and marks a message *uncertain* only when an
unmatched stored message shares its gap, so it is never silently dropped.

**Proof.** `packages/core/src/align.test.ts`: "keeps genuine repeats: two identical messages in one
minute stay two", "handles a backfill (older export imported after a newer one)", "flags edited or
reordered messages inside the overlap as uncertain instead of dropping them".

## 8. Chat text is untrusted input everywhere

**Problem.** Chat text ends up in spreadsheets, web pages, XML files and AI prompts. Each is an
injection surface.

**Idea.** OWASP CSV Injection: cells starting with `=`, `+`, `-`, `@`, tab, CR or LF (and full-width
lookalikes in some locales) can run as formulas; no single fix is safe in every app
(<https://owasp.org/www-community/attacks/CSV_Injection>). OWASP Top 10 for LLM Applications 2025
lists Prompt Injection (LLM01), Improper Output Handling (LLM05) and Excessive Agency (LLM06)
(<https://genai.owasp.org/llm-top-10/>).

**Here.**
- CSV cells are neutralised, including full-width `＝＋－＠`
  ([`packages/core/src/csv.ts`](../packages/core/src/csv.ts)).
- The web app renders text, never HTML. It refuses non-loopback hosts and cross-site requests.
- XML exports escape everything and drop characters XML forbids.
- ZIP imports refuse path traversal, symlinks and zip bombs.
- AI proposals are kept only if they quote text that is actually in the message (span-grounded).
- The MCP server labels chat text as data and has **no tool to accept or submit**, so prompt
  injection cannot turn into an accepted order (excessive agency is designed out, not filtered).

**Proof.** `csv.test.ts` (formula table incl. `＝1+1`); `server.test.ts`: "neutralises formula
injection that arrives through chat text", "refuses non-loopback Host headers (DNS rebinding)",
"never turns an upload name into a path"; `archive.test.ts`: path traversal and symlink cases;
`exporters.test.ts`: "escapes hostile names instead of breaking the document";
`providers.test.ts`: "runs a consented batch and keeps only grounded proposals"; `mcp.test.ts`:
the tool list contains no accept/approve/reject/fill/submit tool.

## 9. Local-first, with honest gaps

**Problem.** Business chats are sensitive. Many small businesses cannot or should not upload them
to a service, and a dashboard that hides missing days misleads.

**Idea.** Ink & Switch, "Local-first software" (2019): the network is optional, data is private by
default, and the user keeps ownership and control (<https://www.inkandswitch.com/essay/local-first/>).
ChatterPilot follows those ideals; it does not attempt the essay's collaboration and multi-device
ideals.

**Here.** SQLite workspace on disk, loopback-only web app, no account, no network calls in the core.
Every metric states its definition, its date coverage and the days with no data; trends are refused
when coverage is too thin.

**Proof.** `apps/local/e2e/demo.spec.ts`: the full demo makes **no outbound request** and shows the
Jan 16–19 gap; `server.test.ts`: "defaults money metrics to accepted orders and states coverage".

## 10. Vocabulary is data, not code

**Problem.** Every shop and region has its own words: *bori*, *peti*, *nag*, *dedh*, *sawa do*,
Devanagari digits. Hard-coding them makes the system English-only, or brittle.

**Here.** [`packages/orders/src/lexicon.ts`](../packages/orders/src/lexicon.ts) holds the default
words; a business adds its own in `lexicon.json`, which is validated and versioned with its
catalogue. Digits from other scripts are normalised one-for-one so evidence spans stay exact.
Background: [docs/research/indian-order-language.md](research/indian-order-language.md).

**Proof.** `packages/orders/src/hinglish.test.ts`.

---

## Using these patterns elsewhere

The order flow is one instance. A complaint desk, a booking desk or a field-report log needs the
same pieces: evidence on every value, abstention, a person who accepts, frozen records, safe side
effects, untrusted-input handling, and honest coverage. The fleet template
([`packages/templates/src/fleet.ts`](../packages/templates/src/fleet.ts)) applies them to vehicle
bookings and faults with the same core. [docs/harnesses.md](harnesses.md) shows how to ask a coding
agent to add your own.
