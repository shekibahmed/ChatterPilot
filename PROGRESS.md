# Progress log

Append-only evidence per slice, recovery or interruption. `HANDOFF.md` holds current state.
Synthetic/sanitised details only. A partial slice stays partial even if committed for preservation.

## 2026-10-17 — S0 baseline (WP0)
- Tool / active writer: Claude Code
- Approved scope: outline approval 2026-10-17 (S0–S7 + OA0 sequence; D000–D003)
- Starting branch / HEAD: `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`; created `build/v0.1`
- Outcome: completed
- Changes: moved private planning packet out of the checkout; `.gitignore`; `AGENTS.md`/`CLAUDE.md`;
  checkpoint files; README stub; pnpm workspace, `tsconfig*.json`, Biome, Vitest; CI workflow with
  SHA-pinned actions; `packages/core` with exact amount parsing (`parseAmountToMinor`, `formatMinor`).
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S0 working tree before commit):
  - `rm -rf node_modules packages/core/node_modules && pnpm install --frozen-lockfile` — exit 0
  - `pnpm check` (biome check . && tsc -p tsconfig.json && vitest run) — exit 0; 1 file, 27 tests passed
  - Lint rule activation probe (temporary `x == 2` file) — reported `lint/suspicious/noDoubleEquals`; probe deleted
- Note: `biome migrate` rewrote `recommended: true` to `preset: "none"` (all rules off); corrected to
  `preset: "recommended"` and verified with the probe above.
- GitHub CI: run 39040324981 on `75855287ec47e0946d1ab95679f4398f4357476c` — success (checked during S1).
- Next: S1 line scanner in `packages/import-whatsapp`.

## 2026-10-17 — S1 WhatsApp line scanner (WP1 / P1)
- Tool / active writer: Claude Code
- Approved scope: outline approval 2026-10-17, slice S1; D002
- Starting branch / HEAD: `build/v0.1` @ `75855287ec47e0946d1ab95679f4398f4357476c`
- Outcome: completed
- Changes:
  - `packages/import-whatsapp`: `scanExport` (Android/iOS headers, `-`/`/`/`.` separators, 12/24 h,
    a.m./p. m., U+202F/LRM, multiline, CRLF/BOM, system/media/deleted/edited classification, raw
    timestamp text, 1-based line ranges, per-message status). Day/month order is decided across the
    whole export; ambiguity → `needs_date_order`, never guessed. Corrupt dates are isolated as
    `invalid_timestamp`. `decodeExportBytes` decodes strictly (no silent U+FFFD).
  - `apps/local`: `pnpm chatterpilot parse <file> [--date-order] [--json]` with terminal-safe output.
  - `fixtures/synthetic/chats/`: two hand-authored exports (Android DMY, iOS MDY) + README.
  - Dev-only `whatsapp-chat-parser@4.0.2` (MIT) used as an independent test oracle.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S1 working tree before commit):
  - `pnpm check` — exit 0; 5 test files, 84 tests passed
  - `pnpm -s chatterpilot parse fixtures/synthetic/chats/android-dmy-hardware-orders.txt` — exit 0;
    15 messages, all timestamps ok
  - Cross-check: both fixtures agree with whatsapp-chat-parser on message count, authors, bodies and
    wall-clock times (the library keeps the file's trailing newline on the last body; normalised in the test)
- Known limitations (documented, not yet handled):
  - System-line detection is English-only.
  - A continuation line typed in exactly the header format would start a new message.
  - Day/month order cannot be declared per chat inside a mixed file.
- Next: S2 storage + import (SQLite migrations, file-hash idempotency, safe ZIP).

## 2026-10-17 — S2 storage and safe import (WP1 / P1)
- Tool / active writer: Claude Code
- Approved scope: outline approval 2026-10-17, slice S2; D004 recorded
- Starting branch / HEAD: `build/v0.1` @ `2f56f44bcd98b0f7165ba774aef3498cda678b35` (GitHub CI: success)
- Outcome: completed
- Changes:
  - `packages/storage`: `Workspace` (better-sqlite3 13.0.3, WAL, foreign keys, `user_version`
    migrations, STRICT tables for import_batch/message/attachment/skipped_entry/workspace_meta),
    content-addressed `BlobStore`, atomic `recordImport`, exact-file-name media linking, `importSummary`.
  - `packages/import-whatsapp`: `openWhatsAppArchive` (yauzl 3.4.0; validates all entries before
    extraction; symlink/encryption/size/ratio/count/path checks; streaming byte caps; content
    signature check). Test-only ZIP writer exported as `@chatterpilot/import-whatsapp/testing`.
  - `apps/local`: `importExport` pipeline (SHA-256 dedupe, date-order gate, failed-import blob
    cleanup) and CLI `init` / `import`.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S2 working tree before commit):
  - `rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install --frozen-lockfile` — exit 0
  - `pnpm check` — exit 0; 7 test files, 105 tests passed (incl. 13 hostile-archive cases and
    import tests for byte-identical raw text, duplicate no-op, ambiguous-date refusal, cleanup)
  - Manual CLI run in a scratch workspace: `init`, `import` of both fixtures, duplicate re-import
    ("nothing changed"), ambiguous file refused with exit 1
