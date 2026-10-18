import { describe, expect, it } from "vitest";
import { recordSession } from "./agent-session.ts";

describe("recorded agent session (docs/agent-session.md)", () => {
  it("still runs, and still shows that an agent cannot accept or export unaccepted orders", async () => {
    const md = await recordSession();
    expect(md).toContain('"createdBy": "agent:demo-agent"');
    expect(md).toContain('"reviewer": "agent:demo-agent"');
    expect(md).toContain("Tool accept_draft not found");
    expect(md).toContain("No accepted orders to export yet.");
  }, 30_000);
});
