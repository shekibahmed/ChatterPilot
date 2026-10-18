# Decision log

Records decisions adopted during authorised implementation. Superseded decisions are kept and point to
their replacement. No secrets, customer data or private transcripts.

## D000 — Ownership, name, visibility and git authority
- Date: 2026-10-17 (+05:30)
- Status: accepted
- Decision owner / approval: Shekib Ahmed, outline approval in Claude Code session of 2026-10-17
- Context: Plan requires private-first MIT development and a confirmed copyright holder before code.
- Chosen: MIT licence, `Copyright (c) 2026 Shekib Ahmed` (existing LICENSE, unchanged). Product name
  **ChatterPilot**, optional "by Kaamchor" branding. GitHub repository `shekibahmed/ChatterPilot` stays
  PRIVATE. Each tested slice is committed (explicit paths) and pushed to the private origin on branch
  `build/v0.1`. The private planning packet is kept outside this repository.
- Not authorised: visibility change, package publication, public deployment, paid/provider calls,
  bot registration, real-target submission, merging to `main`.
- Supersedes / superseded by: —

## D001 — Architecture and stack
- Date: 2026-10-17 (+05:30)
- Status: accepted (outline approval)
- Context: Local-first single-machine app; SQLite; no-key demo; contracts shared with an opt-in order
  module. Versions checked against npm/GitHub on 2026-10-17.
- Options considered: Next.js full-stack (rejected: more than a loopback app needs); `node:sqlite`
  (release candidate in Node 26, no transaction helper) vs better-sqlite3 13 (chosen: mature,
  `db.transaction()`, bundled N-API prebuilds).
- Chosen: pnpm workspace, TypeScript (strict, ESM, erasable syntax only), Node >= 26, Zod contracts,
  Vitest, Biome, Playwright Test. Vite + React UI with a Hono API bound to 127.0.0.1. better-sqlite3.
  yauzl for ZIP (plus explicit symlink checks). Money as integer minor units + scale.
  Packages: `apps/local`, `packages/{core,import-whatsapp,storage,templates,order-automation}`,
  `fixtures/{synthetic,mock-order-app}`, `docs/`. Providers, Telegram and the agent skill are added only
  when their gates open. Packages are created when first needed, not up front.
- Consequences: no build step for packages; dependency licences inventoried before any distribution.

## D002 — Hand-rolled WhatsApp line scanner
- Date: 2026-10-17 (+05:30)
- Status: accepted (outline approval)
- Context: The plan requires original timestamp text, source line ranges and per-message parse status.
- Options: adopt `whatsapp-chat-parser` 4.0.2 (MIT, zero deps) vs own scanner.
- Chosen: own scanner. The library returns only `{date, author, message, attachment}` (no raw timestamp
  or line numbers), has had no pushes since Sep 2024, and has open issues on captions, system messages
  and line detection. It may be used as a dev-only cross-check in tests.

## D003 — OA0 recording provenance
- Date: 2026-10-17 (+05:30)
- Status: accepted (outline approval)
- Context: Playwright Codegen runs headed only and has no public recorder API (checked against
  Playwright 1.64.1 source), so an agent cannot genuinely "record" a human interaction.
- Chosen: the owner performs a short `npx playwright codegen` session against the synthetic mock order
  form; the raw recording is kept with a provenance note and then parameterised. Hand-written connector
  code is never labelled as recorded.

## D004 — Import safety policy and raw-evidence storage
- Date: 2026-10-17 (+05:30)
- Status: accepted (within approved S2 scope; revisit on owner request)
- Context: PLAN §5 requires safe ZIP handling, preserved raw evidence, idempotent imports and
  confirmation of ambiguous dates.
