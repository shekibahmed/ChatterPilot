import { readFileSync } from "node:fs";
import { scanExport } from "@chatterpilot/import-whatsapp";
import { describe, expect, it } from "vitest";
import {
  extractFleetEvents,
  type FleetEvent,
  type FleetMessage,
  linkFleetEvents,
  loadVehicles,
  summariseFleet,
} from "./fleet.ts";

const fixture = (path: string) =>
  readFileSync(new URL(`../../../fixtures/synthetic/${path}`, import.meta.url), "utf8");
const registry = loadVehicles(fixture("fleet/vehicles.csv"));

function eventsFrom(text: string): FleetEvent[] {
  const messages: FleetMessage[] = scanExport(text, { dateOrder: "dmy" })
    .messages.filter((m) => m.kind === "text")
    .map((m) => ({
      id: `m${m.index}`,
      author: m.author,
      localDateTime: m.localDateTime,
      startLine: m.startLine,
      body: m.body,
    }));
  return linkFleetEvents(messages.flatMap((m) => extractFleetEvents(m, registry)));
}

const msg = (
  body: string,
  author = "Imran (Driver)",
  time = "2026-02-03T09:40:00",
): FleetMessage => ({
  id: "x",
  author,
  localDateTime: time,
  startLine: 1,
  body,
});

describe("fleet template on the synthetic operations chat", () => {
  it("has ambiguous dates, so the day/month order must be declared", () => {
    expect(scanExport(fixture("chats/android-fleet-ops.txt")).detectedDateOrder).toBe("ambiguous");
  });

  const events = eventsFrom(fixture("chats/android-fleet-ops.txt"));
  const byId = new Map(events.map((e) => [e.id, e]));
  const summary = summariseFleet(events);

  it("loads the vehicle registry with a content version", () => {
    expect(registry.issues).toEqual([]);
    expect(registry.vehicles.map((v) => v.registration)).toEqual(["BUS-07", "AB-12", "TT-03"]);
    expect(registry.version).toMatch(/^[0-9a-f]{16}$/);
  });

  it("extracts zero, one or several events per message", () => {
    expect(events.map((e) => [e.messageId, e.type])).toEqual([
      ["m1", "booking_request"],
      ["m2", "booking_confirmation"],
      ["m3", "fault_report"],
      ["m3", "repair_quote"],
      ["m5", "payment_report"],
      ["m6", "booking_change"],
      ["m7", "booking_request"],
      ["m8", "booking_cancellation"],
      ["m9", "fault_report"],
      ["m10", "repair_quote"],
      ["m11", "repair_done"],
      ["m12", "payment_report"],
      ["m13", "booking_confirmation"],
    ]);
  });

  it("keeps one booking per reference through changes and cancellations", () => {
    expect(summary.bookings).toEqual([
      { ref: "BK-1021", status: "confirmed", eventIds: ["m1#0", "m2#0", "m6#0", "m13#0"] },
      { ref: "BK-1022", status: "cancelled", eventIds: ["m7#0", "m8#0"] },
    ]);
    expect(byId.get("m6#0")?.relations).toEqual([
      {
        type: "update_of",
        eventId: "m1#0",
        strength: "supported",
        basis: "same booking reference BK-1021",
      },
    ]);
    expect(byId.get("m8#0")?.relations[0]).toMatchObject({ type: "cancels", eventId: "m7#0" });
  });

  it("links a fault and its quote from the same message, without creating an expense", () => {
    const quote = byId.get("m3#1");
    expect(quote?.amount.value).toEqual({ minor: 240000, kind: "quoted", text: "2,400" });
    expect(quote?.vehicle.value).toEqual({ vehicleId: "V-BUS07", registration: "BUS-07" });
    expect(quote?.relations).toEqual([
      {
        type: "quote_for",
        eventId: "m3#0",
        strength: "supported",
        basis: "fault and quote in the same message",
      },
    ]);
  });

  it("proposes, but does not assert, the link for 'Paid 2,400 for that repair'", () => {
    const payment = byId.get("m5#0");
    expect(payment?.amount.value).toEqual({ minor: 240000, kind: "reported_paid", text: "2,400" });
    expect(payment?.vehicle.value).toBeNull();
    expect(payment?.relations).toEqual([
      {
        type: "payment_for",
        eventId: "m3#1",
        strength: "needs_review",
        basis: "same amount, same person, within 48 hours; no vehicle named",
      },
    ]);
  });

  it("does not link an unrelated payment (diesel) to a repair quote", () => {
    const diesel = byId.get("m12#0");
    expect(diesel?.relations).toEqual([]);
    expect(diesel?.notes).toEqual([
      "Payment not linked to a quote: no open quote with this vehicle and amount.",
    ]);
  });

  it("tracks fault resolution per vehicle", () => {
    expect(summary.faults).toEqual([
      { eventId: "m3#0", vehicle: "BUS-07", status: "open" },
      { eventId: "m9#0", vehicle: "AB-12", status: "resolved" },
    ]);
    expect(byId.get("m10#0")?.relations[0]).toMatchObject({
      type: "quote_for",
      eventId: "m9#0",
      strength: "needs_review",
    });
  });

  it("keeps quoted and reported-paid money apart", () => {
    expect(summary.quotedMinor).toBe(240000 + 315000);
    expect(summary.reportedPaidMinor).toBe(240000 + 115000);
  });

  it("cites the message span and registry row for a vehicle", () => {
    expect(byId.get("m9#0")?.vehicle.evidence).toEqual([
      {
        kind: "message",
        messageId: "m9",
        startLine: 10,
        endLine: 10,
        span: { start: 0, end: 5 },
        text: "AB-12",
      },
      {
        kind: "catalogue",
        catalogueVersion: registry.version,
        table: "vehicles",
        recordId: "V-AB12",
        row: 3,
        column: "registration",
      },
    ]);
  });
});

