# Release checklist (P6, owner approval required)

The repository stays **private** until Shekib explicitly approves a visibility change. This list
records what was checked on 2026-10-17 and what still needs a decision. It is not an approval.

## Checked (automated audits, 2026-10-17)

- [x] Full git history scanned for secrets, tokens, private keys, private URLs (ChatGPT, other
      private repositories), the private planning packet, databases and workspaces: none found.
- [x] Fixtures, docs, README, skill and screenshots scanned for personal data (phones, emails,
      government ids, real-format vehicle registrations) and keys: none found; screenshots show only
      synthetic fixture data.
- [x] Runtime and bundled dependency licences: MIT and Apache-2.0 only (see
      [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)).
- [x] Every command in the agent skill exists in the CLI (enforced by a test).
- [x] CI: lint, typecheck, unit/integration tests and browser tests run on every push.

## Decisions needed before going public

- [ ] **Synthetic names that might coincide with real businesses or products.** Offline checks could
      not confirm: "Hilltop Travels" (fleet fixture), "UltraBond" and "Rockset" cement (catalogue
      fixture, tests, screenshots). Either confirm no conflict or rename to obviously invented names
      and regenerate screenshots (`CHATTERPILOT_SCREENSHOTS=1 pnpm test:e2e`).
- [x] **Visibility wording.** HANDOFF.md and PROGRESS.md say the repository is private; update when
      it changes. History rewriting is optional (nothing secret is in it).
- [ ] **Branding and trademark.** Product name ChatterPilot; optional "by Kaamchor"; confirm the
      call-to-action destination before adding it (PLAN §12).
- [ ] **OA0 recording.** Make the Codegen recording of the synthetic form
      ([guide](../fixtures/mock-order-app/recording/README.md)) so the connector can be labelled
      "recorded"; until then public material must call it hand-written.
- [ ] **Claims review.** README support matrix and docs must match the release; no time-saving or
      accuracy claims until measured with consenting pilots (PLAN §10 P5).
- [x] **Explicit approval** from Shekib for the visibility change (given 2026-10-18; the repository
      was made public that day). Promotion (posting launch drafts) still needs approval per post.

## Build-time only (not distributed)

- lightningcss (MPL-2.0) is used by Vite while building the web UI and is not shipped; development
  tools are not listed in THIRD_PARTY_NOTICES.md.
