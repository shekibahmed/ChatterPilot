---
title: Generate agent references from the running code and drift-test them as data
date: 2026-10-18
category: developer-experience
module: apps/local/src/agent-reference.ts, apps/local/src/docs.test.ts
problem_type: developer_experience
component: documentation
severity: medium
applies_when:
  - Publishing a tool list, error-code table or API reference that agents will branch on
  - Docs quote test names, file paths or links that can go stale
  - Generated files are committed in a repository whose formatter also rewrites them
tags: [agent-docs, mcp, error-codes, drift-test, generated-docs, biome, docs-test]
---

# Generate agent references from the running code and drift-test them as data

## Context

To make ChatterPilot usable by coding agents without a guide, two references were added:
`docs/agents/tools.json` (what the MCP server offers) and `docs/agents/errors.md` (every error code
the `--json` CLI and MCP tools can return, with its exit code). Hand-written versions would drift
the first time someone adds a tool or an error. The repository already had the habit of tests
that keep docs honest: `docs.test.ts` checks that test names quoted in `docs/patterns.md` exist
and that links resolve, and a skill test keeps the agent skill's commands in step with the CLI
(session history).

Three things went wrong on the way, each caught by looking at the output rather than trusting it:

- **The error scanner missed codes.** A single regular expression for "code, literal message,
  optional exit code" found 18 codes while `grep` showed 20 distinct `OpError` codes in the source.
  It missed `audio_not_found` (message built from a conditional expression) and `export_refused`
  (message from `err.problems.join(" ")`), and did not know that the operations layer passes
  `ImportError` codes (`date_order_required`, `archive_rejected` and others) straight through. One
  `ImportError` call also has a third, non-exit argument after the message.
- **The tools drift test failed right after `pnpm format`.** Biome re-wrapped the committed
  `tools.json`, so a byte-for-byte comparison with the generator's `JSON.stringify` output failed
  although nothing had changed.
- **The new path check flagged four files that do not exist yet,** all in starter tasks that ask
  the reader to create a new test file.

## Guidance

1. **Generate from the running system, not from source text, where you can.** `listTools` starts
   the real MCP server on a throwaway synthetic workspace and asks it over raw JSON-RPC
   (`initialize`, `notifications/initialized`, `tools/list`;
   `apps/local/src/agent-reference.ts:25-69`). The reference is then exactly what an agent sees,
   annotations included.
2. **When you must scan source, anchor on the stable part and read the variable part separately.**
   `findErrorCodes` matches only `new (OpError|ImportError)("code",` and then reads the message: a
   string or template literal is quoted (with `${…}` shown as `…`), anything else becomes
   "(depends on the case)". The exit code is read directly after a literal message, or, when the
   message is an expression, by a looser search up to the end of the statement
   (`agent-reference.ts:118-127`). Check a scanner's count against an independent `grep` before
   trusting it.
3. **Compare generated JSON as data.** The drift test parses both sides
   (`apps/local/src/agent-reference.test.ts:12-16`), so formatter whitespace never fails it while any
   content change does. Markdown that the formatter leaves alone (`errors.md`) can still be
   compared as text.
4. **Put a safety assertion next to the drift check.** The same test fails if any tool name
   suggests accepting, rejecting, submitting, filling or approving (`agent-reference.test.ts:17`),
   which encodes the project's "a person accepts" rule where a new tool would first appear.
5. **Let doc checks tell proposals from claims.** The path check in `docs.test.ts` skips a missing
   path only when its own line proposes creating it ("new file", "Add `…`", "create";
   `apps/local/src/docs.test.ts:81-85`). Table tests named with `%j` or `%s` are matched up to the
   placeholder in the problem-catalogue check (`docs.test.ts:65`).
6. **Watch each guard fail once.** The overnight run proved the skill-consistency test by
   injecting a fake command into the skill and seeing it fail; that test later caught a real
   mismatch (`draft --catalogue` missing from the rewritten usage text) (session history). In this
   session the extended link check failed while `llms.txt` did not exist yet, and the tools drift
   test failed on the formatter change above, so both are known to bite.
7. **Make regeneration one command and say so where agents look.** `pnpm agent-reference` is listed
   in `AGENTS.md`, `llms.txt` and `docs/agents/README.md`; the generated files' headers give the
   equivalent `node apps/local/src/agent-reference.ts`. The table now lists 25 codes: 20 from
   `OpError` and 5 that only `ImportError` raises.

## Why This Matters

Agents branch on references: an error code missing from the table becomes an unhandled case, and a
tool list that lags the server teaches the wrong surface. A drift test that fails on formatting
noise trains people to regenerate blindly or to delete the test. Doc checks that cannot tell a
proposed file from a stale citation either block useful task descriptions or get loosened until
they check nothing.

## When to Apply

- Any reference an agent or script consumes: tool lists, error codes, CLI usage, config schemas.
- Docs that cite tests, files or links (patterns, problem catalogues, recipes, learnings).
- Not for prose explanations, which a generator cannot write.

## Examples

Drift test, before (failed after `pnpm format` with no real change):

```ts
expect(readFileSync(join(ROOT, "docs/agents/tools.json"), "utf8")).toBe(toolsJson(tools));
```

After:

```ts
// Compared as data: the formatter may re-wrap the committed file.
expect(JSON.parse(readFileSync(join(ROOT, "docs/agents/tools.json"), "utf8"))).toEqual(
  JSON.parse(toolsJson(tools)),
);
for (const tool of tools) expect(tool.name).not.toMatch(/accept|reject|submit|fill|approve/);
```

Scanner coverage check used before trusting the table:

```sh
grep -h -A1 "new OpError(" apps/local/src/{cli,ops,mcp}.ts | grep -o '"[a-z_]*"' | sort -u
```

## Related

- `docs/agents/README.md`, `llms.txt` (where agents find the references)
- `DECISIONS.md` D024 (agent-first docs and generated interfaces)
- `docs/solutions/architecture-patterns/tiered-agent-workflows-for-repository-docs.md` (how the
  agent docs these tests protect were written and checked)