describe("fleet template edge cases", () => {
  it("draws no time-based links when message times are unknown", () => {
    const quote = extractFleetEvents(
      { ...msg("BUS-07 tyre issue, quoted 2,400"), localDateTime: null },
      registry,
    );
    const pay = extractFleetEvents(
      { ...msg("Paid 2,400 for that repair"), id: "y", localDateTime: null },
      registry,
    );
    expect(linkFleetEvents([...quote, ...pay]).at(-1)?.relations).toEqual([]);
  });

  it("does not link a payment that names no vehicle or repair", () => {
    const quote = extractFleetEvents(msg("BUS-07 tyre issue, quoted 2,400"), registry);
    const pay = extractFleetEvents(
      { ...msg("Paid 2,400 today", "Imran (Driver)", "2026-02-03T10:00:00"), id: "y" },
      registry,
    );
    const linked = linkFleetEvents([...quote, ...pay]);
    expect(linked.at(-1)?.relations).toEqual([]);
  });

  it("does not link a payment by someone else or days later", () => {
    const quote = extractFleetEvents(msg("BUS-07 tyre issue, quoted 2,400"), registry);
    const other = extractFleetEvents(
      { ...msg("Paid 2,400 for that repair", "Owner", "2026-02-03T10:00:00"), id: "y" },
      registry,
    );
    expect(linkFleetEvents([...quote, ...other]).at(-1)?.relations).toEqual([]);
    const late = extractFleetEvents(
      { ...msg("Paid 2,400 for that repair", "Imran (Driver)", "2026-02-08T10:00:00"), id: "z" },
      registry,
    );
    expect(linkFleetEvents([...quote, ...late]).at(-1)?.relations).toEqual([]);
  });

  it("marks a change without an earlier request", () => {
    const [change] = linkFleetEvents(
      extractFleetEvents(msg("BK-2000 shifted to Monday"), registry),
    );
    expect(change?.type).toBe("booking_change");
    expect(change?.notes).toEqual(["No earlier request for this booking in the imported chats."]);
  });

  it("ignores chatter without vehicles, bookings or amounts", () => {
    expect(extractFleetEvents(msg("Approved, thanks"), registry)).toEqual([]);
    expect(extractFleetEvents(msg("Bus is very clean today"), registry)).toEqual([]);
  });

  it("matches registrations written with spaces or without the dash", () => {
    const [a] = extractFleetEvents(msg("ab 12 has a leak"), registry);
    const [b] = extractFleetEvents(msg("AB12 overheating"), registry);
    expect([a?.vehicle.value?.vehicleId, b?.vehicle.value?.vehicleId]).toEqual([
      "V-AB12",
      "V-AB12",
    ]);
  });

  it("reports registry problems", () => {
    expect(
      loadVehicles("vehicle_id,registration\nV1,AB-1\nV1,AB-2\nV3,\n").issues.map((i) => i.row),
    ).toEqual([3, 4]);
    expect(loadVehicles("id,reg\n").issues[0]?.message).toContain("vehicle_id and registration");
  });
});
