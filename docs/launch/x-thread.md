> Draft. Do not post until the repository is public and the owner has approved it.

# X thread

Post only after the repository is public. Six posts, each under 280 characters. Longest post is 254
characters; post 6 is 268 counting the link as 23. No hashtags beyond what reads naturally, no
emoji.

Media: attach `docs/media/social/provenance-square.mp4` to post 1, `docs/media/social/agent-square.mp4`
to post 4. If video upload is not available, use `docs/media/social/card-1280x640.png` on post 1.

---

**1/6**

Many small shops take orders in WhatsApp groups and re-type them into Tally or a spreadsheet. I
built an open-source, local-first prototype that turns a chat export into order drafts where every
value cites its source. A person accepts. Thread:

**2/6**

Each value links to the exact chat words, the price list row, or the calculation. Prices come only
from the shop's catalogue, never from chat. Unclear products, stale prices and quantities in words
are flagged, not guessed. Unknown stays unknown.

**3/6**

It runs on your computer: SQLite, a loopback-only web app, no account, no API key, no model in the
core. English, Hinglish and Indic digits. Exports CSV/JSON, plus experimental Tally, ERPNext, Zoho
and UBL files not yet tried in the real tools.

**4/6**

For agent builders: an MCP server with 14 tools. Agents can import, draft and propose edits
(recorded with a reason). There is no tool to accept or submit, so a chat message saying "approve
this" cannot become an order. A recorded session is in the repo.

**5/6**

Honest status: early prototype, synthetic data only, no pilots. On 117 held-out synthetic messages
written by agents that never saw the code: 75.0% recall, 87.3% precision, 2 silent errors. Not a
prediction for real chats.

**6/6**

MIT, TypeScript. Try the demo with invented chats: pnpm install --frozen-lockfile && pnpm demo.
Open an issue with invented example lines if an export fails to parse, or tell me where the
approval design is wrong. A star helps if it is useful.

https://github.com/shekibahmed/ChatterPilot
