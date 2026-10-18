/**
 * Records the walkthrough: `pnpm media` (record, then render) or `pnpm media --record-only`.
 * Starts the synthetic demo on a throwaway workspace, drives the review app with Playwright and a
 * visible cursor, records the intro/outro cards and a replay of the recorded agent session, and
 * writes raw recordings plus docs/media/raw/manifest.json. Nothing leaves 127.0.0.1.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { APP_CHAPTERS, parseAgentSession, STORYBOARD } from "./chapters.ts";
import { SIZE } from "./ffmpeg.ts";
import { type CaptionMark, type CursorMark, makeUi, OVERLAY_SCRIPT, readingMs } from "./overlay.ts";
import { ROOT, startDemo } from "./server.ts";

export const MEDIA = join(ROOT, "docs/media");
export const RAW = join(MEDIA, "raw");
const PAGES = new URL("./pages/", import.meta.url).pathname;
const PORT = 4340;

export interface Segment {
  file: string;
  /** Seconds into the raw recording where the content starts and ends. */
  start: number;
  end: number;
}

export interface ChapterMark {
  id: string;
  title: string;
  start: number;
  end: number;
  captions: CaptionMark[];
}

export type SocialFormat = "square" | "vertical";

export interface Manifest {
  intro: Segment;
  app: Segment & { chapters: ChapterMark[]; cursor: CursorMark[] };
  agent: Segment & { captions: CaptionMark[] };
  outro: Segment;
  /** The agent replay recorded natively in social formats (large type, captions in the page). */
  agentSocial: Record<SocialFormat, Segment>;
}

async function recording(
  browser: Browser,
  name: string,
  init: string[],
  size: { width: number; height: number } = { width: 1280, height: 720 },
) {
  const dir = join(RAW, `tmp-${name}`);
  const context: BrowserContext = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    colorScheme: "light",
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
    acceptDownloads: true,
    recordVideo: { dir, size },
  });
  for (const script of init) await context.addInitScript(script);
  const page: Page = await context.newPage();
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const finish = async () => {
    const video = page.video();
    await context.close();
    const file = `${name}.webm`;
    if (video) renameSync(await video.path(), join(RAW, file));
    rmSync(dir, { recursive: true, force: true });
    return file;
  };
  return { page, now, finish };
}

const copy = () =>
  `window.__COPY = ${JSON.stringify({
    subtitle: STORYBOARD.intro.subtitle,
    cards: STORYBOARD.intro.cards,
    outroTitle: STORYBOARD.outro.title,
    outroLines: STORYBOARD.outro.lines.slice(0, 3),
  })};`;

async function recordCards(browser: Browser, mode: "intro" | "outro"): Promise<Segment> {
  const r = await recording(browser, mode, [copy()]);
  await r.page.goto(`file://${PAGES}cards.html#${mode}`);
  const start = r.now();
  await r.page.waitForFunction("window.__done === true", undefined, { timeout: 60_000 });
  await r.page.waitForTimeout(mode === "intro" ? 100 : 600);
  const end = r.now();
  return { file: await r.finish(), start, end };
}

function agentSession() {
  const session = parseAgentSession(readFileSync(join(ROOT, "docs/agent-session.md"), "utf8"));
  const captions = STORYBOARD.chapters.find((c) => c.id === "09-agent")?.captions ?? [];
  // Captions by step: load catalogue, create draft (cites chat words), propose edit, refusals.
  const captionAt: Record<number, number> = { 0: 0, 3: 1, 4: 2, 5: 3 };
  session.steps.forEach((step, i) => {
    const index = captionAt[i];
    const text = index === undefined ? undefined : captions[index]?.text;
    if (text) step.caption = text;
    step.hold = text ? readingMs(text) : 1900;
  });
  return { ...session, steps: session.steps.slice(0, 7) };
}

