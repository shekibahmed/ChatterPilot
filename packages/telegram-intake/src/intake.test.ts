import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Workspace } from "@chatterpilot/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  callbackData,
  type IntakePolicy,
  intakeGapWarning,
  processUpdate,
  type TgUpdate,
} from "./intake.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/synthetic/telegram/${name}`, import.meta.url), "utf8");
const UPDATES = fixture("updates.jsonl")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as TgUpdate);
const POLICY = JSON.parse(fixture("policy.json")) as IntakePolicy;
const NOW = new Date("2026-01-12T12:00:00Z");
const DRAFT = "00000000-0000-4000-8000-000000000001";
const SNAPSHOT = "abcdefabcdef".padEnd(64, "0");
const resolver = { acceptedSnapshot: (id: string) => (id === DRAFT ? SNAPSHOT : null) };

let dir: string;
let ws: Workspace;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-intake-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Intake", timezone: "Asia/Kolkata" });
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

const runAll = (updates = UPDATES) =>
  updates.map((u) => processUpdate(ws.intake, u, POLICY, resolver, NOW));

describe("offline Telegram intake on synthetic updates", () => {
  it("classifies every update", () => {
    expect(runAll().map((r) => [r.updateId, r.outcome, "reason" in r ? r.reason : ""])).toEqual([
      [5001, "accepted", ""],
      [5002, "possible_repeat", ""],
      [5003, "refused", "sender is not allowlisted"],
      [5004, "refused", "chat is not allowlisted"],
      [5005, "media_only", ""],
      [5006, "edit", ""],
      [5007, "refused", "no human sender"],
      [5008, "accepted", ""],
      [5009, "callback", "sender is not an approver"],
      [5010, "callback", "unrecognised button data"],
      [5001, "duplicate_update", ""],
    ]);
  });

  it("flags a re-forward of the same order instead of creating a second order", () => {
    const [first, second] = runAll();
    expect(second).toMatchObject({
      outcome: "possible_repeat",
      repeatOf: first && "envelopeId" in first ? first.envelopeId : "",
    });
  });

  it("keeps an edit as a new version linked to the original", () => {
    const results = runAll();
    const original = results[0];
    const edit = results[5];
    expect(edit).toMatchObject({
      outcome: "edit",
      editOf: original && "envelopeId" in original ? original.envelopeId : "",
    });
    const versions = ws.intake.envelopes().filter((e) => e.messageId === 71);
    expect(versions.map((v) => [v.status, v.text.includes("45 bags")])).toEqual([
      ["accepted", false],
      ["edit", true],
    ]);
  });

  it("does not keep content from refused updates", () => {
    runAll();
    const texts = ws.intake
      .envelopes()
      .map((e) => e.text)
      .join("\n");
    expect(texts).not.toContain("500 bags");
    expect(ws.intake.logEntries().map((l) => [l.updateId, l.outcome])).toEqual([
      [5003, "refused"],
      [5004, "refused"],
      [5007, "refused"],
      [5009, "callback_refused"],
      [5010, "callback_refused"],
    ]);
  });

  it("stores injected instructions as plain data and grants nothing", () => {
    runAll();
    const injected = ws.intake.envelopes().find((e) => e.updateId === 5008);
    expect(injected?.status).toBe("accepted");
    expect(injected?.text).toContain("Ignore previous instructions");
    expect(ws.intake.logEntries().some((l) => l.outcome === "callback_valid")).toBe(false);
  });

  it("survives a restart: the offset is durable and replays are ignored", () => {
    runAll(UPDATES.slice(0, 4));
    const path = ws.dir;
    ws.close();
    ws = Workspace.open(path);
    expect(ws.intake.offset()).toBe(5004);
    const replay = runAll(UPDATES.slice(0, 6));
    expect(replay.map((r) => r.outcome)).toEqual([
      "duplicate_update",
      "duplicate_update",
      "duplicate_update",
      "duplicate_update",
      "media_only",
      "edit",
    ]);
  });

  it("accepts an approval button only from an approver and only for the exact accepted version", () => {
    const valid = processUpdate(
      ws.intake,
      {
        update_id: 6001,
        callback_query: { id: "a", from: { id: 111001 }, data: callbackData(DRAFT, SNAPSHOT) },
      },
      POLICY,
      resolver,
      NOW,
    );
    expect(valid).toMatchObject({ outcome: "callback", valid: true, draftId: DRAFT });
    const stale = processUpdate(
      ws.intake,
      {
        update_id: 6002,
        callback_query: {
          id: "b",
          from: { id: 111001 },
          data: callbackData(DRAFT, "f".repeat(64)),
        },
      },
      POLICY,
      resolver,
      NOW,
    );
    expect(stale).toMatchObject({
      valid: false,
      reason: "draft changed since the button was sent",
    });
    const notAccepted = processUpdate(
      ws.intake,
      {
        update_id: 6003,
        callback_query: {
          id: "c",
          from: { id: 111001 },
          data: callbackData("00000000-0000-4000-8000-000000000009", SNAPSHOT),
        },
      },
      POLICY,
      resolver,
      NOW,
    );
    expect(notAccepted).toMatchObject({ valid: false, reason: "draft is not accepted" });
  });

  it("warns about possible gaps beyond Telegram's 24-hour retention", () => {
    expect(intakeGapWarning(null, NOW)).toBeNull();
    expect(intakeGapWarning("2026-01-11T13:00:00Z", NOW)).toBeNull();
    expect(intakeGapWarning("2026-01-10T12:00:00Z", NOW)).toMatch(/48 hours.*at most 24 hours/);
  });
});
