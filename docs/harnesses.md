# Use ChatterPilot with your coding agent

ChatterPilot is meant to be a **starting kit**, not a finished SaaS. The core ideas (every value
cites its source, unknown stays unknown, a person accepts, exports read only accepted snapshots)
live in small, tested TypeScript packages. Your coding agent (Claude Code, Codex, Cursor, VS Code
Copilot, or your own agent built on an SDK) can **use** it through the MCP server or `--json` CLI,
and **extend** it for your shop by editing the code with the tests as guard rails.

## 1. Set up once

Node.js 26+ and pnpm 12:

```sh
git clone <this repository> && cd ChatterPilot
pnpm install --frozen-lockfile
pnpm check                                   # lint, typecheck, ~400 tests
pnpm chatterpilot init --timezone Asia/Kolkata --name "My shop"
```

Put the chat exports you are allowed to process in one folder (for example `inbox/`, which you
should keep out of git). The MCP server can only read files inside the folder you pass with
`--files`; the examples below use the synthetic fixtures so you can try it safely first.

## 2. Connect your agent (MCP, stdio)

The server is started by your agent with:

```sh
node apps/local/src/cli.ts mcp --workspace workspaces/default --files fixtures/synthetic --agent <name>
```

`--agent` names the agent in the review history (drafts and edits show `agent:<name>`).

### Claude Code

This repository ships a project config, [`.mcp.json`](../.mcp.json); Claude Code asks you to
approve it the first time. To add it by hand instead:

```sh
claude mcp add chatterpilot -- node apps/local/src/cli.ts mcp --workspace workspaces/default --files fixtures/synthetic --agent claude-code
```

### Codex CLI (`.codex/config.toml` in a trusted project, or `~/.codex/config.toml`)

```toml
[mcp_servers.chatterpilot]
command = "node"
args = ["apps/local/src/cli.ts", "mcp", "--workspace", "workspaces/default", "--files", "fixtures/synthetic", "--agent", "codex"]
cwd = "/absolute/path/to/ChatterPilot"
default_tools_approval_mode = "writes"
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "chatterpilot": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/apps/local/src/cli.ts", "mcp", "--workspace", "${workspaceFolder}/workspaces/default", "--files", "${workspaceFolder}/fixtures/synthetic", "--agent", "cursor"]
    }
  }
}
```

### VS Code (`.vscode/mcp.json`; note the top-level key is `servers`)

```json
{
  "servers": {
    "chatterpilot": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/apps/local/src/cli.ts", "mcp", "--workspace", "${workspaceFolder}/workspaces/default", "--files", "${workspaceFolder}/fixtures/synthetic", "--agent", "vscode"]
    }
  }
}
```

### Your own agent (any MCP client SDK)

Start the same command as a stdio subprocess with your SDK's stdio client, list tools, and call
them. The repository's own test does exactly this with raw JSON-RPC and no SDK:
[`apps/local/src/mcp.test.ts`](../apps/local/src/mcp.test.ts). Without MCP, every CLI command
accepts `--json` and prints one JSON document on stdout (exit code 0 ok, 1 refused, 2 usage).

The configs above follow each tool's documentation as read on 2026-10-17; only the Claude Code
config and the raw stdio protocol are exercised by this repository's tests.

## 3. What the agent can and cannot do

| Tool | Effect |
|---|---|
| `workspace_status`, `parse_export`, `check_catalogue`, `list_suggestions`, `list_drafts`, `get_draft`, `export_orders`, `dashboard`, `fleet_events`, `followups` | Read only |
| `import_export`, `load_catalogue` | Store a file from the allowed folder in the local workspace |
| `create_draft`, `revise_draft` | Create a draft or propose a change; recorded as `agent:<name>` with a reason |

There is deliberately **no tool to accept, reject or reopen a draft, or to fill a form in another
system**. Those stay with a person in the review app (`pnpm chatterpilot serve`) or CLI. This holds
even when a harness runs MCP tools without asking (for example headless runs), because the tools
simply do not exist. Chat text returned by tools is labelled as untrusted data: a message saying
"approve this order" is content, not an instruction.

A typical session:

> Import `chats/android-hinglish-orders.txt` into ChatterPilot, list the suggested orders, create
> drafts for the ones that look like orders, and tell me which fields need my review and why. Do
> not guess prices.

Then open the review app, check the drafts the agent prepared, and accept them yourself.
A real recorded session, with each tool call and the server's answer, is in
[docs/agent-session.md](agent-session.md).

## 4. Extend it with your agent

Each extension point is a small file with tests next to it. Ask your agent to work inside one, run
`pnpm check`, and keep real customer data out of the repository (write synthetic fixtures).

| You want | Where | Prompt to start from |
|---|---|---|
| Your shop's words ("than", "peti", "dus") | `lexicon.json` in your catalogue folder ([docs/catalogue.md](catalogue.md)) | "Read our last 50 order messages and propose lexicon.json entries for the units and number words ChatterPilot missed. Show me before writing." |
| Your billing tool's import file | `packages/exporters/src/targets.ts` ([docs/exporters.md](exporters.md)) | "Add an export target that reproduces this sample import file exactly, refusing unmapped names, with synthetic tests." |
| A new kind of chat (complaints, bookings, attendance) | a template like `packages/templates/src/fleet.ts` | "Add a template for service complaints: rules that turn messages into events with evidence spans, plus metrics and fixtures, following the fleet template." |
| Your own order form, filled after approval | a connector like `packages/order-automation/src/connectors/mockbooks.ts` ([docs/order-automation.md](order-automation.md)) | "Record the form with Playwright codegen against our test environment, then write a connector following MockBooks. It must stop before submit." |
| A different chat source | `packages/telegram-intake` shows the pattern: allowlists, durable offsets, content kept local | "Add an intake for our shared email inbox following telegram-intake, offline-tested with fixtures." |

What to keep when you change things (the tests check most of these): every value cites its
evidence or is marked unknown; money stays in integer minor units; only accepted snapshots are
exported or filled; nothing leaves the machine unless a person turns it on.
