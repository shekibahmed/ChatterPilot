# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), end of S4a
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Owner asked (2026-10-17) to run all remaining stages autonomously, stopping only on real problems.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup, real-target
  submission, merge to `main`.
- Current work package: S0–S4a done → next slice S4b (React review UI, demo, e2e)

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE, checked with `gh repo view`)
- Branch: `build/v0.1` (created from `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`)
- Observed HEAD before this metadata edit: `f823a17a624fa06ddaa410be4f6cb4889384a5bb` (S3)
- Last tested code state: S4a working tree, committed as the S4a commit on `build/v0.1`
  (look up its SHA with `git log -1`; a file cannot contain its own commit SHA)
- Remote: push of `build/v0.1` authorised; verify with `git ls-remote origin build/v0.1`

## Working tree to preserve
- No untracked or unrelated work besides this slice at the time of the S4a commit.
- Private planning packet: kept outside the repository in the sibling folder `../ChatterPilot-private/`.
  Never copy it in.
- Ignored local runtime files: `node_modules/`; local workspaces under `workspaces/` (gitignored).

## Completed and incomplete work
- Done: S0 baseline; S1 line scanner + `parse` CLI (CI green on `2f56f44b`); S2 storage, safe
  ZIP import, `init`/`import` CLI; S3 catalogue + order drafts with provenance, `catalogue check`
  and `draft` CLI; S4a review decisions, accepted snapshots, local API, CSV/JSON export,
  `catalogue load`/`serve`/`demo` CLI.
- Incomplete: none.
- Not verified: GitHub CI for the S4a push (check with `gh run list --branch build/v0.1`).

## Test evidence
- Root, Node 26.10.0, pnpm 12.14.0: fresh `pnpm install --frozen-lockfile` exit 0; `pnpm check`
  exit 0 (236 tests); manual `serve` smoke test (status 200, spoofed Host 403)

## Decisions, blockers and approvals
- Decisions: D000–D006
- Open (not blocking S1–S4): first BYOK provider (P4); real order target app; pilot users; the owner
  records the OA0 codegen session when OA0 starts.

## Exact next step
- Slice S4b: `apps/local/web` (Vite + React): status/import health, upload with date-order prompt,
  source viewer, suggestions, draft review with provenance chips and edit/exclude/link/accept/
  reject, export links. Root `pnpm demo`; Playwright e2e of the demo path; README screenshot.
- Command: `pnpm check && pnpm test:e2e`
- Expected: all pass; demo works offline
