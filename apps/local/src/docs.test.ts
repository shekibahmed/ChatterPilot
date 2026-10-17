import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url).pathname;

function files(dir: string, test: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full, test) : test(name) ? [full] : [];
  });
}

const testSources = [
  ...files(join(root, "packages"), (n) => n.endsWith(".test.ts")),
  ...files(join(root, "apps"), (n) => /\.(test|spec)\.ts$/.test(n)),
]
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const docs = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "AGENTS.md",
  ...readdirSync(join(root, "docs"))
    .filter((n) => n.endsWith(".md"))
    .map((n) => `docs/${n}`),
];

describe("documentation stays true to the code", () => {
  it("quotes only test names that exist (patterns guide)", () => {
    const text = readFileSync(join(root, "docs/patterns.md"), "utf8");
    const proofs = text
      .split("\n**Proof.**")
      .slice(1)
      .map((p) => p.split("\n## ")[0] ?? "");
    const names = proofs.flatMap((p) =>
      [...p.replace(/\n/g, " ").matchAll(/"([^"]{12,})"/g)].map((m) => m[1] ?? ""),
    );
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) expect(testSources, `test "${name}" not found`).toContain(name);
  });

  it("links only to files that exist", () => {
    for (const doc of docs) {
      const text = readFileSync(join(root, doc), "utf8");
      for (const [, target = ""] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/i.test(target)) continue;
        const path = resolve(dirname(join(root, doc)), target);
        expect(existsSync(path), `${doc} links to missing ${target}`).toBe(true);
      }
    }
  });
});
