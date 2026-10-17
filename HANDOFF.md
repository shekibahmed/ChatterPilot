# Current handoff

## Session and authority
- Updated at: 2026-10-17 (+05:30), end of S2
- Active writer: Claude Code. Next owner: Claude Code (Codex when the Claude allowance ends)
- Approved outline: S0–S7 + OA0 (see PROGRESS.md / DECISIONS.md D000–D003), approved 2026-10-17
- Authorised: local commits per tested slice; push to private origin branch `build/v0.1`.
  Not authorised: visibility change, publication, deployment, paid/provider calls, bot setup, real-target
  submission, merge to `main`.
- Current work package: S0–S2 done → next slice S3 (catalogue CSV + order draft, WP3/C04)

## Verified repository and code state
- Repository: `shekibahmed/ChatterPilot` (GitHub visibility PRIVATE, checked with `gh repo view`)
- Branch: `build/v0.1` (created from `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`)
- Observed HEAD before this metadata edit: `2f56f44bcd98b0f7165ba774aef3498cda678b35` (S1)
- Last tested code state: S2 working tree, committed as the S2 commit on `build/v0.1`
  (look up its SHA with `git log -1`; a file cannot contain its own commit SHA)
- Remote: push of `build/v0.1` authorised; verify with `git ls-remote origin build/v0.1`

## Working tree to preserve
- No untracked or unrelated work besides this slice at the time of the S2 commit.
- Private planning packet: kept outside the repository in the sibling folder `../ChatterPilot-private/`.
  Never copy it in.
- Ignored local runtime files: `node_modules/`; local workspaces under `workspaces/` (gitignored).

## Completed and incomplete work
- Done: S0 baseline; S1 line scanner + `parse` CLI (CI green on `2f56f44b`); S2 storage, safe
  ZIP import, `init`/`import` CLI.
- Incomplete: none.
- Not verified: GitHub CI for the S2 push (check with `gh run list --branch build/v0.1`).

## Test evidence
- Root, Node 26.10.0, pnpm 12.14.0: fresh `pnpm install --frozen-lockfile` exit 0; `pnpm check`
  exit 0 (105 tests); manual CLI init/import/duplicate/ambiguous runs as expected

## Decisions, blockers and approvals
- Decisions: D000–D004
- Open (not blocking S1–S4): first BYOK provider (P4); real order target app; pilot users; the owner
  records the OA0 codegen session when OA0 starts.

## Exact next step
- Slice S3: `packages/templates` (sme-order) + `packages/order-automation` or `core` contracts:
  catalogue CSV validator (duplicate IDs/aliases, units, prices, dates, staleness), deterministic
  order-line rules → OrderIntent, alias resolution, computed totals in minor units, typed
  FieldEvidence (message/catalogue/computed/human), ≥50 adversarial synthetic order lines, and a
  `chatterpilot draft` CLI preview.
- Command: `pnpm check` from the repository root
- Expected: all tests pass; no invented price; unknowns stay unknown; exact totals
- Stop if: catalogue CSV column contract needs an owner decision → record a proposed decision and ask
