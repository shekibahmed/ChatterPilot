# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), end of autonomous run (release-readiness pass)
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Owner asked (2026-10-17) to run all remaining stages autonomously, stopping only on real problems.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup, real-target
  submission, merge to `main`.
- Current work package: S0–S7, WP7 skill, OA1 offline, P4a, review fixes done; OA0 built except the owner's recording → P4b and release-readiness done; **stopped: remaining stages need the owner**

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE, checked with `gh repo view`)
- Branch: `build/v0.1` (created from `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`)
- Observed HEAD before this metadata edit: `956ec4d1541de02fd217e84b84740285223ee5bd` (P4b)
- Last tested code state: P4b commit `956ec4d1` (this commit changes docs only) on `build/v0.1`
  (look up its SHA with `git log -1`; a file cannot contain its own commit SHA)
- Remote: push of `build/v0.1` authorised; verify with `git ls-remote origin build/v0.1`

## Working tree to preserve
- No untracked or unrelated work besides this slice at the time of the final commit.
- Private planning packet: kept outside the repository in the sibling folder `../ChatterPilot-private/`.
  Never copy it in.
- Ignored local runtime files: `node_modules/`, `apps/local/dist/` (built UI), `workspaces/` (local data).

## Completed and incomplete work
- Done: S0 baseline; S1 line scanner + `parse` CLI (CI green on `2f56f44b`); S2 storage, safe
  ZIP import, `init`/`import` CLI; S3 catalogue + order drafts with provenance, `catalogue check`
  and `draft` CLI; S4a review decisions, accepted snapshots, local API, CSV/JSON export,
  `catalogue load`/`serve`/`demo` CLI; S4b React review app, `pnpm demo`, Playwright e2e, README; S5 dashboard; S6 overlap
  reconciliation; S7 fleet template smoke test; OA0 approvals,
  execution ledger, MockBooks synthetic target and hand-written connector (recording pending).
- Incomplete: none.
- Not verified: GitHub CI for the OA0/WP7 pushes (e2e job now starts 5 MockBooks servers) (check with `gh run list --branch build/v0.1`).

## Test evidence
- Root, Node 26.10.0, pnpm 12.14.0: fresh `pnpm install --frozen-lockfile` exit 0; `pnpm check`
  exit 0 (360 tests); `pnpm test:e2e` exit 0 (10 browser tests); connector spec 18/18 over 3 repeats at OA0

## Decisions, blockers and approvals
- Decisions: D000–D015
- **Owner action:** record the MockBooks Codegen session (`fixtures/mock-order-app/recording/README.md`).
- Open decisions: first BYOK provider (P4); real order target app (OA2); pilot users (P5); Telegram
  bot authorisation (OA1 live); public release (P6).

## Exact next step
Everything that could be done without new authority is done. Each remaining stage needs Shekib:
1. **OA0 recording** (about 5 minutes): `fixtures/mock-order-app/recording/README.md`.
2. **P4 provider**: choose the first BYOK provider/model and the cloud-data policy; then build one
   adapter behind `@chatterpilot/providers` and test it with synthetic data only.
3. **OA1 live bot**: authorise a private Telegram test bot (token held outside the repo), operator
   and chat ids; then add a grammY long-polling source feeding `processUpdate`.
4. **OA2 real target**: name the app, account, document type and permitted actions.
5. **P5 pilots** and **P6 release**: see `docs/release-checklist.md`; merging `build/v0.1` into `main`
   also needs approval.
- Resume command for any tool: `pnpm install --frozen-lockfile && pnpm check && pnpm test:e2e`