- Chosen:
  - **Whole archive refused** (nothing stored) for: path traversal/absolute/backslash names, symlinks,
    encrypted entries, entry/total/compression-ratio/entry-count/archive-size limits, lying sizes,
    no or several candidate chat texts. Limits default to PLAN §5 values (100 MiB archive, 500 MiB
    expanded, 10,000 entries) plus 64 MiB per entry and ratio 200; all configurable, not yet benchmarked.
  - **Entry skipped and reported** (archive still imported): nested archives and unsupported file types.
  - Media content is compared with the extension's signature; mismatches are flagged, never executed.
  - Archive entry names are labels only. Files are stored content-addressed by SHA-256.
  - The chat text bytes are stored unchanged (raw evidence). The ZIP itself is not kept; its SHA-256 is.
  - Identical source files (same SHA-256) are a no-op. Overlapping exports are handled in S6.
  - Ambiguous day/month order blocks the import until declared; nothing is stored meanwhile.
  - Database writes are one transaction. Blobs written by a failed import are deleted unless referenced.
  - Media links use the exact exported file name only when exactly one message names that file.
- Consequences: imports never guess dates or links; users may need to re-run with `--date-order`.

## D005 — Catalogue contract, `orders` package and deterministic drafting rules
- Date: 2026-10-17 (+05:30)
- Status: accepted (within approved S3 scope; catalogue columns open to owner revision)
- Context: PLAN §4/§16 and C04 require a versioned owner catalogue, typed field provenance, exact
  totals and no invented prices; the order-execution module must stay separate from drafting.
- Chosen:
  - Package `@chatterpilot/orders` holds catalogue validation, line extraction, matching and
    draft building (all read-only). Approval/connector execution will live in a separate
    `order-automation` package (OA0), so drafting never performs actions. Deviation from the PLAN §6
    layout, which put catalogue validation in `order-automation`.
  - Catalogue = folder with `products.csv` (product_id, name, aliases `|`-separated, unit,
    alt_units like `box:16`, price, currency, price_effective_from, price_confirmed_on,
    tax_rate_percent), `customers.csv` (customer_id, name, aliases) and optional `catalogue.json`
    (maintainer, stalePriceDays, default 30). Version = first 16 hex chars of a SHA-256 over all files.
  - Errors (bad IDs/units/prices/currency/dates/tax, duplicate IDs, malformed CSV) make the catalogue
    unusable; missing price/tax, unconfirmed prices and shared aliases are warnings.
  - Extraction is conservative regex over quantity + unit + product phrases. Product matching needs
    every word of a name/alias; the most specific wins; ties are `ambiguous`; one-edit typos on
    5+ letter words are `fuzzy` and always need review. Units are only defaulted for products sold
    per piece.
  - Arithmetic is integer minor units with half-up rounding (`order-draft/1`); line tax
    `round(amount × rate)`; totals are unknown if any input is unknown or currencies differ.
  - Prices are `needs_review` when unconfirmed, older than `stalePriceDays` at the order date, or not
    yet effective.
- Known limitations: English/ASCII digits only (Devanagari digits and Hindi unit words abstain);
  delivery dates are not extracted; corrections in later messages appear as separate suggestions
  until review linking (S4).

## D006 — Review model, accepted snapshots and local API security
- Date: 2026-10-17 (+05:30)
- Status: accepted (within approved S4 scope)
- Context: PLAN §4 (ReviewDecision), §6 (loopback, CSRF, Host checks, no guessable media paths),
  §7 (human review before consequential use) and §16 (approvals bind exact versions).
