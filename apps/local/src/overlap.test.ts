import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Workspace } from "@chatterpilot/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importExport } from "./import.ts";
import { dashboard, loadCatalogueIntoWorkspace, suggestions } from "./review.ts";

const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
const ANDROID = readFileSync(join(FIXTURES, "chats/android-dmy-hardware-orders.txt"), "utf8");
const LINES = ANDROID.trimEnd().split("\n");
const EXTRA = [
  "16/01/26, 9:00 am - Ravi Kumar: Need 20 more bags cement for site 2",
  "16/01/26, 9:05 am - Anita (Sunrise Hardware): Noted",
];
const NAME = "WhatsApp Chat with Sunrise Hardware Orders";

let dir: string;
let ws: Workspace;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-overlap-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Test", timezone: "Asia/Kolkata" });
  await loadCatalogueIntoWorkspace(ws, join(FIXTURES, "catalogue"));
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

async function importLines(fileName: string, lines: string[], chat?: string) {
  const path = join(dir, fileName);
  writeFileSync(path, `${lines.join("\n")}\n`);
  const outcome = await importExport(ws, path, chat ? { chat } : {});
  if (outcome.status !== "imported") throw new Error("expected a new import");
  return outcome.summary;
}

const canonicalCount = () =>
  (
    ws.db.prepare("SELECT COUNT(*) AS n FROM message WHERE duplicate_of IS NULL").get() as {
      n: number;
    }
  ).n;

describe("re-importing overlapping exports of the same chat", () => {
  it("counts repeated history once and adds only new messages", async () => {
    const first = await importLines(`${NAME}.txt`, LINES);
    expect(first.overlap).toEqual({ new: 15, duplicate: 0, uncertain: 0 });
    const later = await importLines(`${NAME} (1).txt`, [...LINES, ...EXTRA]);
    expect(later.chatKey).toBe("sunrise hardware orders");
    expect(later.overlap).toEqual({ new: 2, duplicate: 15, uncertain: 0 });
    expect(canonicalCount()).toBe(17);
    // Suggestions are not duplicated: the three original order messages plus the new one.
    expect(suggestions(ws).map((m) => m.startLine)).toEqual([6, 12, 18, 20]);
  });

  it("handles a partial export that starts mid-history", async () => {
    await importLines(`${NAME}.txt`, LINES);
    const partial = await importLines(`${NAME} (2).txt`, [...LINES.slice(12), ...EXTRA]);
    // Lines 13-19 hold 6 messages (one with a caption line), all already stored.
    expect(partial.overlap).toEqual({ new: 2, duplicate: 6, uncertain: 0 });
  });

  it("handles a backfill: the older export imported after the newer one", async () => {
    await importLines(`${NAME}.txt`, [...LINES.slice(12), ...EXTRA]);
    const older = await importLines(`${NAME} (4).txt`, LINES.slice(0, 14));
    // Lines 1-14 hold 10 messages: lines 13-14 (one message) overlap, 9 are earlier history.
    expect(older.overlap).toEqual({ new: 9, duplicate: 1, uncertain: 0 });
    expect(canonicalCount()).toBe(17);
  });

  it("keeps both versions of an edited message and flags them for review", async () => {
    await importLines(`${NAME}.txt`, LINES);
    const edited = LINES.map((l) => l.replace("make it 45 bags", "make it 46 bags"));
    const second = await importLines(`${NAME} (1).txt`, edited);
    expect(second.overlap).toEqual({ new: 0, duplicate: 14, uncertain: 1 });
    expect(second.warnings.join(" ")).toMatch(/both versions are kept/);
    expect(canonicalCount()).toBe(16);
  });

  it("never merges messages across chats, but warns when a file looks renamed", async () => {
    await importLines(`${NAME}.txt`, LINES);
    const other = await importLines("Sunrise backup copy.txt", [...LINES, ...EXTRA]);
    expect(other.overlap).toEqual({ new: 17, duplicate: 0, uncertain: 0 });
    expect(other.warnings.join(" ")).toContain(
      '15 of 17 messages already exist in the chat "sunrise hardware orders"',
    );
  });

  it("treats a same-named export from a different period as new", async () => {
    await importLines(`${NAME}.txt`, LINES);
    const later = LINES.map((l) => l.replace(/^1(\d)\/01\/26/, "2$1/02/26"));
    const other = await importLines(`${NAME} (3).txt`, later);
    expect(other.overlap).toEqual({ new: 15, duplicate: 0, uncertain: 0 });
  });

  it("lets the user name the chat when file names differ", async () => {
    await importLines("orders-jan.txt", LINES, "Sunrise orders");
    const second = await importLines(
      "orders-jan-later.txt",
      [...LINES, ...EXTRA],
      "Sunrise orders",
    );
    expect(second.overlap).toEqual({ new: 2, duplicate: 15, uncertain: 0 });
  });

  it("does not double-count dashboard activity", async () => {
    await importLines(`${NAME}.txt`, LINES);
    await importLines(`${NAME} (1).txt`, [...LINES, ...EXTRA]);
    const activity = dashboard(ws, "accepted").activity.value;
    expect(activity.map((d) => [d.date, d.messages])).toEqual([
      // Text messages only (system, media and deleted messages are not counted).
      ["2026-01-12", 5],
      ["2026-01-13", 1],
      ["2026-01-14", 0],
      ["2026-01-15", 2],
      ["2026-01-16", 2],
    ]);
  });

  it("upgrades workspaces created before fingerprints existed", async () => {
    await importLines(`${NAME}.txt`, LINES);
    ws.db.exec("UPDATE message SET fingerprint = ''; UPDATE import_batch SET chat_key = ''");
    const path = ws.dir;
    ws.close();
    ws = Workspace.open(path);
    const second = await importLines(`${NAME} (1).txt`, [...LINES, ...EXTRA]);
    expect(second.overlap).toEqual({ new: 2, duplicate: 15, uncertain: 0 });
  });
});
