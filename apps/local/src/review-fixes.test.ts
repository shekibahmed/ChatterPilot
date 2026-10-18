import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv } from "@chatterpilot/core";
import { Workspace } from "@chatterpilot/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importExport } from "./import.ts";
import {
  createDraft,
  decide,
  exportCsv,
  loadCatalogueIntoWorkspace,
  ReviewError,
  suggestions,
} from "./review.ts";

const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
let dir: string;
let ws: Workspace;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-fixes-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Test", timezone: "Asia/Kolkata" });
  await loadCatalogueIntoWorkspace(ws, join(FIXTURES, "catalogue"));
  await importExport(ws, join(FIXTURES, "chats/android-dmy-hardware-orders.txt"));
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof ReviewError ? err.message : `unexpected: ${String(err)}`;
  }
  return "no error";
};

describe("review: one message, one live draft", () => {
  it("refuses the same message twice in one draft", () => {
    const [m] = suggestions(ws);
    expect(refusal(() => createDraft(ws, [m?.id ?? "", m?.id ?? ""], "Anita"))).toBe(
      "The same message was chosen twice.",
    );
  });

  it("refuses a message that is already in another draft, until that draft is rejected", () => {
    const [m, other] = suggestions(ws);
    const first = createDraft(ws, [m?.id ?? ""], "Anita");
    expect(refusal(() => createDraft(ws, [m?.id ?? ""], "Anita"))).toBe(
      "This message is already part of another order draft.",
    );
    const second = createDraft(ws, [other?.id ?? ""], "Anita");
    expect(
      refusal(() =>
        decide(
          ws,
          second.record.id,
          { action: "link_message", messageId: m?.id ?? "" },
          "Anita",
          "x",
        ),
      ),
    ).toBe("This message is already part of another order draft.");
    decide(ws, first.record.id, { action: "reject" }, "Anita", "Wrong customer");
    expect(createDraft(ws, [m?.id ?? ""], "Anita").record.status).toBe("open");
  });

  it("refuses messages that repeat an earlier export", async () => {
    const path = join(dir, "WhatsApp Chat with Copy.txt");
    writeFileSync(path, "12/01/26, 10:04 am - Ravi Kumar: 40 bags cement for Kumar Builders\n");
    await importExport(ws, path, { dateOrder: "dmy" });
    const later = join(dir, "WhatsApp Chat with Copy (1).txt");
    writeFileSync(
      later,
      "12/01/26, 10:04 am - Ravi Kumar: 40 bags cement for Kumar Builders\n12/01/26, 10:05 am - Ravi Kumar: thanks\n",
    );
    await importExport(ws, later, { dateOrder: "dmy" });
    const repeat = ws.db.prepare("SELECT id FROM message WHERE duplicate_of IS NOT NULL").get() as {
      id: string;
    };
    expect(refusal(() => createDraft(ws, [repeat.id], "Anita"))).toMatch(
      /repeats one from an earlier export/,
    );
  });
});

describe("review: suggestions and exports", () => {
  it("does not suggest payments, deliveries or quotes as orders", async () => {
    const path = join(dir, "WhatsApp Chat with Mixed.txt");
    writeFileSync(
      path,
      [
        "14/01/26, 10:00 am - Ravi: Delivered 40 bags cement today",
        "14/01/26, 10:01 am - Ravi: Paid 16400 for 40 bags cement, thanks",
        "14/01/26, 10:02 am - Anita: Quote: 40 bags cement at 410 per bag",
        "14/01/26, 10:03 am - Ravi: Need 20 bags cement for Kumar Builders",
        "",
      ].join("\n"),
    );
    await importExport(ws, path);
    const mixed = suggestions(ws).filter((m) => m.sourceName.includes("Mixed"));
    expect(mixed.map((m) => m.body)).toEqual(["Need 20 bags cement for Kumar Builders"]);
  });

  it("lists a reviewer's customer choice in the CSV human_edits column", () => {
    const correction = suggestions(ws).find((m) => m.body.startsWith("Sorry make it 45"));
    const view = createDraft(ws, [correction?.id ?? ""], "Anita");
    decide(
      ws,
      view.record.id,
      { action: "set_customer", customerId: "KB-01" },
      "Anita",
      "Phone call with Ravi",
    );
    decide(ws, view.record.id, { action: "accept" }, "Anita", undefined);
    const parsed = parseCsv(exportCsv(ws));
    if (!parsed.ok) throw new Error("bad csv");
    const [header, row] = parsed.rows;
    expect(row?.[header?.indexOf("human_edits") ?? -1]).toBe("Anita: Phone call with Ravi");
  });
});
