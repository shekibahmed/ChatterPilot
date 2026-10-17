/**
 * Reproducible performance check on a synthetic export: `pnpm bench [messages]` (default 100000).
 * Generates an Android-format chat in a temporary folder, then times import, identical re-import,
 * status, suggestions with preview drafts and the dashboard. Nothing leaves the machine.
 */
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dashboardData,
  importFile,
  initWorkspace,
  loadCatalogue,
  suggestDrafts,
  workspaceStatus,
} from "./ops.ts";

const BODIES = [
  "40 bags cement pls",
  "white tiles 10 box, ivory tiles 4 box",
  "payment done 15000",
  "ok",
  "do bori rockset bhej dena",
  "kal tak 2 ton sand",
  "rate kya hai 8mm rod",
  "<Media omitted>",
  "Order for Kumar Builders site 2:\n40 bags cement\n120 sq ft tiles 2x2 white",
  "thanks bhai",
  "40 bags ultrabond cement\nmake it 45",
];
const PEOPLE = ["Ravi (synthetic)", "Anita (synthetic)", "Kumar Builders", "Shah Interiors"];

export function syntheticExport(messages: number): string {
  const lines: string[] = [];
  let t = Date.UTC(2025, 0, 1, 3, 30);
  for (let i = 0; i < messages; i++) {
    t += 60_000 * (1 + ((i * 7) % 9));
    const d = new Date(t);
    const two = (n: number) => String(n).padStart(2, "0");
    const hour = d.getUTCHours() % 12 || 12;
    const ampm = d.getUTCHours() >= 12 ? "pm" : "am";
    const stamp = `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}, ${hour}:${two(d.getUTCMinutes())} ${ampm}`;
    lines.push(`${stamp} - ${PEOPLE[i % PEOPLE.length]}: ${BODIES[(i * 13) % BODIES.length]}`);
  }
  return `${lines.join("\n")}\n`;
}

async function timed<T>(label: string, run: () => Promise<T> | T): Promise<T> {
  const start = performance.now();
  const result = await run();
  const ms = performance.now() - start;
  console.log(
    `${label.padEnd(34)} ${(ms / 1000).toFixed(2).padStart(7)} s   heap ${(process.memoryUsage().heapUsed / 2 ** 20).toFixed(0)} MB`,
  );
  return result;
}

async function main() {
  const messages = Number(process.argv[2] ?? 100_000);
  const dir = mkdtempSync(join(tmpdir(), "chatterpilot-bench-"));
  try {
    const file = join(dir, "WhatsApp Chat with Bench.txt");
    writeFileSync(file, syntheticExport(messages));
    console.log(
      `Synthetic export: ${messages} messages, ${(statSync(file).size / 2 ** 20).toFixed(1)} MB; Node ${process.version}`,
    );
    const workspace = join(dir, "ws");
    initWorkspace({ workspace, timezone: "Asia/Kolkata", name: "bench" });
    await loadCatalogue({
      workspace,
      dir: new URL("../../../fixtures/synthetic/catalogue", import.meta.url).pathname,
    });
    await timed("import", () => importFile({ workspace, file, dateOrder: "dmy" }));
    await timed("identical re-import", () => importFile({ workspace, file, dateOrder: "dmy" }));
    await timed("status (counts suggestions)", () => workspaceStatus(workspace));
    const s = await timed("suggestions with preview drafts", () => suggestDrafts(workspace));
    await timed("dashboard", () => dashboardData(workspace, "accepted"));
    console.log(
      `${s.length} suggested messages; workspace ${(statSync(join(workspace, "workspace.db")).size / 2 ** 20).toFixed(0)} MB`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
