# Background music: sources and licences

Both tracks are dedicated to the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). No attribution is
required; the credit below is given as a courtesy, as the composer asks.

| File in this folder | Title | Composer | Source page | Licence |
|---|---|---|---|---|
| `hypnotic-chill.mp3` | Hypnotic Chill (Extended 4 minute mix) | cynicmusic (The Cynic Project, cynicmusic.com, pixelsphere.org) | <https://opengameart.org/content/hypnotic-chill-extended-4-minute-mix> | CC0 1.0 |
| `calm-ambient-2.mp3` | Calm Ambient 2 (Synthwave 15k) | cynicmusic (The Cynic Project, cynicmusic.com, pixelsphere.org) | <https://opengameart.org/content/calm-ambient-2-synthwave-15k> | CC0 1.0 |

Licence checked on each source page on 2026-10-18. Changes made here: loudness normalised to
-16 LUFS, re-encoded as 112 kbps MP3, metadata removed; `calm-ambient-2.mp3` is cut to the first
192 seconds (the original ends with 15 seconds of silence) with a 6-second fade-out.

SHA-256 of the original downloads:

```
8fa1ace27d6acbe740f729ad684b739143a7b7acb2fe2ffaa5ab2669cd9e297f  2010_June_HypnoticChill_17.mp3
8795429283315a6fd3249ea09a940158960ff7c40643a95fc3f7455f29db275f  002_Synthwave_15k.mp3
```

If both files are missing, `pnpm media` synthesises a quiet ambient pad with ffmpeg instead, so the
pipeline never depends on a download.
