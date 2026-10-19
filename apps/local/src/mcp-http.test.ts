import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Workspace } from "@chatterpilot/storage";
import { afterAll, describe, expect, it } from "vitest";
import { LITE_TOOL_NAMES } from "./mcp.ts";
import { runMcpCommand } from "./mcp-cli.ts";
import { startMcpHttpServer } from "./mcp-http.ts";

const ROOT = new URL("../../../", import.meta.url).pathname;

async function readRpc(response: Response): Promise<Record<string, unknown>> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await response.json()) as Record<string, unknown>;
  const text = await response.text();
  const data = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0);
  const last = data.at(-1);
  if (!last) throw new Error(`No JSON-RPC payload in ${type}: ${text}`);
  return JSON.parse(last) as Record<string, unknown>;
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("MCP streamable HTTP", () => {
  let url = "";
  let close: () => Promise<void> = async () => {};

  afterAll(async () => {
    await close();
  });

  it("lists only the read-only lite tools, then the same list with a bearer token", async () => {
    const started = await startMcpHttpServer({
      workspace: join(tmpdir(), "missing-on-purpose"),
      profile: "lite",
      host: "127.0.0.1",
      port: 0,
    });
    url = `http://127.0.0.1:${started.port}/mcp`;
    close = started.close;

    const init = await post(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "chatterpilot-http-test", version: "0" },
      },
    });
    expect(init.status).toBe(200);
    const session = init.headers.get("mcp-session-id");
    expect(session).toBeTruthy();
    const initialized = await readRpc(init);
    expect(initialized).toMatchObject({ id: 1 });

    const noted = await post(
      url,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { "mcp-session-id": session ?? "" },
    );
    expect(noted.status).toBe(202);

    const listed = await post(
      url,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { "mcp-session-id": session ?? "" },
    );
    expect(listed.status).toBe(200);
    const body = (await readRpc(listed)) as {
      result: { tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] };
    };
    const tools = body.result.tools;
    expect(tools.map((tool) => tool.name)).toEqual([...LITE_TOOL_NAMES]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.some((tool) => /accept|approve|reject|fill|submit/.test(tool.name))).toBe(false);

    await close();
    const token = "test-token-not-a-secret";
    const locked = await startMcpHttpServer({
      workspace: join(tmpdir(), "missing-on-purpose"),
      host: "127.0.0.1",
      port: 0,
      token,
    });
    close = locked.close;
    const lockedUrl = `http://127.0.0.1:${locked.port}/mcp`;
    const denied = await post(lockedUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "chatterpilot-http-test", version: "0" },
      },
    });
    expect(denied.status).toBe(401);
    const allowed = await post(
      lockedUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "chatterpilot-http-test", version: "0" },
        },
      },
      { authorization: `Bearer ${token}` },
    );
    expect(allowed.status).toBe(200);
  });

  it("refuses a public bind with no token", async () => {
    expect(await runMcpCommand(["--transport", "http", "--host", "0.0.0.0", "--port", "0"])).toBe(
      2,
    );
  });
});

describe("MCP lite profile over stdio", () => {
  let dir = "";
  let child: ChildProcessWithoutNullStreams;
  let nextId = 1;
  const pending = new Map<number, (msg: Record<string, unknown>) => void>();

  function rpc(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve) => pending.set(id, resolve));
  }

  afterAll(() => {
    child?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("is the default, and --profile full is what exposes the write tools", async () => {
    dir = mkdtempSync(join(tmpdir(), "chatterpilot-lite-"));
    Workspace.create(join(dir, "ws"), { name: "Lite", timezone: "Asia/Kolkata" }).close();
    child = spawn(
      process.execPath,
      ["apps/local/src/cli.ts", "mcp", "--workspace", join(dir, "ws"), "--agent", "lite"],
      { cwd: ROOT },
    );
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) {
          const msg = JSON.parse(line) as { id?: number };
          if (typeof msg.id === "number") pending.get(msg.id)?.(msg as Record<string, unknown>);
        }
        nl = buffer.indexOf("\n");
      }
    });
    await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "lite", version: "0" },
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
    const listed = (await rpc("tools/list")) as {
      result: { tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] };
    };
    expect(listed.result.tools.map((tool) => tool.name)).toEqual([...LITE_TOOL_NAMES]);
    expect(listed.result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });
});
