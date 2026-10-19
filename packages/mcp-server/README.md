# chatterpilot

Local MCP server. It turns a WhatsApp chat export into order drafts where every value cites the
message or catalogue row it came from. A person accepts a draft; this server has no accept or
submit tool.

This package is the server only. The review app, demo and tests live in the
[ChatterPilot](https://github.com/shekibahmed/ChatterPilot) repository. Nothing in that repository
has been piloted with a real business. Fixtures there are synthetic.

Not published until the maintainer tags a release. See `RELEASING.md` in the repository.

## Run

Requires Node.js 22.18 or later. `npx` installs `better-sqlite3`, which has its own prebuilds.

```sh
npx chatterpilot --workspace workspaces/default --files .
```

That speaks MCP on stdin/stdout. The default tool profile is `lite` (read-only). Add
`--profile full` for import, catalogue load and draft edits.

Streamable HTTP, for a client that cannot use stdio (loopback only unless you pass `--token`):

```sh
npx chatterpilot --transport http --port 4318
```

The endpoint is `http://127.0.0.1:4318/mcp`.

MIT © 2026 Shekib Ahmed.
