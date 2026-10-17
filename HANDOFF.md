# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), end of S3
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup, real-target
  submission, merge to `main`.
- Current work package: S0–S3 done → next slice S4 (review UI, CSV/JSON export, demo)

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE, checked with `gh repo view`)
- Branch: `build/v0.1` (created from `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`)
- Observed HEAD before this metadata edit: `0853e3f1226851e4dcaab9f0eb84102338aaf159` (S2)
- Last tested code state: S3 working tree, committed as the S3 commit on `build/v0.1`
  (look up its SHA with `git log -1`; a file cannot contain its own commit SHA)
- Remote: push of `build/v0.1` authorised; verify with `git ls-remote origin build/v0.1`

## Working tree to preserve
- No untracked or unrelated work besides this slice at the time of the S3 commit.
- Private planning packet: kept outside the repository in the sibling folder `../ChatterPilot-private/`.
  Never copy it in.
- Ignored local runtime files: `node_modules/`; local workspaces under `workspaces/` (gitignored).

## Completed and incomplete work
- Done: S0 baseline; S1 line scanner + `parse` CLI (CI green on `2f56f44b`); S2 storage, safe
  ZIP import, `init`/`import` CLI; S3 catalogue + order drafts with provenance, `catalogue check`
  and `draft` CLI.
- Incomplete: none.
- Not verified: GitHub CI for the S3 push (check with `gh run list --branch build/v0.1`).

## Test evidence
- Root, Node 26.10.0, pnpm 12.14.0: fresh `pnpm install --frozen-lockfile` exit 0; `pnpm check`
  exit 0 (204 tests); manual CLI init/import/catalogue check/draft runs as expected

## Decisions, blockers and approvals
- Decisions: D000–D005
- Open (not blocking S1–S4): first BYOK provider (P4); real order target app; pilot users; the owner
  records the OA0 codegen session when OA0 starts.

## Exact next step
- Slice S4: local review app — Hono API on 127.0.0.1 (Host/Origin checks) + Vite/React UI:
  import health, source viewer, suggested orders, draft review (accept/edit/reject with reason →
  human provenance, link a correction message), CSV (formula-injection-safe) and JSON export,
  `pnpm demo` seeding a synthetic workspace with no network; Playwright e2e of the demo path.
- Command: `pnpm check` then `pnpm test:e2e`
- Expected: all pass; demo runs offline
- Stop if: a UI/stack choice conflicts with D001 → record a decision first
