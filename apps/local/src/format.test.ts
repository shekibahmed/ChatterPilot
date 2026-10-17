import { describe, expect, it } from "vitest";
import { terminalSafe } from "./format.ts";

describe("terminalSafe", () => {
  it("neutralises ANSI escapes and control characters", () => {
    expect(terminalSafe("ok\u001b[2J\u0007done")).toBe("ok�[2J�done");
  });

  it("shows line breaks and truncates", () => {
    expect(terminalSafe("a\nb")).toBe("a ⏎ b");
    expect(terminalSafe("abcdefghij", 5)).toBe("abcd…");
  });
});
