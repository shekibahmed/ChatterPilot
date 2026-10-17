import { describe, expect, it } from "vitest";
import { type ScanResult, scanExport } from "./scan.ts";

// All fixtures are synthetic and hand-authored.   = narrow no-break space, ‎ = LRM.
const chat = (...lines: string[]) => `${lines.join("\n")}\n`;

/** Every source line belongs to exactly one message or to the unattached preamble. */
function expectAllLinesAccounted(result: ScanResult) {
  let covered = result.unattached ? result.unattached.endLine - result.unattached.startLine + 1 : 0;
  let expectedNext = (result.unattached?.endLine ?? 0) + 1;
  for (const m of result.messages) {
    expect(m.startLine).toBe(expectedNext);
    covered += m.endLine - m.startLine + 1;
    expectedNext = m.endLine + 1;
  }
  expect(covered).toBe(result.lineCount);
}

describe("scanExport: formats and timestamps", () => {
  it.each([
    ["Android DMY 24h", "31/12/2024, 21:41 - Meera: Need 20 bags", "dmy", "2024-12-31T21:41:00"],
    [
      "Android MDY 12h U+202F",
      "12/31/24, 9:41 PM - Meera: Need 20 bags",
      "mdy",
      "2024-12-31T21:41:00",
    ],
    ["Android dotted DMY", "31.12.24, 21:41 - Meera: Need 20 bags", "dmy", "2024-12-31T21:41:00"],
    ["Android YMD", "2024-12-31 21:41 - Meera: Need 20 bags", "ymd", "2024-12-31T21:41:00"],
    ["Android p. m.", "31/12/24, 9:41 p. m. - Meera: Need 20 bags", "dmy", "2024-12-31T21:41:00"],
    ["iOS seconds", "[31/12/24, 9:41:05 PM] Meera: Need 20 bags", "dmy", "2024-12-31T21:41:05"],
    [
      "iOS LRM-prefixed",
      "‎[31/12/24, 9:41:05 PM] Meera: Need 20 bags",
      "dmy",
      "2024-12-31T21:41:05",
    ],
    [
      "12 AM is midnight",
      "[31/12/24, 12:05:00 AM] Meera: Need 20 bags",
      "dmy",
      "2024-12-31T00:05:00",
    ],
    ["12 PM is noon", "[31/12/24, 12:05:00 PM] Meera: Need 20 bags", "dmy", "2024-12-31T12:05:00"],
  ])("%s", (_name, line, order, local) => {
    const result = scanExport(chat(line));
    expect(result.detectedDateOrder).toBe(order);
    expect(result.messages).toHaveLength(1);
    const [m] = result.messages;
    expect(m).toMatchObject({
      localDateTime: local,
      status: "ok",
      author: "Meera",
      body: "Need 20 bags",
      kind: "text",
    });
    expectAllLinesAccounted(result);
  });

  it("keeps the timestamp exactly as written", () => {
    const [m] = scanExport(chat("12/31/24, 9:41 PM - Meera: hi")).messages;
    expect(m?.timestampText).toBe("12/31/24, 9:41 PM");
  });

  it("does not guess an ambiguous day/month order", () => {
    const text = chat("01/02/24, 10:00 - Meera: a", "03/04/24, 11:00 - Kabir: b");
    const result = scanExport(text);
    expect(result.detectedDateOrder).toBe("ambiguous");
    expect(result.appliedDateOrder).toBeNull();
    expect(result.messages.map((m) => [m.status, m.localDateTime])).toEqual([
      ["needs_date_order", null],
      ["needs_date_order", null],
    ]);
    expect(result.warnings.join(" ")).toMatch(/ambiguous/);
  });

  it("resolves an ambiguous export once the order is declared", () => {
    const text = chat("01/02/24, 10:00 - Meera: a");
    expect(scanExport(text, { dateOrder: "dmy" }).messages[0]?.localDateTime).toBe(
      "2024-02-01T10:00:00",
    );
    expect(scanExport(text, { dateOrder: "mdy" }).messages[0]?.localDateTime).toBe(
      "2024-01-02T10:00:00",
    );
  });

  it("uses one order for the whole export: a single 13 decides it", () => {
    const result = scanExport(chat("01/02/24, 10:00 - Meera: a", "13/02/24, 10:00 - Meera: b"));
    expect(result.detectedDateOrder).toBe("dmy");
    expect(result.messages[0]?.localDateTime).toBe("2024-02-01T10:00:00");
  });

  it("reports contradictory timestamps as a conflict", () => {
    const result = scanExport(chat("13/01/24, 10:00 - Meera: a", "01/13/24, 10:00 - Meera: b"));
    expect(result.detectedDateOrder).toBe("conflict");
    expect(result.messages.every((m) => m.status === "needs_date_order")).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/no single/);
  });

  it("isolates a corrupt timestamp instead of poisoning detection", () => {
    const result = scanExport(chat("31/12/24, 10:00 - Meera: a", "32/13/24, 10:00 - Meera: b"));
    expect(result.detectedDateOrder).toBe("dmy");
    expect(result.messages.map((m) => m.status)).toEqual(["ok", "invalid_timestamp"]);
  });

  it("flags impossible calendar dates and clock times", () => {
    const result = scanExport(
      chat("31/12/24, 10:00 - M: a", "30/02/24, 10:00 - M: b", "[01/12/24, 13:00:00 PM] M: c"),
    );
    expect(result.messages.map((m) => m.status)).toEqual([
      "ok",
      "invalid_timestamp",
      "invalid_timestamp",
    ]);
  });

  it("warns when a declared order contradicts the timestamps", () => {
    const result = scanExport(chat("31/12/24, 10:00 - Meera: a"), { dateOrder: "mdy" });
    expect(result.messages[0]?.status).toBe("invalid_timestamp");
    expect(result.warnings.join(" ")).toMatch(/differs/);
  });
});