- Bugs found and fixed during the slice: better-sqlite3 rejects numbered `?1` placeholders when
  values are passed positionally (switched to named `@params`); the cleanup path could hide the
  original error (now guarded).
- Not done (by design, later slices): overlap/backfill reconciliation (S6), deletion/export of
  workspaces, timezone-aware UTC conversion (local wall-clock + workspace zone stored for now).
- Next: S3 catalogue CSV + order draft with typed field provenance.

## 2026-10-17 — S3 catalogue CSV and order drafts (WP3/WP4 contracts, C04)
- Tool / active writer: Claude Code
- Approved scope: outline approval 2026-10-17, slice S3; D005 recorded
- Starting branch / HEAD: `build/v0.1` @ `0853e3f1226851e4dcaab9f0eb84102338aaf159`
- Outcome: completed
- Changes:
  - `packages/core`: strict RFC 4180 `parseCsv`, `divideRoundHalfUp`/`toSafeMinor`, typed
    `Provenance`/`Field` (message, catalogue, computed, human).
  - `packages/orders`: `loadCatalogue` (validation, versioning, stale-price policy), unit synonyms,
    `extractOrderLines`, `matchRecord` (resolved/fuzzy/ambiguous/unresolved), `buildOrderDraft`
    with per-field provenance and blocking issues.
  - `apps/local`: `suggestOrderMessages`, CLI `catalogue check` and `draft`.
  - `fixtures/synthetic/catalogue/`: synthetic products/customers/catalogue.json.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S3 working tree before commit):
  - `pnpm check` — exit 0; 204 tests passed, incl. 54 adversarial order lines, catalogue validation
    matrix, exact hand-computed totals for both chat fixtures (plumbing subtotal 2,790.00 equals the
    total quoted in the chat), provenance of every critical field
  - Manual: `catalogue check fixtures/synthetic/catalogue` exit 0 with 3 expected warnings;
    `draft` over a scratch workspace lists 4 suggestions with sources per value
- Bugs found and fixed during the slice (found by probing and tests): thousands separators split
  into fake lines; unit words read as products; size-led products ("2x2 tiles", "8mm rod") lost
  their unit; WhatsApp "<This message was edited>" leaked into product text; customer evidence
  used a guessed offset instead of a located span.
- GitHub CI for S2 push (`0853e3f1`): see HANDOFF.
- Next: S4 review UI + CSV/JSON export + `pnpm demo`.

