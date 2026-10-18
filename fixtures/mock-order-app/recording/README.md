# Recording the MockBooks connector (owner step for OA0)

PLAN OA0 requires the order connector to be derived from a **genuine Playwright Codegen recording of
a person using the form**. Codegen records only in a visible browser, driven by a human, so an
agent cannot produce this evidence. The connector in
`packages/order-automation/src/connectors/mockbooks.ts` is therefore labelled **hand-written** until
this recording exists and has been reconciled with it.

Everything here is synthetic: MockBooks is a local test form, and the data comes from
`fixtures/synthetic`. Do not record against any real application or account.

## What to record (about 5 minutes)

1. Start the synthetic form (Terminal 1):

   ```sh
   node fixtures/mock-order-app/server.ts --port 4330
   ```

2. Start Codegen (Terminal 2), writing the recording into this folder:

   ```sh
   pnpm exec playwright codegen \
     --target javascript \
     --test-id-attribute data-testid \
     --output fixtures/mock-order-app/recording/recorded-2-lines.js \
     http://127.0.0.1:4330/
   ```

3. In the browser window that opens, fill in this synthetic order by hand:

   | Field | Value |
   |---|---|
   | Customer | Kumar Builders |
   | Order date | 2026-01-12 |
   | Reference | REC-0001 |
   | Line 1 | Vitrified Tile 2x2 White, quantity `120`, unit `sqft` |
   | Line 2 (click **Add line**) | UltraBond Cement 50kg, quantity `45`, unit `bag` |

   Check that the total shows **30979.20**, then click **Save draft** and wait for
   "Draft DR-… saved".

   **Do not click "Submit proforma".**

4. Close the browser. Codegen writes `recorded-2-lines.js`.

5. Optional, to show variable line counts: record a second session with one line (Shah Interiors,
   UltraBond Cement 50kg, `10` `bag`) into `recorded-1-line.js`.

6. Fill in `PROVENANCE.md` (template below), then commit both files.

## PROVENANCE.md template

```markdown
- Recorded by: <name>
- Date/time and timezone:
- Playwright version: (output of `pnpm exec playwright --version`)
- Command used: (copy from above)
- Target: MockBooks synthetic form, http://127.0.0.1:4330, fixtures at commit <sha>
- Data: synthetic values from fixtures/mock-order-app/recording/README.md
- Submit clicked: no
- Edits made to the raw recording: none (the raw file is kept unchanged)
```

## What happens next (agent step)

The raw recording is kept unchanged as evidence. The connector is then reconciled against it:
every locator and step in the hand-written connector is compared with the recording, differences
are resolved in favour of what the person actually did (unless unsafe), literal values are replaced
by typed payload fields, and a test checks that the connector's step sequence matches the
recording's. Only after that may the connector's `provenance` change from `"hand-written"` to
`"recorded"`, with a decision entry in `DECISIONS.md`.
