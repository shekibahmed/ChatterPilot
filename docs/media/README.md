# Walkthrough media

Everything here is generated from the running demo with invented data. Regenerate it after a UI
change with one command; nothing is drawn by hand and nothing leaves your computer.

```sh
pnpm media            # build the review app, record, render (about 5 minutes; needs ffmpeg)
pnpm media:render     # re-render from the last raw recording (docs/media/raw/, not committed)
pnpm media:tour       # open the interactive tour at http://127.0.0.1:4318/media/tour.html
```

| File | What it is |
|---|---|
| `tour.mp4` | The full walkthrough with background music: intro, eight chapters in the review app, a replay of a real agent session, and the outro |
| `tour.html` | Interactive tour: chapters, a progress bar with chapter marks, a caption transcript you can click to jump, music on or off, playback speed, keyboard shortcuts, deep links (`tour.html#05-correction`), the benefits with the test that checks each, and copy-paste setup for Claude Code, Codex and Cursor |
| `chapters.json`, `chapters.js`, `tour.vtt` | Chapter and caption times on the tour timeline (`chapters.js` lets `tour.html` work when opened from disk) |
| `poster.jpg` | Poster frame for the player |
| `gif/*.gif` | Silent loops for the README: intro, provenance, correction, export, dashboard, agent |
| `social/*-square.mp4`, `social/*-vertical.mp4` | Captioned clips with music for sharing (1080×1080 and 1080×1920) |
| `social/card-1280x640.png` | Social preview image for the repository |
| `music/` | The two background tracks and their licence (CC0, see [music/LICENSE.md](music/LICENSE.md)) |

## How it is made

- [`apps/local/src/media/record.ts`](../../apps/local/src/media/record.ts) starts the demo on a
  throwaway workspace and replays the same flow as the browser test
  ([`apps/local/e2e/demo.spec.ts`](../../apps/local/e2e/demo.spec.ts)) with a visible cursor and
  captions. The video therefore shows behaviour the test suite checks.
- Captions, intro cards and benefits come from
  [`apps/local/src/media/storyboard.json`](../../apps/local/src/media/storyboard.json). They were
  drafted by an Opus agent and fact-checked by two Sonnet agents against the docs and tests; a unit
  test keeps captions short, says "synthetic", forbids time-saving claims and checks that every
  benefit names a test that exists. The app is recorded 624 px tall and ffmpeg draws the chapter
  label and captions in a band below it, so they never cover the screen they describe; the same
  clean recording is cropped for the social clips.
- The intro and outro are HTML and CSS animations
  ([`pages/cards.html`](../../apps/local/src/media/pages/cards.html)) that use the demo's own order.
  The agent chapter types out [docs/agent-session.md](../agent-session.md), a recorded MCP session.
- [`apps/local/src/media/render.ts`](../../apps/local/src/media/render.ts) uses ffmpeg: constant
  frame rate, cross-fades between parts, a music bed with fade in and out, palette-optimised GIFs,
  and square and vertical social formats.

## Owner steps (need a person with access to the GitHub repository)

1. **Inline player in the README.** GitHub plays a video inside a README only when it was uploaded
   to GitHub. After the repository is public, edit README.md on github.com, drag `tour.mp4` into the
   editor, and put the `https://github.com/user-attachments/assets/…` URL it creates on its own line
   where the README comment says so.
2. **Social preview.** Settings → General → Social preview → upload `social/card-1280x640.png`.
3. **Interactive tour online.** Enable GitHub Pages for the repository (it serves `docs/`); the
   tour is then at `/media/tour.html`. Until then it runs locally with `pnpm media:tour`.
