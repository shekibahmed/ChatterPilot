# ChatterPilot for coding agents

Start here if you are an AI coding agent (Claude Code, Codex, Cursor or your own) or are briefing
one. ChatterPilot turns WhatsApp order messages into source-linked drafts that a person accepts.
Your job is usually to extend it for one shop or one billing tool without breaking its safety
rules. The tests guard those rules; this page tells you how to use them.

## Orient in five minutes

Read these in order. Stop when you know enough for your task.

1. [AGENTS.md](../../AGENTS.md): working rules, the session start steps, and the commands.
2. [HANDOFF.md](../../HANDOFF.md): the current state of the work. The checkout wins if they differ.
3. [llms.txt](../../llms.txt): a one-page map of the docs, code entry points and commands.
4. [docs/problems.md](../problems.md): each business problem, the code that solves it and the test
   that proves it.
5. [docs/patterns.md](../patterns.md): the ten patterns. Your change should follow the one that fits.
6. The source file you will change and the test file next to it. Read the test first.

Then inspect the real state of the checkout, as AGENTS.md says:

```sh
git branch --show-current
git status --short --branch
git log -5 --oneline
```

## Invariants

Keep all of these. The test named after each one fails if you break it.

| Rule | Guarded by |
|---|---|
| Money is integer minor units plus a scale, never binary floats. | `packages/core/src/money.test.ts`: "avoids binary float error" |
| Unknown values stay unknown and are flagged, never guessed. | `packages/orders/src/draft.test.ts`: "never invents a price, unit or tax" |
| Chat text, transcripts and model output are data, never instructions. | `packages/telegram-intake/src/intake.test.ts`: "stores injected instructions as plain data and grants nothing" |
| No MCP tool accepts, rejects, reopens, fills a form or submits. The CLI has no accept, reject or reopen command; `fill-form` is approval-bound and stops before Submit. The HTTP API has one decisions endpoint (`POST /api/drafts/:id/decisions`) that exists only for the person using the review app. Do not add other routes that decide, and never call that endpoint yourself to accept or reject a draft; a person does that in the app. | `apps/local/src/mcp.test.ts`: "lists the tools with honest hints, and no accept or form-filling tool" |
| Accepted snapshots are frozen; exports read only them. | `apps/local/src/server.test.ts`: "cannot be edited or deleted, even directly in SQLite" |
| Fixtures are synthetic. No real chats, names, phone numbers or price lists. | Review; see [fixtures/synthetic/README.md](../../fixtures/synthetic/README.md) |
| Held-out evaluation sets are scored, never tuned on. | Review; see [docs/evaluation.md](../evaluation.md) |
| Form filling stops before Submit. | `apps/local/src/execution.test.ts`: "refuses to submit, even with a submit approval" |

Two rules have no test because a test cannot see them: synthetic data and held-out discipline. You
keep them by what you write and what you look at.

## Prove a change

First run `pnpm install --frozen-lockfile` (Node 26 or later, pnpm 12). `pnpm test:e2e` also needs
the Playwright browser: `pnpm exec playwright install chromium`. If it cannot run, write "not run"
and say why.

Run the smallest check first, then the full one.

```sh
pnpm exec vitest run packages/orders/src/draft.test.ts     # one test file
pnpm exec vitest run packages/orders/src -t "does not regress"   # one test by name
pnpm check:quick      # lint, types, and only tests affected by your change
pnpm check            # lint (Biome), types (TypeScript), all Vitest tests; must exit 0
pnpm format           # apply Biome formatting if lint fails on formatting
```

Run these as well when they apply:

| You changed | Also run |
|---|---|
| The web app, the HTTP server or the fill-form flow | `pnpm test:e2e` |
| Drafting rules, the lexicon or the catalogue matcher | `pnpm chatterpilot eval` (development set). After you have finished, as a regression check: `pnpm chatterpilot eval --cases fixtures/eval/order-messages.heldout.json` |
| The follow-ups rules | The `fu-a` half from a scratch file (below) while you work. After you have finished, as a regression check: `pnpm chatterpilot eval --template followups` |
| An MCP tool or an `OpError` code | `pnpm agent-reference` (rewrites `docs/agents/tools.json` and `docs/agents/errors.md`) |
| The recorded MCP session | `node apps/local/src/agent-session.ts > docs/agent-session.md` |

