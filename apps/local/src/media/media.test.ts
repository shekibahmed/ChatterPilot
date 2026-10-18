import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_CHAPTERS, parseAgentSession, STORYBOARD } from "./chapters.ts";
import {
  captionFilters,
  concatWithFades,
  cursorWindow,
  followClip,
  gif,
  panExpression,
  toCfr,
  withMusic,
  wrap,
  xfadeFilter,
  xfadeOffsets,
} from "./ffmpeg.ts";
import { readingMs } from "./overlay.ts";
import { appCaptionCues, tourTimeline, toVtt } from "./render.ts";
import { parseRange, resolveDocPath } from "./serve-tour.ts";
import { ROOT } from "./server.ts";

describe("storyboard", () => {
  it("has a chapter for every recorded step, with short plain captions", () => {
    const ids = STORYBOARD.chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chapter of APP_CHAPTERS) expect(ids).toContain(chapter.id);
    expect(ids).toContain("09-agent");
    for (const chapter of STORYBOARD.chapters) {
      expect(chapter.captions.length).toBeGreaterThan(0);
      for (const { text } of chapter.captions) {
        expect(text.length).toBeLessThanOrEqual(70);
        expect(text).not.toMatch(/[!—]|seamless|powerful|revolutionary/i);
      }
    }
  });

  it("states that the data is synthetic and makes no time-saving claim", () => {
    const all = JSON.stringify(STORYBOARD);
    expect(all).toMatch(/synthetic/);
    expect(all).not.toMatch(/saves? (you )?(hours|time)|\d+% faster|10x/i);
  });

  it("cites a test that exists for every benefit", () => {
    for (const benefit of STORYBOARD.benefits) {
      const [file, ...rest] = benefit.proof.split(":");
      const source = readFileSync(join(ROOT, file ?? ""), "utf8");
      const quoted = /"([^"]+)"/.exec(rest.join(":"))?.[1];
      expect(quoted, benefit.heading).toBeDefined();
      expect(source).toContain(quoted ?? "");
    }
  });
});

describe("agent session replay", () => {
  it("reads the recorded MCP session, including the refusals", () => {
    const session = parseAgentSession(readFileSync(join(ROOT, "docs/agent-session.md"), "utf8"));
    expect(session.tools).toBeGreaterThan(5);
    const calls = session.steps.map((s) => s.call.split("(")[0]);
    expect(calls.slice(0, 3)).toEqual(["load_catalogue", "import_export", "list_suggestions"]);
    expect(session.steps.find((s) => s.call.startsWith("accept_draft"))?.error).toBe(true);
    expect(session.steps.find((s) => s.call.startsWith("export_orders"))?.error).toBe(true);
    for (const step of session.steps) expect(step.result.length).toBeLessThanOrEqual(231);
  });
});

