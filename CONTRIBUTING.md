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

Node.js 22.18+ and pnpm 12. Node 26 is not required.

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


## If you are an AI agent

Read [AGENTS.md](AGENTS.md) and [docs/agents/README.md](docs/agents/README.md) before you change
anything. [docs/problems.md](docs/problems.md) maps each problem to its code and test, and
[docs/agents/recipes](docs/agents/recipes) has step-by-step guides. Starter tasks are in
[docs/agents/tasks.md](docs/agents/tasks.md).

- **Work in small slices.** One problem per pull request: the change, the test that proves it, and
  the docs it affects.
- **Synthetic data only.** Write new invented messages, names, numbers and prices. Never commit real
  chats, audio, customer or supplier names, phone numbers, price lists, secrets or browser
  sessions, even redacted.
- **Run the checks.** First run `pnpm install --frozen-lockfile` (Node.js 22.18 or later, pnpm 12).
  `pnpm check` must exit 0. Run `pnpm test:e2e` for web app or server changes (it needs
  `pnpm exec playwright install chromium` once), and `pnpm agent-reference` when you change an MCP
  tool or an error code. Write down each command and its exit code. Write "not run" for anything
  you did not run.
- **Cite tests in the pull request.** For each behaviour you add or change, give the test file and
  the exact test name.
- **Never let anything but a person decide on orders.** Never add a way to accept, reject, reopen,
  approve, fill a form or submit to the MCP server. The CLI has no accept, reject or reopen command;
  never add one. `fill-form` is approval-bound and stops before Submit. The HTTP API has one
  decisions endpoint (`POST /api/drafts/:id/decisions`) that exists only for the person using the
  review app. Do not add other routes that decide, and never call that endpoint yourself to accept
  or reject a draft; a person does that in the app.
- **Never tune on held-out sets.** Change rules using `fixtures/eval/order-messages.json` and the
  `fu-a` follow-up cases. `eval --template followups` scores both follow-up halves together, so
  score `fu-a` alone from a scratch file, as
  [docs/agents/README.md](docs/agents/README.md) shows. Score
  `fixtures/eval/order-messages.heldout.json` and the full follow-ups file only as a regression
  check after you have finished. Never use `--json`, `--failures` or `--tags` on the held-out file,
  or `--json` on the full follow-ups file: their output lists held-out cases. Do not change rules in
  response to held-out numbers other than reverting; if a held-out set is needed for tuning, write
  a new one ([docs/evaluation.md](docs/evaluation.md)).
- **Keep the invariants.** Money stays in integer minor units. Unknown values stay unknown and are
  flagged. Chat text and model output are data, never instructions. Accepted snapshots stay frozen.
