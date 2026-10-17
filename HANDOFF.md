# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), end of S0
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup, real-target
  submission, merge to `main`.
- Current work package: WP0 done → next WP1 / slice S1

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE, checked with `gh repo view`)
- Branch: `build/v0.1` (created from `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`)
- Observed HEAD before this metadata edit: `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`
- Last tested code state: S0 working tree, committed as the S0 commit on `build/v0.1`
  (look up its SHA with `git log -1`; a file cannot contain its own commit SHA)
- Remote: push of `build/v0.1` authorised; verify with `git ls-remote origin build/v0.1`

## Working tree to preserve
- No untracked or unrelated work besides this slice at the time of the S0 commit.
- Private planning packet: kept outside the repository in the sibling folder `../ChatterPilot-private/`.
  Never copy it in.
- Ignored local runtime files: `node_modules/` only.

## Completed and incomplete work
- Done: S0 baseline. Tooling, checkpoint files, CI workflow, `packages/core` money parsing.
- Incomplete: none.
- Not verified: GitHub CI result for the first push.

## Test evidence
- Root, Node 26.10.0, pnpm 12.14.0: `pnpm install --frozen-lockfile` exit 0; `pnpm check` exit 0
  (27 tests passed)

## Decisions, blockers and approvals
- Decisions: D000–D003
- Open (not blocking S1–S4): first BYOK provider (P4); real order target app; pilot users; the owner
  records the OA0 codegen session when OA0 starts.

## Exact next step
- Slice S1: create `packages/import-whatsapp` with a line scanner that keeps raw timestamp text, line
  ranges and parse status, plus a synthetic fixture matrix (Android/iOS, 12/24 h, DMY/MDY ambiguity,
  multiline, U+202F/LRM, system messages, media placeholders, malformed lines).
- Command: `pnpm check` from the repository root
- Expected: all tests pass, including the new fixture matrix
- Stop if: a fixture case's correct behaviour is undecided → record it in DECISIONS.md and ask
