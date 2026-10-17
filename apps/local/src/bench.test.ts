import { scanExport } from "@chatterpilot/import-whatsapp";
import { describe, expect, it } from "vitest";
import { syntheticExport } from "./bench.ts";

describe("benchmark export generator", () => {
  it("produces a valid Android export with every message parsed", () => {
    // Early January only has days 1-12, so the order is ambiguous; the benchmark declares it.
    const scan = scanExport(syntheticExport(500), { dateOrder: "dmy" });
    expect(scan.messages).toHaveLength(500);
    expect(scan.unattached).toBeNull();
    expect(scan.appliedDateOrder).toBe("dmy");
    expect(scan.messages.every((m) => m.localDateTime !== null)).toBe(true);
  });
});
