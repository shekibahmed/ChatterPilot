/**
 * The walkthrough, chapter by chapter. Mirrors the browser test (apps/local/e2e/demo.spec.ts) so the
 * video shows behaviour that the test suite checks. Captions come from storyboard.json by index.
 */
import { readFileSync } from "node:fs";
import type { Page } from "playwright";
import type { Ui } from "./overlay.ts";

export interface Storyboard {
  intro: { title: string; subtitle: string; cards: { heading: string; line: string }[] };
  chapters: { id: string; title: string; captions: { at: string; text: string }[] }[];
  outro: { title: string; lines: string[] };
  benefits: { heading: string; body: string; proof: string }[];
  readmeBlurb: string;
  socialHooks: string[];
}

export const STORYBOARD: Storyboard = JSON.parse(
  readFileSync(new URL("./storyboard.json", import.meta.url), "utf8"),
) as Storyboard;

export interface AppChapter {
  id: string;
  run(page: Page, ui: Ui, say: (index: number) => Promise<void>): Promise<void>;
}

/** Chapters recorded in the review app, in order (the agent chapter is a terminal replay). */
export const APP_CHAPTERS: AppChapter[] = [
  {
    id: "01-overview",
    async run(page, ui, say) {
      await page.getByRole("heading", { name: /source-linked drafts/ }).waitFor();
      await ui.pause(500);
      await ui.moveTo(page.getByRole("heading", { name: /source-linked drafts/ }));
      await say(0);
      await ui.moveTo(page.getByText("chat exports imported"));
      await say(1);
      await ui.type(page.getByLabel("Reviewer name"), "Anita");
      await say(2);
    },
  },
  {
    id: "02-imports",
    async run(page, ui, say) {
      await ui.click(page.getByRole("link", { name: "Imports", exact: true }));
      await say(0);
      await ui.click(page.getByRole("link", { name: "android-dmy-hardware-orders.txt" }));
      await page.getByText("Order for Kumar Builders site 2:").waitFor();
      await say(1);
      await ui.moveTo(page.getByText("lines 6–9"));
      await say(2);
    },
  },
  {
    id: "03-draft",
    async run(page, ui, say) {
      await ui.click(page.getByRole("link", { name: "Orders", exact: true }));
      await say(0);
      const order = page.locator(".suggestion", { hasText: "Order for Kumar Builders" });
      await ui.moveTo(order);
      await say(1);
      await ui.click(order.getByRole("button", { name: "Draft order" }));
      await page.getByTestId("draft-total").waitFor();
      await ui.moveTo(page.getByTestId("draft-total"));
      await say(2);
      await ui.moveTo(page.getByText("No open issues"));
      await say(3);
    },
  },
  {
    id: "04-provenance",
    async run(page, ui, say) {
      const chips = page.getByTestId("line-0").getByRole("button", { name: "Chat line 7" });
      await ui.moveTo(page.getByTestId("line-0"));
      await say(0);
      await ui.click(chips.nth(0));
      await page.locator("mark").first().waitFor();
      await ui.scrollTo(page.locator("mark").first());
      await say(1);
      await ui.click(chips.nth(1));
      await ui.scrollTo(page.locator("mark").first());
      await say(2);
    },
  },
  {
    id: "05-correction",
    async run(page, ui, say) {
      const select = page.getByLabel("Message to link");
      await ui.moveTo(select);
      await select.selectOption({
        label: "line 12: Sorry make it 45 bags cement <This message was edited>",
      });
      await say(0);
      await ui.type(page.getByLabel("Link reason"), "Customer corrected cement to 45 bags");
      await say(1);
      await ui.click(page.getByRole("button", { name: "Link" }));
      await page
        .getByTestId("line-2")
        .getByText(/45 bags cement/)
        .first()
        .waitFor();
      await ui.type(page.getByLabel("Reason for line 1"), "Superseded by the correction");
      await ui.click(page.getByTestId("line-0").getByRole("button", { name: "Exclude" }));
      await page.getByTestId("draft-total").getByText("INR 30,979.20").waitFor();
      await ui.moveTo(page.getByTestId("draft-total"));
      await say(2);
      await ui.click(page.getByRole("button", { name: "Accept order" }));
      await page.getByText("Accepted and frozen").waitFor();
      await ui.moveTo(page.getByText("Accepted and frozen"));
      await say(3);
    },
  },
  {
    id: "06-export",
    async run(page, ui, say) {
      await ui.click(page.getByRole("link", { name: "Export", exact: true }));
      await say(0);
      const download = page.waitForEvent("download");
      await ui.click(page.getByRole("link", { name: "Download CSV" }));
      await download;
      await say(1);
      const zoho = page.locator(".panel").filter({ hasText: "Zoho Books" });
      await ui.click(zoho.getByRole("button", { name: "Prepare file" }));
      await zoho
        .getByRole("link", { name: /Download chatterpilot-sales-orders-zoho\.csv/ })
        .waitFor();
      await say(2);
      const tally = page.locator(".panel").filter({ hasText: "Tally Prime" });
      await ui.click(tally.getByRole("button", { name: "Prepare file" }));
      await tally
        .getByText(/export-map\.json/)
        .last()
        .waitFor();
      await ui.moveTo(tally.getByText(/export-map\.json/).last());
      await say(3);
    },
  },
  {
    id: "07-dashboard",
    async run(page, ui, say) {
      await ui.click(page.getByRole("link", { name: "Dashboard", exact: true }));
      await page.getByTestId("coverage").waitFor();
      await ui.moveTo(page.getByTestId("coverage"));
      await say(0);
      await say(1);
      await ui.moveTo(page.getByTestId("comparison"));
      await say(2);
      const bar = page.getByRole("button", { name: /2026-01-12: INR 30,979.20 from 1 order/ });
      await ui.moveTo(bar);
      await bar.hover();
      await say(3);
    },
  },
  {
    id: "08-followups",
    async run(page, ui, say) {
      await ui.click(page.getByRole("link", { name: "Follow-ups", exact: true }));
      await page.getByTestId("open-followups").waitFor();
      await say(0);
      await ui.moveTo(page.getByTestId("open-followups").getByText("Meera Shah").first());
      await say(1);
      const verified = page.getByText(/Neither is a verified payment/);
      await ui.moveTo(verified);
      await say(2);
      await say(3);
    },
  },
];