## 2026-10-17 — S4a review persistence, local API and export (WP4/WP5, P2/P3)
- Tool / active writer: Claude Code (autonomous run authorised by the owner on 2026-10-17)
- Approved scope: outline approval 2026-10-17, slice S4 (split into S4a API and S4b UI); D006
- Starting branch / HEAD: `build/v0.1` @ `f823a17a624fa06ddaa410be4f6cb4889384a5bb`
- Outcome: completed (S4a); UI is S4b
- Changes:
  - `packages/orders`: reviewer overrides (`DraftOverrides`, `OverrideError`), excluded lines,
    human provenance with previous values; draft logic refactored into `buildLine`.
  - `packages/core`: `toCsv`/`neutraliseCell` (OWASP CSV injection set incl. LF and full-width).
  - `packages/storage`: migration 2 (catalogue_version, order_draft, append-only draft_decision with
    triggers), `ReviewStore`, `importSummaries`; blob-reference check covers catalogue files.
  - `apps/local`: review service (create/decide/accept/reject/reopen, suggestions, CSV/JSON export
    from accepted snapshots), Hono API with loopback/CSRF/CSP protections, CLI `catalogue load`,
    `serve`, `demo`.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S4a working tree before commit):
  - `pnpm check` — exit 0; 236 tests passed (new: override semantics, CSV neutralisation matrix,
    Host/CSRF/Origin/Sec-Fetch-Site refusals, upload with date-order prompt, full draft→link
    correction→exclude→accept→export flow, accept blocked by issues, reject needs reason,
    formula injection from chat author/reviewer neutralised in export, SQLite refuses UPDATE/DELETE
    of review history, catalogue blobs byte-identical)
  - Manual: `serve` on 127.0.0.1:4399 — `/api/status` 200 (old scratch workspace auto-migrated to
    schema v2); spoofed `Host: evil.example` → 403; web UI not yet built → 503 message as designed
- Next: S4b React review UI, `pnpm demo`, Playwright e2e, README screenshot.

## 2026-10-17 — S4b review web app, demo and end-to-end test (WP4/WP7 showcase)
- Tool / active writer: Claude Code (autonomous run)
- Approved scope: slice S4 (part b); D007
- Starting branch / HEAD: `build/v0.1` @ `f3ada6559c93ede3a9ee0ae9e89c235af446b3e9`
- Outcome: completed
- Changes: `apps/local/web` (Overview, Imports with upload + date-order prompt + source viewer,
  Orders with suggestions and drafts, Draft review with provenance chips that highlight the exact
  chat words, inline edits with reasons, exclude/include, link correction, accept/reject/reopen,
  history, Export); `pnpm build:web`, `pnpm demo`, `pnpm test:e2e`; e2e specs; CI e2e job; README
  rewritten with real screenshots and honest support matrix; `docs/why.md`, `docs/catalogue.md`.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, Chromium rev 1243, code state = S4b working tree):
  - `pnpm check` — exit 0; 236 tests passed
  - `pnpm test:e2e` — exit 0; 2 passed: full demo review (draft 28,355.20 → link correction →
    exclude superseded line → 30,979.20 → accept → CSV contains 45.000 and not 40.000) with zero
    requests outside 127.0.0.1; ambiguous upload asks for the date order
  - Bundle scan: only inert URL strings (React error docs, XML namespaces); nothing fetched
- Issues found and fixed: two Playwright copies (global 1.64 runner vs project 1.63); test expected
  the quantity chip but clicked the product chip; monospace leak and chip wrapping in the UI.
- Next: S5 deterministic dashboard with coverage and drill-down.

## 2026-10-17 — S5 deterministic dashboard (WP5 / P3)
- Tool / active writer: Claude Code (autonomous run)
- Approved scope: slice S5; D008
- Starting branch / HEAD: `build/v0.1` @ `ec3ed9d68969fd4860974677fe39327a8a1bdcee`
  (GitHub CI for it: `check` success, `e2e` success)
- Outcome: completed
- Changes: `packages/orders/src/metrics.ts` (+11 tests with hand-computed expectations, incl.
  scope switching, exclusions, base-unit conversion, gaps, insufficient vs valid week comparison
  33.3%); `/api/dashboard?scope=`; Dashboard tab (coverage banner, pipeline tiles, order-value and
  activity bar charts with tooltip/table view, comparison, product/customer/issue tables);
  e2e dashboard assertions; README dashboard row + screenshot.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S5 working tree):
  - `pnpm check` — exit 0; 248 tests passed
  - `pnpm test:e2e` — exit 0; 2 passed (dashboard coverage text, refused trend, tooltip value)
