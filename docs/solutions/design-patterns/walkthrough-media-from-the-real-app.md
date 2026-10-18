---
title: Make walkthrough videos from the real app, with captions as data in a reserved band
date: 2026-10-18
category: design-patterns
module: apps/local/src/media (walkthrough media pipeline)
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - Producing README GIFs, demo videos or social clips of a web app with Playwright and ffmpeg
  - The same recording must be reused at 16:9 and cropped to square or vertical formats
  - Captions or labels must describe what is on screen at that moment
tags: [playwright, ffmpeg, walkthrough-video, captions, readme-media, social-clips, gif]
---

# Make walkthrough videos from the real app, with captions as data in a reserved band

## Context

ChatterPilot needed animated walkthroughs for its README and launch: a tour video with music,
GIFs and square/vertical social clips. The repository's rule is that media shows real, tested
behaviour on synthetic data. README screenshots already came from the browser test behind
`CHATTERPILOT_SCREENSHOTS=1` (session history), so the video pipeline (`pnpm media`) replays the
same flow as `apps/local/e2e/demo.spec.ts` against a throwaway demo workspace.

The first version drew captions and a chapter label inside the page (an injected overlay). Three
problems followed, found by looking at extracted frames and by a frame-by-frame review from a
separate agent:

- **Social crops were unreadable or broken.** Putting the 16:9 recording inside a 1080x1080 or
  1080x1920 frame shrank the UI to a strip. Cropping instead cut the in-page caption pill in half,
  because it sits at a fixed screen position the crop does not follow.
- **Captions covered what they described.** A bottom caption sat on the Zoho card, the second order
  row and the subtotal row while talking about them; the chapter pill sat over table headers and
  buttons.
- **Captions ran ahead of the screen.** "She gives a reason" appeared after the reason field had
  already cleared on submit; the agent-chapter caption about draft citations showed during the
  import step. The cursor tip also sat on the number the caption quoted.

## Guidance

1. **Record captions as data, not pixels.** The page overlay only moves a visible cursor; each
   caption is pushed with its timestamp into a manifest
   (`captions.push` at `apps/local/src/media/overlay.ts:159`, `cursor.push` at `overlay.ts:136`). ffmpeg draws them
   later, so one clean recording serves every format.
2. **Reserve a band for words.** Record the app shorter than the output frame
   (`SIZE.appHeight = 624` of 720, `apps/local/src/media/ffmpeg.ts:8`), pad the frame and draw the
   chapter label and captions in the band (`apps/local/src/media/render.ts:178-196`). Text can
   then never cover the screen.
3. **Time captions to the moment they describe, then review frames.** Say the caption while its
   evidence is visible (the reason caption now comes before clicking Link,
   `apps/local/src/media/chapters.ts:95`); map terminal captions to the step that shows them
   (`apps/local/src/media/record.ts:99`). Each caption lasts until the next one, the chapter end or 9 s,
   whichever comes first (`appCaptionCues`, `render.ts:136`). Point the cursor tip at the element's lower edge
   (`overlay.ts:134`).
4. **Zoom social clips by following the recorded cursor.** Build a piecewise ffmpeg expression
   that holds each position and eases to the next (`panExpression`, `ffmpeg.ts:252`), and crop a
   600x600 (square) or 800x600 (vertical) window around it (`ffmpeg.ts:293`). Draw the hook and
   captions in large type on top. For content you control fully (the agent-session terminal page),
   record natively at 1080x1080 and 1080x1920 instead of cropping.
5. **Build filtergraphs from non-empty parts.** An empty caption list once left `...,[v]`, which
   ffmpeg rejects. Join parts with `.filter(Boolean)` (`render.ts:195`) and append captions only
   when there are some (`withCaptions`, `ffmpeg.ts:244`); a unit test asserts no `,[v]`
   (`apps/local/src/media/media.test.ts:142`).
6. **Plan around GitHub's README limits.** GIFs autoplay inline (silent). An MP4 plays inline only
   when uploaded through GitHub's editor (a URL of the form https://github.com/user-attachments/assets/ID on its own
   line); a committed MP4 opens in the file viewer; per third-party guides read on 2026-10-18,
   `<video>` tags pointing at repo paths are stripped. So the README shows GIFs and links the MP4 and an interactive page.
7. **Keep the interactive page working from disk.** Browsers block `fetch` of local JSON on
   `file://`, so the renderer also writes chapter data as a script (`chapters.js`,
   `render.ts:242`); the local server answers HTTP range requests so the video can seek
   (`parseRange`, `apps/local/src/media/serve-tour.ts:32`).

## Why This Matters

Text burned into a recording binds it to one framing; every new format then means re-recording or
accepting clipped captions. Captions that cover or precede their evidence make an honest demo look
wrong, which matters most for a project whose pitch is that every value is traceable. Frame review
by a separate agent caught all the placement and timing problems above; a test suite could not,
because nothing was functionally broken.

## When to Apply

- Any scripted product video built from a real UI, especially when one take feeds several formats.
- When captions are generated (storyboard JSON) rather than edited by hand in a video editor.
- Skip the band when the output is a single 16:9 video with no crops and captions can overlay
  safely; it costs 96 px of app height.

## Examples

Before (in-page caption, cropped for social):

```text
square crop of the 1280x720 recording: UI tiny, caption pill cut at the crop edge,
caption box covering the subtotal row it talks about
```

After (data captions, band, cursor-following crop):

```ts
// render.ts: tour frame = 1280x624 app + 96 px band with label and caption
const band = [
  `pad=${SIZE.width}:${SIZE.height}:0:0:color=0x0b1417`,
  ...labels,
  captionFilters(writeCues("cap", appCaptionCues(app), 60), { font, size: 24, bottom: 18, pad: 0, left: 300, box: false }),
].filter(Boolean).join(",");

// ffmpeg.ts: square clip follows the cursor
const x = panExpression(cursor.map((m) => ({ t: m.t, v: m.x })));
`[0:v]crop=600:600:x='clip(${x}-300,0,iw-600)':y=...,scale=1080:1080`
```

Regenerate with `pnpm media` (record and render) or `pnpm media:render` (render only); raw
recordings stay in the ignored `docs/media/raw/`. Committed media files total roughly 50 MB (music excluded), and each
regeneration adds about that much, so re-run deliberately.

## Related

- `docs/media/README.md` (outputs, owner steps), `DECISIONS.md` D023 (decision and limits)
- `apps/local/e2e/demo.spec.ts` (the flow the video replays), `apps/local/e2e/tour.spec.ts`
