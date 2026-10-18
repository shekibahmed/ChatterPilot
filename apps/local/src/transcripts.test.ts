import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv } from "@chatterpilot/core";
import { Workspace } from "@chatterpilot/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importExport } from "./import.ts";
import {
  addTranscript,
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
let voiceId: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-transcripts-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Test", timezone: "Asia/Kolkata" });
  await loadCatalogueIntoWorkspace(ws, join(FIXTURES, "catalogue"));
  await importExport(ws, join(FIXTURES, "chats/android-dmy-hardware-orders.txt"));
  voiceId = (
    ws.db
      .prepare("SELECT id FROM message WHERE media_file_name = 'PTT-20260112-WA0003.opus'")
      .get() as { id: string }
  ).id;
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("person-supplied transcripts of voice notes", () => {
  it("makes a transcribed voice note draftable, with transcript provenance", () => {
    expect(suggestions(ws).some((m) => m.id === voiceId)).toBe(false);
    addTranscript(ws, {
      messageId: voiceId,
      text: "For Kumar Builders, also 5 boxes white tiles please",
      by: "Anita",
      language: "en",
    });
    expect(suggestions(ws).some((m) => m.id === voiceId)).toBe(true);

    const view = createDraft(ws, [voiceId], "Anita");
    const qty = view.draft.lines[0]?.quantity.evidence[0];
    expect(qty).toMatchObject({
      kind: "transcript",
      messageId: voiceId,
      origin: "manual",
      startLine: 10,
      text: "5 boxes white tiles",
    });
    expect(view.draft.lines[0]?.amount.value).toBe(416000);

    decide(ws, view.record.id, { action: "accept" }, "Anita", undefined);
    const parsed = parseCsv(exportCsv(ws));
    if (!parsed.ok) throw new Error("bad csv");
    const [header, row] = parsed.rows;
    expect(row?.[header?.indexOf("chat_source") ?? -1]).toBe(
      "android-dmy-hardware-orders.txt line 10 (voice note, manual transcript): 5 boxes white tiles",
    );
  });

  it("keeps every version and drafts from the latest", () => {
    addTranscript(ws, { messageId: voiceId, text: "40 bags cement", by: "Anita" });
    const second = addTranscript(ws, {
      messageId: voiceId,
      text: "For Shah Interiors 45 bags cement",
      by: "Ravi",
      note: "Listened again",
    });
    expect(second.version).toBe(2);
    expect(ws.transcripts.versions(voiceId).map((t) => [t.version, t.createdBy])).toEqual([
      [1, "Anita"],
      [2, "Ravi"],
    ]);
    const view = createDraft(ws, [voiceId], "Anita");
    expect(view.draft.lines[0]?.quantity.value?.milli).toBe(45000);
    expect(() => ws.db.prepare("UPDATE transcript SET text = 'forged'").run()).toThrow(/versioned/);
  });

  it("only accepts transcripts for voice-note messages", () => {
    const image = ws.db
      .prepare("SELECT id FROM message WHERE media_file_name = 'IMG-20260113-WA0007.jpg'")
      .get() as { id: string };
    expect(() => addTranscript(ws, { messageId: image.id, text: "x", by: "Anita" })).toThrow(
      ReviewError,
    );
    const [text] = suggestions(ws);
    expect(() => addTranscript(ws, { messageId: text?.id ?? "", text: "x", by: "Anita" })).toThrow(
      ReviewError,
    );
  });
});
