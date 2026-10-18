import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Workspace } from "@chatterpilot/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { draftFor, readCatalogueDir, suggestOrderMessages } from "./drafts.ts";
import { importExport } from "./import.ts";

const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;

let dir: string;
let ws: Workspace;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-drafts-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Test", timezone: "Asia/Kolkata" });
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("suggestOrderMessages", () => {
  it("suggests only messages with catalogue products, across imports", async () => {
    await importExport(ws, join(FIXTURES, "chats/android-dmy-hardware-orders.txt"));
    await importExport(ws, join(FIXTURES, "chats/ios-mdy-plumbing-orders.txt"));
    const { catalogue } = readCatalogueDir(join(FIXTURES, "catalogue"));
    if (!catalogue) throw new Error("catalogue failed to load");

    const candidates = suggestOrderMessages(ws, catalogue);
    // Order, correction, new enquiry (Android) and the plumbing order (iOS). Quotes, payments,
    // deliveries, system and media messages are not suggested.
    expect(candidates.map((c) => [c.sourceName, c.message.startLine])).toEqual([
      ["android-dmy-hardware-orders.txt", 6],
      ["android-dmy-hardware-orders.txt", 12],
      ["android-dmy-hardware-orders.txt", 18],
      ["ios-mdy-plumbing-orders.txt", 3],
    ]);
    const first = candidates[0];
    if (!first) throw new Error("no candidates");
    expect(draftFor(first, catalogue).total.value).toBe(2835520);
  });
});
