import { chmodSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../../apps/local/src/mcp-bin.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: new URL("./dist/chatterpilot.js", import.meta.url).pathname,
  external: ["better-sqlite3", "playwright", "yauzl"],
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
  legalComments: "none",
});
chmodSync(new URL("./dist/chatterpilot.js", import.meta.url), 0o755);
