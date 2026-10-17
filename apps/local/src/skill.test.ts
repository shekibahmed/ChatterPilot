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