- Issues found and fixed: a scripted edit failed to re-export the `Dashboard` type, and reading only
  the tail of the typecheck output hid the root error for several iterations (misattributed at first
  to a compiler bug); a scripted rename damaged UI text ("comparable d."), caught by the e2e test.
  Lesson recorded: read complete typecheck output; avoid blind text substitution in UI files.
- Next: S6 overlap/backfill reimport reconciliation.

## 2026-10-17 — S6 overlapping re-import reconciliation (WP2 / C05)
- Tool / active writer: Claude Code (autonomous run)
- Approved scope: slice S6; D009
- Starting branch / HEAD: `build/v0.1` @ `6f1831d83e41d45ee20909431bf0ec76516a147e`
- Outcome: completed
- Changes: `packages/core/src/align.ts` (`reconcileSequences`, 7 tests); storage migration 3
  (chat_key, fingerprint, overlap, duplicate_of), reconciliation inside the import transaction,
  renamed-file warning, backfill on open, overlap counts in summaries; canonical-only suggestions
  and activity; CLI `--chat`, upload chat field, overlap column and repeat/changed badges in the UI;
  `apps/local/src/overlap.test.ts` (9 scenarios).
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S6 working tree):
  - `pnpm check` — exit 0; 264 tests passed (superset re-export, mid-history partial, backfill,
    edited message kept as uncertain, cross-chat isolation + renamed-file warning, same name different
    period, `--chat` override, no double counting in suggestions/dashboard, v2→v3 upgrade)
  - `pnpm test:e2e` — exit 0; 2 passed
  - Manual CLI: re-importing a later export reports "1 new, 15 already imported, 0 changed"
- Found while testing: four of my first expectations were wrong (miscounted messages, byte-identical
  file deduplicated before chat logic, invented activity counts); the probe also exposed the
  renamed-file risk, now covered by the warning.
- Next: S7 fleet/travel template smoke test.

## 2026-10-17 — S7 fleet/travel template smoke test (PLAN §2B)
- Tool / active writer: Claude Code (autonomous run)
- Approved scope: slice S7; D010
- Starting branch / HEAD: `build/v0.1` @ `67ac066fa1b1b991db5ea55a8be819a62be5f36b`
- Outcome: completed
- Changes: `packages/templates` (fleet rules, linking, summary, vehicle registry; 17 tests);
  `fixtures/synthetic/chats/android-fleet-ops.txt` (ambiguous dates on purpose) and
  `fixtures/synthetic/fleet/vehicles.csv`; `apps/local/src/fleet.ts` + integration test; CLI
  `events`; `Provenance` catalogue table gains "vehicles"; README mention.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S7 working tree):
  - `pnpm check` — exit 0; 282 tests passed (PLAN §4 example: "BUS-07 reported a tyre issue. Repair
    quoted at 2,400" → fault + linked quote, no expense; "Paid 2,400 for that repair" → separate
    payment report with a needs-review link; bookings counted once through change/cancel; later
    export re-import adds only the new booking and leaves money totals unchanged)
  - Manual CLI: import refused until `--date-order dmy`; `events` lists all 13 events with links
- Found while testing: the dash in registrations was never made optional (escaper does not escape
  "-"); the fixture's dates are ambiguous, which correctly left times unknown until declared.
