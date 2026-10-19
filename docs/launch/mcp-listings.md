# MCP listings

The repository is public. The npm package `chatterpilot` is **not** published until the steps in [RELEASING.md](../../RELEASING.md) have been run. Do not submit a listing that tells people to `npx chatterpilot` before `npm view chatterpilot version` prints a version. Do not say a listing exists until it has been merged or approved.

Checked on 2026-10-19: the name `chatterpilot` was free on npm, and these directories had not listed this server.

Facts every listing should keep:

- Local-first. Stdio by default. Streamable HTTP on `127.0.0.1:4318/mcp` with `--transport http`. No hosted URL.
- Default tool profile `lite` is six read-only tools. `--profile full` is fourteen tools. No accept, reject or submit tool.
- Node.js 22.18 or later. The clone also needs pnpm 12. `npx` does not need pnpm.
- MIT. Synthetic fixtures only. Not piloted with a real business.
- Chat text in tool results is untrusted data.

## Official MCP registry

Manifest: [`server.json`](../../server.json) at the repository root (`name`: `io.github.shekibahmed/chatterpilot`). Schema: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`. Description length limit on the registry is 100 characters; the committed description is within that.

Publish the npm package first. The registry checks `mcpName` in `packages/mcp-server/package.json` against `server.json`.

```sh
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
./mcp-publisher validate
./mcp-publisher login github
./mcp-publisher publish
```

GitHub login only authorises names starting with `io.github.shekibahmed/`. Confirm with:

```sh
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.shekibahmed/chatterpilot"
```

There is no `remotes` entry. Do not add one until a public HTTPS endpoint exists.

## punkpeye/awesome-mcp-servers

Read [CONTRIBUTING.md](https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md) again on the day you open the pull request. On 2026-10-19 it asked for one server per line, alphabetical order inside the category, and a public GitHub repository you install and run yourself. Remote-only servers belong in a different list. Their note for automated agents: a pull request title ending in `🤖🤖🤖` is fast-tracked. Use that only if you are opening the pull request as an agent.

Category: `### 💬 Communication` (local service that reads a chat export). Legend marks for this server: `📇` TypeScript, `🏠` local, `🍎` `🪟` `🐧` because it is Node. Do not add a Glama badge until Glama has a page.

Line to insert in alphabetical order by `owner/repo`:

```markdown
- [shekibahmed/ChatterPilot](https://github.com/shekibahmed/ChatterPilot) 📇 🏠 🍎 🪟 🐧 - Local-first server that turns a WhatsApp chat export into order drafts where every value cites its source. The default profile is read-only; a person accepts. There is no accept or submit tool.
```

Pull request title: `Add ChatterPilot (local WhatsApp order drafts)`

Pull request body:

```markdown
Adds ChatterPilot, a local MCP server (TypeScript, MIT, stdio and streamable HTTP). It imports a WhatsApp export you choose, matches order lines to your own price list, and builds drafts where each value cites a chat span, a catalogue row or a calculation. The default profile is six read-only tools. The full profile can draft and propose edits. There is no tool to accept or submit. Early prototype, tested on synthetic data only. Not yet used by a real business.
```

One server in the pull request. Fork, branch, edit `README.md` only.

## Smithery

Smithery's publish documentation, fetched 2026-10-19 from https://smithery.ai/docs/build/publish, offers two paths:

1. **URL.** A public HTTPS server that speaks streamable HTTP. ChatterPilot does not have one. Do not submit a URL.
2. **Local MCPB bundle.** Build an `.mcpb` and publish it with `smithery mcp publish ./server.mcpb -n shekibahmed/chatterpilot`. That bundle is not built in this repository yet. Building one is a separate step (Anthropic's MCPB guide). Skip Smithery until you either host an HTTPS endpoint or produce the bundle.

[`smithery.yaml`](../../smithery.yaml) is the stdio command (`npx -y chatterpilot`) for clients that still read that file. It is not a claim that Smithery lists the server. Their older "add from GitHub" flow may still notice the file; if the dashboard offers it after the npm package exists, the paste-ready description is the long description below. Do not invent a `https://smithery.ai/server/...` link.

## Glama

Glama's own server-score page (read 2026-10-19) says public GitHub repositories are scanned at least daily, and that `glama.json` is how a maintainer is named. [`glama.json`](../../glama.json) names `shekibahmed`.

1. After the npm package exists, sign in to https://glama.ai with the GitHub user `shekibahmed`.
2. If ChatterPilot is not listed yet, use the submit control on https://glama.ai/mcp/servers and give `https://github.com/shekibahmed/ChatterPilot`.
3. Server type: local / stdio. Install command: `npx -y chatterpilot`.
4. Claim the listing with GitHub. The score page says authentication plus `glama.json` is how an author is verified.
5. Do not add a Glama badge to the README until the page exists. The badge URL is on that page, not before.

## Paste-ready fields

**Name:** ChatterPilot

**One line:** Turn a WhatsApp order export into source-linked drafts a person reviews.

**Long description:**

ChatterPilot is a local-first, MIT-licensed toolkit for shops that take orders in WhatsApp groups. The MCP server lets an agent read a workspace, preview a WhatsApp TXT export from an allowed folder, and see messages that look like orders, with a draft preview where each value cites its evidence. The default profile is read-only (six tools). `--profile full` can import an export, load the shop's price list, create an open draft and propose an edit, recorded as `agent:<name>` with a reason. There is no tool to accept, reject or submit. Unknown values stay unknown. Prices come only from the catalogue. Chat text in results is labelled untrusted. Stdio is the default. `--transport http` serves streamable HTTP on 127.0.0.1 (a non-loopback bind requires a bearer token). Data stays in a local SQLite workspace. The server makes no network calls of its own. Status: early prototype, tested on synthetic data only, not yet used by a real business.

**Install, after publish:**

```sh
npx -y chatterpilot --workspace workspaces/default --files .
```

**Install from a clone, works today:**

```sh
git clone https://github.com/shekibahmed/ChatterPilot.git && cd ChatterPilot
corepack enable && corepack prepare pnpm@12.14.0 --activate && pnpm install --frozen-lockfile
node apps/local/src/cli.ts mcp --workspace workspaces/default --files fixtures/synthetic --agent <name>
```

**Transports:** stdio (default); streamable HTTP at `http://127.0.0.1:4318/mcp`

**Requirements:** Node.js 22.18 or later. pnpm 12 only for a clone. `npx` does not need pnpm.

**Tools:**

| Profile | Tools |
|---|---|
| lite (default, all read-only) | `workspace_status`, `parse_export`, `list_suggestions`, `list_drafts`, `get_draft`, `dashboard` |
| full, added on top | `import_export`, `check_catalogue`, `load_catalogue`, `create_draft`, `revise_draft`, `export_orders`, `fleet_events`, `followups` |

Not offered: accept, reject, reopen, fill a form, submit.

**Licence:** MIT

**Category:** Communication, or business / productivity if the directory has no communication section.

**Tags:** whatsapp, orders, small-business, provenance, human-in-the-loop, local-first, sqlite, typescript

**Repository:** https://github.com/shekibahmed/ChatterPilot

**Author:** Shekib Ahmed (GitHub: shekibahmed)

**Media that exists in the repo:** `docs/media/gif/intro.gif`, `docs/media/gif/agent.gif`, `docs/images/draft-review.png`
