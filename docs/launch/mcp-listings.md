> Draft. Do not post until the repository is public and the owner has approved it.

# MCP list and directory entries

Submit only after the repository is public. ChatterPilot is **not listed anywhere yet**; do not say
otherwise in any post until a listing has actually been merged or approved.

Things every list and directory will notice, so be ready to state them:

- The server runs locally over stdio, started from a clone of the repository with Node.js 26+.
- There is no npm package. Directories that install from a package registry (or a registry that
  requires a published package) cannot list it until a package exists, and publishing a package
  needs a separate owner decision.
- It reads only files inside the folder passed with `--files`, and stores data in a local SQLite
  workspace. It makes no network calls.

## awesome-mcp-servers

Several lists use this name; the most widely referenced one is `punkpeye/awesome-mcp-servers` on
GitHub. Before opening a pull request, read that list's current CONTRIBUTING file and README:

- which category fits (look for a category covering business tools, finance, communication or data
  processing; pick the one where similar servers already sit);
- the exact line format, including any language or scope markers the list requires (several lists
  use small symbols for "TypeScript" and "runs locally"; add them only if the list's legend requires
  them);
- alphabetical ordering within the category, and whether one entry per pull request is required.

Line to adapt to the list's format:

```markdown
- [shekibahmed/ChatterPilot](https://github.com/shekibahmed/ChatterPilot) - Local-first server that turns WhatsApp chat exports into order drafts where every value cites its source; agents can draft and propose edits, but there is no tool to accept or submit.
```

Pull request title: `Add ChatterPilot (local WhatsApp order drafting with provenance)`

Pull request body:

```markdown
Adds ChatterPilot, a local stdio MCP server (TypeScript, MIT). It imports WhatsApp chat exports,
matches order lines against the user's own price list and creates drafts where each value cites the
chat span, catalogue row or calculation it came from. Agents can import, draft and propose edits;
there is deliberately no accept or submit tool, so a person decides. Early prototype, tested on
synthetic data only.
```

## Fields typically requested by MCP directories

Directories differ; copy the fields they ask for.

**Name:** ChatterPilot

**Short description (one line):**
Turn WhatsApp order chat exports into source-linked order drafts; agents draft, a person accepts.

**Long description:**

ChatterPilot is a local-first, MIT-licensed toolkit for small businesses that take orders in
WhatsApp groups. Its MCP server lets a coding agent import a WhatsApp TXT export from an allowed
folder, load the business's own price list, list messages that look like orders, create order
drafts and propose edits. Every value in a draft cites its evidence: the exact chat span, a
catalogue row, a calculation, or a named edit with a reason. Unknown values stay unknown and are
flagged rather than guessed; prices come only from the catalogue. Agent edits are recorded as
`agent:<name>` with a reason. There is deliberately no tool to accept, reject or submit a draft, so
prompt-injected chat text cannot become an accepted order; a person accepts in the local review app.
Tool results label chat text as untrusted data. The server runs over stdio, reads only files inside
the folder passed with `--files`, stores data in a local SQLite workspace and makes no network calls.
Status: early prototype, tested only on synthetic data; not yet used by a real business.

**Install / run command:**

```sh
git clone https://github.com/shekibahmed/ChatterPilot && cd ChatterPilot
pnpm install --frozen-lockfile
node apps/local/src/cli.ts mcp --workspace workspaces/default --files fixtures/synthetic --agent <name>
```

Claude Code (from the repository folder):

```sh
claude mcp add chatterpilot -- node apps/local/src/cli.ts mcp --workspace workspaces/default --files fixtures/synthetic --agent claude-code
```

Configs for Codex, Cursor and VS Code: `docs/harnesses.md`.

**Transport:** stdio

**Requirements:** Node.js 26 or later, pnpm 12

**Tools (14), from `docs/agent-session.md` and `docs/harnesses.md`:**

| Tool | Effect |
|---|---|
| `workspace_status` | Read only: imports, catalogue, saved drafts, pending suggestions |
| `parse_export` | Read only: preview a WhatsApp export without storing it |
| `import_export` | Stores an export from the allowed folder in the local workspace |
| `check_catalogue` | Read only: validate a price list folder |
| `load_catalogue` | Stores a price list from the allowed folder in the local workspace |
| `list_suggestions` | Read only: messages that look like orders |
| `create_draft` | Creates an order draft, recorded as `agent:<name>` |
| `revise_draft` | Proposes a change with a reason; the draft stays open |
| `list_drafts` | Read only |
| `get_draft` | Read only: a draft with evidence for every value |
| `export_orders` | Read only: exports accepted orders (CSV/JSON and experimental import files) |
| `dashboard` | Read only: metrics with stated coverage |
| `fleet_events` | Read only: bookings, changes, faults and payments for the fleet template |
| `followups` | Read only: open deliveries, complaints, payment promises and quote requests |

Not offered, by design: accept, reject, reopen, fill a form or submit.

**Licence:** MIT

**Category:** Business / productivity (alternatives, depending on the directory: data processing,
communication, finance)

**Tags:** whatsapp, orders, small-business, provenance, human-in-the-loop, local-first, sqlite,
typescript, india, hinglish

**Repository:** https://github.com/shekibahmed/ChatterPilot

**Author / maintainer:** Shekib Ahmed (GitHub: shekibahmed)

**Screenshots or media:** `docs/images/draft-review.png`, `docs/media/social/card-1280x640.png`,
`docs/media/gif/agent.gif`
