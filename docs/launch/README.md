> Draft. Do not post until the repository is public and the owner has approved it.

# Launch plan

The aim is useful feedback, issues, stars and reviews from three groups: programmers, people who
build agents, and small-business operators who re-type WhatsApp orders. The way to get them is to be
useful and plain about what exists: an early prototype, tested only on synthetic data, never piloted.

Every draft in this folder says what ChatterPilot is, what it is not, and what feedback is wanted.
Nothing here may be posted while the repository is private.

## Files in this folder

| File | What it is |
|---|---|
| [show-hn.md](show-hn.md) | Three title options and the first comment |
| [reddit.md](reddit.md) | Posts for r/selfhosted, r/ClaudeAI, r/LocalLLaMA (conditional), r/smallbusiness, r/developersIndia or r/IndiaStartups |
| [x-thread.md](x-thread.md) | A six-post thread |
| [linkedin.md](linkedin.md) | One post, under 1,300 characters |
| [devto.md](devto.md) | Article: "Ten patterns for turning chat messages into records a person can trust" |
| [mcp-listings.md](mcp-listings.md) | Ready-to-paste entries for MCP lists and directories |
| [discussions.md](discussions.md) | Proposed Discussions categories and a pinned welcome post |
| [`../../.github/ISSUE_TEMPLATE/usage.yml`](../../.github/ISSUE_TEMPLATE/usage.yml) | New issue form: "Tell us how you use it" |

## 1. Prerequisites (the owner does these first)

None of these can be done by an agent: they change visibility or publish material.

1. **Commit the walkthrough media.** `docs/media/` (tour.mp4, tour.html, gif/, social/,
   card-1280x640.png, music licence) must be committed and pushed so links in the posts resolve.
   Check `docs/media/music/LICENSE.md` is included (both tracks are CC0 1.0).
2. **Make the repository public.** Settings, General, Danger Zone, Change visibility. Before that,
   run the release checklist ([docs/release-checklist.md](../release-checklist.md)): no secrets,
   no real chats, no private planning packet, history clean.
3. **Enable Discussions.** Settings, General, Features, Discussions. Create the categories in
   [discussions.md](discussions.md) and pin the welcome post.
4. **Set the social preview image.** Settings, General, Social preview, upload
   `docs/media/social/card-1280x640.png`. This is the image shown when the link is shared on HN,
   Reddit, X, LinkedIn and chat apps.
