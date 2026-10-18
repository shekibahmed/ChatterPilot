/**
 * ffmpeg argument builders for the walkthrough media. Pure functions (tested in media.test.ts);
 * render.ts runs them. Filters used: fps/scale (constant frame rate), xfade (chapter transitions),
 * afade/volume (music bed), palettegen/paletteuse (GIF), pad/drawtext (social formats).
 */

/** Output size. The app is recorded `appHeight` tall; the rest of the frame is the caption band. */
export const SIZE = { width: 1280, height: 720, appHeight: 624, fps: 30 } as const;

const base = ["-hide_banner", "-loglevel", "error", "-y"];
const h264 = [
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
];

/** Variable-frame-rate browser recording → constant-frame-rate silent H.264, optionally trimmed. */
export function toCfr(
  input: string,
  output: string,
  start = 0,
  end?: number,
  extraFilters = "",
  /** Height to scale the recording to before `extraFilters` (the app is recorded shorter). */
  height: number = SIZE.height,
): string[] {
  const trim = ["-ss", start.toFixed(3), ...(end === undefined ? [] : ["-to", end.toFixed(3)])];
  return [
    ...base,
    "-i",
    input,
    ...trim,
    "-vf",
    `fps=${SIZE.fps},scale=${SIZE.width}:${height}:flags=lanczos${extraFilters ? `,${extraFilters}` : ""},format=yuv420p`,
    "-an",
    ...h264,
    "-crf",
    "18",
    output,
  ];
}

/** Offsets at which each next segment starts when segments overlap by `fade` seconds. */
export function xfadeOffsets(durations: readonly number[], fade: number): number[] {
  const offsets: number[] = [];
  let end = 0;
  durations.forEach((d, i) => {
    offsets.push(i === 0 ? 0 : end - fade);
    end = (i === 0 ? 0 : end - fade) + d;
  });
  return offsets;
}

/** One filter graph joining N inputs with cross-fades; output label is [v]. */
export function xfadeFilter(durations: readonly number[], fade: number): string {
  if (durations.length < 2) return "[0:v]null[v]";
  const offsets = xfadeOffsets(durations, fade);
  const parts: string[] = [];
  let prev = "[0:v]";
  for (let i = 1; i < durations.length; i++) {
    const out = i === durations.length - 1 ? "[v]" : `[x${i}]`;
    parts.push(
      `${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${(offsets[i] ?? 0).toFixed(3)}${out}`,
    );
    prev = out;
  }
  return parts.join(";");
}

export function concatWithFades(
  inputs: readonly string[],
  durations: readonly number[],
  fade: number,
  output: string,
): string[] {
  return [
    ...base,
    ...inputs.flatMap((file) => ["-i", file]),
    "-filter_complex",
    xfadeFilter(durations, fade),
    "-map",
    "[v]",
    ...h264,
    "-crf",
    "23",
    output,
  ];
}

export interface MusicOptions {
  /** Linear gain for the music bed (the tracks are normalised to -16 LUFS). */
  volume: number;
  /** Seconds into the track to start from. */
  from?: number;
  fadeIn?: number;
  fadeOut?: number;
  crf?: number;
}

/** Adds a looping music bed that fades in and out over a silent video of `duration` seconds. */
export function withMusic(
  video: string,
  music: string,
  duration: number,
  output: string,
  options: MusicOptions,
): string[] {
  const fadeIn = options.fadeIn ?? 1.5;
  const fadeOut = options.fadeOut ?? 3;
  const outAt = Math.max(0, duration - fadeOut).toFixed(3);
  return [
    ...base,
    "-i",
    video,
    "-stream_loop",
    "-1",
    ...(options.from ? ["-ss", options.from.toFixed(3)] : []),
    "-i",
    music,
    "-filter_complex",
    `[1:a]volume=${options.volume},afade=t=in:d=${fadeIn},afade=t=out:st=${outAt}:d=${fadeOut},atrim=0:${duration.toFixed(3)}[a]`,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    ...(options.crf === undefined
      ? ["copy"]
      : ["libx264", "-preset", "slow", "-crf", String(options.crf), "-pix_fmt", "yuv420p"]),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-movflags",
    "+faststart",
    output,
  ];
}

/** A quiet ambient pad, used only when no music file is present. */
export function synthMusic(output: string, seconds: number): string[] {
  const tones = [110, 164.81, 220, 277.18];
  return [
    ...base,
    ...tones.flatMap((f) => ["-f", "lavfi", "-i", `sine=frequency=${f}:duration=${seconds}`]),
    "-filter_complex",
    `amix=inputs=${tones.length}:normalize=1,lowpass=f=1200,tremolo=f=0.15:d=0.5,aecho=0.8:0.6:900:0.4,volume=2.5`,
    "-c:a",
    "libmp3lame",
    "-q:a",
    "5",
    output,
  ];
}

/** A clip of a video, re-encoded so cuts are frame-accurate. */
export function cut(input: string, output: string, start: number, duration: number): string[] {
  return [
    ...base,
    "-ss",
    start.toFixed(3),
    "-i",
    input,
    "-t",
    duration.toFixed(3),
    "-an",
    ...h264,
    "-crf",
    "20",
    output,
  ];
}

