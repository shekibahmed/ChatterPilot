# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), end of P4b
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Owner asked (2026-10-17) to run all remaining stages autonomously, stopping only on real problems.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup, real-target
  submission, merge to `main`.
- Current work package: S0–S7, WP7 skill, OA1 offline, P4a, review fixes done; OA0 built except the owner's recording → P4b done; next: final release-readiness pass

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE, checked with `gh repo view`)
- Branch: `build/v0.1` (created from `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`)
- Observed HEAD before this metadata edit: `f18db7181bdef5c97255e5acc6ad683aee52d3d4` (review fixes)
- Last tested code state: P4b working tree, committed as the P4b commit on `build/v0.1`
  (look up its SHA with `git log -1`; a file cannot contain its own commit SHA)
- Remote: push of `build/v0.1` authorised; verify with `git ls-remote origin build/v0.1`

## Working tree to preserve
- No untracked or unrelated work besides this slice at the time of the P4b commit.
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
- Release-readiness pass that needs no owner authority: dependency licence inventory (THIRD_PARTY
  notices / SBOM), history scan for private data, README support matrix check. Stop afterwards:
  remaining stages need the owner (Codegen recording, provider choice, live bot, real target app,
  pilots, public release).
