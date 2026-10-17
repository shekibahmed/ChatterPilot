import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Workspace } from "@chatterpilot/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allowedPath } from "./mcp.ts";

const ROOT = new URL("../../../", import.meta.url).pathname;
const FIXTURES = join(ROOT, "fixtures/synthetic");

let dir: string;
let files: string;
let child: ChildProcessWithoutNullStreams;
let nextId = 1;
const pending = new Map<number, (msg: Record<string, unknown>) => void>();

function rpc(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve) => pending.set(id, resolve));
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = (await rpc("tools/call", { name, arguments: args })) as {
    result: {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: { text: string }[];
    };
  };
  return res.result;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-mcp-"));
  files = join(dir, "files");
  cpSync(FIXTURES, files, { recursive: true });
  Workspace.create(join(dir, "ws"), { name: "MCP test", timezone: "Asia/Kolkata" }).close();
  child = spawn(
    process.execPath,
    [
      "apps/local/src/cli.ts",
      "mcp",
      "--workspace",
      join(dir, "ws"),
      "--files",
      files,
      "--agent",
      "test",
    ],
    {
      cwd: ROOT,
    },
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
  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "chatterpilot-test", version: "0" },
  });
  expect(init.result).toBeDefined();
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
}, 30_000);

afterAll(() => {
  child?.kill();
  rmSync(dir, { recursive: true, force: true });
});

describe("MCP server over stdio", () => {
  it("lists the tools with honest hints, and no accept or form-filling tool", async () => {
    const res = (await rpc("tools/list")) as {
      result: { tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] };
    };
    const tools = res.result.tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "workspace_status",
        "parse_export",
        "import_export",
        "list_suggestions",
        "create_draft",
        "revise_draft",
        "get_draft",
        "export_orders",
        "dashboard",
      ]),
    );
    expect(names.some((n) => /accept|approve|reject|fill|submit/.test(n))).toBe(false);
    const hint = (n: string) => tools.find((t) => t.name === n)?.annotations?.readOnlyHint;
    expect([
      hint("list_suggestions"),
      hint("get_draft"),
      hint("import_export"),
      hint("revise_draft"),
    ]).toEqual([true, true, false, false]);
  });

  it("refuses files outside the allowed folder", async () => {
    const res = await call("parse_export", { path: "../../../etc/passwd" });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/Only files inside|not found/);
  });

  it("lets an agent import, preview, draft and propose an edit; a person still has to accept", async () => {
    expect((await call("load_catalogue", { dir: "catalogue" })).isError).toBeFalsy();
    const imported = await call("import_export", { path: "chats/android-dmy-hardware-orders.txt" });
    expect(imported.structuredContent).toMatchObject({ status: "imported" });

    const suggested = (await call("list_suggestions")).structuredContent as {
      suggestions: { messageId: string; text: string }[];
    };
    const order = suggested.suggestions.find((s) => s.text.startsWith("Order for Kumar Builders"));
    expect(order).toBeDefined();

    const created = (await call("create_draft", { messageIds: [order?.messageId] }))
      .structuredContent as {
      record: { id: string; status: string; createdBy: string };
    };
    expect(created.record).toMatchObject({ status: "open", createdBy: "agent:test" });

    const revised = (
      await call("revise_draft", {
        draftId: created.record.id,
        reason: "Customer corrected to 45 bags in a later message",
        change: { action: "set_line", line: 0, field: "quantity", value: "45" },
      })
    ).structuredContent as {
      record: { status: string };
      draft: { lines: { quantity: { evidence: { kind: string; reviewer?: string }[] } }[] };
    };
    expect(revised.record.status).toBe("open");
    expect(revised.draft.lines[0]?.quantity.evidence[0]).toMatchObject({
      kind: "human",
      reviewer: "agent:test",
    });

    const exported = (await call("export_orders", { format: "csv" })).structuredContent as {
      content: string;
    };
    expect(exported.content.trim().split("\r\n")).toHaveLength(1); // header only: nothing accepted
  });

  it("reports errors as tool results the agent can read", async () => {
    const res = await call("get_draft", { draftId: "does-not-exist" });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toBe("Draft not found.");
  });
});

describe("allowedPath", () => {
  it("rejects symlinks that escape the allowed folder", () => {
    const base = mkdtempSync(join(tmpdir(), "chatterpilot-root-"));
    symlinkSync("/etc", join(base, "escape"));
    expect(() => allowedPath(base, "escape/hostname")).toThrow(/Only files inside/);
    rmSync(base, { recursive: true, force: true });
  });
});
