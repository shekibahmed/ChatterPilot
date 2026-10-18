/**
 * Turns the raw recordings into the published media: `pnpm media:render` re-renders without
 * re-recording. Writes docs/media/tour.mp4 (with music), chapters.json and tour.vtt (for the
 * interactive tour page), GIFs for the README, and social clips. Requires ffmpeg and ffprobe.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STORYBOARD } from "./chapters.ts";
import {
  captionFilters,
  concatWithFades,
  cursorWindow,
  cut,
  followClip,
  gif,
  SIZE,
  type SocialFormat,
  synthMusic,
  type TimedText,
  toCfr,
  withMusic,
  wrap,
  xfadeOffsets,
} from "./ffmpeg.ts";
import type { Manifest } from "./record.ts";
import { ROOT } from "./server.ts";

const MEDIA = join(ROOT, "docs/media");
const RAW = join(MEDIA, "raw");
const WORK = join(RAW, "work");
const FADE = 0.8;
const GIF_LIMIT = 6 * 1024 * 1024;

function ffmpeg(args: string[]) {
  const res = spawnSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
  if (res.status !== 0) throw new Error(`ffmpeg failed (${res.status}): ffmpeg ${args.join(" ")}`);
}

function duration(file: string): number {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Number(out.toString().trim());
}

function font(): string {
  try {
    const file = execFileSync("fc-match", ["-f", "%{file}", "sans-serif:bold"]).toString().trim();
    if (file && existsSync(file)) return file;
  } catch {
    // fontconfig missing; fall through.
  }
  return "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf";
}

export interface TourChapter {
  id: string;
  title: string;
  start: number;
  end: number;
  captions: { t: number; text: string }[];
}

/** Chapter and caption times on the final tour timeline (segments overlap by the fade). */
export function tourTimeline(manifest: Manifest, durations: readonly number[]): TourChapter[] {
  const [intro = 0, app = 0, agent = 0, outro = 0] = xfadeOffsets(durations, FADE);
  const total = (durations.at(-1) ?? 0) + outro;
  const agentStory = STORYBOARD.chapters.find((c) => c.id === "09-agent");
  const chapters: TourChapter[] = [
    { id: "00-intro", title: "What it does", start: intro, end: app, captions: [] },
    ...manifest.app.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      start: round(app + c.start - manifest.app.start),
      end: round(app + c.end - manifest.app.start),
      captions: c.captions.map((m) => ({ t: round(app + m.t - manifest.app.start), text: m.text })),
    })),
    {
      id: "09-agent",
      title: agentStory?.title ?? "A coding agent",
      start: round(agent),
      end: round(outro),
      captions: manifest.agent.captions.map((m) => ({ t: round(agent + m.t), text: m.text })),
    },
    { id: "10-outro", title: "Try it", start: round(outro), end: round(total), captions: [] },
  ];
  return chapters;
}

const round = (n: number) => Math.round(n * 100) / 100;

function vttTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/** WebVTT captions: each caption shows until the next one or the end of its chapter. */
export function toVtt(chapters: readonly TourChapter[]): string {
  const cues: string[] = ["WEBVTT", ""];
  for (const chapter of chapters) {
    chapter.captions.forEach((c, i) => {
      const end = Math.min(chapter.captions[i + 1]?.t ?? chapter.end, c.t + 8);
      cues.push(`${vttTime(c.t)} --> ${vttTime(end)}`, c.text, "");
    });
  }
  return cues.join("\n");
}

function makeGif(input: string, output: string) {
  for (const [width, fps] of [
    [880, 10],
    [800, 10],
    [720, 8],
  ] as const) {
    ffmpeg(gif(input, output, width, fps));
    if (statSync(output).size <= GIF_LIMIT) return;
  }
  console.error(`  warning: ${output} is still over ${GIF_LIMIT / 1024 / 1024} MB`);
}

/**
 * Caption cues for the app recording, on its trimmed timeline: each caption shows until the next
 * one in its chapter or the end of the chapter, and never longer than `max` seconds.
 */
