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
