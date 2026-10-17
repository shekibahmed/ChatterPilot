# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), end of WP7 (skill)
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Owner asked (2026-10-17) to run all remaining stages autonomously, stopping only on real problems.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup, real-target
  submission, merge to `main`.
- Current work package: S0–S7, WP7 skill done; OA0 built except the owner's recording → next OA1 offline

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE, checked with `gh repo view`)
- Branch: `build/v0.1` (created from `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`)
- Observed HEAD before this metadata edit: `0b4ec5eaaa346b30898cd5f43ae61ea10e7af78b` (OA0)
- Last tested code state: WP7 working tree, committed as the WP7 commit on `build/v0.1`
  (look up its SHA with `git log -1`; a file cannot contain its own commit SHA)
- Remote: push of `build/v0.1` authorised; verify with `git ls-remote origin build/v0.1`

## Working tree to preserve
- No untracked or unrelated work besides this slice at the time of the WP7 commit.
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
  exit 0 (316 tests); `pnpm test:e2e` exit 0 at OA0 (8 browser tests); connector spec 18/18 over 3 repeats

## Decisions, blockers and approvals
- Decisions: D000–D011
- **Owner action:** record the MockBooks Codegen session (`fixtures/mock-order-app/recording/README.md`).
- Open decisions: first BYOK provider (P4); real order target app (OA2); pilot users (P5); Telegram
  bot authorisation (OA1 live); public release (P6).

## Exact next step
- OA1 offline: Telegram-shaped synthetic updates processed without a bot or network — numeric
  sender/chat allowlists, durable update offsets and transport dedupe, separate business-level
  repeat detection, edited messages as new versions, intake-gap warning (24 h retention), callback
  validation bound to an exact draft version; CLI `intake --fixture`.
- Command: `pnpm check`
