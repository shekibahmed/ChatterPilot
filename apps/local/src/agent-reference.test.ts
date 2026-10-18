import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorsMarkdown, findErrorCodes, listTools, toolsJson } from "./agent-reference.ts";

const ROOT = new URL("../../../", import.meta.url).pathname;
const regenerate = "out of date: run node apps/local/src/agent-reference.ts";

describe("machine-readable references for agents", () => {
  it("docs/agents/tools.json is the MCP server's own tool list, with no accept or submit tool", async () => {
    const tools = await listTools();
    // Compared as data: the formatter may re-wrap the committed file.
    expect(
      JSON.parse(readFileSync(join(ROOT, "docs/agents/tools.json"), "utf8")),
      regenerate,
    ).toEqual(JSON.parse(toolsJson(tools)));
    for (const tool of tools) expect(tool.name).not.toMatch(/accept|reject|submit|fill|approve/);
  }, 20_000);

  it("docs/agents/errors.md lists every error code the CLI and MCP tools can return", () => {
    const codes = findErrorCodes();
    expect(codes.map((c) => c.code)).toEqual(
      expect.arrayContaining(["nothing_accepted", "outside_root", "date_order_required", "review"]),
    );
    expect(readFileSync(join(ROOT, "docs/agents/errors.md"), "utf8"), regenerate).toBe(
      errorsMarkdown(codes),
    );
  });
});