- Next: OA0 synthetic order form and connector (needs the owner's Codegen recording; see D003).

## 2026-10-17 — OA0 synthetic order execution proof (partial: recording pending)
- Tool / active writer: Claude Code (autonomous run)
- Approved scope: OA0 (outline approval); D011, D003
- Starting branch / HEAD: `build/v0.1` @ `d3e7ec3ffb2c53608bcd7cbf1db670fa9ec917c6`
- Outcome: **partial** — everything except the owner's genuine Codegen recording is built and
  tested; the connector is labelled hand-written until that recording exists.
- Changes: `packages/order-automation` (payload, approval, connector contract, runner, MockBooks
  connector); storage migration 4 + `ExecutionStore`; `fixtures/mock-order-app` (server, form,
  draft and drafts views, recording guide); `apps/local/src/execution.test.ts` (fake target);
  `apps/local/e2e/connector.spec.ts` (real browser against MockBooks); `docs/order-automation.md`;
  README row.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, Chromium rev 1243, code state = OA0 tree):
  - `pnpm check` — exit 0; 313 tests passed (approval binding matrix, state machine, runner with
    duplicate/stale-price/operator/layout/lost-response/not-found/tamper/submit-refusal cases,
    append-only execution history)
  - `pnpm test:e2e` — exit 0; 8 passed (2 demo + 6 connector: two orders with 2 and 1 lines read
    back exactly and 0 submissions; price drift blocked before saving; layout change stops with
    nothing saved; lost response reconciled to one draft; duplicate drafts after a dropped
    connection stop for a person; other origins blocked)
  - Stability: connector spec `--repeat-each 3` — 18/18 passed
- Issues found and fixed: exact `getByLabel` includes option text for wrapping labels (switched to
  role locators); `<output>` values read with `textContent`; tests used absolute counts on shared
  servers (now deltas); orphaned test servers from a timed-out background run were stopped.
- Owner action needed: follow `fixtures/mock-order-app/recording/README.md` (about 5 minutes).
- Next: WP7 agent skill package against the real CLI; then OA1 offline Telegram intake fixtures.

## 2026-10-17 — WP7 companion agent skill
- Tool / active writer: Claude Code (autonomous run)
- Starting branch / HEAD: `build/v0.1` @ `0b4ec5eaaa346b30898cd5f43ae61ea10e7af78b`
- Outcome: completed (skill text); packaging/installer work of WP7 not started
- Changes: `skills/whatsapp-operations/SKILL.md` (triggers, inputs, procedure using only the real
  CLI, outputs, permission boundaries, untrusted-content rule, "never" list);
  `apps/local/src/skill.test.ts` checks frontmatter, that every `pnpm chatterpilot …` command and
  flag in the skill appears in the CLI's own usage text, and that referenced pnpm scripts exist.
- Checks: `pnpm check` — exit 0; 316 tests passed. Mutation check: adding a fake
  `pnpm chatterpilot transcribe --all` line made the skill test fail as intended; file restored.
- Not run: installing the skill into a separate clean agent environment (PLAN WP7 test).
- Next: OA1 offline Telegram intake (synthetic updates, no bot, no network).

## 2026-10-17 — OA1 offline Telegram intake
- Tool / active writer: Claude Code (autonomous run)
- Starting branch / HEAD: `build/v0.1` @ `3d37d47d7e6cac871e97941616cbd670c8477238`
- Outcome: completed for offline scope (D012); live bot not started (needs owner authority)
- Changes: `packages/telegram-intake` (rules + 8 tests); storage migration 5 + `IntakeStore`;
  `fixtures/synthetic/telegram/{updates.jsonl,policy.json}` (11 synthetic updates incl. outsider,
  bot, re-forward, edit, voice, injection text, bad callbacks, replay); CLI `intake`.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0): `pnpm check` — exit 0; 324 tests passed.
  Manual CLI: all 11 updates classified as expected; accepted and edited forwards resolve to
  catalogue products; refused content not stored.
- Next: independent multi-agent review of the branch (owner asked to use workflows with Sonnet/Haiku
  agents), then P4 offline (transcript import, provider interface without any real provider).

## 2026-10-17 — P4a provider boundary (offline, no provider)
- Tool / active writer: Claude Code (autonomous run); review workflow running read-only in parallel
- Starting branch / HEAD: `build/v0.1` @ `3fe6faf8ed41e52db198a2b574f8d329a803f9b2`
- Outcome: completed for the contract (D013); no network, no keys, no provider calls
- Changes: `packages/providers` (contract, validation, consent/budget runner, key vault, fixture
  provider) + 15 tests.
- Checks: `pnpm exec vitest run packages/providers` — 15 passed; `tsc -p tsconfig.json` and
  `biome check packages/providers` clean. Full `pnpm check` deferred until the review finishes
  (to avoid reformatting files under review).