A test in `apps/local/src/agent-reference.test.ts` fails until the generated files match the code.
`apps/local/src/docs.test.ts` fails if a Markdown link in the docs points to a missing file.

### Keep held-out sets held out

Some output lists held-out cases one by one. `--json` on the drafting eval prints every case, and
`--json` on the follow-ups eval prints a `failures` array with `fu-b` ids. Never use `--json`,
`--failures` or `--tags` on `fixtures/eval/order-messages.heldout.json`, and never use `--json` on
the full `fixtures/eval/followup-messages.json` (the default for `--template followups`).

`pnpm chatterpilot eval --template followups` scores both halves together. To tune follow-ups
rules, score only the `fu-a` half. Write it to a scratch file outside the repository, from the
repository root:

```sh
dir=$(mktemp -d)
node -e 'const fs = require("node:fs"); const all = JSON.parse(fs.readFileSync("fixtures/eval/followup-messages.json", "utf8")); fs.writeFileSync(process.argv[1], JSON.stringify(all.filter((c) => c.id.startsWith("fu-a-"))));' "$dir/fu-a.json"
pnpm chatterpilot eval --template followups --cases "$dir/fu-a.json"
```

Run the held-out commands as a regression check after you have finished. Do not change rules in
response to their numbers other than reverting. If a held-out set is needed for tuning, write a new
held-out set ([docs/evaluation.md](../evaluation.md)).

## Report results

Record each command you ran and its exit code. Write "not run" for anything you did not run.
Reading code is not a passing test. A short report looks like this:

```text
Change: business lexicon words for cloth shops (packages/orders/src/hinglish.test.ts)
pnpm exec vitest run packages/orders/src/hinglish.test.ts   exit 0
pnpm chatterpilot eval                                      exit 0 (recall 90.4%, silent 0; unchanged)
pnpm check                                                  exit 0
pnpm test:e2e                                               not run (no UI change)
Tests that prove it: hinglish.test.ts "adds the business's own unit words"
```

Quote figures only from output you saw in this session.

### CLI and MCP exit codes

| Exit | Meaning |
|---|---|
| 0 | Done. |
| 1 | Refused or could not do it (for example `nothing_accepted`, `no_workspace`, `date_order_required`). |
| 2 | Wrong usage: unknown command or flag, or a bad value such as `bad_format` or `bad_date_order`. |

With `--json`, a refused command prints `{"error": {"code": "...", "message": "..."}}` on stdout.
Branch on `code`, not on the message. The full list is [errors.md](errors.md). `serve`, `demo` and
`mcp` do not accept `--json`. MCP tools return the same message with `isError: true` and no code
field. The tool list, with input schemas and read-only hints, is [tools.json](tools.json).

## Recipes

Step-by-step guides for common extensions. Each ends with the commands that must exit 0.

- [Add a shop's words (lexicon.json)](recipes/add-shop-words.md)
- [Add an export format](recipes/add-exporter.md)
- [Add a message template](recipes/add-message-template.md)
- [Add a read-only MCP tool](recipes/add-mcp-tool.md)
- [Add evaluation cases](recipes/add-eval-cases.md)
- [Change a drafting rule and measure it](recipes/change-a-drafting-rule.md)

## Tasks

[tasks.md](tasks.md) lists small, safe starter tasks. Each one is a real gap in the code or tests,
with acceptance criteria and the test that will prove it.

## Never, without separate owner approval

From [AGENTS.md](../../AGENTS.md): change repository visibility, publish packages, deploy, call a
paid or data-sending provider, register a bot, submit a form in a real system, or merge to `main`.
Never commit secrets, real chats or audio, customer data, or browser sessions.
