# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), end of S1
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup, real-target
  submission, merge to `main`.
- Current work package: WP0 + S1 done → next slice S2 (WP1 storage/import)

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE, checked with `gh repo view`)
- Branch: `build/v0.1` (created from `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`)
- Observed HEAD before this metadata edit: `75855287ec47e0946d1ab95679f4398f4357476c` (S0)
- Last tested code state: S1 working tree, committed as the S1 commit on `build/v0.1`
  (look up its SHA with `git log -1`; a file cannot contain its own commit SHA)
- Remote: push of `build/v0.1` authorised; verify with `git ls-remote origin build/v0.1`

## Working tree to preserve
- No untracked or unrelated work besides this slice at the time of the S1 commit.
- Private planning packet: kept outside the repository in the sibling folder `../ChatterPilot-private/`.
  Never copy it in.
- Ignored local runtime files: `node_modules/` only.

## Completed and incomplete work
- Done: S0 baseline (GitHub CI green on `75855287`). S1 WhatsApp line scanner + `parse` CLI.
- Incomplete: none.
- Not verified: GitHub CI for the S1 push (check with `gh run list --branch build/v0.1`).

## Test evidence
- Root, Node 26.10.0, pnpm 12.14.0: `pnpm check` exit 0 (84 tests); CLI parse of the Android fixture exit 0

## Decisions, blockers and approvals
- Decisions: D000–D003
- Open (not blocking S1–S4): first BYOK provider (P4); real order target app; pilot users; the owner
  records the OA0 codegen session when OA0 starts.

## Exact next step
- Slice S2: `packages/storage` (better-sqlite3 migrations for Workspace/ImportBatch/Message/Attachment),
  whole-file SHA-256 idempotency, safe ZIP reading (yauzl + symlink/bomb/ratio/count caps), and a
  `chatterpilot import` command.
- Command: `pnpm check` from the repository root
- Expected: all tests pass, including malicious-ZIP rejection and identical-reimport no-op
- Stop if: better-sqlite3 cannot load on Node 26 → record the fallback (`node:sqlite`) as a decision first
