import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LITE_TOOL_NAMES } from "./mcp.ts";

const root = new URL("../../../", import.meta.url).pathname;
const bin = join(root, "packages/mcp-server/dist/chatterpilot.js");

describe("published MCP bundle", () => {
  let child: ChildProcessWithoutNullStreams | undefined;
  let nextId = 1;
  const pending = new Map<number, (msg: Record<string, unknown>) => void>();

  afterAll(() => {
    child?.kill();
  });

  it("builds, prints help, and answers tools/list on stdio with the lite profile", async () => {
    const built = spawnSync(process.execPath, ["packages/mcp-server/build.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(built.status, built.stderr).toBe(0);

    const help = spawnSync(process.execPath, [bin, "--help"], { cwd: root, encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--profile lite|full");
    expect(help.stdout).toContain("--transport stdio|http");

    const dir = mkdtempSync(join(tmpdir(), "chatterpilot-bundle-"));
    child = spawn(process.execPath, [bin, "--workspace", join(dir, "ws")], { cwd: root });
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
    const rpc = (method: string, params: unknown = {}) => {
      const id = nextId++;
      child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return new Promise<Record<string, unknown>>((resolve) => pending.set(id, resolve));
    };
    const init = await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "bundle", version: "0" },
    });
    expect(init.result).toBeDefined();
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
    const listed = (await rpc("tools/list")) as {
      result: { tools: { name: string }[] };
    };
    expect(listed.result.tools.map((tool) => tool.name)).toEqual([...LITE_TOOL_NAMES]);
    rmSync(dir, { recursive: true, force: true });
  }, 30_000);
});
