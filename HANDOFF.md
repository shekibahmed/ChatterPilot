# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), during the overnight autonomous loop
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends, about
  12:30 on 2026-10-18)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Owner direction (2026-10-17, evening): no provider or live bot for now; position the repository as
  a starting kit that people extend with their own coding agent; keep improving it autonomously
  (research, concepts, usability, quality) in a loop; commit and push each stage.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup,
  real-target submission, merge to `main`, inventing contact/CTA URLs.
- Current work package: overnight improvement loop (see PROGRESS.md "Overnight run" entries)

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE)
- Branch: `build/v0.1`; look up the latest commit with `git log -1` (a file cannot contain its own SHA)
- Last fully checked code: "Measure the follow-ups rules and broaden them" (`3651c4c`):
  `pnpm check` exit 0 (451 tests), `pnpm test:e2e` exit 0 (12 passed)

## Working tree to preserve
- Private planning packet: sibling folder `../ChatterPilot-private/`. Never copy it in.
- Ignored local runtime files: `node_modules/`, `apps/local/dist/`, `workspaces/`.
- Research notes from this run (not in the repo, not needed to resume): the session scratchpad.
  Their substance is in `docs/research/`, `docs/exporters.md`, `docs/harnesses.md`, `docs/patterns.md`.

## Done in the overnight loop (each a pushed commit)
1. Ops layer, `--json` on every CLI command, MCP stdio server (no accept/fill tools) — D016
2. Lexicon: Hinglish units/numbers, Indic digits, `lexicon.json`, Unicode names — D017
3. Experimental import files for Tally, ERPNext, Zoho Books, UBL (`packages/exporters`) — D018
4. Starting-kit positioning, `.mcp.json`, `docs/harnesses.md` (Claude Code/Codex/Cursor/VS Code) — D019
5. `docs/patterns.md` (ten patterns, each tied to a real test; a test enforces this)
6. CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, privacy-first issue forms, PR template
7. Evaluation harness (`chatterpilot eval`), 115-message agent-written development set — D020
8. Drafting rules round 1: corrections, partial matches, non-orders (dev set silent errors 11 → 0) — D021
9. Held-out order set (117): recall 67.4% → 75.0%, precision 81.6% → 87.3%, silent 9 → 2
10. Performance (100k messages: status 6.0 → 1.3 s) and `pnpm bench`; dev container (tested clean)
11. CI flake fixed (connector waited too little for async lists; `--slow-master` reproduces it)
12. Multi-agent review (`wf_4a70377a-3e7`): 8 confirmed defects fixed with regression tests
13. `docs/for-shops.md`, `docs/privacy.md` (DPDP Act/Rules from official texts; not legal advice)
14. Follow-ups template + tab + CLI/MCP, measured (held-out 14 → 30 of 34 exact)

## Next candidates (optional, in order)
- "Forget a person" (DPDP erasure) conflicts with the append-only decision log and frozen snapshots:
  needs an owner decision (redaction design) before code. See docs/privacy.md "What it does not do".
- More labelled data from real (consented) exports during pilots; then re-tune and re-measure.
- Busy/Vyapar/Marg import recipes once someone shares a template file.

## Owner actions (unchanged, need Shekib)
1. **OA0 recording** (about 5 minutes): `fixtures/mock-order-app/recording/README.md`.
2. **P4 provider** choice and cloud-data policy; **OA1** live bot; **OA2** real target app.
3. **P5 pilots** and **P6 release** (`docs/release-checklist.md`); merge to `main`.
4. When public: enable private vulnerability reporting; decide a contact/consulting link for the
   README (none is invented in the repo); try the import files in real Tally/ERPNext/Zoho sandboxes.

## Resume command
`pnpm install --frozen-lockfile && pnpm check && pnpm test:e2e && pnpm chatterpilot eval`
