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

## 2026-10-17 — S2 storage and safe import (WP1 / P1)
- Tool / active writer: Claude Code
- Approved scope: outline approval 2026-10-17, slice S2; D004 recorded
- Starting branch / HEAD: `build/v0.1` @ `2f56f44bcd98b0f7165ba774aef3498cda678b35` (GitHub CI: success)
- Outcome: completed
- Changes:
  - `packages/storage`: `Workspace` (better-sqlite3 13.0.3, WAL, foreign keys, `user_version`
    migrations, STRICT tables for import_batch/message/attachment/skipped_entry/workspace_meta),
    content-addressed `BlobStore`, atomic `recordImport`, exact-file-name media linking, `importSummary`.
  - `packages/import-whatsapp`: `openWhatsAppArchive` (yauzl 3.4.0; validates all entries before
    extraction; symlink/encryption/size/ratio/count/path checks; streaming byte caps; content
    signature check). Test-only ZIP writer exported as `@chatterpilot/import-whatsapp/testing`.
  - `apps/local`: `importExport` pipeline (SHA-256 dedupe, date-order gate, failed-import blob
    cleanup) and CLI `init` / `import`.
- Checks (cwd = repo root, Node 26.10.0, pnpm 12.14.0, code state = S2 working tree before commit):
  - `rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install --frozen-lockfile` — exit 0
  - `pnpm check` — exit 0; 7 test files, 105 tests passed (incl. 13 hostile-archive cases and
    import tests for byte-identical raw text, duplicate no-op, ambiguous-date refusal, cleanup)
  - Manual CLI run in a scratch workspace: `init`, `import` of both fixtures, duplicate re-import
    ("nothing changed"), ambiguous file refused with exit 1
- Bugs found and fixed during the slice: better-sqlite3 rejects numbered `?1` placeholders when
  values are passed positionally (switched to named `@params`); the cleanup path could hide the
  original error (now guarded).
- Not done (by design, later slices): overlap/backfill reconciliation (S6), deletion/export of
  workspaces, timezone-aware UTC conversion (local wall-clock + workspace zone stored for now).
- Next: S3 catalogue CSV + order draft with typed field provenance.
