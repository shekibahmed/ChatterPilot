> Draft. Do not post until the repository is public and the owner has approved it.

# LinkedIn post

Post only after the repository is public. The post text below is 1,284 characters including the
link (recounted after the last edit), under the 1,300-character limit. Attach
`docs/media/social/correction-square.mp4` or, if video is not wanted,
`docs/media/social/card-1280x640.png`. LinkedIn tends to show fewer people posts with links in the
body; if that matters, put the link in the first comment and say "link in the first comment".

---

In many small businesses, WhatsApp is the order book. A customer writes "40 bags cement", then
"sorry, make it 45". Later someone re-types the order into Tally or a spreadsheet, and corrections
or old prices slip through.

I have open-sourced ChatterPilot, an early prototype for this. It reads a chat export on the shop's
own computer and prepares order drafts where every value shows where it came from: the chat line,
the price list row, or the calculation. Unclear items are flagged, never guessed. A person checks
and accepts every order before it is exported.

It also lets coding agents (Claude Code, Codex, Cursor) prepare drafts, but there is no tool for an
agent to accept one.

To be plain: it has been tested only on invented data and has not been used by a real business
yet.

I am looking for feedback from:
- shop owners and distributors who re-type WhatsApp orders today
- accountants or ERP consultants with a Tally, ERPNext or Zoho test company
- developers and agent builders

Try the demo (invented chats): pnpm demo, or watch the 4-minute walkthrough in the repository. If
an export does not parse, open an issue with invented example lines. A star helps if it is useful.

MIT licensed. Please do not share real chats.

https://github.com/shekibahmed/ChatterPilot