- Chosen:
  - A draft = f(source messages, catalogue version, decision log). Decisions (set customer, set line
    product/quantity/unit/price/tax, exclude line, link message, accept, reject, reopen) are stored in
    an append-only table guarded by SQLite triggers. Each carries reviewer, time and reason (reason
    required except for accept); overrides become `human` provenance with the previous value.
  - Every decision is dry-run before it is recorded; invalid ones (unknown product/unit, zero
    quantity, line out of range) are refused and leave no trace.
  - Accept requires zero open issues and freezes the exact computed draft plus its SHA-256 in the
    decision record. Exports read only accepted snapshots, so later catalogue changes cannot alter
    an accepted order. Reopening is an explicit, reasoned decision.
  - Catalogue files are stored as blobs per version so any draft can be re-derived exactly.
  - Reviewer identity is self-declared (single-user local tool); not authentication.
  - API binds to 127.0.0.1 only; Host must be loopback (DNS-rebinding defence); non-GET requests
    need the `x-chatterpilot: 1` header and a same-origin Origin/Sec-Fetch-Site when sent; no CORS;
    CSP `default-src 'self'` with `frame-ancestors 'none'`. Uploads are written under a random
    directory with a sanitised name and deleted after import. Attachments are served by random id,
    with a real media type only when the content signature matched; otherwise as a download.
  - CSV export quotes every text cell and neutralises formula leaders (= + - @ tab CR LF and their
    full-width forms) with a leading apostrophe.
- Known limitations: catalogue upload is CLI-only (`catalogue load`); single reviewer per workspace.

## D007 — Review UI, demo and browser tests
- Date: 2026-10-17 (+05:30)
- Status: accepted (within approved S4 scope)
- Chosen: Vite 8.3.2 + React 19.3.0 single-page app in `apps/local/web`, built to
  `apps/local/dist/web` (gitignored) and served by the loopback API. Hash routing, plain CSS with
  system fonts and light/dark themes, no third-party assets, no `dangerouslySetInnerHTML`.
  Reviewer name is kept in `localStorage` (convenience only). `pnpm demo` seeds `workspaces/demo`
  from synthetic fixtures and serves it. `@playwright/test` 1.63.0 is a root dev dependency (a single
  copy, so the runner and tests agree); `pnpm test:e2e` drives the demo in Chromium and asserts no
  request leaves 127.0.0.1. README screenshots (`docs/images`) are produced by the same test with
  `CHATTERPILOT_SCREENSHOTS=1` and contain synthetic data only. CI gains an e2e job.
- All new dependency versions were released at least two weeks before 2026-10-17.

## D008 — Dashboard metrics
- Date: 2026-10-17 (+05:30)
- Status: accepted (within approved S5 scope, PLAN §7)
- Chosen: metrics are a pure function (`computeDashboard` in `@chatterpilot/orders`) over imports,
  per-day text-message counts, suggestions and drafts. Money metrics default to accepted (reviewed)
  orders; "include open drafts" is an explicit toggle. Every metric carries a definition, unit,
  window and exclusion counts. Coverage = union of each export's first..last local date; gaps are
  listed and uncovered days are "no data", never zero. Currencies are never added or converted.
  Week-on-week change is shown only when all 14 days are covered, each week has at least
  3 orders in scope and one currency; otherwise "insufficient comparable data" with the reason.
  Charts are dependency-free HTML bars (single series, so no legend), with hover/focus tooltips and
  a table view; bar colours `#0d9488` (light) / `#1aa596` (dark) pass the dataviz palette checks.
- Not included: forecasting, anomaly detection, staff/productivity measures (PLAN §7 forbids
  equating message counts with productivity).

