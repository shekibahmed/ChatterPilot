---
title: Write repository docs with tiered agent workflows, a single writer and verifiers with distinct lenses
date: 2026-10-18
category: architecture-patterns
module: docs, launch drafts and media copy (agent-written content)
problem_type: architecture_pattern
component: development_workflow
severity: medium
applies_when:
  - Agents draft documentation, marketing copy, captions or test data that will be committed
  - Several agents work in parallel but the branch must have one writer
  - Written claims must match code, tests, file paths and measured numbers
tags: [multi-agent, workflows, verification, documentation, opus, sonnet, haiku, single-writer]
---

# Write repository docs with tiered agent workflows, a single writer and verifiers with distinct lenses

## Context

On 2026-10-18 four Workflow runs produced most of ChatterPilot's new content: the walkthrough
storyboard (`wf_771c3c30-143`), the launch drafts (`wf_2456b9ef-657`), the agent docs
(`wf_7c70e511-1f8`) and a QA pass over rendered video frames (`wf_a0c86d51-8b8`). The owner asked
for Opus 5.5 at high effort as the lead and Sonnet or Haiku sub-agents chosen per task. Earlier
runs (overnight, 2026-10-17) had already used fresh agents to write labelled evaluation sets and
adversarial reviewers that had to reproduce each finding before it counted (session history;
`docs/how-it-was-built.md`).

Every Sonnet verifier pass in these runs found real problems in confident, well-written drafts
(the Haiku privacy scans found nothing, which is also a useful result):

| Run | Draft | Verifier findings |
|---|---|---|
| Storyboard | Opus | 5 factual (e.g. "every value links to chat words", but prices cite the catalogue) and 34 language/timing (captions not matching the UI moment, jargon) |
| Launch drafts | Opus | 8 channel/tone and 6 factual, including a stated video length that `ffprobe` and a file size that the file itself disproved, and "what I have heard" implying operator interviews that never happened |
| Agent docs | Opus, fed by 4 Haiku inventories | 1 path/test and 7 rules: a contributor rule that contradicted the HTTP accept endpoint, a recipe writing to `../` outside the repository, a cold-start step missing, and instructions that would let an agent tune on the held-out evaluation set |
| Frame QA | none (review only) | 3 Haiku privacy scans: 0; 1 Sonnet legibility review: 20 (captions covering or preceding their evidence) |

## Guidance

1. **Tier by judgement, not by habit.** Opus (high effort) writes and reconciles; Sonnet verifies;
   Haiku does mechanical sweeps (inventories of exports and tests, privacy scans of frames). The
   cheap tier never decides what is true.
2. **Give verifiers different lenses.** Pair a facts lens (every claim, number, path and test name
   checked against the tree, running tools such as `grep` and `ffprobe`) with a rules lens (repo
   invariants, channel rules, tone). Identical verifiers find the same things; distinct lenses
   found disjoint problems in each of the three drafting runs above.
3. **Reconcile only verified problems.** The final Opus pass receives the original draft plus the
   verifiers' problem list and changes nothing else; skip it when the list is empty.
4. **Return whole files through a schema; keep one writer.** Agents return
   `{files: [{path, content}]}` and never touch the tree. The orchestrating session writes them after
   rejecting absolute paths and `..`, runs `pnpm check`, and commits. This keeps AGENTS.md's one
   writer per branch and lets the orchestrator fold an agent-proposed section (for example the
   CONTRIBUTING agent section) into an existing file instead of overwriting it.
5. **Read the journal, not the notification.** The completion notification truncates long results;
   the run's `journal.jsonl` holds each agent's full return value and is what to parse.
6. **Back agent-written docs with mechanical tests.** After integration, tests fail if a doc quotes
   a test name that does not exist, names a missing source file or links to a missing file
   (`apps/local/src/docs.test.ts`), and generated references are compared with their generators.
   The first run of the new path check flagged four "missing" files that were starter tasks
   proposing new tests, so the check exempts a path only when its own line proposes creating it.
7. **Re-read or parameterise a workflow script before reusing it.** On 2026-10-17 a second review
   was launched with the first review's script unchanged; it would have re-reviewed old areas and
   missed the new code, and had to be stopped and replaced (session history).
8. **Fix only what a verifier confirms, then re-measure.** In the overnight follow-ups review, an
   adversarial verifier confirmed 2 of 4 findings; the other two were documented design choices.
   One confirmed fix regressed a development-set case (69 to 68 of 73), caught only by rerunning
   the labelled set (session history). Rerun the evaluation after every review-driven change.
9. **Review rendered output visually.** Nothing in the media was functionally broken, so tests
   passed; only an agent looking at extracted frames found captions covering the content they
   described.

## Why This Matters

Drafts from strong models read as finished, and their mistakes are exactly the ones a busy owner
would publish: plausible numbers, invented provenance ("operators told me"), rules that contradict
code, and instructions that quietly undermine a safety discipline. The project's credibility rests
on "every value cites its source"; content about it must meet the same bar. Cost is modest relative
to the work, per the workflow completion reports: about 0.27M sub-agent tokens for the storyboard, 0.36M for the launch drafts, 1.0M for
the agent docs and 0.27M for the frame QA.

## When to Apply

- Any agent-written text that makes factual claims about the repository or will be published.
- Skip the verifier tier for throwaway notes or text no one will act on.
- Verifiers check claims; they do not execute instructions. A recipe still needs one real run
  (none of the six recipes had been executed end to end as of 2026-10-18; see `HANDOFF.md`).

## Examples

Workflow shape used for the launch drafts (abridged):

```js
phase('Draft')
const draft = await agent(BRIEF + filesToWrite, { model: 'opus', effort: 'high', schema: FILES })
phase('Verify')
const checks = await parallel([
  () => agent(`Fact-check against the repository... ${JSON.stringify(draft)}`, { model: 'sonnet', schema: CHECK }),
  () => agent(`Review channel fit and tone... ${JSON.stringify(draft)}`, { model: 'sonnet', schema: CHECK }),
])
const problems = checks.filter(Boolean).flatMap((c) => c.problems)
phase('Final')
return problems.length ? await agent(`Apply these corrections...`, { model: 'opus', effort: 'high', schema: FILES }) : draft
```

Integration by the single writer:

```python
for f in result["files"]:
    assert not f["path"].startswith("/") and ".." not in f["path"]
    write(f["path"], f["content"])
# then: pnpm check (docs tests catch missing tests, files and links), commit explicit paths
```

## Related

- `docs/how-it-was-built.md` (method: independent evaluation sets, adversarial review)
- `docs/solutions/design-patterns/walkthrough-media-from-the-real-app.md` (the frame-QA findings)
- `PROGRESS.md` entry "2026-10-18 — Media, launch kit and agent-first docs" (run ids and checks)
