# Starter tasks for agents

Small, safe tasks for a "good first issue for agents" label. Each one is a real gap found by
reading the code and running the commands on 2026-10-18. None changes drafting rules, money, the
review flow or what an agent may do. Before you start, read [README.md](README.md) in this folder.

Every task is done when its new test passes and `pnpm check` exits 0. Report the commands you ran
and their exit codes, and quote the new test names in the pull request.

---

## 1. Make the CLI usage honest about `--json`

**Context.** The first line of `USAGE` in `apps/local/src/cli.ts` says "every command accepts
--json". `serve`, `demo` and `mcp` do not: `node apps/local/src/cli.ts serve --json` prints
"Unknown option '--json'" and exits 2. `init` does accept `--json`, but its usage line does not
show it. The same claim appears in [README.md](../../README.md) ("Every CLI command also takes
`--json`") and in [docs/harnesses.md](../harnesses.md).

**Do.** Reword the first `USAGE` line to name the exceptions, add `[--json]` to the `init` line, and
fix the two docs. Do not add `--json` to `serve`, `demo` or `mcp`.

**Acceptance criteria.**
- `USAGE` no longer says every command accepts `--json`.
- Every usage line that starts with `chatterpilot` shows `--json` except `serve`, `demo` and `mcp`.
- `node apps/local/src/cli.ts serve --json` still exits 2.

**Test that proves it.** In `apps/local/src/skill.test.ts`, describe "agent skill matches the real
CLI" (which already has `help`, the usage text):

```ts
it("shows --json only on commands that accept it", () => {
  expect(help).not.toContain("every command accepts --json");
  for (const line of help.split("\n").filter((l) => l.trim().startsWith("chatterpilot "))) {
    const command = line.trim().split(" ")[1] ?? "";
    expect(line.includes("--json"), command).toBe(!["serve", "demo", "mcp"].includes(command));
  }
});
```

## 2. Report a missing follow-ups cases file as `bad_cases`

**Context.** `pnpm chatterpilot eval --cases nope.json --json` prints
`{"error": {"code": "bad_cases", ...}}` and exits 1, through `evaluateDrafting` in
`apps/local/src/ops.ts`. The follow-ups path, `eval --template followups --cases nope.json`, calls
`readFileSync` and `JSON.parse` directly in `apps/local/src/cli.ts` and prints a Node stack trace
instead, with no JSON.

**Do.** Read and parse the file inside a function in `apps/local/src/ops.ts` that throws
`new OpError("bad_cases", ...)` on a missing or unreadable file, like the drafting path. Call it from
the `eval` command. Then run `pnpm agent-reference` and commit `docs/agents/errors.md` if it
changed.

**Acceptance criteria.**
- `node apps/local/src/cli.ts eval --template followups --cases nope.json --json` exits 1 and
  prints a JSON error with code `bad_cases` on stdout.
- `pnpm chatterpilot eval --template followups` still exits 0 with the same output as before.

**Test that proves it.** A new file `apps/local/src/cli-errors.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../", import.meta.url).pathname;
const cli = (...args: string[]) =>
  spawnSync(process.execPath, ["apps/local/src/cli.ts", ...args], { cwd: ROOT, encoding: "utf8" });

describe("CLI errors are codes, not crashes", () => {
  it("reports a missing follow-ups cases file as bad_cases", () => {
    const res = cli("eval", "--template", "followups", "--cases", "does-not-exist.json", "--json");
    expect(res.status).toBe(1);
    expect(JSON.parse(res.stdout)).toMatchObject({ error: { code: "bad_cases" } });
  });
});
```

## 3. Report a missing vehicles file without a stack trace

**Context.** `fleet` in `apps/local/src/ops.ts` calls `readFileSync(options.vehiclesCsv)` before
anything else, so `node apps/local/src/cli.ts events --vehicles nope.csv --json` prints a Node
stack trace and exits 1. The MCP tool `fleet_events` is not affected, because `allowedPath` already
throws `not_found` first.

**Do.** Check the file in `fleet` and throw an `OpError` with a plain message and exit code 1. Pick
a code in the style of [errors.md](errors.md) (for example `bad_vehicles`), then run
`pnpm agent-reference` so `docs/agents/errors.md` lists it.

**Acceptance criteria.**
- The command above exits 1 and prints `{"error": {"code": ..., "message": ...}}` on stdout.
- `docs/agents/errors.md` lists the code (the test "docs/agents/errors.md lists every error code the
  CLI and MCP tools can return" passes).

**Test that proves it.** Add to `apps/local/src/cli-errors.test.ts` (task 2 creates it; create it
here if task 2 is not done):

```ts
it("reports a missing vehicles file as a code", () => {
  const res = cli("events", "--vehicles", "does-not-exist.csv", "--json");
  expect(res.status).toBe(1);
  expect(JSON.parse(res.stdout).error.code).toBe("bad_vehicles");
});
```

## 4. Unit tests for `matchRecord`

**Context.** `matchRecord` in `packages/orders/src/match.ts` decides whether a product or customer
name is `resolved`, `fuzzy`, `ambiguous` or `unresolved`. It has no test file; it is only covered
through `packages/orders/src/draft.test.ts`. Its rules: the most specific key wins (more words, then
more characters), equal ties on different records are ambiguous, and a one-edit typo (keys of 5 or
more characters, words of 4 or more) gives only `fuzzy`.

**Do.** Add `packages/orders/src/match.test.ts`. Do not change `match.ts`.

**Acceptance criteria.** One test per status, plus one for "most specific wins". The expectations
below were checked against the current code.

**Test that proves it.**

```ts
import { describe, expect, it } from "vitest";
import { matchRecord } from "./match.ts";

const records = [
  { id: "CEM", keys: ["cement"] },
  { id: "WHT", keys: ["white cement"] },
  { id: "P1", keys: ["pvc pipe"] },
  { id: "P2", keys: ["pvc pipe"] },
];
const keysOf = (r: { keys: string[] }) => r.keys;
const match = (text: string) => {
  const m = matchRecord(text, records, keysOf);
  return [m.status, m.record?.id ?? null, m.candidates.map((c) => c.id)];
};

describe("matchRecord", () => {
  it("prefers the most specific name", () => {
    expect(match("40 bags white cement")).toEqual(["resolved", "WHT", ["WHT"]]);
  });
  it("returns fuzzy, never resolved, for a one-letter typo", () => {
    expect(match("40 bags cemnt")).toEqual(["fuzzy", "CEM", ["CEM"]]);
  });
  it("does not pick between equally good matches", () => {
    expect(match("10 pvc pipe")).toEqual(["ambiguous", null, ["P1", "P2"]]);
  });
  it("leaves short or unknown words unresolved", () => {
    expect(match("2 bags cem")).toEqual(["unresolved", null, []]);
    expect(match("hello there")).toEqual(["unresolved", null, []]);
  });
});
```

## 5. Show that follow-ups do not double-count after a re-import

**Context.** `apps/local/src/fleet.test.ts` proves the fleet template does not inflate bookings or
money when a later export repeats history ("does not inflate bookings or money when a later export
is imported"). `followupItems` in the same source file has no such test, although it reads the same
canonical messages.

**Do.** Add a test to `apps/local/src/fleet.test.ts`. Import `fixtures/synthetic/chats/android-followups.txt`
as `WhatsApp Chat with Shop.txt`, then import the same text plus one new line as
`WhatsApp Chat with Shop (1).txt`, for example
`05/02/26, 11:00 am - Kumar Traders: payment kal kar dunga 5000`. Use `dateOrder: "dmy"`.

**Acceptance criteria.** Checked against the current code:
- The second import reports overlap `{ new: 1, duplicate: 9, uncertain: 0 }`.
- `summary.reportedPaidMinor` is unchanged (1845000).
- `summary.promisedMinor` grows by exactly 500000 (from 1845000 to 2345000).

**Test that proves it.** A test named, for example, "does not double-count follow-ups when a later
export is imported", using `importExport` and `followupItems` the way the fleet test uses
`fleetEvents`.

## 6. Call `check_catalogue` and `list_drafts` in the MCP test

**Context.** `apps/local/src/mcp.test.ts` never names or calls `check_catalogue` or `list_drafts`,
and no other test or e2e spec does either. Its `expect.arrayContaining([...])` list in "lists the
tools with honest hints, and no accept or form-filling tool" leaves both out, and its hint check
covers only `list_suggestions`, `get_draft`, `import_export` and `revise_draft`. A broken handler
would pass every test.

**Do.** Add both names to the `expect.arrayContaining([...])` list, and add two tests to describe
"MCP server over stdio", after "lets an agent import, preview, draft and propose an edit; a person
still has to accept" (tests share one server and workspace, in order). Do not change `mcp.ts`.

**Acceptance criteria.**
- The tools/list test names `check_catalogue` and `list_drafts`. Both have `readOnlyHint: true`
  (`READ_ONLY` in `mcp.ts`); optionally add them to the hint check.
- `check_catalogue` with `{ dir: "catalogue" }` returns `structuredContent` with `usable: true` and
  `products: 9`, and `{ dir: "../../../etc" }` returns `isError: true`.
- `list_drafts` returns `{ drafts: [...] }` with one draft whose `status` is `open` (the agent's
  draft from the earlier test).

**Test that proves it.**

```ts
it("checks a catalogue folder without loading it", async () => {
  expect((await call("check_catalogue", { dir: "catalogue" })).structuredContent).toMatchObject({
    usable: true,
    products: 9,
  });
  expect((await call("check_catalogue", { dir: "../../../etc" })).isError).toBe(true);
});

it("lists the agent's open draft", async () => {
  const { drafts } = (await call("list_drafts")).structuredContent as { drafts: { status: string }[] };
  expect(drafts.map((d) => d.status)).toEqual(["open"]);
});
```

## 7. Test the `/api/catalogue` and `/api/followups` routes

**Context.** `apps/local/src/server.ts` serves `GET /api/catalogue` (products with `id`, `name`,
`unit`, `altUnits`, and customers, or empty lists when no catalogue is loaded) and
`GET /api/followups` (`{ items, summary }`). No test in `apps/local/src/server.test.ts` requests
either route.

**Do.** Add a describe block to `apps/local/src/server.test.ts`, using its `get` and `json`
helpers. Its `beforeEach` already loads the synthetic catalogue and imports the hardware chat.

**Acceptance criteria.**
- `/api/catalogue` returns 9 products, each with an `altUnits` array, and a `version` string.
- With a fresh workspace and no catalogue (`createApp` on a new `Workspace`), it returns
  `{ products: [], customers: [] }`.
- `/api/followups` returns status 200 with an `items` array and a `summary` object.

**Test that proves it.** For example, describe "catalogue and follow-ups API" with "lists the loaded
catalogue, or nothing before one is loaded" and "returns follow-up items and a summary".

## 8. Unit tests for `BlobStore`

**Context.** `packages/storage` has no test files. `BlobStore` in `packages/storage/src/blobs.ts`
names files only by SHA-256 so imported file names cannot choose paths. That rule is tested only
indirectly ("never turns an upload name into a path" in `apps/local/src/server.test.ts`).

**Do.** Add `packages/storage/src/blobs.test.ts` with a temporary folder (`mkdtempSync`) removed in
`afterEach`. Do not change `blobs.ts`.

**Acceptance criteria.**
- Putting the same bytes twice returns the same `sha256` and `sizeBytes`.
- `has` is true after `put` and false after `remove`.
- `pathFor` throws "invalid blob id" for `"../../etc/passwd"` and for an upper-case digest.
- The store's `tmp` folder is empty after a successful `put`.

**Test that proves it.**

```ts
it("refuses blob ids that are not SHA-256 digests", () => {
  const store = new BlobStore(dir);
  expect(() => store.pathFor("../../etc/passwd")).toThrow("invalid blob id");
  expect(() => store.pathFor("A".repeat(64))).toThrow("invalid blob id");
});
```

`put` takes a stream: `await store.put(Readable.from([Buffer.from("synthetic", "utf8")]))`.

## 9. Score one half of the follow-ups set, and keep held-out failures out of the output

**Context.** `eval --template followups` in `apps/local/src/cli.ts` scores the whole
`fixtures/eval/followup-messages.json`: the `fu-a` development half (39 cases) and the `fu-b`
held-out half (34 cases) together. There is no option to score one half, so an agent must write a
scratch file to tune on `fu-a` alone ([README.md](README.md), "Keep held-out sets held out"). With
`--json` it prints the report from `evaluateFollowups` in
`packages/templates/src/followups-eval.ts`, whose `failures` array lists held-out `fu-b` ids with
their expected and found kinds.

**Do.** Add `--split development|heldout` to the follow-ups branch of the `eval` command:
`development` keeps ids that start with `fu-a-`, `heldout` keeps ids that start with `fu-b-`, and no
`--split` scores the whole file as today. Leave `failures` out of the `--json` output unless
`--split development` is given. Update the `eval` line in `USAGE`, and replace the scratch-file
steps in [README.md](README.md) and [recipes/add-eval-cases.md](recipes/add-eval-cases.md) with the
new option. Do not change `evaluateFollowups`.

**Acceptance criteria.**
- `eval --template followups --split development --json` reports `cases: 39` and includes
  `failures`.
- `eval --template followups --split heldout --json` reports `cases: 34` and has no `failures` key.
- `eval --template followups --json` has no `failures` key.
- `pnpm chatterpilot eval --template followups` (no `--json`) prints the same text as before.

**Test that proves it.** A new file `apps/local/src/eval-cli.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../", import.meta.url).pathname;
const followups = (...args: string[]) =>
  JSON.parse(
    spawnSync(
      process.execPath,
      ["apps/local/src/cli.ts", "eval", "--template", "followups", ...args, "--json"],
      { cwd: ROOT, encoding: "utf8" },
    ).stdout,
  );

describe("follow-ups evaluation keeps the held-out half held out", () => {
  it("scores each half on its own", () => {
    expect(followups("--split", "development").cases).toBe(39);
    expect(followups("--split", "heldout").cases).toBe(34);
  });
  it("never prints held-out failures", () => {
    expect(followups("--split", "heldout")).not.toHaveProperty("failures");
    expect(followups()).not.toHaveProperty("failures");
  });
});
```
