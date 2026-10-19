import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url).pathname;
const skill = readFileSync(
  new URL("skills/whatsapp-operations/SKILL.md", `file://${root}`),
  "utf8",
);

function usage(): string {
  try {
    execFileSync(process.execPath, ["apps/local/src/cli.ts"], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (err) {
    return String((err as { stderr?: string }).stderr ?? "");
  }
  throw new Error("CLI without arguments should print usage and exit non-zero");
}

describe("agent skill matches the real CLI", () => {
  const help = usage();

  it("has the required frontmatter", () => {
    expect(skill).toMatch(/^---\nname: whatsapp-operations\ndescription: .+\n---\n/);
  });

  it("is copied to the Claude Code skills path", () => {
    const copy = readFileSync(
      new URL(".claude/skills/whatsapp-operations/SKILL.md", `file://${root}`),
      "utf8",
    );
    expect(copy).toBe(skill);
  });

  it("only uses commands and flags that the CLI documents", () => {
    const invocations = [
      ...skill.matchAll(/pnpm chatterpilot ([a-z]+)(?: ([a-z]+))?((?: [^`\n]*)?)/g),
    ];
    expect(invocations.length).toBeGreaterThanOrEqual(8);
    for (const [, command, sub, rest] of invocations) {
      const name = sub && ["check", "load"].includes(sub) ? `${command} ${sub}` : command;
      expect(help, `"${name}" is not in the CLI usage`).toContain(`chatterpilot ${name}`);
      for (const flag of (rest ?? "").match(/--[a-z-]+/g) ?? []) {
        expect(help, `flag ${flag} of "${name}" is not in the CLI usage`).toContain(flag);
      }
    }
  });

  it("only mentions package scripts that exist", () => {
    const scripts = Object.keys(
      (JSON.parse(readFileSync(`${root}package.json`, "utf8")) as { scripts: object }).scripts,
    );
    for (const [, script] of skill.matchAll(/`pnpm ([a-z:]+)`/g)) {
      if (script === "install") continue;
      expect(scripts).toContain(script);
    }
  });
});

describe("harness configs match the real CLI", () => {
  const help = usage();
  const docs = readFileSync(new URL("docs/harnesses.md", `file://${root}`), "utf8");
  const mcpJson = readFileSync(new URL(".mcp.json", `file://${root}`), "utf8");

  it("ships a valid Claude Code project config that starts the MCP server", () => {
    const config = JSON.parse(mcpJson) as {
      mcpServers: { chatterpilot: { command: string; args: string[] } };
    };
    const { command, args } = config.mcpServers.chatterpilot;
    expect(command).toBe("node");
    expect(args[0]).toMatch(/apps\/local\/src\/cli\.ts$/);
    expect(args[1]).toBe("mcp");
    for (const flag of args.filter((a) => a.startsWith("--"))) expect(help).toContain(flag);
  });

  it("documents only flags the mcp command accepts, in parseable JSON", () => {
    const mcpUsage = help.split("\n").find((l) => l.includes("chatterpilot mcp")) ?? "";
    for (const block of docs.matchAll(/```json\n([\s\S]*?)```/g)) {
      const parsed = JSON.parse(block[1] ?? "") as Record<string, unknown>;
      expect(parsed).toBeTruthy();
    }
    for (const line of docs.split("\n").filter((l) => l.includes(" mcp "))) {
      for (const flag of line.match(/--[a-z]+/g) ?? []) expect(mcpUsage).toContain(flag);
    }
  });
});
