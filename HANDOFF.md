# Current handoff

## Session and authority
- Updated at: 2026-10-19, after the launch-readiness slice (D025)
- Active writer: Cursor cloud agent on `cursor/launch-mcp-readme-ac05`. Next owner: Shekib, for the
  publish, tag and listing steps in `RELEASING.md` and `docs/launch/mcp-listings.md`.
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to origin; a pull request into `main`. The
  2026-10-19 launch task authorises the README CTA to https://bekaamchor.com (the same public
  channels already printed in `operations-intelligence-workbench`).
  Owner direction (2026-10-17, evening): no provider or live bot for now; position the repository as
  a starting kit that people extend with their own coding agent.
  Not authorised: visibility change, publishing the npm package, pushing a version tag, deployment,
  paid/provider calls, bot setup, real-target submission, merge to `main`.
- Current work package: launch readiness (README, Node floor, MCP HTTP + lite profile, unpublished
  npm package). See PROGRESS.md "2026-10-19".

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot`, **public since 2026-10-18** (owner-approved); `main` has
  the v0.1 build (PR #1). Pages: https://shekibahmed.github.io/ChatterPilot/ (serves `docs/` from
  `main`). Discussions on, `usage` label created, private vulnerability reporting on.
- Branch: `cursor/launch-mcp-readme-ac05` off `main` @ `58a2ae8`. Look up the latest commit with
  `git log -1` (a file cannot contain its own SHA).
- Last fully checked code: this slice, Node 22.23.3, pnpm 12.14.0:
  `pnpm check` exit 0 (491 tests). `pnpm test:e2e` not run here (no Playwright Chromium). The npm
  package is not published.

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
15. `docs/how-it-was-built.md` (method case study); second review (`wf_3f15d46f-5da`): 2 fixes
16. Walkthrough media (`pnpm media`, D023): tour video with CC0 music, README GIFs, social clips,
    interactive `docs/media/tour.html`; launch drafts in `docs/launch/` (nothing posted)
17. Agent-first docs (D024): `llms.txt`, `docs/problems.md`, `docs/agents/` recipes and tasks,
    generated `tools.json`/`errors.md` with drift tests, `pnpm check:quick`

## Next candidates (optional, in order)
- "Forget a person" (DPDP erasure): proposed design and options in DECISIONS.md D022; needs the
  owner's decision before code.
- More labelled data from real (consented) exports during pilots; then re-tune and re-measure.
- Busy/Vyapar/Marg import recipes once someone shares a template file.
- Decide whether an agent's proposed edit should carry its own evidence kind (today `kind: "human"`
  with `reviewer: "agent:<name>"`); seen in the agent chapter of the walkthrough.
- Have an agent execute one recipe in `docs/agents/recipes/` end to end in a worktree.
- Re-run `pnpm media` after visible UI changes (it adds about 50 MB to history each time; do it
  deliberately).

## Owner actions (need Shekib)
Done on 2026-10-18: README inline video, social preview image, Discussions categories and the pinned
welcome post (https://github.com/shekibahmed/ChatterPilot/discussions/3). The README CTA is now in
the repo (this task). The npm package is still unpublished.
1. **Publish:** follow `RELEASING.md`. Create the `NPM_TOKEN` Actions secret, merge this pull
   request, tag `v0.1.0` from `main`, and push the tag. Do not publish by hand from a laptop unless
   the workflow cannot run. Confirm `npm view chatterpilot` is still 404 before tagging.
2. **Listings:** after npm shows `0.1.0`, follow `docs/launch/mcp-listings.md` (official registry,
   awesome-mcp-servers, Glama). Smithery stays a stdio config until there is a public HTTPS URL or
   an MCPB bundle. Do not submit a URL this repository does not host.
3. **GitHub topics:** on 2026-10-19 the API already returned 11 topics (`ai-agents`, `claude-code`,
   `human-in-the-loop`, `local-first`, `mcp`, `mcp-server`, `order-management`, `provenance`,
   `small-business`, `typescript`, `whatsapp`). Confirm they still match what you want. The launch
   note that said "currently 7" was behind the live list.
4. **Discussions tidy-up (optional):** the default "General" and "Polls" categories still exist, and
   "Show and tell" kept its name. Descriptions do not yet end with the invented-data sentence
   (`docs/launch/discussions.md`).
5. **Launch posts**: approve and post the drafts in `docs/launch/` in waves. `reddit.md` and
   `show-hn.md` now say Node.js 22.18+.
6. **OA0 recording**, **P4 provider**, **OA1** live bot, **OA2** real target app, **P5 pilots**.
7. Try the import files in real Tally/ERPNext/Zoho sandboxes. Fixture names that might match real
   brands are still listed in `docs/release-checklist.md`.

## Resume command
`pnpm install --frozen-lockfile && pnpm check && pnpm test:e2e && pnpm chatterpilot eval`