## 2026-10-17 — Multi-agent review and fixes (owner asked for Sonnet/Haiku workflows)
- Tool / active writer: Claude Code; review by Workflow run `wf_809cd0bf-461` (4 Sonnet finders by
  area → 4 Sonnet adversarial verifiers; 1 Haiku docs-claims checker); 9 agents, read-only.
- Starting branch / HEAD: `build/v0.1` @ `9f7a38eb55987b431da28c33e2b22e2480758cb4`
- Result: 15 findings confirmed by the verifiers (0 critical, 0 high, 4 medium, 11 low), 1 refuted;
  4 docs-claim issues. All addressed in this commit:
  - Import: same-minute messages interleaved across batches were mismatched (now compared as
    multisets per timestamp); messages in a hole between earlier exports were "uncertain" (now new
    unless an unmatched stored message shares the gap); duplicate ZIP entry names crashed with a raw
    SQLite error (now `duplicate_entry` refusal); right-to-left text starting with a direction mark was
    classed as system (now requires system-notice wording); typed "<attached: x>" text became media
    (now only at line start or after the exporter's mark).
  - Orders: catalogue citations used row index, not file line (parseCsv now returns `rowLines`); huge
    quantities threw and broke every view (now `amount_out_of_range` issue, value unknown); the same
    message could feed two drafts or appear twice (now refused; one live draft per message; repeats
    from earlier exports refused); name matches were cited as "aliases" (now the matched column);
    customer overrides were missing from CSV `human_edits` (now included).
  - Security: chat names were printed to the terminal unsanitised (now `terminalSafe`).
  - Execution: approvals survived reopening/rejecting the draft (runner and `storeApproval` now
    require the current accepted snapshot); blocked/unknown attempts locked the document forever
    (new `closeAttempt` with operator + reason); read-back did not check the target record is still a
    draft (now a `status` diff); malformed Telegram updates threw and stalled intake (now logged and
    skipped; CLI skips bad JSON lines).
  - Docs: README claimed payments/quotes are never suggested (now true via `looksLikeNonOrder`, and
    worded as English keyword rules); README/docs implied app-level form filling (new CLI
    `fill-form --approve`, MockBooks on loopback only, plus accurate wording); README listed Telegram
    intake as absent (now describes offline intake); SKILL legend for `?`/`!` corrected.
- Checks (Node 26.10.0, pnpm 12.14.0, Chromium rev 1243):
  - `pnpm check` — exit 0; 357 tests passed (new regression tests for each fix)
  - `pnpm test:e2e` — exit 0; 9 passed (adds the `fill-form` CLI flow: no `--approve` sends
    nothing; with it, one MockBooks draft and 0 submissions)

## 2026-10-17 — P4b person-supplied transcripts
- Tool / active writer: Claude Code (autonomous run)
- Starting branch / HEAD: `build/v0.1` @ `f18db7181bdef5c97255e5acc6ad683aee52d3d4`
- Outcome: completed (D015)
- Changes: `transcript` provenance kind (core), `SourceMessage.transcript` (orders), migration 6 +
  `TranscriptStore`, review service `addTranscript` and transcript-aware drafting/suggestions/CSV,
  CLI `transcript add`, UI transcript block with highlighting; e2e config shares one workspace path
  across Playwright workers (the config is re-evaluated per worker).
- Checks (Node 26.10.0, pnpm 12.14.0, Chromium rev 1243):
  - `pnpm check` — exit 0; 360 tests passed (draftable after transcript, provenance kind, CSV
    source, versioning, edit refusal, audio-only)
  - `pnpm test:e2e` — exit 0; 10 passed (new: CLI adds a transcript to the demo voice note, the UI
    drafts it at 4,908.80 and highlights "5 boxes white tiles" inside the transcript)

## 2026-10-17 — Release-readiness pass (no owner authority needed)
- Tool / active writer: Claude Code; audits by Workflow run `wf_62591c14-639` (Haiku: fixtures/docs/
  screenshots privacy and impersonation scan; Sonnet: full git-history secrets/private-reference scan
  and licence review), read-only.
- Starting branch / HEAD: `build/v0.1` @ `956ec4d1541de02fd217e84b84740285223ee5bd`
- Results: no secrets, private links, packet files, databases or personal data anywhere in history;
  screenshots synthetic. Low-severity notes recorded as owner decisions in `docs/release-checklist.md`
  (possible coincidental real names in fixtures; "private" wording; build-only MPL-2.0 lightningcss).
- Changes: `THIRD_PARTY_NOTICES.md` (from `pnpm -r licenses list --prod`: MIT + Apache-2.0
  Playwright; React bundled), `docs/release-checklist.md`, README licence link.
- Checks: `pnpm check` initially FAILED (Biome formatting of `apps/local/e2e/playwright.config.ts`,
  edited after the last format run in P4b); the P4b commit `956ec4d1` and the notices commit
  `cc650b54` were pushed with that lint failure (GitHub CI for `956ec4d1`: failure). Fixed by
  formatting in the next commit; `pnpm check` then exit 0, 360 tests passed. Lesson: never chain a
  commit after `pnpm check` without checking its exit status.

## 2026-10-17 — Overnight run, slice 1: operations layer, JSON CLI, MCP server
- Tool / active writer: Claude Code (overnight autonomous run authorised by the owner)
- Starting branch / HEAD: `build/v0.1` @ `ed4cc9f0461ca6f2c7d570b17e46792a3b85f524`
- Research: workflow `wf_73607549-f9f` (6 Sonnet researchers: export formats, billing import
  formats, Indian order language, agent-harness integration, landscape/stars, patterns).
- Changes: `apps/local/src/ops.ts`, rewritten `cli.ts` (all commands `--json`; new `status`,
  `drafts`, `export`, `dashboard`, `mcp`), `apps/local/src/mcp.ts`, `mcp.test.ts` (spawns the real
  stdio server and speaks JSON-RPC), D016.
- Checks: `pnpm check` exit 0, 365 tests; `pnpm test:e2e` exit 0, 10 passed (before MCP tests
  were added). The skill-consistency test caught a dropped `--catalogue` flag in the new usage text.

## 2026-10-17 — Overnight run, slice 2: lexicon (Hinglish, Indic digits, business words)
- Starting HEAD: `8744070bd4549180249afcd68dfdfe7a9e5a7ec2`
- Changes: `lexicon.ts` (defaults, merge, validation, compile, digit normalisation), lexicon-driven
  `extract.ts` (Unicode products, word quantities, earliest-valid candidate), catalogue `lexicon.json`
  (+ migration 7 storage), Unicode `matchKey`/customer spans, `quantity_in_words` issue, dozen/gross
  conversion, Hinglish synthetic chat added to the demo, docs (catalogue.md section, research note).
- Checks: `pnpm check` exit 0, 389 tests (new Hinglish suite incl. the research note's examples, a
  Devanagari customer, lexicon.json validation/versioning, the synthetic Hinglish chat end to end);
  `pnpm test:e2e` exit 0, 10 passed (dashboard now shows the Jan 16–19 coverage gap).

## 2026-10-17 — Overnight run, slice 3: export files for other tools
- Starting HEAD: `738decda719a7b9a1d0cbee30476a642c4cbc8d6`
- Changes: new `packages/exporters` (tally-xml, erpnext-csv, zoho-csv, ubl-order; fail-closed
  flattening, XML escaping, name mapping with warnings), `exportOrdersAs` in ops, CLI
  `export --format … --map --output`, server `/api/exports[/:format[/:index]]`, Export tab with
  per-target warnings, MCP `export_orders` returns files + warnings, docs/exporters.md, example map.
- Checks: `pnpm check` exit 0, 399 tests (9 exporter tests incl. hostile names and xmllint
  well-formedness; server export API; MCP export refusal); `pnpm test:e2e` exit 0, 10 passed.
- Not verified: importing any file into the real tools.

## 2026-10-17 — Overnight run, slice 4: use and extend with your coding agent
- Starting HEAD: `50ab1d17483ac0b768621024f793e2e5d77421d6`
- Changes: `.mcp.json`, `docs/harnesses.md` (setup, Claude Code/Codex/Cursor/VS Code configs, tool
  table, what agents cannot do, extension recipes), README repositioning + updated language and
  package lists, clean MCP exit on stdin close, config tests in `skill.test.ts`.
- Checks: `pnpm check` exit 0, 401 tests. Manual: `claude mcp get chatterpilot` reads the project
  config (pending approval, as designed); the server answers initialize/workspace_status from
  another working directory and exits 0 on stdin close.

## 2026-10-17 — Overnight run, slice 5: patterns guide
- Starting HEAD: `208d9047dd4fe2003de1da68a4b7563759479e24`
- Changes: `docs/patterns.md` (ten patterns: problem, primary source, where implemented, proving
  test), README link, `apps/local/src/docs.test.ts` (every test name quoted in the guide must exist;
  every relative link in README and docs/ must resolve).
- Checks: `pnpm check` exit 0, 403 tests.

## 2026-10-17 — Overnight run, slice 6: community files
- Starting HEAD: `1b0566fc34381e0a540928b7bc18782b0e31b80e`
- Changes: CONTRIBUTING (no-real-data rule, first contributions, what will not be merged), SECURITY
  (private reporting, scope), CODE_OF_CONDUCT (Contributor Covenant 2.1 by reference), issue forms
  (bug, export format/order words, idea) with a privacy checkbox, PR template; link test covers them.
- Owner to do: enable private vulnerability reporting in repository settings when the repo is public.

## 2026-10-17 — Overnight run, slice 7: evaluation harness and baseline
- Starting HEAD: `a0c25e7bb83f37acede0fced29595684c21052e9`
- Workflow `wf_1130947d-eda` (6 Sonnet agents: 3 authors, 3 label checkers; 18 label changes, 5
  messages dropped as ambiguous) produced `fixtures/eval/order-messages.json` (115 messages).
- Changes: `evaluate.ts` (+ tests), CLI `eval [--tags] [--failures] [--json]`, docs/evaluation.md.
- Baseline: recall 81.7%, precision 85.0%, 11 silent errors, 23/37 non-orders rejected.
- Checks: `pnpm check` exit 0, 407 tests.

## 2026-10-17 — Overnight run, slice 8: drafting rules, round 1 (development set)
- Starting HEAD: `f279e20258b4c0f0d1f04b3e9199c6efd9a35845`
- Changes: in-message corrections (`correction_in_message`; single-line value applied with review),
  `product_partial` for unexplained words, non-order patterns for stock questions/complaints/past
  deliveries (polite question-orders kept, tested), list fallback split, size normalisation in
  `matchKey`, Devanagari units and numbers.
- Dev set: recall 81.7% → 90.4%, precision 85.0% → 93.1%, silent errors 11 → 0, non-orders 23/37 →
  37/37. Tuned on the same set: a held-out set is next.
- Checks: `pnpm check` exit 0, 422 tests; `pnpm test:e2e` exit 0, 10 passed.

## 2026-10-17 — Overnight run, slice 9: held-out evaluation set
- Starting HEAD: `1da9bcbb633f88dee0eb4a39c4d8b5c4d5ffef75`
- Workflow `wf_96736e39-e9c` (6 Sonnet agents, fresh briefs; 10 label changes) wrote
  `fixtures/eval/order-messages.heldout.json` (117 messages). Scored once; not used for tuning.
- Held-out: before round 1 (`f279e20`, scored in a temporary worktree) recall 67.4%, precision 81.6%,
  silent 9; after round 1 recall 72.8%, precision 87.0%, silent 2. Floors added as a test.
- Benchmark (synthetic 100,000-message Android export, 6.2 MB, this laptop): import 2.8 s,
  identical re-import 0.23 s, suggestions with preview drafts 13.4 s (45,454 suggestions),
  dashboard 6.1 s, status 6.0 s. Workspace DB 45 MB. Status/dashboard cost noted for follow-up.
