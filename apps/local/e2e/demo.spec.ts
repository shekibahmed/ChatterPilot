import { expect, test } from "@playwright/test";

const BASE = "http://127.0.0.1:4320";
const SCREENSHOTS = process.env.CHATTERPILOT_SCREENSHOTS === "1";
const shot = new URL("../../../docs/images/", import.meta.url).pathname;

test("demo: review a chat order end to end without any outbound request", async ({ page }) => {
  const outbound: string[] = [];
  page.on("request", (req) => {
    if (!req.url().startsWith(BASE) && !req.url().startsWith("data:")) outbound.push(req.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /source-linked drafts/ })).toBeVisible();
  await expect(page.getByText("chat exports imported")).toBeVisible();
  await page.getByLabel("Reviewer name").fill("Anita");
  if (SCREENSHOTS) await page.screenshot({ path: `${shot}overview.png` });

  // Imports show coverage and the untouched source text with line numbers.
  await page.getByRole("link", { name: "Imports", exact: true }).click();
  await page.getByRole("link", { name: "android-dmy-hardware-orders.txt" }).click();
  await expect(page.getByText("Order for Kumar Builders site 2:")).toBeVisible();
  await expect(page.getByText("lines 6–9")).toBeVisible();

  // Suggestions → draft.
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  const order = page.locator(".suggestion", { hasText: "Order for Kumar Builders" });
  await order.getByRole("button", { name: "Draft order" }).click();
  await expect(page.getByTestId("draft-total")).toHaveText("INR 28,355.20");
  await expect(page.getByText("No open issues")).toBeVisible();

  // Provenance: clicking a chat chip highlights the exact words in the source message.
  const chips = page.getByTestId("line-0").getByRole("button", { name: "Chat line 7" });
  await chips.nth(0).click(); // product field
  await expect(page.locator("mark")).toHaveText("cement");
  await chips.nth(1).click(); // quantity field
  await expect(page.locator("mark")).toHaveText("40 bags cement");

  // Link the later correction, exclude the superseded line, and accept.
  await page
    .getByLabel("Message to link")
    .selectOption({ label: "line 12: Sorry make it 45 bags cement <This message was edited>" });
  await page.getByLabel("Link reason").fill("Customer corrected cement to 45 bags");
  await page.getByRole("button", { name: "Link" }).click();
  await expect(page.getByTestId("line-2")).toContainText("45 bags cement");
  await page.getByLabel("Reason for line 1").fill("Superseded by the correction");
  await page.getByTestId("line-0").getByRole("button", { name: "Exclude" }).click();
  await expect(page.getByTestId("line-0")).toContainText("excluded");
  await expect(page.getByTestId("draft-total")).toHaveText("INR 30,979.20");
  if (SCREENSHOTS) await page.screenshot({ path: `${shot}draft-review.png`, fullPage: true });

  await page.getByRole("button", { name: "Accept order" }).click();
  await expect(page.locator(".status-accepted").first()).toBeVisible();
  await expect(page.getByText("Accepted and frozen")).toBeVisible();

  // Export contains the accepted, corrected lines.
  await page.getByRole("link", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  const csv = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of csv) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text).toContain('"CEM-UB50"');
  expect(text).toContain('"45.000"');
  expect(text).not.toContain('"40.000"');

  expect(outbound).toEqual([]);
});

test("an ambiguous upload asks for the date order", async ({ page }) => {
  await page.goto("/#/imports");
  await page.getByLabel("WhatsApp export file").setInputFiles({
    name: "WhatsApp Chat with Test.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("01/02/26, 10:00 - Meera: 10 bags cement\n"),
  });
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText(/Day\/month order is ambiguous/)).toBeVisible();
  await page.getByRole("combobox").selectOption("dmy");
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Imported.")).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp Chat with Test.txt" })).toBeVisible();
});