describe("ffmpeg builders", () => {
  it("places cross-faded segments so each overlaps the previous by the fade", () => {
    expect(xfadeOffsets([10, 20, 5], 1)).toEqual([0, 9, 28]);
    expect(xfadeFilter([10, 20, 5], 1)).toBe(
      "[0:v][1:v]xfade=transition=fade:duration=1:offset=9.000[x1];[x1][2:v]xfade=transition=fade:duration=1:offset=28.000[v]",
    );
    expect(xfadeFilter([10], 1)).toBe("[0:v]null[v]");
    const args = concatWithFades(["a.mp4", "b.mp4"], [3, 4], 0.5, "out.mp4");
    expect(args.filter((a) => a === "-i")).toHaveLength(2);
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("normalises recordings to constant frame rate and trims them", () => {
    const args = toCfr("in.webm", "out.mp4", 1.5, 9);
    expect(args.join(" ")).toContain("-ss 1.500 -to 9.000");
    expect(args.join(" ")).toContain("fps=30,scale=1280:720");
    expect(args).toContain("-an");
  });

  it("fades the music out at the end of the video and never outlasts it", () => {
    const args = withMusic("v.mp4", "m.mp3", 60, "o.mp4", { volume: 0.3 }).join(" ");
    expect(args).toContain("-stream_loop -1");
    expect(args).toContain("afade=t=out:st=57.000:d=3");
    expect(args).toContain("atrim=0:60.000");
    expect(args).toContain("-shortest");
    expect(args).toContain("-c:v copy");
  });

  it("builds GIFs from their own palette", () => {
    expect(gif("i.mp4", "o.gif", 960, 12).join(" ")).toMatch(/palettegen.*paletteuse/);
  });

  it("pans smoothly between cursor positions and holds in between", () => {
    expect(panExpression([])).toBe("0");
    expect(panExpression([{ t: 0, v: 100 }])).toBe("100");
    const expr = panExpression([
      { t: 0, v: 100 },
      { t: 2, v: 300 },
    ]);
    expect(expr).toBe(
      "if(lt(t,2.00),100,if(lt(t,2.00+0.8),100+(200)*((t-2.00)/0.8)*((t-2.00)/0.8)*(3-2*((t-2.00)/0.8)),300))",
    );
    const marks = [
      { t: 1, x: 10, y: 10 },
      { t: 5, x: 50, y: 50 },
      { t: 9, x: 90, y: 90 },
    ];
    expect(cursorWindow(marks, 4, 4)).toEqual([
      { t: 0, x: 10, y: 10 },
      { t: 1, x: 50, y: 50 },
    ]);
  });

  it("draws captions only while they apply, from text files", () => {
    const f = captionFilters([{ start: 1, end: 3.5, file: "/w/c0.txt" }], {
      font: "/f.ttf",
      size: 25,
      bottom: 30,
      pad: 16,
    });
    expect(f).toContain("textfile=/w/c0.txt");
    expect(f).toContain("enable='between(t,1.00,3.50)'");
  });

  it("builds square and vertical clips that follow the cursor", () => {
    const common = {
      input: "i.mp4",
      output: "o.mp4",
      cursor: [{ t: 0, x: 640, y: 360 }],
      hookFile: "/h.txt",
      captions: [],
      font: "/f.ttf",
    };
    const square = followClip({ ...common, format: "square" }).join(" ");
    expect(square).toContain("crop=600:600:x='clip(640-300,0,iw-600)'");
    expect(square).not.toContain(",[v]");
    expect(square).toContain("scale=1080:1080");
    const vertical = followClip({ ...common, format: "vertical" }).join(" ");
    expect(vertical).toContain("s=1080x1920");
    expect(vertical).toContain("textfile=/h.txt");
  });

  it("wraps hook text for drawtext", () => {
    expect(wrap("A customer writes 40 bags, then 45. A person records the fix.", 26)).toBe(
      "A customer writes 40 bags,\nthen 45. A person records\nthe fix.",
    );
  });
});

describe("timeline and captions", () => {
  const manifest = {
    intro: { file: "intro.webm", start: 0.5, end: 10.5 },
    app: {
      file: "app.webm",
      start: 2,
      end: 22,
      cursor: [],
      chapters: [
        { id: "01-overview", title: "One", start: 2, end: 12, captions: [{ t: 3, text: "a" }] },
        { id: "02-imports", title: "Two", start: 12, end: 22, captions: [{ t: 13, text: "b" }] },
      ],
    },
    agent: { file: "agent.webm", start: 0, end: 8, captions: [{ t: 1, text: "c" }] },
    outro: { file: "outro.webm", start: 0, end: 5 },
    agentSocial: {
      square: { file: "agent-square.webm", start: 0, end: 20 },
      vertical: { file: "agent-vertical.webm", start: 0, end: 20 },
    },
  };

  it("maps recording times onto the joined tour", () => {
    const chapters = tourTimeline(manifest, [10, 20, 8, 5]);
    expect(chapters.map((c) => c.id)).toEqual([
      "00-intro",
      "01-overview",
      "02-imports",
      "09-agent",
      "10-outro",
    ]);
    // The app segment starts at 10 - 0.8 = 9.2 s on the tour timeline.
    expect(chapters[1]).toMatchObject({
      start: 9.2,
      end: 19.2,
      captions: [{ t: 10.2, text: "a" }],
    });
    expect(chapters[3]?.captions[0]?.t).toBeCloseTo(28.4 + 1, 5);
    expect(chapters.at(-1)?.end).toBeCloseTo(35.6 + 5, 5);
  });

  it("writes WebVTT cues that end at the next caption", () => {
    const vtt = toVtt(tourTimeline(manifest, [10, 20, 8, 5]));
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("00:00:10.200 --> 00:00:18.200\na");
  });

  it("times app captions until the next caption or the chapter end", () => {
    expect(appCaptionCues(manifest.app)).toEqual([
      { start: 1, end: 10, text: "a" },
      { start: 11, end: 20, text: "b" },
    ]);
    expect(appCaptionCues(manifest.app, 12, 17)).toEqual([{ start: 1, end: 5, text: "b" }]);
  });

  it("gives longer captions more reading time", () => {
    expect(readingMs("short")).toBe(2200);
    expect(readingMs("x".repeat(70))).toBeGreaterThan(4000);
  });
});

describe("local tour server", () => {
  it("serves only files inside docs/", () => {
    expect(resolveDocPath("/")).toBe(join(ROOT, "docs/media/tour.html"));
    expect(resolveDocPath("/media/tour.mp4")).toBe(join(ROOT, "docs/media/tour.mp4"));
    const docs = join(ROOT, "docs");
    for (const hostile of [
      "/../package.json",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/media/../../LICENSE",
    ]) {
      const file = resolveDocPath(hostile);
      expect(file === null || file.startsWith(`${docs}/`), hostile).toBe(true);
    }
  });

  it("answers byte ranges so the video can seek", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual([0, 99]);
    expect(parseRange("bytes=900-", 1000)).toEqual([900, 999]);
    expect(parseRange("bytes=-100", 1000)).toEqual([900, 999]);
    expect(parseRange("bytes=2000-3000", 1000)).toBeNull();
    expect(parseRange(undefined, 1000)).toBeNull();
  });
});
