import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseString } from "whatsapp-chat-parser";
import { scanExport } from "./scan.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/synthetic/chats/${name}`, import.meta.url), "utf8");

const FIXTURES = ["android-dmy-hardware-orders.txt", "ios-mdy-plumbing-orders.txt"];

const pad = (n: number) => String(n).padStart(2, "0");
const wallClock = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

describe("cross-check against whatsapp-chat-parser (dev-only oracle)", () => {
  it.each(FIXTURES)("%s: same messages, authors, bodies and wall-clock times", (name) => {
    const text = fixture(name);
    const ours = scanExport(text);
    const theirs = parseString(text, { daysFirst: ours.appliedDateOrder === "dmy" });
    expect(ours.messages).toHaveLength(theirs.length);
    theirs.forEach((expected, i) => {
      const actual = ours.messages[i];
      expect(actual?.author).toBe(expected.author);
      // The library keeps the file's final newline on the last message; we do not.
      expect(actual?.body).toBe(expected.message.replace(/\n$/, ""));
      expect(actual?.localDateTime).toBe(wallClock(expected.date));
    });
  });
});

describe("synthetic Android hardware-orders export", () => {
  const result = scanExport(fixture("android-dmy-hardware-orders.txt"));

  it("detects format and date order with no warnings", () => {
    expect(result).toMatchObject({ formats: ["android"], detectedDateOrder: "dmy", warnings: [] });
    expect(result.messages.every((m) => m.status === "ok")).toBe(true);
  });

  it("classifies every message", () => {
    expect(result.messages.map((m) => m.kind)).toEqual([
      "system",
      "system",
      "system",
      "text",
      "text",
      "text",
      "media",
      "text",
      "text",
      "media",
      "text",
      "media",
      "text",
      "text",
      "deleted",
    ]);
  });

  it("keeps the multiline order with its source lines", () => {
    const order = result.messages[5];
    expect(order).toMatchObject({ startLine: 6, endLine: 9, author: "Ravi Kumar" });
    expect(order?.body.split("\n")).toEqual([
      "Order for Kumar Builders site 2:",
      "40 bags cement",
      "120 sq ft tiles 2x2 white",
      "Deliver Thursday",
    ]);
  });

  it("links voice notes and images by exported file name", () => {
    expect(result.messages.flatMap((m) => (m.media ? [m.media] : []))).toEqual([
      { state: "attached", fileName: "PTT-20260112-WA0003.opus", mediaType: "audio" },
      { state: "attached", fileName: "IMG-20260113-WA0007.jpg", mediaType: "image" },
      { state: "omitted", fileName: null, mediaType: "unknown" },
    ]);
  });

  it("flags the edited correction", () => {
    expect(result.messages.filter((m) => m.edited).map((m) => m.index)).toEqual([8]);
  });
});

describe("synthetic iOS plumbing-orders export", () => {
  const result = scanExport(fixture("ios-mdy-plumbing-orders.txt"));

  it("detects format, date order and seconds", () => {
    expect(result).toMatchObject({ formats: ["ios"], detectedDateOrder: "mdy", warnings: [] });
    expect(result.messages[2]?.localDateTime).toBe("2026-01-14T09:12:44");
  });

  it("classifies system notices, media and text", () => {
    expect(result.messages.map((m) => m.kind)).toEqual([
      "system",
      "system",
      "text",
      "media",
      "text",
      "media",
      "media",
      "text",
    ]);
    expect(result.messages[5]?.media).toEqual({
      state: "attached",
      fileName: "00000006-Quote-0114.pdf",
      mediaType: "document",
    });
  });
});
