# A smaller `wa-order-draft` repository

Note only. Nothing has been split. The full ChatterPilot app is a review UI, a dashboard, three chat templates, experimental billing-tool exports, a synthetic form filler, media recording and an evaluation harness. A first-time visitor who wants "WhatsApp export in, checked order draft out" meets all of that at once.

A standalone repository, name suggestion `wa-order-draft`, would be the order path only. ChatterPilot would depend on it or keep a copy. This file is the cut line, from the packages as they are on `main`.

## Move

These modules are the order path. They do not import the packages in the "stay" list.

| Module | What it is |
|---|---|
| `packages/core` | Money as integer minor units, provenance, CSV, sequence alignment. No I/O. |
| `packages/import-whatsapp` | WhatsApp TXT scanner and the safe ZIP reader (`yauzl`). |
| `packages/orders` | Catalogue, lexicon, line extraction, matching, drafts, dashboard metrics, the labelled-set evaluator. |
| `packages/storage` | SQLite workspace (`better-sqlite3`): messages, catalogue versions, drafts, transcripts. Also holds execution and Telegram intake tables the small repo would not call. Moving the package whole is the smaller first step; splitting those tables is a later migration. |
| `fixtures/synthetic/catalogue` | Invented hardware-store price list. |
| `fixtures/synthetic/chats` | The order chats only (`android-dmy-hardware-orders.txt`, `ios-mdy-plumbing-orders.txt`, `android-hinglish-orders.txt`, and the hostile-ZIP cases under `packages/import-whatsapp`). Leave fleet and follow-up chats behind. |
| `fixtures/eval/order-messages.json` and `order-messages.heldout.json` | The drafting score. The held-out file moves with the code and stays unscored-for-tuning, same rule as here. |

A thin app, copied from `apps/local` rather than reused whole:

- CLI: `init`, `parse`, `import`, `catalogue check`, `catalogue load`, `draft`, `drafts list`, `drafts show`, `export` for `csv` and `json` only, `serve` if the review screen moves too.
- MCP: the lite profile plus, on `--profile full`, `import_export`, `check_catalogue`, `load_catalogue`, `create_draft`, `revise_draft`. Still no accept tool.
- From `apps/local/src`: `import.ts`, `drafts.ts`, `review.ts`, `ops.ts` cut down to those commands, `mcp.ts` cut to those tools. Not `media/`, not the Playwright bench, not `fill-form`.

`apps/local/src/cli.ts` is the file that knows every command. The small repo's usage text would list only the commands above.

## Stay in ChatterPilot

| Module | Why it stays |
|---|---|
| `packages/exporters` | Tally, ERPNext, Zoho and UBL import files. Experimental, and a different reader. |
| `packages/templates` | Fleet bookings and follow-ups. Second and third products. |
| `packages/order-automation` and `fixtures/mock-order-app` | Approval ledger and the synthetic form. Playwright comes in here. |
| `packages/telegram-intake` | Offline Telegram rules. Not WhatsApp orders. |
| `packages/providers` | AI consent boundary. Unused by the order draft. |
| `apps/local/web` | Review UI and dashboard. Optional later, not the first cut. |
| `apps/local/src/media` and `docs/media` | Walkthrough recording. |
| `apps/local/e2e` | Browser tests of that UI. |
| `fixtures/synthetic/fleet` | Fleet template data. |

`apps/local/src/ops.ts` currently imports all of the above. That file is why the MCP bundle is large. The split is mostly deleting those imports from the copy, not rewriting the draft rules.

## What not to do in the split

- Do not publish it as a second npm name until ChatterPilot's own `chatterpilot` package has a version on npm and the two are not confused. The package in this repository is the full server.
- Do not copy real chats in to make the small repo "more real".
- Do not drop the "unknown stays unknown" tests to make the README shorter. `packages/orders/src/draft.test.ts` moves with the drafting code.