export interface SessionStep {
  title: string;
  call: string;
  result: string;
  error: boolean;
  caption?: string;
  hold?: number;
}

/** Turns docs/agent-session.md (a real recorded MCP session) into terminal steps. */
export function parseAgentSession(markdown: string): { tools: number; steps: SessionStep[] } {
  const tools = Number(/offers (\d+) tools/.exec(markdown)?.[1] ?? 0);
  const steps: SessionStep[] = [];
  const sections = markdown.split(/^### /m).slice(1);
  for (const section of sections) {
    const title = (section.split("\n")[0] ?? "").trim();
    const blocks = [...section.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1] ?? "");
    if (blocks.length < 2) continue;
    const call = JSON.parse(blocks[0] ?? "{}") as { tool: string; arguments: object };
    const resultText = (blocks[1] ?? "").replace(/\n… \(trimmed\)$/, "");
    let compact: string;
    try {
      compact = JSON.stringify(JSON.parse(resultText));
    } catch {
      compact = resultText.replace(/\s+/g, " ");
    }
    if (compact.length > 230) compact = `${compact.slice(0, 227)}…`;
    const args = JSON.stringify(call.arguments);
    steps.push({
      title: title.replace(/^\d+\.\s*/, ""),
      call: `${call.tool}(${args === "{}" ? "" : args})`,
      result: compact,
      error: /"isError":true|"error":/.test(compact),
    });
  }
  return { tools, steps };
}