describe("scanExport: message structure", () => {
  it("joins multiline messages and records their line range", () => {
    const result = scanExport(
      chat(
        "31/12/2024, 21:41 - Meera: Order for Sunrise Hardware:",
        "20 bags cement",
        "",
        "5 boxes tiles - urgent",
        "31/12/2024, 21:45 - Kabir: Noted",
      ),
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      startLine: 1,
      endLine: 4,
      body: "Order for Sunrise Hardware:\n20 bags cement\n\n5 boxes tiles - urgent",
    });
    expect(result.messages[1]).toMatchObject({ startLine: 5, endLine: 5 });
    expectAllLinesAccounted(result);
  });

  it("splits the author at the first ': ' only", () => {
    const [m] = scanExport(chat("31/12/2024, 21:41 - Meera: Rate: 240 - final")).messages;
    expect(m).toMatchObject({ author: "Meera", body: "Rate: 240 - final" });
  });

  it("keeps phone-number and ~-prefixed authors as written", () => {
    const result = scanExport(
      chat("31/12/2024, 21:41 - +91 90000 00001: hi", "[31/12/24, 9:41:05 PM] ~ Ravi: hello"),
    );
    expect(result.messages.map((m) => m.author)).toEqual(["+91 90000 00001", "~ Ravi"]);
  });

  it("reports lines before the first header instead of dropping them", () => {
    const result = scanExport(chat("Some stray text", "more", "31/12/2024, 21:41 - Meera: hi"));
    expect(result.unattached).toEqual({ startLine: 1, endLine: 2, text: "Some stray text\nmore" });
    expect(result.messages[0]?.startLine).toBe(3);
    expectAllLinesAccounted(result);
  });

  it("treats a header-like line without the separator as a continuation", () => {
    const result = scanExport(
      chat("31/12/2024, 21:41 - Meera: hi", "31/12/24 21:41 Meera typed this"),
    );
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.body).toBe("hi\n31/12/24 21:41 Meera typed this");
  });

  it("handles CRLF line endings and a byte order mark", () => {
    const result = scanExport(
      "﻿31/12/2024, 21:41 - Meera: a\r\nsecond line\r\n31/12/2024, 21:42 - Kabir: b\r\n",
    );
    expect(result.hadByteOrderMark).toBe(true);
    expect(result.messages.map((m) => m.body)).toEqual(["a\nsecond line", "b"]);
    expect(result.lineCount).toBe(3);
  });

  it("handles an empty export", () => {
    const result = scanExport("");
    expect(result).toMatchObject({ messages: [], unattached: null, lineCount: 0 });
  });

  it("warns about mixed Android and iOS formats", () => {
    const result = scanExport(
      chat("31/12/2024, 21:41 - Meera: a", "[31/12/24, 9:41:05 PM] Meera: b"),
    );
    expect(result.formats).toEqual(["android", "ios"]);
    expect(result.warnings.join(" ")).toMatch(/mixes/);
  });
});

