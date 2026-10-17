# Progress log

Append-only evidence per slice, recovery or interruption. `HANDOFF.md` holds current state.
Synthetic/sanitised details only. A partial slice stays partial even if committed for preservation.

## 2026-10-17 — S0 baseline (WP0)
- Tool / active writer: Claude Code
- Approved scope: outline approval 2026-10-17 (S0–S7 + OA0 sequence; D000–D003)
- Starting branch / HEAD: `main` @ `f9514b7505dfa4b0f9797a5c454e810eb1dfb216`; created `build/v0.1`
- Outcome: completed
- Changes: moved private planning packet out of the checkout; `.gitignore`; `AGENTS.md`/`CLAUDE.md`;
  checkpoint files; README stub; pnpm workspace, `tsconfig*.json`, Biome, Vitest; CI workflow with
  SHA-pinned actions; `packages/core` with exact amount parsing (`parseAmountToMinor`, `formatMinor`).
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S0 working tree before commit):
  - `rm -rf node_modules packages/core/node_modules && pnpm install --frozen-lockfile` — exit 0
  - `pnpm check` (biome check . && tsc -p tsconfig.json && vitest run) — exit 0; 1 file, 27 tests passed
  - Lint rule activation probe (temporary `x == 2` file) — reported `lint/suspicious/noDoubleEquals`; probe deleted
- Note: `biome migrate` rewrote `recommended: true` to `preset: "none"` (all rules off); corrected to
  `preset: "recommended"` and verified with the probe above.
- Not run: GitHub CI (runs after push).
- Next: S1 line scanner in `packages/import-whatsapp`.
