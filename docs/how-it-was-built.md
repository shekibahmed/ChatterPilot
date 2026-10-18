# How ChatterPilot was built

ChatterPilot was built in October 2026 by Shekib Ahmed working with AI coding agents (Claude Code,
with Opus, Sonnet and Haiku sub-agents for drafting, research, test-data writing and review). This
page describes the method, because the method is reusable even where the code is not. Every number
below comes from this repository's history: [PROGRESS.md](../PROGRESS.md) has the test evidence for
each step, and [DECISIONS.md](../DECISIONS.md) has the reasons.

## 1. Research before code, and say what was not verified

Each area started with focused research from primary sources: WhatsApp export formats, the
parser library already on npm (evaluated and rejected: unmaintained, and it drops line numbers),
SQLite options, ZIP safety, CSV injection, Tally/ERPNext/Zoho import formats, how Indian shops
write orders, MCP and agent configuration, and India's DPDP Act. Reports separate *verified* from
*inferred*, and the docs keep that distinction ("experimental: not yet imported into the real
tool"; "general information, not legal advice").

## 2. Small vertical slices, each tested, committed and pushed

The work was split into slices that each leave something runnable: the line scanner, storage and
safe import, catalogue and drafts, the review app, the dashboard, overlap reconciliation, a second
template, form filling against a synthetic target, the agent interface, and so on. A slice is only
committed when `pnpm check` (lint, types, tests) exits 0, plus the browser tests for anything with a
UI. Commit messages say what changed for a user and what was measured. One early slice was pushed
with a formatting failure; the fix and the lesson ("never chain the commit after a check without
reading its exit status") are recorded rather than hidden.

## 3. Rules that make AI-assisted output safe to use

Written down once ([docs/patterns.md](patterns.md)) and enforced by tests:

- every value cites its evidence, or is marked unknown;
- quantities in words, partial product matches and corrections are **flagged**, never silently
  guessed;
- a person accepts; accepted records freeze; exports read only frozen records;
- chat text is untrusted input everywhere (spreadsheets, XML, the web app, AI prompts);
- the agent interface has no tool to accept or submit, so prompt injection cannot become an order.

## 4. Measure with data you did not write yourself

"Works on my examples" is not a measurement. For order drafting, three agents that never saw the
code wrote 115 labelled messages (English, Hinglish, Devanagari), and a fourth re-checked every
label. Fresh agents with different briefs then wrote a 117-message **held-out** set that is scored
but never used for tuning ([docs/evaluation.md](evaluation.md)).

| Order drafting, held-out set | recall | precision | silent errors |
|---|---|---|---|
| first rules | 67.4% | 81.6% | 9 |
| after one round of rule changes and a code review | 75.0% | 87.3% | 2 |

On the development set the same changes looked better (90.4% recall, 0 silent errors). The gap
is the cost of tuning on what you measure, and the held-out figure is the one quoted. The
headline metric is *silent errors*, meaning wrong values with no review flag, because those are the ones a
busy person might accept.

The follow-ups template was measured the same way: 14 of 34 held-out messages exactly right
before, 30 of 34 after, with no false positives.

## 5. Adversarial review, with reproduction

After a night of changes, four reviewer agents examined the new code by area (extraction,
drafting, exporters, app surfaces) and a separate verifier tried to *refute* each finding by
reproducing it. Eight of nine findings were confirmed and fixed, each with a regression test,
including two that silently produced wrong orders ("5 boxes 1 inch elbow" read as 5 pieces; "make it
by 5pm" read as a quantity of 5) and a regular expression that a 20,000-character message could
stall for minutes. A CI failure that looked like noise turned out to be a real race condition and
now has a test that reproduces it.

The same structure checks writing. For the walkthrough captions, the launch drafts and the agent
docs, an Opus agent drafted and two Sonnet agents checked from different angles (facts against the
code and tests; rules and tone) before anything was committed; every check found real problems,
such as a video length that `ffprobe` disproved and a recipe that would have let an agent tune on
the held-out set. A separate agent reviewed frames of the rendered video and found captions covering
what they described. See
[docs/solutions/architecture-patterns/tiered-agent-workflows-for-repository-docs.md](solutions/architecture-patterns/tiered-agent-workflows-for-repository-docs.md).

## 6. Built to be extended by your agent

The repository is a starting kit: an MCP server and `--json` CLI so agents can operate it, configs
for Claude Code, Codex, Cursor and VS Code, and recipes for adapting the vocabulary, export formats,
templates and connectors ([docs/harnesses.md](harnesses.md)). The tests are the guard rails that let
someone else's agent change the code without losing the safety properties.

## What this does not show

No real business has used it yet. All data is synthetic. The import files have not been tried in
the real billing tools. These are the next steps, and they need people, consent and time rather than
more code.