describe("scanExport: system, media, deleted and edited messages", () => {
  it.each([
    "31/12/2024, 21:40 - Messages and calls are end-to-end encrypted. Only people in this chat can read them.",
    "31/12/2024, 21:40 - Meera added Kabir",
    '31/12/2024, 21:40 - Meera changed the subject from "Orders" to "Orders: January"',
    "31/12/2024, 21:40 - Kabir joined using this group's invite link",
    "[31/12/24, 9:40:00 PM] Sunrise Orders: ‎Messages and calls are end-to-end encrypted.",
    "[31/12/24, 9:40:00 PM] Sunrise Orders: ‎Meera added Kabir",
  ])("classifies %j as system", (line) => {
    const [m] = scanExport(chat(line)).messages;
    expect(m?.kind).toBe("system");
  });

  it("keeps system message text instead of discarding it", () => {
    const [m] = scanExport(chat("31/12/2024, 21:40 - Meera added Kabir")).messages;
    expect(m).toMatchObject({ author: null, body: "Meera added Kabir" });
  });

  it.each([
    [
      "31/12/2024, 21:41 - Meera: <Media omitted>",
      { state: "omitted", fileName: null, mediaType: "unknown" },
    ],
    [
      "[31/12/24, 9:41:05 PM] Meera: ‎image omitted",
      { state: "omitted", fileName: null, mediaType: "image" },
    ],
    [
      "[31/12/24, 9:41:05 PM] Meera: ‎audio omitted",
      { state: "omitted", fileName: null, mediaType: "audio" },
    ],
    [
      "[31/12/24, 9:41:05 PM] Meera: ‎<attached: 00000012-AUDIO-2024-12-31-21-41-05.opus>",
      {
        state: "attached",
        fileName: "00000012-AUDIO-2024-12-31-21-41-05.opus",
        mediaType: "audio",
      },
    ],
    [
      "[31/12/24, 9:41:05 PM] Meera: ‎Quote.pdf • ‎2 pages ‎<attached: 00000013-Quote.pdf>",
      { state: "attached", fileName: "00000013-Quote.pdf", mediaType: "document" },
    ],
    [
      "31/12/2024, 21:41 - Meera: IMG-20241231-WA0001.jpg (file attached)",
      { state: "attached", fileName: "IMG-20241231-WA0001.jpg", mediaType: "image" },
    ],
    [
      "31/12/2024, 21:41 - Meera: PTT-20241231-WA0002.opus (file attached)",
      { state: "attached", fileName: "PTT-20241231-WA0002.opus", mediaType: "audio" },
    ],
  ])("recognises media in %j", (line, media) => {
    const [m] = scanExport(chat(line)).messages;
    expect(m).toMatchObject({ kind: "media", media });
  });

  it("keeps an Android media caption in the body", () => {
    const [m] = scanExport(
      chat(
        "31/12/2024, 21:41 - Meera: IMG-20241231-WA0001.jpg (file attached)",
        "Tiles sample, 2x2 ft",
      ),
    ).messages;
    expect(m?.kind).toBe("media");
    expect(m?.body).toBe("IMG-20241231-WA0001.jpg (file attached)\nTiles sample, 2x2 ft");
  });

  it("recognises deleted messages", () => {
    const result = scanExport(
      chat(
        "31/12/2024, 21:41 - Meera: This message was deleted",
        "[31/12/24, 9:41:05 PM] Kabir: ‎You deleted this message.",
      ),
    );
    expect(result.messages.map((m) => m.kind)).toEqual(["deleted", "deleted"]);
  });

  it("flags edited messages without altering the body", () => {
    const [m] = scanExport(
      chat("31/12/2024, 21:41 - Meera: 25 bags not 20 <This message was edited>"),
    ).messages;
    expect(m).toMatchObject({
      kind: "text",
      edited: true,
      body: "25 bags not 20 <This message was edited>",
    });
  });

  it("does not treat a typed iOS message as system", () => {
    const [m] = scanExport(chat("[31/12/24, 9:41:05 PM] Meera: Meera added 5 more bags")).messages;
    expect(m?.kind).toBe("text");
  });
});
