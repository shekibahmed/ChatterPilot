/**
 * Argument parsing shared by `chatterpilot mcp` and the published `npx chatterpilot` binary.
 * Stdout stays free for the stdio protocol; status goes to stderr.
 */
import { parseArgs } from "node:util";
import { type McpProfile, runMcpServer } from "./mcp.ts";
import { DEFAULT_MCP_HTTP_PORT, isLoopbackHost, startMcpHttpServer } from "./mcp-http.ts";
import { DEFAULT_WORKSPACE } from "./ops.ts";

export const MCP_USAGE = `chatterpilot mcp [--workspace <dir>] [--files <dir>] [--agent <name>] [--profile lite|full] [--transport stdio|http] [--host <addr>] [--port <n>] [--token <secret>]
      Model Context Protocol server. Default profile is lite (read-only). --profile full adds import,
      catalogue load, draft creation and draft edits. There is no accept or submit tool.
      --transport stdio (default) speaks JSON-RPC on stdin/stdout. --transport http serves streamable
      HTTP at http://<host>:<port>/mcp (default 127.0.0.1:${DEFAULT_MCP_HTTP_PORT}). A non-loopback
      --host requires --token. File arguments must stay inside --files (default: the current folder).`;

function asProfile(value: string): McpProfile | undefined {
  return value === "lite" || value === "full" ? value : undefined;
}

export async function runMcpCommand(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(MCP_USAGE);
    return 0;
  }
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: "string", default: DEFAULT_WORKSPACE },
      files: { type: "string" },
      agent: { type: "string", default: "mcp" },
      profile: { type: "string", default: "lite" },
      transport: { type: "string", default: "stdio" },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: String(DEFAULT_MCP_HTTP_PORT) },
      token: { type: "string" },
    },
  });
  const profile = asProfile(values.profile);
  if (!profile) {
    console.error("Profile must be lite or full.");
    console.error(MCP_USAGE);
    return 2;
  }
  if (values.transport !== "stdio" && values.transport !== "http") {
    console.error("Transport must be stdio or http.");
    console.error(MCP_USAGE);
    return 2;
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("Port must be an integer from 0 to 65535.");
    console.error(MCP_USAGE);
    return 2;
  }
  if (values.token === "") {
    console.error("--token needs a non-empty secret.");
    console.error(MCP_USAGE);
    return 2;
  }
  const mcp = {
    workspace: values.workspace,
    agentName: values.agent,
    profile,
    ...(values.files ? { filesRoot: values.files } : {}),
  };
  if (values.transport === "http") {
    if (!isLoopbackHost(values.host) && !values.token) {
      console.error(
        "Refusing to listen outside loopback without --token. The server can read a local workspace.",
      );
      console.error(MCP_USAGE);
      return 2;
    }
    const started = await startMcpHttpServer({
      ...mcp,
      host: values.host,
      port,
      ...(values.token ? { token: values.token } : {}),
    });
    console.error(
      `ChatterPilot MCP listening on http://${started.host}:${started.port}/mcp (${profile}).`,
    );
    await new Promise<number>(() => {});
    return 0;
  }
  await runMcpServer(mcp);
  return new Promise<number>((done) => {
    process.stdin.once("close", () => done(0));
    process.stdin.once("end", () => done(0));
  });
}
