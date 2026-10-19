> Draft. Do not post until the repository is public and the owner has approved it.

# Show HN

Post only after the repository is public. Submit the repository URL
(https://github.com/shekibahmed/ChatterPilot) as the link, then add the first comment below
straight away.

Before posting, re-read the Show HN guidelines on the HN site: a Show HN must be something people
can try, the title starts with "Show HN:", and asking for votes or comments is not allowed. The
title limit is 80 characters; all three options below fit.

## Title options

1. `Show HN: ChatterPilot, WhatsApp order drafts where every value cites its source` (79 characters)
2. `Show HN: Local-first order drafts from WhatsApp chats; a person accepts each one`
3. `Show HN: An MCP server that lets agents draft orders but has no accept tool`

Recommended: 1 for a general audience, 3 if the owner wants agent builders first. Option 3 still
needs the first comment to explain the WhatsApp context.

## First comment

Hi HN. I built ChatterPilot, a local-first, MIT-licensed toolkit for a narrow problem: many small
businesses (especially in India) take orders in WhatsApp groups, and someone re-types them into a
spreadsheet, Tally or an ERP. Corrections get lost ("sorry make it 45 bags"), prices drift, and
when a number is disputed nobody can show where it came from.

What it does today: it reads a WhatsApp TXT or ZIP export you choose, matches order lines against
your own price list, and prepares drafts where every value cites its source: the exact chat span,
the catalogue row, the calculation, or a named person's edit with a reason. Unknown values stay
unknown and are flagged instead of guessed. A person accepts; the accepted record is frozen with a
SHA-256, and exports (CSV/JSON, plus experimental Tally, ERPNext, Zoho Books and UBL files that have
not been tried in the real tools yet) read only accepted records.

It runs on your machine: SQLite, a loopback-only web app, no account, no API key, and no model in
the core. The drafting is deterministic rules plus your catalogue and a vocabulary file
(English, Hinglish, Indic digits).

There is also an MCP server for coding agents with 14 tools. Agents can import, draft and propose
edits, which are recorded as `agent:<name>` with a reason. There is deliberately no tool to accept,
reject or submit, so a prompt-injected chat message cannot become an accepted order. A recorded
session is in docs/agent-session.md.

What it is not: it is an early prototype, tested only on synthetic data, and nothing has been
piloted with a real business. I make no time-saving claims. On a held-out set of 117 synthetic
messages written by AI agents that never saw the code (English, Hinglish, Devanagari), the drafting
rules get 75.0% recall and 87.3% precision with 2 silent errors (wrong lines without a review flag).
Those are synthetic messages, so they are not a prediction for real chats; docs/evaluation.md has
the method and the development-set numbers, which look better because the rules were tuned on them.

The design ideas (field-level provenance, abstaining, integer money, frozen approvals, bound
approvals, safe re-imports, chat text as untrusted input) are written up in docs/patterns.md with
the test that checks each one. They apply to any "messy messages in, records out" system.

Try it: `pnpm install --frozen-lockfile && pnpm demo` (Node.js 22.18+, pnpm 12), then open
http://127.0.0.1:4317. The demo uses invented chats and an invented hardware-store catalogue.
There is a walkthrough video of about four minutes in docs/media (invented data).

Feedback I would value most:

- Where the provenance or approval model is wrong or overbuilt.
- Export formats from other locales that fail to parse (invented lines in the same format, please,
  never real chats).
- If you have a Tally, ERPNext or Zoho Books test company: whether the import files actually load.
- If you build agents: whether "the tool does not exist" is the right way to keep a person in charge,
  or whether you would want something else.

I built it with AI coding agents (Claude Code); docs/how-it-was-built.md describes the method,
including the held-out evaluation and the adversarial review rounds.
