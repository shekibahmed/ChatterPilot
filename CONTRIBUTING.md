# Contributing to ChatterPilot

Thank you for helping small businesses spend less time re-typing chat messages.

## The one rule: no real chat data

Never put a real WhatsApp/Telegram export, a real customer or supplier name, a phone number, a
vehicle number or a real price list in an issue, a pull request, a fixture or a commit. Use
invented data that has the same *shape*. Real exports are often full of other people's personal
data, and Git history is forever.

If a real export fails to import, describe the shape instead, for example:
`12/10/26, 9:14 pm - <name>: <text>` or `[2026-10-12 21:14:05] <name>: <text>`. Then write a
synthetic line that reproduces the problem.

## Good first contributions

- **A new export format** (a locale's date/time style): add a synthetic chat under
  `fixtures/synthetic/chats/` and a case in `packages/import-whatsapp/src/scan.test.ts`.
- **Order words for your language or trade**: extend `DEFAULT_LEXICON` in
  `packages/orders/src/lexicon.ts` and add cases to `hinglish.test.ts` (or a new test file for your
  language). Explain where the words are used. Native speakers are especially welcome.
- **An import file for your billing tool**: see [docs/exporters.md](docs/exporters.md). Base it on
  a template exported from the tool, with synthetic values.
- **A new template** (complaints, bookings, attendance): follow `packages/templates/src/fleet.ts`.

## Development

Node.js 26+ and pnpm 12.

```sh
pnpm install --frozen-lockfile
pnpm check        # Biome lint + format check, TypeScript, Vitest
pnpm test:e2e     # Playwright (installs Chromium on first run: pnpm exec playwright install chromium)
pnpm format       # apply formatting
```

A pull request needs `pnpm check` to pass and, for UI changes, `pnpm test:e2e`. Read
[AGENTS.md](AGENTS.md) for conventions; it is written for coding agents and humans alike.

## What we will not merge

- Anything that sends chat content off the machine by default, or that guesses a value (price,
  quantity, customer) instead of flagging it.
- A tool or endpoint that lets an agent accept orders or submit documents in another system.
- Dependencies that are unmaintained, have unclear licences, or add a network call at runtime.
- Claims of time saved or accuracy without a reproducible measurement.

Design decisions are recorded in [DECISIONS.md](DECISIONS.md). If you want to change one, open an
issue first and explain what changed.

By contributing you agree that your contribution is licensed under the MIT licence of this project.