/** Two-pass-quality GIF in one graph: palette from the clip itself, Bayer dithering. */
export function gif(input: string, output: string, width: number, fps: number): string[] {
  return [
    ...base,
    "-i",
    input,
    "-vf",
    `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    "-loop",
    "0",
    output,
  ];
}

export type SocialFormat = "square" | "vertical";

/** Wraps text to lines of at most `width` characters (for drawtext, which does not wrap). */
export function wrap(text: string, width: number): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export interface TimedText {
  /** Seconds on the clip's own timeline. */
  start: number;
  end: number;
  /** A file holding the (already wrapped) text, so captions need no escaping. */
  file: string;
}

export interface CaptionStyle {
  font: string;
  size: number;
  /** Distance of the caption box from the bottom edge, in pixels. */
  bottom: number;
  pad: number;
  /** Centre captions in the area right of this x (leaves room for a label on the left). */
  left?: number;
  /** Draw a dark box behind the text (off when the caption sits in its own band). */
  box?: boolean;
}

/** Caption boxes drawn by ffmpeg, one drawtext per caption, shown only while it applies. */
export function captionFilters(captions: readonly TimedText[], style: CaptionStyle): string {
  return captions
    .map((c) => {
      const left = style.left ?? 0;
      const x = left ? `${left}+(w-${left}-text_w)/2` : "(w-text_w)/2";
      const box =
        style.box === false ? "box=0" : `box=1:boxcolor=0x0c1218@0.9:boxborderw=${style.pad}`;
      return `drawtext=fontfile=${style.font}:textfile=${c.file}:enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})':fontsize=${style.size}:fontcolor=white:line_spacing=${Math.round(style.size * 0.3)}:text_align=C:${box}:x=${x}:y=h-text_h-${style.bottom}`;
    })
    .join(",");
}

/** Caption filters to append after another filter: empty when there are no captions. */
function withCaptions(captions: readonly TimedText[], style: CaptionStyle): string {
  return captions.length ? `,${captionFilters(captions, style)}` : "";
}

/**
 * A piecewise expression (ffmpeg expression syntax, variable t) that holds each value and eases to
 * the next one over `ease` seconds, starting at each key's time: a smooth camera pan.
 */
export function panExpression(keys: readonly { t: number; v: number }[], ease = 0.8): string {
  if (keys.length === 0) return "0";
  let expr = String(keys.at(-1)?.v ?? 0);
  for (let i = keys.length - 1; i >= 1; i--) {
    const from = keys[i - 1]?.v ?? 0;
    const to = keys[i]?.v ?? 0;
    const t0 = (keys[i]?.t ?? 0).toFixed(2);
    const p = `(t-${t0})/${ease}`;
    const moving = `${from}+(${to - from})*(${p})*(${p})*(3-2*(${p}))`;
    expr = `if(lt(t,${t0}),${from},if(lt(t,${t0}+${ease}),${moving},${expr}))`;
  }
  return expr;
}

/** Cursor marks in a window of a recording, re-timed to the window, with the position at its start. */
export function cursorWindow(
  marks: readonly { t: number; x: number; y: number }[],
  start: number,
  duration: number,
): { t: number; x: number; y: number }[] {
  const before = marks.filter((m) => m.t <= start).at(-1);
  const inside = marks.filter((m) => m.t > start && m.t < start + duration);
  const first = before ?? inside[0] ?? { t: start, x: 640, y: 360 };
  return [{ t: 0, x: first.x, y: first.y }, ...inside.map((m) => ({ ...m, t: m.t - start }))];
}

/**
 * A zoomed social clip from the 1280x720 recording: a crop window that follows the cursor, scaled
 * up, with the hook on top and captions drawn below. Square: the zoomed view fills the frame.
 * Vertical: the zoomed view sits in the middle with the hook above and captions below.
 */
export function followClip(options: {
  input: string;
  output: string;
  format: SocialFormat;
  cursor: readonly { t: number; x: number; y: number }[];
  hookFile: string;
  captions: readonly TimedText[];
  font: string;
}): string[] {
  // Square: a 600x600 window (1.8x zoom). Vertical: a wider 800x600 window, so more of a table fits.
  const [cw, ch] = options.format === "square" ? [600, 600] : [800, 600];
  const [sw, sh] = options.format === "square" ? [1080, 1080] : [1080, 810];
  const x = panExpression(options.cursor.map((m) => ({ t: m.t, v: m.x })));
  const y = panExpression(options.cursor.map((m) => ({ t: m.t, v: m.y })));
  const cropX = `clip(${x}-${cw / 2},0,iw-${cw})`;
  const cropY = `clip(${y}-${ch / 2},0,ih-${ch})`;
  const zoom = `[0:v]crop=${cw}:${ch}:x='${cropX}':y='${cropY}',scale=${sw}:${sh}:flags=lanczos`;
  const brand = (bottom: number, size: number) =>
    `drawtext=fontfile=${options.font}:text=ChatterPilot:fontsize=${size}:fontcolor=0x2dd4bf:x=(w-text_w)/2:y=h-${bottom}`;
  const graph =
    options.format === "square"
      ? [
          `${zoom},drawtext=fontfile=${options.font}:textfile=${options.hookFile}:fontsize=44:fontcolor=white:line_spacing=12:text_align=C:box=1:boxcolor=0x0b1417@0.92:boxborderw=26:x=(w-text_w)/2:y=34${withCaptions(options.captions, { font: options.font, size: 38, bottom: 60, pad: 20 })}[v]`,
        ]
      : [
          `color=c=0x0b1417:s=1080x1920:r=${SIZE.fps}[bg]`,
          `${zoom}[z]`,
          `[bg][z]overlay=0:520:shortest=1,drawtext=fontfile=${options.font}:textfile=${options.hookFile}:fontsize=60:fontcolor=white:line_spacing=16:text_align=C:x=(w-text_w)/2:y=120${withCaptions(options.captions, { font: options.font, size: 44, bottom: 230, pad: 24 })},${brand(120, 40)}[v]`,
        ];
  return [
    ...base,
    "-i",
    options.input,
    "-filter_complex",
    graph.join(";"),
    "-map",
    "[v]",
    "-an",
    ...h264,
    "-crf",
    "21",
    options.output,
  ];
}
