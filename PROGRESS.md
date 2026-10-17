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
- GitHub CI: run 39040324981 on `75855287ec47e0946d1ab95679f4398f4357476c` — success (checked during S1).
- Next: S1 line scanner in `packages/import-whatsapp`.

## 2026-10-17 — S1 WhatsApp line scanner (WP1 / P1)
- Tool / active writer: Claude Code
- Approved scope: outline approval 2026-10-17, slice S1; D002
- Starting branch / HEAD: `build/v0.1` @ `75855287ec47e0946d1ab95679f4398f4357476c`
- Outcome: completed
- Changes:
  - `packages/import-whatsapp`: `scanExport` (Android/iOS headers, `-`/`/`/`.` separators, 12/24 h,
    a.m./p. m., U+202F/LRM, multiline, CRLF/BOM, system/media/deleted/edited classification, raw
    timestamp text, 1-based line ranges, per-message status). Day/month order is decided across the
    whole export; ambiguity → `needs_date_order`, never guessed. Corrupt dates are isolated as
    `invalid_timestamp`. `decodeExportBytes` decodes strictly (no silent U+FFFD).
  - `apps/local`: `pnpm chatterpilot parse <file> [--date-order] [--json]` with terminal-safe output.
  - `fixtures/synthetic/chats/`: two hand-authored exports (Android DMY, iOS MDY) + README.
  - Dev-only `whatsapp-chat-parser@4.0.2` (MIT) used as an independent test oracle.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S1 working tree before commit):
  - `pnpm check` — exit 0; 5 test files, 84 tests passed
  - `pnpm -s chatterpilot parse fixtures/synthetic/chats/android-dmy-hardware-orders.txt` — exit 0;
    15 messages, all timestamps ok
  - Cross-check: both fixtures agree with whatsapp-chat-parser on message count, authors, bodies and
    wall-clock times (the library keeps the file's trailing newline on the last body; normalised in the test)
- Known limitations (documented, not yet handled):
  - System-line detection is English-only.
  - A continuation line typed in exactly the header format would start a new message.
  - Day/month order cannot be declared per chat inside a mixed file.
- Next: S2 storage + import (SQLite migrations, file-hash idempotency, safe ZIP).
