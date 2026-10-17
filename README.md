# ChatterPilot

**Turn WhatsApp order messages into source-linked drafts you can check and export.**

ChatterPilot is a local-first toolkit for small businesses whose orders, follow-ups and operational
updates live in WhatsApp chats. It imports chat exports you choose, proposes business records that
link back to the exact messages they came from, lets a person review and correct them, and exports
clean CSV/JSON. It runs on your machine. Core features need no account, API key or network.

> **Status: early private prototype.** Nothing here is production-ready yet. The support matrix,
> measured limits and demo will be added as each piece is built and tested.

## Principles
- **Evidence first.** Every proposed field shows where it came from: a message, the price catalogue,
  a calculation, or a human correction.
- **Unknown stays unknown.** No invented prices, dates or totals.
- **Humans approve.** Nothing consequential happens without review.
- **Local by default.** Optional AI processing is opt-in, uses your own key, and shows what is sent.

## Development
Requires Node.js 26+ and pnpm 12.

```sh
pnpm install --frozen-lockfile
pnpm check
```

## Licence
MIT © 2026 Shekib Ahmed. See [LICENSE](LICENSE).
