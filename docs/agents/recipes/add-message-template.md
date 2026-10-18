# Recipe: add a message template

## Goal

Turn a new kind of chat (service complaints, bookings, attendance, field reports) into reviewable
items with evidence, using the same import core. Follow the follow-ups template, which is the
newest and smallest. Patterns:
[1. Every value cites its source](../../patterns.md#1-every-value-cites-its-source-field-level-provenance)
and [2. Unknown stays unknown](../../patterns.md#2-unknown-stays-unknown-abstain-instead-of-guessing).

There is no template registry. A template is a set of exported functions in
`packages/templates/src/`, re-exported from `packages/templates/src/index.ts`.

## Read first

- `packages/templates/src/followups.ts`: `FOLLOWUPS_TEMPLATE_VERSION`, `FollowupMessage`,
  `FollowupItem`, `extractFollowups` (one message in, zero or more items out), `linkFollowups`
  (inferred links, always `needs_review`) and `summariseFollowups` (integer money).
- `packages/templates/src/followups.test.ts`: a table test, a synthetic chat test, and a held-out
  regression floor.
- `packages/templates/src/followups-eval.ts`: `evaluateFollowups`, the scorer for a labelled set.
- `packages/core/src/provenance.ts`: `Field<T>`, `Provenance` (use `kind: "message"` with a span),
  `unknownField`.
- `apps/local/src/fleet.ts`: `followupItems`, which runs a template over a workspace's canonical
  text messages (repeats from overlapping exports already excluded).
- [fixtures/synthetic/README.md](../../../fixtures/synthetic/README.md): rules for synthetic chats.

## Steps

1. Create `packages/templates/src/<name>.ts`. Keep the follow-ups shape:

   ```ts
   import { type Field, type Provenance, parseAmountToMinor } from "@chatterpilot/core";

   export const COMPLAINTS_TEMPLATE_VERSION = "complaints/1";

   export interface ComplaintMessage {
     readonly id: string;
     readonly author: string | null;
     readonly localDateTime: string | null;
     readonly startLine: number;
     readonly body: string;
   }

   export interface ComplaintItem {
     readonly id: string;
     readonly messageId: string;
     readonly trigger: Field<string>;      // the phrase that matched, with its span
     readonly quantity: Field<number>;     // null and "unknown" when not written
   }

   export function extractComplaints(msg: ComplaintMessage): ComplaintItem[] {
     // Deterministic rules. Cite the exact span: { kind: "message", messageId, startLine,
     // endLine, span: { start, end }, text }. Leave a value unknown rather than guess it.
     return [];
   }
   ```

   Money goes through `parseAmountToMinor` and stays in integer minor units. Keep promised,
   quoted and reported amounts in separate fields; never add them together.

2. Write a synthetic chat at `fixtures/synthetic/chats/android-<name>.txt` with invented names and
   numbers. Copy the header format of `fixtures/synthetic/chats/android-followups.txt`
   (`02/02/26, 9:10 am - Name: text`).

3. Re-export the functions and types from `packages/templates/src/index.ts`.

4. Wire it into the app only if people need it there. Each step is optional and small:
   - `apps/local/src/fleet.ts`: a function like `followupItems` (it can call the file's private
     `canonicalTextMessages`).
   - `apps/local/src/ops.ts`: a function like `followups` that wraps it in `withWorkspace`.
   - `apps/local/src/cli.ts`: a command in `commands` and a line in `USAGE`.
   - `apps/local/src/mcp.ts`: a read-only tool (see [add-mcp-tool.md](add-mcp-tool.md)).
   - `apps/local/src/server.ts`: a `GET /api/<name>` route like `/api/followups`.

5. If you will tune rules, add a labelled set `fixtures/eval/<name>-messages.json` with a
   development half and a held-out half, as `fu-a` and `fu-b` do in
   `fixtures/eval/followup-messages.json`. See [add-eval-cases.md](add-eval-cases.md).

## Test to add

`packages/templates/src/<name>.test.ts`, following `followups.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { scanExport } from "@chatterpilot/import-whatsapp";
import { describe, expect, it } from "vitest";
import { extractComplaints } from "./complaints.ts";

const msg = (body: string) => ({ id: "m", author: "A", localDateTime: "2026-02-02T10:00:00", startLine: 1, body });

describe("extractComplaints", () => {
  it.each([
    ["5 bags short in yesterday's delivery", 1],
    ["40 bags cement bhej do", 0],
    ["good morning", 0],
  ])("%j gives %j items", (body, count) => {
    expect(extractComplaints(msg(body))).toHaveLength(count);
  });

  it("cites the exact words that triggered the rule", () => {
    const [item] = extractComplaints(msg("5 bags short in yesterday's delivery"));
    expect(item?.trigger.evidence[0]).toMatchObject({ kind: "message", startLine: 1 });
  });
});

describe("synthetic complaints chat", () => {
  const text = readFileSync(
    new URL("../../../fixtures/synthetic/chats/android-complaints.txt", import.meta.url), "utf8");
  const messages = scanExport(text, { dateOrder: "dmy" }).messages;
  it("finds every complaint in the chat", () => {
    const items = messages.flatMap((m) => extractComplaints({
      id: `L${m.startLine}`, author: m.author, localDateTime: m.localDateTime,
      startLine: m.startLine, body: m.body,
    }));
    expect(items.length).toBeGreaterThan(0); // replace with the exact expected items
  });
});
```

If you wired it into the app, add a re-import test like `apps/local/src/fleet.test.ts` ("does not
inflate bookings or money when a later export is imported").

## Done when

```sh
pnpm exec vitest run packages/templates/src   # exit 0
pnpm check                                    # exit 0
pnpm test:e2e                                 # exit 0, only if you added a web view or route
```

## Do not

- Do not verify anything the chat only claims. A payment "done" is reported, not confirmed.
- Do not assert a link that was inferred from author and timing. Mark it `needs_review`.
- Do not use floats for money or quantities.
- Do not add a tool or route that accepts, approves or submits anything.
- Do not use real chats, names, phone numbers or vehicle numbers in fixtures.