5. **Get an inline video player.** A video file committed to the repository does not play inline in
   a README. Drag `docs/media/tour.mp4` into the README editor on github.com (or into an issue
   comment box) so GitHub uploads it as an attachment, then paste the resulting link on its own
   line near the top of the README. tour.mp4 is about 12 MB; GitHub limits video attachments
   (check the current limit for the owner's plan before uploading), so if the upload is refused,
   use a clip from `docs/media/social/` instead (each is 1.2 to 1.9 MB) or re-encode the tour
   smaller.
6. **Add the issue form.** Commit `.github/ISSUE_TEMPLATE/usage.yml` and create a `usage` label
   (the form applies it). Optionally add a `contact_links` entry to `.github/ISSUE_TEMPLATE/config.yml`
   pointing questions to Discussions.
7. **Repository details.** Set the description (for example "Local-first toolkit: WhatsApp order
   messages become source-linked drafts a person checks and exports. Early prototype, synthetic
   data only.") and topics such as `whatsapp`, `mcp`, `local-first`, `small-business`, `typescript`,
   `order-management`, `provenance`.
8. **Enable private vulnerability reporting** (Settings, Code security) so the route described in
   SECURITY.md works.
9. **Test the clean path once** from a fresh clone on a second machine or a Codespace:
   `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm demo`. Fix anything a first-time visitor
   would hit before any post goes out.
10. **Turn repository paths into full links.** The drafts mention repository paths such as
    `docs/agent-session.md`, `docs/evaluation.md`, `docs/patterns.md` and `docs/media`. Plain paths
    do not become links on HN, Reddit, X or LinkedIn. Work is on `build/v0.1`, and merging to
    `main` needs separate owner approval, so first confirm that the public default branch actually
    contains `docs/` and `docs/media/`. Then replace each path in the draft being posted with
    `https://github.com/shekibahmed/ChatterPilot/blob/<default-branch>/<path>` (use `tree` instead of
    `blob` for a folder such as `docs/media`) and open every link while logged out. Do not post a
    link to a path that does not exist on that branch.

## 2. Order of channels and timing

Post in waves so each wave's feedback can be answered before the next one starts. Do not post
everywhere on the same day: unanswered comments look worse than no post.

| Wave | When | Channel | Why this order |
|---|---|---|---|
| 0 | Day 0 | Repository public, Discussions on, welcome post pinned | A quiet day to catch broken links and setup problems |
| 1 | Day 2 or 3 | Show HN ([show-hn.md](show-hn.md)) | Programmers give the most direct technical feedback; be at the keyboard for the first few hours |
| 1 | Same day, after HN | X thread, LinkedIn post | Points people who know the owner to the repository |
| 2 | Day 4 to 7 | r/ClaudeAI, r/selfhosted | Agent builders and self-hosters; one subreddit per day |
| 2 | Day 5 to 8 | dev.to article ([devto.md](devto.md)) | Lasting, searchable explanation of the patterns |
| 3 | Week 2 | r/developersIndia or r/IndiaStartups, then r/smallbusiness | Operators and Indian developers; by now the README reflects first feedback |
| 3 | Week 2 | MCP lists and directories ([mcp-listings.md](mcp-listings.md)) | Pull requests to lists are reviewed slowly; submit once the setup has been tested by strangers |
| 4 | Only if honest | r/LocalLLaMA | Only when a local-model adapter exists, or framed as a design question (see reddit.md) |

Wave 1 posts HN, X and LinkedIn on one day on purpose; this is the only day with more than one
channel.

Timing notes:

- Choose a time when the owner can reply for three to four hours afterwards. Commonly suggested
  times are weekday mornings US Eastern for HN and US-centred subreddits, and Indian working hours
  for the India-focused posts. These are habits, not measured facts; reachability matters more.
- Never ask anyone to upvote, and never coordinate votes. HN and Reddit both penalise it.
- One post per community. Do not cross-post the same text; each draft is written for its audience.

## 3. Checklist

Before any post:

- [ ] Repository is public; README renders; all links in the draft resolve when logged out
- [ ] Every repository path in the draft has been turned into a full GitHub link on the public default branch (prerequisite 10)
- [ ] Discussions enabled; categories created; welcome post pinned
- [ ] Social preview image set (check by pasting the link into a private chat preview)
- [ ] Inline tour video plays in the README
- [ ] `usage.yml` issue form committed; `usage` label exists
- [ ] Private vulnerability reporting enabled
- [ ] Fresh clone: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm demo` all pass (record exit codes in PROGRESS.md)
- [ ] The draft still matches the code: re-read the numbers against [docs/evaluation.md](../evaluation.md)
- [ ] The draft says "synthetic data" and "prototype" plainly, and quotes only held-out numbers with their caveat
- [ ] No em-dashes, no emoji, no claims of time saved, customers or listings
- [ ] Community rules re-read on the day (see the notes in each draft)

After each post:

- [ ] Reply to every substantive comment within the first few hours
- [ ] Turn each concrete report into an issue (see below) and link it in the reply
- [ ] Add a short PROGRESS.md entry: where it was posted, when, and what came back
- [ ] Update the README or docs where several people were confused by the same thing

## 4. Handling feedback

Rules that apply to every reply:

- **Never ask for real chats.** If someone offers to send a real export, thank them and point them
  to [CONTRIBUTING.md](../../CONTRIBUTING.md): describe the shape, use invented values.
- **If someone posts real personal data** (names, phone numbers, prices from a real chat) in an issue
  or Discussion, hide or edit it promptly and explain why, politely.
- **Security reports go private.** Point people to SECURITY.md; do not discuss the details in public.
- **Do not argue.** If a criticism is right, say so and open an issue. If it is a misunderstanding,
  answer once with a link to the doc and improve the doc.
- **Do not over-promise.** Answer "will it do X?" with what exists today and what the roadmap says
  X is waiting for ([docs/roadmap.md](../roadmap.md)).

Triage into the issue forms:

| What came in | Where it goes | Label |
|---|---|---|
| Something does not work as documented (install, demo, import, export) | Bug report (`bug.yml`) | `bug` |
| An export that does not parse, a date format, order words in a language or trade | Export format, language or order words (`format.yml`) | `format` |
| A workflow someone wants supported (complaints, bookings, a billing tool) | Idea or use case (`idea.yml`) | `idea` |
| "I tried it with my agent / in my shop and here is what happened" | Tell us how you use it (`usage.yml`) | `usage` |
| A vulnerability | Private vulnerability report (SECURITY.md) | none in public |
| A general question or discussion | Discussions, Q&A category | |

When a comment on HN, Reddit, X or LinkedIn contains a concrete report, open the issue yourself with
the form's fields filled from the comment (invented values only), and reply with the issue link so
the person can follow it. Once a week, read the `usage` issues together: they show who is actually
trying it and what got in the way, which is the input the roadmap needs.
