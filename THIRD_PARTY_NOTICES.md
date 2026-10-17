# Third-party software

ChatterPilot is MIT-licensed (see [LICENSE](LICENSE)). It uses the packages below at runtime or
bundles them into the built review app. Each keeps its own licence; this file does not relabel any
of them. Inventory produced with `pnpm -r licenses list --prod` on 2026-10-17 and checked against
each package's `package.json`. Development-only tools (TypeScript, Biome, Vitest, Vite and its build
dependencies such as lightningcss, MPL-2.0) are not distributed and are not listed.

| Package | Version | Licence | Used for |
|---|---|---|---|
| better-sqlite3 | 13.0.3 | MIT | Local SQLite database (bundles SQLite, which is in the public domain) |
| node-addon-api | 8.9.2 | MIT | Native addon support for better-sqlite3 |
| yauzl | 3.4.0 | MIT | Reading ZIP exports safely |
| pend | 1.2.0 | MIT | Dependency of yauzl |
| hono | 4.13.12 | MIT | Local HTTP API |
| @hono/node-server | 2.1.3 | MIT | Node adapter for Hono |
| playwright / playwright-core | 1.63.0 | Apache-2.0 | Browser connector for the synthetic order form (opt-in) |
| react / react-dom | 19.3.0 | MIT | Review app UI (bundled into `apps/local/dist/web`) |
| scheduler | 0.28.0 | MIT | Dependency of react-dom (bundled) |

## Apache-2.0 notice (Playwright)

Playwright is © Microsoft Corporation, licensed under the Apache License, Version 2.0
(<https://www.apache.org/licenses/LICENSE-2.0>). Its `NOTICE` and `ThirdPartyNotices.txt` files are
shipped inside the installed `playwright-core` package and must be kept with any distribution that
includes it. ChatterPilot does not modify Playwright.

## Before any public release

- Re-run the inventory for the exact release lockfile and update this file.
- Playwright downloads browser binaries separately; their licences apply to those downloads.
- Optional future components (a speech-to-text sidecar, provider SDKs) must be inventoried, including
  model weights and native libraries such as FFmpeg, before they are added.