async function recordAgent(browser: Browser, format?: SocialFormat): Promise<Manifest["agent"]> {
  const session = agentSession();
  const size =
    format === "square"
      ? { width: 1080, height: 1080 }
      : format === "vertical"
        ? { width: 1080, height: 1920 }
        : { width: 1280, height: 720 };
  const extra = format
    ? {
        layout: format,
        hook: STORYBOARD.socialHooks[2] ?? "",
        // Shorter for social: skip listing suggestions so the refusals land inside 30 seconds.
        steps: session.steps.filter((step) => !step.call.startsWith("list_suggestions")),
      }
    : {};
  const r = await recording(
    browser,
    format ? `agent-${format}` : "agent",
    [`window.__SESSION = ${JSON.stringify({ ...session, ...extra })};`],
    size,
  );
  await r.page.goto(`file://${PAGES}terminal.html`);
  const start = r.now();
  await r.page.waitForFunction("window.__done === true", undefined, { timeout: 120_000 });
  const marks = (await r.page.evaluate("window.__marks")) as CaptionMark[];
  const end = r.now();
  return {
    file: await r.finish(),
    start,
    end,
    captions: marks.map((m) => ({ t: m.t, text: m.text })),
  };
}

async function recordApp(browser: Browser, url: string): Promise<Manifest["app"]> {
  // The app is recorded 96 px short of 720; render.ts adds a band below it for the chapter label
  // and captions, so they never cover the screen they describe.
  const r = await recording(browser, "app", [OVERLAY_SCRIPT], {
    width: SIZE.width,
    height: SIZE.appHeight,
  });
  await r.page.goto(url);
  const chapters: ChapterMark[] = [];
  const cursor: CursorMark[] = [];
  for (const chapter of APP_CHAPTERS) {
    const story = STORYBOARD.chapters.find((c) => c.id === chapter.id);
    if (!story) throw new Error(`storyboard.json has no chapter ${chapter.id}`);
    const captions: CaptionMark[] = [];
    const ui = makeUi(r.page, r.now, captions, cursor);
    const start = r.now();
    await chapter.run(r.page, ui, async (index) => {
      const text = story.captions[index]?.text;
      if (text) await ui.caption(text);
    });
    await ui.hideCaption();
    chapters.push({ id: chapter.id, title: story.title, start, end: r.now(), captions });
    console.error(`  recorded ${chapter.id} (${(r.now() - start).toFixed(1)} s)`);
  }
  const first = chapters[0]?.start ?? 0;
  const last = chapters.at(-1)?.end ?? r.now();
  return { file: await r.finish(), start: first, end: last, chapters, cursor };
}

async function socialCard(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 640 } });
  await context.addInitScript(copy());
  const page = await context.newPage();
  await page.goto(`file://${PAGES}cards.html#social`);
  await page.waitForFunction("window.__done === true");
  mkdirSync(join(MEDIA, "social"), { recursive: true });
  await page.screenshot({ path: join(MEDIA, "social/card-1280x640.png") });
  await context.close();
}

export async function record(): Promise<Manifest> {
  if (!existsSync(join(ROOT, "apps/local/dist/web/index.html"))) {
    throw new Error('The review app is not built. Run "pnpm build:web" (pnpm media does this).');
  }
  mkdirSync(RAW, { recursive: true });
  const server = await startDemo(PORT);
  const browser = await chromium.launch({ headless: true });
  try {
    console.error("Recording intro cards");
    const intro = await recordCards(browser, "intro");
    console.error("Recording the review app");
    const app = await recordApp(browser, server.url);
    console.error("Recording the agent session replay");
    const agent = await recordAgent(browser);
    console.error("Recording outro and social card");
    const outro = await recordCards(browser, "outro");
    console.error("Recording social formats");
    const agentSocial = {
      square: await recordAgent(browser, "square"),
      vertical: await recordAgent(browser, "vertical"),
    };
    await socialCard(browser);
    const manifest: Manifest = { intro, app, agent, outro, agentSocial };
    writeFileSync(join(RAW, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    await browser.close();
    await server.stop();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await record();
  if (!process.argv.includes("--record-only")) {
    const { render } = await import("./render.ts");
    await render(manifest);
  }
}
