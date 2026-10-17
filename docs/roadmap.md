# Roadmap

What exists, what comes next, and what each next step is waiting for. Dates are not promised;
each step has a gate that must be met first.

## Built and tested (synthetic data only)

- WhatsApp TXT/ZIP import with every line accounted for and safe re-imports
- Order drafts with evidence for every value; English, Hinglish and Indic digits; shop vocabularies
- Review app: correct, link corrections, accept; frozen accepted records
- Dashboard with stated coverage; follow-ups (open deliveries, complaints, payments, quotes)
- Exports: CSV/JSON, and experimental import files for Tally Prime, ERPNext, Zoho Books, UBL 2.1
- Form filling into a synthetic order form that stops before Submit
- Agent interface (MCP, `--json` CLI) for Claude Code, Codex, Cursor and others
- Measured on independently written labelled sets ([evaluation.md](evaluation.md))

## Next, and what each step needs

| Step | Waiting for |
|---|---|
| Try the import files in real Tally, ERPNext and Zoho Books test companies | Someone with a test company and a template export (synthetic data) |
| Pilots with two or three shops | Consent, a written data-handling note ([privacy.md](privacy.md)), and time with the people who re-type orders today |
| Labelled samples from real chats (with consent, kept private) | Pilots; then re-measure and publish only the numbers |
| More languages and trade vocabularies (Marathi, Gujarati, Tamil, Bengali; pharmacy, grocery, textiles) | Native speakers and real phrasing; contributions welcome via the "Export format, language or order words" issue form |
| Erasing one person's data on request | An owner decision on the redaction design ([DECISIONS.md](../DECISIONS.md) D022) |
| Optional AI reading for messages the rules miss | A chosen provider, a cloud-data policy and opt-in consent per batch; the offline boundary already exists |
| Filling a real billing tool's form after approval | A named target system, account and permissions; a recorded, reviewed flow; it will still stop before Submit at first |
| Voice notes | A transcription choice that can run locally or under the same consent rules |
| A one-click installer for non-developers | Pilots showing which platforms shops actually use |

## How to help

- **Shops and distributors:** the most useful thing is to describe your workflow (who sends what,
  where it is re-typed, what goes wrong) using the "Idea or use case" issue form, with invented
  examples. Do not share real chats.
- **Developers and agents:** pick an extension point in [harnesses.md](harnesses.md); keep
  `pnpm check` green and add synthetic tests.
- **Accountants and ERP consultants:** a template export from Tally, Busy, Vyapar, Marg or ERPNext,
  with invented data, lets the import files be checked against the real thing.
