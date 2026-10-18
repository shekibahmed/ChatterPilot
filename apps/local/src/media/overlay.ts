/**
 * A visible cursor, a caption bar and a chapter label, injected into the review app while it is
 * recorded. Playwright still performs the real clicks; the overlay only makes them visible.
 */
import type { Locator, Page } from "playwright";

export const OVERLAY_SCRIPT = `(() => {
  if (window.__cp) return;
  const css = \`
  #cp-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647;
    pointer-events: none; transform: translate(640px, 360px);
    transition: transform 650ms cubic-bezier(.22,.61,.36,1); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  #cp-ring { position: fixed; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px;
    border-radius: 50%; border: 3px solid #0f766e; opacity: 0; pointer-events: none; z-index: 2147483646; }
  #cp-ring.on { animation: cp-ring 520ms ease-out; }
  @keyframes cp-ring { from { opacity: .9; transform: var(--at) scale(.35); } to { opacity: 0; transform: var(--at) scale(1.25); } }
  #cp-caption { position: fixed; left: 50%; bottom: 26px; transform: translate(-50%, 12px); max-width: 84%;
    padding: 12px 24px; border-radius: 14px; background: rgba(12,18,24,.88); color: #fff;
    font: 600 23px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: .1px;
    text-align: center; opacity: 0; transition: opacity 320ms ease, transform 320ms ease;
    pointer-events: none; z-index: 2147483645; box-shadow: 0 8px 30px rgba(0,0,0,.25); }
  #cp-caption.on { opacity: 1; transform: translate(-50%, 0); }
  #cp-chapter { position: fixed; left: 50%; transform: translateX(-50%); top: 12px; padding: 6px 14px; border-radius: 999px;
    background: #0f766e; color: #fff; font: 600 14px/1.2 system-ui, sans-serif; z-index: 2147483645;
    pointer-events: none; opacity: 0; transition: opacity 300ms ease; }
  #cp-chapter.on { opacity: .95; }\`;
  const install = () => {
    if (document.getElementById("cp-cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "cp-cursor";
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.6-6.8L4 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ring = document.createElement("div");
    ring.id = "cp-ring";
    const caption = document.createElement("div");
    caption.id = "cp-caption";
    const chapter = document.createElement("div");
    chapter.id = "cp-chapter";
    document.body.append(cursor, ring, caption, chapter);
    const saved = window.__cpState || { x: 640, y: 360 };
    cursor.style.transition = "none";
    cursor.style.transform = "translate(" + saved.x + "px," + saved.y + "px)";
    requestAnimationFrame(() => { cursor.style.transition = ""; });
  };
  window.__cp = {
    move(x, y) {
      install();
      window.__cpState = { x, y };
      document.getElementById("cp-cursor").style.transform = "translate(" + (x - 4) + "px," + (y - 2) + "px)";
    },
    click() {
      install();
      const s = window.__cpState || { x: 640, y: 360 };
      const ring = document.getElementById("cp-ring");
      ring.style.setProperty("--at", "translate(" + s.x + "px," + s.y + "px)");
      ring.style.transform = "translate(" + s.x + "px," + s.y + "px)";
      ring.classList.remove("on");
      void ring.offsetWidth;
      ring.classList.add("on");
    },
    caption(text) {
      install();
      const el = document.getElementById("cp-caption");
      if (!text) { el.classList.remove("on"); return; }
      el.textContent = text;
      el.classList.add("on");
    },
    chapter(text) {
      install();
      const el = document.getElementById("cp-chapter");
      el.textContent = text || "";
      el.classList.toggle("on", Boolean(text));
    },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();`;

export interface CaptionMark {
  /** Seconds since the recording started. */
  t: number;
  text: string;
}

/** Where the visible cursor was sent, for the zoomed social clips that follow it. */
export interface CursorMark {
  t: number;
  x: number;
  y: number;
}

export interface Ui {
  pause(ms: number): Promise<void>;
  moveTo(target: Locator): Promise<void>;
  click(target: Locator): Promise<void>;
  type(target: Locator, text: string): Promise<void>;
  caption(text: string, holdMs?: number): Promise<void>;
  hideCaption(): Promise<void>;
  chapter(label: string): Promise<void>;
  scrollTo(target: Locator): Promise<void>;
}

/** Reading time for a caption: about 18 characters a second plus a beat, at least 2.2 s. */
export function readingMs(text: string): number {
  return Math.max(2200, Math.round((text.length / 18) * 1000) + 700);
}

/**
 * Captions are recorded as data, not drawn in the page: render.ts draws them with ffmpeg, so the
 * same recording can be cropped for square and vertical clips without a half-visible caption bar.
 */
export function makeUi(
  page: Page,
  now: () => number,
  captions: CaptionMark[],
  cursor: CursorMark[] = [],
): Ui {
  const pause = (ms: number) => page.waitForTimeout(ms);
  // Browser-side calls are plain expressions so this file needs no DOM typings.
  const cp = (call: string) => page.evaluate(`window.__cp && window.__cp.${call}`);
  const scrollTo = async (target: Locator) => {
    await target.evaluate((el: { scrollIntoView(o: object): void }) =>
      el.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    await pause(500);
  };
  const moveTo = async (target: Locator) => {
    await scrollTo(target);
    const box = await target.boundingBox();
    if (!box) return;
    const x = Math.round(box.x + Math.min(box.width / 2, 60));
    // Tip at the lower edge, so the arrow does not cover the words it points at.
    const y = Math.round(box.y + box.height - 3);
    cursor.push({ t: now(), x, y });
    await cp(`move(${x}, ${y})`);
    await pause(480);
  };
  return {
    pause,
    scrollTo,
    moveTo,
    async click(target) {
      await moveTo(target);
      await cp("click()");
      await target.click();
      await pause(450);
    },
    async type(target, text) {
      await moveTo(target);
      await cp("click()");
      await target.click();
      await target.fill("");
      await target.pressSequentially(text, { delay: 38 });
      await pause(350);
    },
    async caption(text, holdMs) {
      captions.push({ t: now(), text });
      await pause(holdMs ?? readingMs(text));
    },
    async hideCaption() {
      await pause(300);
    },
    async chapter(label) {
      await cp(`chapter(${JSON.stringify(label)})`);
    },
  };
}
