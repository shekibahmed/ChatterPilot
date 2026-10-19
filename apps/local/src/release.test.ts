import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_SERVER_VERSION } from "./mcp.ts";

const root = new URL("../../../", import.meta.url).pathname;

describe("publish metadata stays aligned", () => {
  it("matches the package, the registry manifest and the running server version", () => {
    const pkg = JSON.parse(readFileSync(`${root}packages/mcp-server/package.json`, "utf8")) as {
      name: string;
      version: string;
      mcpName: string;
      license: string;
      private?: boolean;
      bin: { chatterpilot: string };
      dependencies: Record<string, string>;
    };
    const server = JSON.parse(readFileSync(`${root}server.json`, "utf8")) as {
      name: string;
      description: string;
      version: string;
      packages: {
        identifier: string;
        version: string;
        transport: { type: string };
      }[];
      remotes?: unknown;
    };
    expect(pkg.name).toBe("chatterpilot");
    expect(pkg.private).toBeUndefined();
    expect(pkg.license).toBe("MIT");
    expect(pkg.version).toBe(MCP_SERVER_VERSION);
    expect(pkg.mcpName).toBe(server.name);
    expect(pkg.mcpName).toBe("io.github.shekibahmed/chatterpilot");
    expect(pkg.bin.chatterpilot).toBe("./dist/chatterpilot.js");
    expect(pkg.dependencies["better-sqlite3"]).toBeTruthy();
    expect(server.version).toBe(pkg.version);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.description.length).toBeGreaterThan(0);
    expect(server.remotes).toBeUndefined();
    expect(server.packages.map((item) => item.transport.type)).toEqual([
      "stdio",
      "streamable-http",
    ]);
    for (const item of server.packages) {
      expect(item.identifier).toBe(pkg.name);
      expect(item.version).toBe(pkg.version);
    }
  });
});
