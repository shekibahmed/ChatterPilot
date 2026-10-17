import { describe, expect, it } from "vitest";
import { type IncomingItem, reconcileSequences, type StoredItem } from "./align.ts";

// Compact helpers: "a@10:01" = fingerprint "a" at 2026-01-01T10:01.
const at = (spec: string) => {
  const [fingerprint = "", time = ""] = spec.split("@");
  return { fingerprint, time: `2026-01-01T${time}:00` };
};
const stored = (...specs: string[]): StoredItem[] =>
  specs.map((s, i) => ({ id: `s${i}`, ...at(s) }));
const incoming = (...specs: string[]): IncomingItem[] => specs.map(at);
const statuses = (s: StoredItem[], i: IncomingItem[]) =>
  reconcileSequences(s, i).map((r) => (r.status === "duplicate" ? `dup:${r.of}` : r.status));

describe("reconcileSequences", () => {
  it("treats a later export that repeats history as duplicates plus new messages", () => {
    expect(
      statuses(
        stored("a@10:00", "b@10:01", "c@10:02"),
        incoming("a@10:00", "b@10:01", "c@10:02", "d@10:03", "e@10:04"),
      ),
    ).toEqual(["dup:s0", "dup:s1", "dup:s2", "new", "new"]);
  });

  it("handles a backfill (older export imported after a newer one)", () => {
    expect(
      statuses(stored("c@10:02", "d@10:03"), incoming("a@10:00", "b@10:01", "c@10:02")),
    ).toEqual(["new", "new", "dup:s0"]);
  });

  it("keeps genuine repeats: two identical messages in one minute stay two", () => {
    expect(
      statuses(
        stored("ok@10:00", "ok@10:00"),
        incoming("ok@10:00", "ok@10:00", "ok@10:00", "x@10:05"),
      ),
    ).toEqual(["dup:s0", "dup:s1", "new", "new"]);
  });

  it("does not merge the same text at different times", () => {
    expect(statuses(stored("ok@10:00"), incoming("ok@10:00", "ok@10:30"))).toEqual([
      "dup:s0",
      "new",
    ]);
  });

  it("flags edited or reordered messages inside the overlap as uncertain instead of dropping them", () => {
    expect(
      statuses(
        stored("a@10:00", "b@10:01", "c@10:02", "d@10:03"),
        incoming("a@10:00", "b-edited@10:01", "c@10:02", "d@10:03", "e@10:04"),
      ),
    ).toEqual(["dup:s0", "uncertain", "dup:s2", "dup:s3", "new"]);
  });

  it("treats messages later in the stored export's last minute as new", () => {
    expect(
      statuses(stored("a@10:00", "b@10:05"), incoming("a@10:00", "b@10:05", "c@10:05")),
    ).toEqual(["dup:s0", "dup:s1", "new"]);
  });

  it("everything is new without a shared time window", () => {
    expect(statuses(stored("a@09:00"), incoming("a@10:00", "b@10:01"))).toEqual(["new", "new"]);
    expect(statuses([], incoming("a@10:00"))).toEqual(["new"]);
  });
});