export function appCaptionCues(
  app: Manifest["app"],
  from = app.start,
  until = app.end,
  max = 9,
): { start: number; end: number; text: string }[] {
  const cues: { start: number; end: number; text: string }[] = [];
  for (const chapter of app.chapters) {
    chapter.captions.forEach((c, i) => {
      const next = chapter.captions[i + 1]?.t ?? chapter.end;
      const start = Math.max(c.t, from) - from;
      const end = Math.min(next, c.t + max, until) - from;
      if (end - start > 0.3) cues.push({ start, end, text: c.text });
    });
  }
  return cues;
}

function writeCues(
  prefix: string,
  cues: { start: number; end: number; text: string }[],
  width: number,
): TimedText[] {
  return cues.map((c, i) => {
    const file = join(WORK, `${prefix}-${i}.txt`);
    writeFileSync(file, wrap(c.text, width));
    return { start: c.start, end: c.end, file };
  });
}

export async function render(manifest: Manifest = readManifest()) {
  mkdirSync(WORK, { recursive: true });
  for (const dir of ["gif", "social"]) mkdirSync(join(MEDIA, dir), { recursive: true });
  const fontFile = font();

  console.error("Normalising recordings");
  // The app recording is kept twice: clean (for zoomed social clips) and with captions (for the tour).
  const appClean = join(WORK, "app.clean.mp4");
  const app = manifest.app;
  ffmpeg(toCfr(join(RAW, app.file), appClean, app.start, app.end, "", SIZE.appHeight));
  // Tour version: a band below the app with the chapter label on the left and the caption beside it.
  const steps = app.chapters.length + 1;
  const labels = app.chapters.map((c, i) => {
    const file = join(WORK, `label-${i}.txt`);
    writeFileSync(file, `STEP ${i + 1} OF ${steps}\n${wrap(c.title, 24)}`);
    return `drawtext=fontfile=${fontFile}:textfile=${file}:enable='between(t,${(c.start - app.start).toFixed(2)},${(c.end - app.start).toFixed(2)})':fontsize=17:fontcolor=0x2dd4bf:line_spacing=6:x=28:y=${SIZE.appHeight}+(${SIZE.height - SIZE.appHeight}-text_h)/2`;
  });
  const band = [
    `pad=${SIZE.width}:${SIZE.height}:0:0:color=0x0b1417`,
    ...labels,
    captionFilters(writeCues("cap", appCaptionCues(app), 60), {
      font: fontFile,
      size: 24,
      bottom: 18,
      pad: 0,
      left: 300,
      box: false,
    }),
  ]
    .filter(Boolean)
    .join(",");
  const parts = (["intro", "app", "agent", "outro"] as const).map((name) => {
    const seg = manifest[name];
    const out = join(WORK, `${name}.mp4`);
    const app = name === "app";
    ffmpeg(
      toCfr(
        join(RAW, seg.file),
        out,
        seg.start,
        seg.end,
        app ? band : "",
        app ? SIZE.appHeight : SIZE.height,
      ),
    );
    return out;
  });
  const durations = parts.map(duration);

  console.error("Joining the tour");
  const silent = join(WORK, "tour.silent.mp4");
  ffmpeg(concatWithFades(parts, durations, FADE, silent));
  const tourLength = duration(silent);

  let music = join(MEDIA, "music/hypnotic-chill.mp3");
  let clipMusic = join(MEDIA, "music/calm-ambient-2.mp3");
  if (!existsSync(music)) {
    music = join(WORK, "synth.mp3");
    ffmpeg(synthMusic(music, 240));
  }
  if (!existsSync(clipMusic)) clipMusic = music;
  ffmpeg(withMusic(silent, music, tourLength, join(MEDIA, "tour.mp4"), { volume: 0.32 }));

  const chapters = tourTimeline(manifest, durations);
  writeFileSync(
    join(MEDIA, "chapters.json"),
    `${JSON.stringify({ duration: round(tourLength), chapters }, null, 2)}\n`,
  );
  writeFileSync(join(MEDIA, "tour.vtt"), toVtt(chapters));
  // The tour page loads this as a script, so it also works when opened from disk (file://).
  const tour = {
    duration: round(tourLength),
    chapters,
    benefits: STORYBOARD.benefits,
    blurb: STORYBOARD.readmeBlurb,
  };
  writeFileSync(join(MEDIA, "chapters.js"), `window.TOUR = ${JSON.stringify(tour, null, 2)};\n`);
  ffmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "9.5",
    "-i",
    silent,
    "-frames:v",
    "1",
    join(MEDIA, "poster.jpg"),
  ]);

  console.error("Making GIFs");
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const clip = (id: string, max = 60) => {
    const c = byId.get(id);
    if (!c) throw new Error(`no chapter ${id}`);
    const out = join(WORK, `${id}.mp4`);
    ffmpeg(cut(silent, out, c.start + 0.2, Math.min(max, c.end - c.start - 0.2)));
    return out;
  };
  const gifs: Record<string, string> = {
    "00-intro": "intro",
    "04-provenance": "provenance",
    "05-correction": "correction",
    "06-export": "export",
    "07-dashboard": "dashboard",
    "09-agent": "agent",
  };
  for (const [id, name] of Object.entries(gifs)) makeGif(clip(id), join(MEDIA, `gif/${name}.gif`));

  console.error("Making social clips");
  const withClipMusic = (silentClip: string, name: string) =>
    ffmpeg(
      withMusic(silentClip, clipMusic, duration(silentClip), join(MEDIA, `social/${name}.mp4`), {
        volume: 0.4,
        from: 20,
        fadeOut: 2,
      }),
    );
  // App chapters: a zoomed view that follows the cursor, with the hook and large captions.
  const appClips: [string, string, SocialFormat[]][] = [
    ["05-correction", STORYBOARD.socialHooks[1] ?? "", ["square", "vertical"]],
    ["04-provenance", STORYBOARD.socialHooks[0] ?? "", ["square"]],
  ];
  for (const [id, hook, formats] of appClips) {
    const chapter = manifest.app.chapters.find((c) => c.id === id);
    if (!chapter) throw new Error(`no chapter ${id}`);
    const from = chapter.start - manifest.app.start;
    const length = Math.min(30, chapter.end - chapter.start);
    const source = join(WORK, `${id}.clean.mp4`);
    ffmpeg(cut(appClean, source, from, length));
    const cursor = cursorWindow(
      manifest.app.cursor.map((m) => ({ ...m, t: m.t - manifest.app.start })),
      from,
      length,
    );
    const cues = appCaptionCues(manifest.app, chapter.start, chapter.start + length);
    for (const format of formats) {
      const hookFile = join(WORK, `${id}-${format}.hook.txt`);
      writeFileSync(hookFile, wrap(hook, format === "square" ? 36 : 26));
      const silentClip = join(WORK, `${id}-${format}.mp4`);
      ffmpeg(
        followClip({
          input: source,
          output: silentClip,
          format,
          cursor,
          hookFile,
          captions: writeCues(`${id}-${format}`, cues, format === "square" ? 40 : 36),
          font: fontFile,
        }),
      );
      withClipMusic(silentClip, `${id.replace(/^\d+-/, "")}-${format}`);
    }
  }
  // The agent replay was recorded natively in each format.
  for (const format of ["square", "vertical"] as const) {
    const seg = manifest.agentSocial[format];
    const silentClip = join(WORK, `agent-${format}.mp4`);
    const [w, h] = format === "square" ? [1080, 1080] : [1080, 1920];
    ffmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      join(RAW, seg.file),
      "-ss",
      seg.start.toFixed(3),
      "-to",
      seg.end.toFixed(3),
      "-vf",
      `fps=30,scale=${w}:${h},format=yuv420p`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "21",
      "-movflags",
      "+faststart",
      silentClip,
    ]);
    withClipMusic(silentClip, `agent-${format}`);
  }
  if (!process.env.CHATTERPILOT_MEDIA_KEEP_WORK) rmSync(WORK, { recursive: true, force: true });
  console.error(`Done: tour ${tourLength.toFixed(1)} s, ${chapters.length} chapters.`);
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(RAW, "manifest.json"), "utf8")) as Manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) await render();
