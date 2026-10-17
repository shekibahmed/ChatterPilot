import { readFileSync } from "node:fs";
import { scanExport } from "@chatterpilot/import-whatsapp";
import { describe, expect, it } from "vitest";
import { extractFollowups, linkFollowups, summariseFollowups } from "./followups.ts";

const msg = (id: string, body: string, author = "A", at = "2026-02-02T10:00:00") => ({
  id,
  author,
  localDateTime: at,
  startLine: 1,
  body,
});
const kinds = (body: string) => extractFollowups(msg("m", body)).map((i) => i.kind);

describe("extractFollowups", () => {
  it.each([
    ["40 bags cement abhi tak nahi aaya", ["delivery_chase"]],
    ["where is my cement order?", ["delivery_chase"]],
    ["5 bags short in yesterday's delivery", ["complaint"]],
    ["2 box tiles toot gaye", ["complaint"]],
    ["wrong size elbow aaya hai", ["complaint"]],
    ["payment kal kar dunga", ["payment_promise"]],
    ["payment done 15000 via upi", ["payment_report"]],
    ["rate batao 8mm rod ka", ["quote_request"]],
    ["mil gaya, thanks", ["resolution"]],
    ["received only 35, 5 short", ["complaint"]],
    ["40 bags cement bhej do", []],
    ["good morning", []],
  ])("%j → %j", (body, expected) => {
    expect(kinds(body)).toEqual(expected);
  });

  it("cites the trigger and the amount, and keeps promised and reported money apart", () => {
    const [promise] = extractFollowups(msg("p", "payment kal kar dunga 18,450"));
    expect(promise?.amount).toMatchObject({ value: 1845000, status: "ok" });
    expect(promise?.amount.evidence[0]).toMatchObject({ kind: "message", text: "18,450" });
    expect(promise?.due.value).toBe("kal");
    const [report] = extractFollowups(msg("r", "paid"));
    expect(report?.amount).toMatchObject({ value: null, status: "unknown" });
  });
});

describe("synthetic follow-ups chat", () => {
  const text = readFileSync(
    new URL("../../../fixtures/synthetic/chats/android-followups.txt", import.meta.url),
    "utf8",
  );
  const items = linkFollowups(
    scanExport(text, { dateOrder: "dmy" }).messages.flatMap((m) =>
      extractFollowups({
        id: `L${m.startLine}`,
        author: m.author,
        localDateTime: m.localDateTime,
        startLine: m.startLine,
        body: m.body,
      }),
    ),
  );
  const summary = summariseFollowups(items);

  it("links the repeat chase and the closing message, marked for review", () => {
    const resolution = items.find((i) => i.kind === "resolution");
    expect(resolution?.links).toEqual([
      {
        type: "resolves",
        itemId: "L1#0",
        strength: "needs_review",
        basis: "closing message from the same person within 7 days",
      },
    ]);
    expect(items.find((i) => i.messageId === "L3")?.links[0]).toMatchObject({
      type: "repeat_of",
      itemId: "L1#0",
    });
  });

  it("lists what is still open, with age and repeats, and never sums promises with payments", () => {
    expect(summary.open.map((o) => [o.kind, o.author, o.ageHours, o.repeats])).toEqual([
      ["complaint", "Shah Interiors", 42, 0],
      ["quote_request", "Ravi (synthetic)", 17, 0],
      ["delivery_chase", "Shah Interiors", 0, 0],
    ]);
    expect(summary).toMatchObject({
      resolved: 1,
      promisedMinor: 1845000,
      reportedPaidMinor: 1845000,
    });
  });
});
