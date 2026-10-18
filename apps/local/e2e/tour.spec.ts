import { expect, test } from "@playwright/test";

const TOUR = "http://127.0.0.1:4319/media/tour.html";

test("the walkthrough page plays, jumps by chapter and caption, and stays offline", async ({
  page,
}) => {
  const outbound: string[] = [];
  page.on("request", (req) => {
    if (!req.url().startsWith("http://127.0.0.1:4319/")) outbound.push(req.url());
  });
  await page.goto(TOUR);
  const chapters = page.locator(".chapter");
  await expect(chapters).toHaveCount(11);
  await expect(page.locator("#benefits .card")).toHaveCount(5);
  await page.locator("#v").evaluate((v: { muted: boolean }) => {
    v.muted = true;
  });

  // A chapter button seeks the video to that chapter and marks it active.
  const correction = chapters.filter({ hasText: "A correction" });
  await correction.click();
  const start = await page.evaluate(
    "window.TOUR.chapters.find((c) => c.id === '05-correction').start",
  );
  await expect
    .poll(() => page.locator("#v").evaluate((v: { currentTime: number }) => v.currentTime))
    .toBeGreaterThanOrEqual(Number(start));
  await expect(correction).toHaveClass(/active/);

  // A caption in the transcript seeks to its moment.
  await page.locator(".cap").filter({ hasText: "no accept tool" }).click();
  await expect(chapters.filter({ hasText: "A coding agent" })).toHaveClass(/active/);

  // Music toggle and setup tabs.
  await page.getByRole("button", { name: /Music (on|off)/ }).click();
  await expect(page.getByRole("button", { name: /Music (on|off)/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("tab", { name: "Codex CLI" }).click();
  await expect(page.locator("#code")).toContainText("[mcp_servers.chatterpilot]");

  expect(outbound).toEqual([]);
});
