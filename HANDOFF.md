# Current handoff

## Session and authority
- Updated at: 2026-10-18 (+05:30), after the media, launch-kit and agent-docs slice
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends, about
  12:30 on 2026-10-18)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to origin branch `build/v0.1`; PRs into `main`
  and merging them (owner, 2026-10-18).
  Owner direction (2026-10-17, evening): no provider or live bot for now; position the repository as
  a starting kit that people extend with their own coding agent; keep improving it autonomously
  (research, concepts, usability, quality) in a loop; commit and push each stage.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup,
  real-target submission, merge to `main`, inventing contact/CTA URLs.
- Current work package: overnight improvement loop (see PROGRESS.md "Overnight run" entries)

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot`, **public since 2026-10-18** (owner-approved); `main` has
  the v0.1 build (PR #1). Pages: https://shekibahmed.github.io/ChatterPilot/ (serves `docs/` from
  `main`). Discussions on, `usage` label created, private vulnerability reporting on.
- Branch: `build/v0.1`; look up the latest commit with `git log -1` (a file cannot contain its own SHA)
- Last fully checked code: the media, launch-kit and agent-docs commits on 2026-10-18:
  `pnpm check` exit 0 (485 tests); `pnpm test:e2e` exit 0 (13 passed); `pnpm media` exit 0

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
1. **README video player** (the browser extension was not connected, so this was not done): on
   github.com edit README.md on `main`, drag in the upload copy of the tour (8.2 MB, under GitHub's
   10 MB free-plan limit; regenerate it with the ffmpeg command in PROGRESS.md 2026-10-18 "Release"),
   and put the `https://github.com/user-attachments/assets/...` URL it creates on its own line where
   the README comment says so.
2. **Social preview**: Settings, General, Social preview, upload
   `docs/media/social/card-1280x640.png`.
3. **Discussions**: create the categories in `docs/launch/discussions.md` and pin the welcome post.
4. **Launch posts**: approve and post the drafts in `docs/launch/` in waves.
5. **OA0 recording**, **P4 provider**, **OA1** live bot, **OA2** real target app, **P5 pilots**.
6. Decide on the fixture names that might match real brands ("UltraBond", "Rockset", "Hilltop
   Travels"; `docs/release-checklist.md`), a contact/consulting link for the README, and try the
   import files in real Tally/ERPNext/Zoho sandboxes.

## Resume command
`pnpm install --frozen-lockfile && pnpm check && pnpm test:e2e && pnpm chatterpilot eval`
