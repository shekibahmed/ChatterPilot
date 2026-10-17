import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Workspace } from "@chatterpilot/storage";
import { loadVehicles } from "@chatterpilot/templates";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fleetEvents } from "./fleet.ts";
import { importExport } from "./import.ts";

const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
const CHAT = readFileSync(join(FIXTURES, "chats/android-fleet-ops.txt"), "utf8");
const registry = loadVehicles(readFileSync(join(FIXTURES, "fleet/vehicles.csv"), "utf8"));

let dir: string;
let ws: Workspace;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-fleet-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Fleet", timezone: "Asia/Kolkata" });
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("fleet template through the shared import core", () => {
  it("does not inflate bookings or money when a later export is imported", async () => {
    const first = join(dir, "WhatsApp Chat with Hilltop Ops.txt");
    writeFileSync(first, CHAT);
    await importExport(ws, first, { dateOrder: "dmy" });
    const before = fleetEvents(ws, registry).summary;

    const later = join(dir, "WhatsApp Chat with Hilltop Ops (1).txt");
    writeFileSync(
      later,
      `${CHAT}07/02/2026, 10:00 - Dispatch (Hilltop Travels): BK-1023 booking request: 2 buses for school trip\n`,
    );
    const outcome = await importExport(ws, later, { dateOrder: "dmy" });
    expect(outcome.status === "imported" && outcome.summary.overlap).toEqual({
      new: 1,
      duplicate: 15,
      uncertain: 0,
    });

    const after = fleetEvents(ws, registry).summary;
    expect(before.bookings.map((b) => [b.ref, b.status])).toEqual([
      ["BK-1021", "confirmed"],
      ["BK-1022", "cancelled"],
    ]);
    expect(after.bookings.map((b) => [b.ref, b.status])).toEqual([
      ["BK-1021", "confirmed"],
      ["BK-1022", "cancelled"],
      ["BK-1023", "requested"],
    ]);
    expect([after.quotedMinor, after.reportedPaidMinor]).toEqual([
      before.quotedMinor,
      before.reportedPaidMinor,
    ]);
    expect(after.eventsByType.payment_report).toBe(2);
  });
});
