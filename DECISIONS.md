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