## D009 — Reconciling overlapping exports (C05)
- Date: 2026-10-17 (+05:30)
- Status: accepted (within approved S6 scope, PLAN §5)
- Chosen:
  - Each import belongs to a chat identity (`chat_key`): from the file name ("WhatsApp Chat with X
    (1).txt" -> "x") or an explicit `--chat` / upload field. Overlap is only checked within one chat.
  - Message fingerprint = SHA-256 of [author, local time (or raw timestamp), kind, body]; not unique.
  - New messages are aligned with the chat's stored canonical messages inside the shared time window
    by longest common subsequence (`reconcileSequences` in core): matched → `duplicate` (points at
    the stored message, counted once); outside the window → `new`; unmatched inside → `uncertain`,
    kept and flagged (edited/deleted). Stored messages stay canonical, so drafts never lose sources.
    Genuine repeats survive because LCS matches pairwise in order. Window edges: unmatched messages
    after the stored side's last message (same minute) are new.
  - Suggestions, activity metrics and drafting use canonical messages only.
  - Safety net: if at least half (and at least 5) of a new import's messages already exist in a
    different chat, the import warns that the file may be a renamed copy and names the chat to use.
  - Byte-identical files remain a workspace-wide no-op (PLAN §5 exact file hash).
  - Old workspaces are upgraded in place (migration 3 + fingerprint/chat-key backfill on open).
- Limits: exact LCS is used up to 25M comparisons per overlap window, then prefix/suffix only
  (the unmatched middle is kept as uncertain, never dropped). Not yet benchmarked at 50,000 messages.
- Not done: a UI to resolve "uncertain" messages (merge or mark as replacement); they are visible
  with a badge and in the import summary.

## D010 — Fleet/travel template as a reuse smoke test
- Date: 2026-10-17 (+05:30)
- Status: accepted (within approved S7 scope; deliberately narrow)
- Context: PLAN §2B keeps fleet/travel as a second, lightweight template proving the core is reusable,
  not a second full product.
- Chosen: `@chatterpilot/templates` `fleet/1`: deterministic rules over canonical messages (shared
  scanner, storage, overlap reconciliation, `Field`/`Provenance`, exact money parsing) produce
  events: booking request/confirmation/change/cancellation, fault report, repair quote, repair done,
  payment report. Vehicles come from an owner `vehicles.csv` (versioned by hash; registrations match
  with or without dash/space). Lifecycle links: later booking events `update_of`/`cancels` the first
  event for the same reference, so a booking is counted once; a quote in the same message as a fault
  is `quote_for` it (supported); a later quote for the same vehicle is linked as needs-review; a
  payment is linked to a quote only with the same vehicle and amount (supported) or, when it names no
  vehicle but says "that repair", the same amount by the same person within 48 h (needs review).
  Quoted and reported-paid amounts are summed separately and never presented as verified expenses.
  Links that depend on time are not drawn when message times are unknown.
- Not included: UI for fleet events (CLI `events` only), fleet dashboard, route/trip metrics.

## D011 — OA0 order execution: approvals, ledger and synthetic connector
- Date: 2026-10-17 (+05:30)
- Status: accepted for the synthetic proof; **recording requirement still open** (see D003)
- Context: PLAN §16 OA0 and ORDER_AUTOMATION.md: synthetic form, recorded and parameterised
  connector, read-back, approval binding, stale-price invalidation, rejected unauthorised actions,
  hard stop before Submit, recovery tests.
- Chosen:
  - `@chatterpilot/order-automation`: `ExecutionPayload` only from accepted snapshots (decimal
    strings; unknown values refuse); approvals bind operator, target (connector, origin, account),
    action, document type, counterparty, payload SHA-256 (canonical JSON), catalogue version and an
    expiry of at most 60 minutes; `checkApproval` returns every failed reason.
  - Storage migration 4: `connector_approval`, `execution_attempt` with the PLAN §16 states and a
    partial unique index (one live attempt per connector/account/document/business reference),
    append-only `execution_event` (triggers). Transitions are compare-and-set in a transaction and
    must be in the `TRANSITIONS` table.
  - Runner `prepareApprovedDraft` stops at `awaiting_submit_approval`. Pre-save mismatch → blocked
    (nothing saved); layout/missing option → failed_before_side_effect (key freed); possible side
    effect without confirmation → submitted_unknown → reconcile by reference (exactly one match
    continues, otherwise a person must check; the key stays locked). `submitApproved` always refuses.
  - `fixtures/mock-order-app` "MockBooks": synthetic local proforma form (labelled as a test
    fixture), with `--drift`, `--layout-v2`, `--lost-response`, `--reset-after-save` faults.
  - `MockBooksConnector` (Playwright): origin route guard, role/label locators with exact names,
    variable line counts, pre-save comparison of the target's computed values, post-save read-back,
    never clicks Submit. **Provenance: hand-written** — the genuine Codegen recording must be made by
    the owner (`fixtures/mock-order-app/recording/README.md`); only after reconciliation with that
    recording may it be labelled "recorded".
- Found during testing: dropping the connection after a save made Chromium retry the POST, creating
  two drafts in the target; reconciliation correctly refused to pick one. Kept as a regression test.
- Not included: real targets, submit/send, Telegram intake (OA1), UI for approvals.

## D012 — OA1 Telegram intake, offline only
- Date: 2026-10-17 (+05:30)
- Status: accepted for offline processing; **live bot not authorised** (needs owner decision, token,
  operator/chat ids and data-transfer consent)
- Chosen: `@chatterpilot/telegram-intake` processes Bot API-shaped updates (from a JSON-lines file;
  no bot, no network). Rules: human sender required; numeric chat and sender allowlists; refused
  updates keep only the reason (`intake_log`), never content; transport dedupe by `update_id` with a
  durable offset (migration 5) so replays after a restart are ignored; business-level identity =
  SHA-256 of forward origin, original date and text, so a re-forward is `possible_repeat` (flagged,
  not merged); edits become new versions linked to the original; voice/files are `media_only`
  (download needs getFile, standard limit 20 MB, not built); approval buttons are only valid from
  allowlisted approvers with `approve:<draftId>:<12 hex of the accepted snapshot>`, and even then
  only record intent (no action); a warning appears after more than 24 h without updates (Telegram's
  retention limit). Forwarded text, including injected instructions, is stored as data.
- Planned for a live pilot: grammY long polling (MIT, checked 2026-10-17), secure token storage,
  privacy-mode documentation.

## D013 — P4 provider boundary, offline (no provider chosen)
- Date: 2026-10-17 (+05:30)
- Status: accepted as the contract; **no real provider adapter** until the owner chooses one and its
  current terms, retention, model ids and pricing are checked (PLAN §13 item 4).
- Chosen: `@chatterpilot/providers`. Providers may only propose order lines as character spans of
  the message they were given; `validateExtraction` quarantines unknown ids, duplicates, non-list
  output, spans outside the text and non-numeric quantities, so injected instructions cannot add
  content. Products, prices and totals stay with deterministic catalogue code. `runExtractionBatch`
  requires a `BatchConsent` bound to provider, exact model, recipient, a hash of the exact items and
  a maximum estimated cost; keys come from an in-memory `KeyVault` (redacted in JSON/inspect,
  `forget`); spend is reserved before the call; timeouts and in-flight cancellation count as
  uncertain charges and are never marked safe to retry unless the provider documents idempotency;
  no automatic fallback. `FixtureProvider` gives deterministic offline answers for tests.
- Not done: audio transcription, transcript import (next), UI for consent, real adapter.

## D014 — Review-driven changes
- Date: 2026-10-17 (+05:30)
- Status: accepted
- Overlap reconciliation now compares same-timestamp runs as multisets and labels an unmatched
  message "uncertain" only when an unmatched stored message shares its gap (supersedes the edge
  rule in D009). One message can belong to only one live (non-rejected) draft, and repeats from
  earlier exports cannot be drafted. Approvals are void once the draft leaves the approved accepted
  version (extends D011). A person can close a stuck attempt (blocked, cancelled, unknown) with a
  reason, which moves it to `rejected` and frees the document key. Read-back requires target status
  "draft". `chatterpilot fill-form` exposes OA0 for the synthetic MockBooks form only (loopback
  targets), with an explicit `--approve` per run.

## D015 — Person-supplied transcripts (P4b, no key)
- Date: 2026-10-17 (+05:30)
- Status: accepted
- Chosen: migration 6 `transcript` (append-only versions per voice-note message, origin
  manual/provider, creator, language, note; UPDATE refused by trigger). `chatterpilot transcript add`
  finds the voice note by its exact exported file name (must be unique among canonical messages).
  Transcribed voice notes join suggestions and drafts using the latest version; evidence uses a new
  `transcript` provenance kind (message id, transcript id, origin, span), shown as "Voice note line N"
  in the UI and "(voice note, manual transcript)" in the CSV. Works even when the audio file is not in
  the export (TXT-only). Automatic transcription stays behind the P4 provider boundary (D013).

## D016 — Agent-harness interfaces: operations layer, JSON CLI, MCP server
- Date: 2026-10-17 (+05:30)
- Status: accepted (owner direction 2026-10-17: the repo is a skeleton that businesses extend with
  their own agentic harness)
- Context: research sweep `wf_73607549-f9f` (MCP spec, harness configs, AGENTS.md, skills).
- Chosen:
  - `apps/local/src/ops.ts`: one operations layer returning JSON-serialisable data (`OpError` with
    exit code 1/2). The CLI and the MCP server both call it.
  - Every CLI command accepts `--json`; new `status`, `drafts list|show`, `export`, `dashboard`.
  - `chatterpilot mcp`: stdio MCP server using `@modelcontextprotocol/server` 2.3.0 (MIT-era
    release line, protocol 2025-11-25 handshake so current clients work) and zod 4.6.5 (pinned ≥2
    weeks old). Tools: workspace_status, parse_export, import_export, check_catalogue,
    load_catalogue, list_suggestions, create_draft, revise_draft, list_drafts, get_draft,
    export_orders, dashboard, fleet_events. Annotations mark read-only vs local-write.
  - Safety: workspace fixed at start; file arguments must resolve (after symlinks) inside `--files`;
    chat text is labelled untrusted data in descriptions; agent changes are recorded as
    `agent:<name>` with a required reason; accept/reject/reopen and form filling are not exposed,
    because harness approval prompts can be skipped (e.g. headless runs) and annotations are hints.
- Not done: MCP resources/prompts; an npm package (`npx chatterpilot`) is not published.

## D017 — Lexicon: Hinglish units and numbers, Indic digits, business word lists
- Date: 2026-10-17 (+05:30)
- Status: accepted
- Context: research note `docs/research/indian-order-language.md` (no primary corpus of order
  phrasing exists; defaults are general knowledge and must be validated with real exports).
- Chosen: `packages/orders/src/lexicon.ts` holds data, not code: unit spellings (English, romanised
  Hindi, some Devanagari), multipliers (dozen 12, gross 144), number words with modifiers
  (sawa/paune/sadhe) and scales (hazaar/lakh), and non-order phrases. Businesses extend it with
  `lexicon.json` in the catalogue folder (validated; part of the catalogue version; stored per
  version, migration 7). Decimal digits of other scripts are normalised one-to-one so evidence
  spans stay exact. Number words count only when a unit follows, and always raise
  `quantity_in_words` for a person to confirm. Single-letter units (m, l, g) count only when glued to
  a digit. Matching keys keep letters, marks and digits of any script, so names like `सीमेंट` work.
  Quantity-first extraction now takes the earliest candidate whose product phrase contains no other
  quantity (fixes "site 2 … 20 bori cement").
- Not done: regional languages beyond the listed words (need native-speaker validation); delivery
  dates ("kal" is ambiguous) are not extracted.

## D018 — Import files for Tally, ERPNext, Zoho Books and UBL (experimental, file-only)
- Date: 2026-10-17 (+05:30)
- Status: accepted
- Context: research on vendor import formats (summarised in `docs/exporters.md`). Tally's Sales
  Order tags and Zoho's column names are not in public docs; Tally can silently drop lines when
  masters do not match, and re-imports create duplicates.
- Chosen: `packages/exporters` renders accepted snapshots only, into files a person imports. No
  connection to any billing tool. Every target is labelled `experimental` and returns warnings.
  Names come from `export-map.json` (workspace folder or `--map`); Tally refuses to export until
  every customer and product is mapped and refuses unit symbols with spaces or `/`. Each order
  carries `CP-<first 10 hex of snapshot SHA-256>` as voucher/reference so duplicates are visible.
  UBL writes one file per order with UN/ECE unit codes. Quantities are in the product's base unit
  (the unit the price is per). Exposed through CLI `export --format`, the Export tab and MCP
  `export_orders` (read-only).
- Not done: import verification against real Tally/ERPNext/Zoho accounts (owner or customer to run);
  UBL XSD validation in CI (well-formedness only, via xmllint when present); Busy/Vyapar/Marg
  (no documented sales-order import; left to "adapt with your agent").

## D019 — Position as a starting kit for coding agents; ship harness configs
- Date: 2026-10-17 (+05:30)
- Status: accepted (owner direction, 2026-10-17: "a skeleton … customers extend with their agentic harness")
- Chosen: README and `docs/harnesses.md` present ChatterPilot as tested reference code to use via
  MCP/`--json` and to extend with an agent. The repository ships `.mcp.json` (Claude Code project
  scope, approval required on first use) pointing at the synthetic fixtures. Configs for Codex,
  Cursor and VS Code are documented from each vendor's docs (not executed here). A test keeps
  `.mcp.json` and the documented flags in line with the CLI. The MCP command now exits 0 when the
  client closes stdin.
- Not done: npm package (`npx chatterpilot`), so configs run from a clone.

## D020 — Evaluate drafting against an independently written labelled set
- Date: 2026-10-17 (+05:30)
- Status: accepted
- Chosen: `packages/orders/src/evaluate.ts` scores the real `buildOrderDraft` against labelled
  messages: exact product + base quantity per line, abstention on AMBIGUOUS/UNKNOWN, spurious lines,
  order/non-order detection, customers. The headline safety metric is *silent errors* (wrong lines
  without a review flag). The development set (115 messages) was written by three agents and
  label-checked by a fourth, none of which saw the code. CLI `eval`; a test ratchets the floors.
- Plan: improve rules on this set, then author a separate held-out set the same way and report it
  without tuning on it.
- Not claimed: accuracy on real chats.

## D021 — Flag, don't guess: corrections, partial matches, non-orders
- Date: 2026-10-17 (+05:30)
- Status: accepted
- Chosen: (1) a correction word after the first line ("make it", "actually", "sorry", "nahi nahi",
  "cancel", …) raises `correction_in_message` on every line of that message; when the message has
  one line and a number follows, that number becomes the quantity (cited, needs review). (2) A
  resolved product whose phrase has extra words not in its name/aliases is `product_partial`
  (needs review). (3) Message-level patterns for stock questions, delivery reports, complaints and
  past-order cancellations stop a suggestion; generic "kya …?" is deliberately not one, because
  Hindi polite orders are phrased as questions.
- Trade-off: (3) can hide a new order written in the same message as a report; documented and
  tested as a known limit. A person can always draft any message by hand.

## D022 — Erasing one person's data (proposed; needs the owner)
- Date: 2026-10-18 (+05:30)
- Status: **proposed**, not implemented. Needs the owner's decision.
- Context: the DPDP Act gives people a right to erasure and requires erasing data once its purpose is
  served (s. 8(7)); Rule 8(3) also asks for at least one year of retention of processing records
  (`docs/privacy.md`). ChatterPilot keeps personal data in: raw export blobs (byte-for-byte, by
  design), `message` rows, attachments, transcripts (append-only trigger), `draft_decision` (append-only
  trigger, may contain names in reasons/values), accepted snapshots inside decisions (frozen JSON with
  evidence text), execution events (append-only) and exported files outside the workspace.
- Options:
  1. **Delete the workspace** (works today): all or nothing.
  2. **Redaction with tombstones** (recommended): a `chatterpilot forget --author "<name>" | --message
     <id>` command that, in one transaction, overwrites the person's message bodies, author names,
     transcripts and attachment blobs with a fixed marker and a hash of the original; deletes the raw
     export blobs that contained them (the import record keeps its hash and counts); and appends a
     `redaction` record (who, when, why, which ids). The append-only triggers would gain one narrow,
     audited exception (UPDATE allowed only to the redaction marker, never to other values).
     Accepted snapshots that cite the person would keep their structure and totals but replace
     evidence text with the marker, so totals stay reproducible while the words are gone.
  3. **Crypto-shredding**: encrypt each sender's text with a per-person key and destroy the key on
     request. Clean in theory; adds key management to a tool meant for small shops.
- Trade-offs of (2): re-checking an old draft against its chat text becomes impossible for redacted
  lines (by design); exported files already sent elsewhere are out of reach (the docs must say so);
  the append-only guarantee becomes "append-only except audited redaction".
- Owner to decide: adopt (2)?; the retention period default; whether redaction is offered in the review
  app or CLI only.

## D023 — Walkthrough media generated from the running demo, with CC0 music
- Date: 2026-10-18 (+05:30)
- Status: accepted (owner asked for animated walkthroughs with background music in the README)
- Chosen: `pnpm media` records the real review app with Playwright (one continuous recording,
  visible cursor, chapter label), replaying the browser test's flow, plus HTML/CSS intro and outro
  cards and a typed replay of the recorded MCP session (`docs/agent-session.md`). Captions live in
  `apps/local/src/media/storyboard.json` (Opus draft, two Sonnet fact-checks, unit-tested rules) and
  are drawn by ffmpeg from recorded timings, not in the page, so the same recording can be cropped.
  ffmpeg renders `docs/media/tour.mp4` with a music bed, GIFs for the README, square and vertical
  clips that follow the cursor, and chapter/caption data for `docs/media/tour.html`.
- Music: two CC0 tracks by cynicmusic from OpenGameArt, licence checked on the source pages and
  recorded in `docs/media/music/LICENSE.md` with the original hashes. A synthesised pad is the
  fallback if the files are missing. No paid or generative service was used.
- Why not AI-generated video: the walkthrough must show behaviour that exists and is tested; a
  recording of the real app does that and regenerates after every UI change.
- Limits: GitHub shows GIFs inline but plays MP4 inline only when uploaded through its editor
  (owner step after the repository is public); `tour.html` needs GitHub Pages or `pnpm media:tour`.
  Media is not diffed in CI (frame timing varies by a few hundred milliseconds between runs).

## D024 — Agent-first documentation and generated interfaces
- Date: 2026-10-18 (+05:30)
- Status: accepted (owner asked to make the repository useful for other AI agents)
- Chosen: `llms.txt` at the root (llmstxt.org format); `docs/agents/` with an orientation page,
  task recipes (shop words, exporter, message template, MCP tool, evaluation cases, drafting rule)
  and seeded starter tasks; `docs/problems.md` mapping business problems to code and tests. Written
  by an Opus agent from an inventory by Haiku scouts, then checked by two Sonnet agents for
  paths, test names and safety rules before integration.
- Generated, tested references: `docs/agents/tools.json` is the MCP server's own `tools/list`
  answer; `docs/agents/errors.md` lists every error code the `--json` CLI and MCP tools can return
  with its exit code. `node apps/local/src/agent-reference.ts` regenerates both and a test fails if
  they drift or if any tool name suggests accepting, approving, rejecting, filling or submitting.
- `pnpm check:quick` (lint, types, tests affected by uncommitted changes) gives agents a fast loop;
  `pnpm check` stays the gate before a commit. The docs link test now covers `llms.txt` and the
  agent, launch, media and solutions folders. Lessons from building these checks are in
  `docs/solutions/developer-experience/generated-agent-references-drift-tested-as-data.md`.
