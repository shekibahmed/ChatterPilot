> Draft. Do not post until the repository is public and the owner has approved it.

# Reddit posts

Post only after the repository is public. One subreddit per day at most, never the same text twice.

General rules for every post:

- **Read the subreddit's rules on the day of posting** (sidebar, pinned posts, wiki). Rules about
  self-promotion, flair, weekly threads and account age change often; the notes below say what to
  check, not what the rules currently are.
- **Disclose authorship** in the first lines: "I built this."
- **Value first.** Each post explains an idea that is useful even to someone who never clicks the
  link, then gives the link once.
- **Stay in the thread.** Reply to questions for the first few hours. Do not ask for upvotes.
- Do not post the same link to many subreddits at once; Reddit's spam filters and moderators treat
  that as spam regardless of quality.

---

## r/selfhosted

**Check before posting:** whether self-built projects are allowed as standalone posts or only on a
particular day or in a megathread; required flair; whether the project must be self-hostable
(ChatterPilot runs locally, not as a server for others, so say that plainly).

**Title:** I built a local-first tool that turns WhatsApp chat exports into order drafts, with no
account, no API key and no network calls in the core

**Body:**

I built this, so treat this as a disclosure: ChatterPilot is an MIT-licensed prototype for small
shops that take orders in WhatsApp groups and re-type them into a spreadsheet or billing tool.

Why it may interest this sub: it is local-first by design, not as an afterthought.

- Everything lives in a SQLite workspace on your disk. The web app binds to 127.0.0.1, refuses
  non-loopback Host headers (DNS rebinding) and cross-site requests.
- The core makes no outbound requests. The browser test for the demo checks that the whole demo
  makes none.
- No account, no API key, no model. Drafting is deterministic rules plus your own price list.
- Chat exports are imported from a file you choose; hostile ZIPs (path traversal, symlinks, zip
  bombs) are refused; re-importing an overlapping export does not duplicate messages.
- Every value in a draft links to its source (the chat span, the catalogue row, the calculation or a
  named person's edit). A person accepts; accepted records are frozen and only those are exported.

What it is not: it is an early prototype tested only on synthetic data. Nothing has been piloted
with a real business. It is not a server you host for a team yet; it is a local app for one
computer. There is no live WhatsApp connection: you export the chat yourself.

Try it with invented data: `pnpm install --frozen-lockfile && pnpm demo` (Node.js 22.18+, pnpm 12), or
open it in the dev container.

Repository: https://github.com/shekibahmed/ChatterPilot

Feedback I would value: what you would expect from a "local-first" tool like this that it does not
do yet (backups, multi-device, a Docker image?), and whether the privacy notes in docs/privacy.md
are clear.

---

## r/ClaudeAI

**Check before posting:** whether project showcases need a specific flair; whether posts about
tools built with Claude must say how Claude was used (this one does); any rule on linking GitHub
repositories.

**Title:** An MCP server where the agent can draft orders but there is deliberately no tool to
accept them (built with Claude Code)

**Body:**

I built ChatterPilot with Claude Code (plus Sonnet and Haiku sub-agents for research, test data
and review), and I want feedback from people who build agents on one design choice.

The project turns WhatsApp order chats into order drafts a person reviews. It has an MCP server with
14 tools. An agent can import a chat export, list messages that look like orders, create drafts and
propose edits. Edits are recorded as `agent:<name>` with a reason.

The agent cannot accept, reject or submit anything, because those tools do not exist. Not "the
tool asks for confirmation": there is no such tool. A test fails if a tool name matching
accept/approve/reject/fill/submit ever appears. My reasoning: a chat message saying "approve this
order" is prompt injection waiting to happen, and in headless runs a confirmation prompt may never
reach a human. Removing the capability seemed more reliable than filtering it. Tool results also
label chat text as untrusted data.

There is a real recorded session in docs/agent-session.md, including the agent calling
`accept_draft` and getting "Tool accept_draft not found".

How Claude was used to build it is written up in docs/how-it-was-built.md: small tested slices,
labelled test sets written by agents that never saw the drafting code, a held-out set that is
scored but not tuned on, and reviewer agents whose findings a separate agent tried to reproduce
before anything was fixed.

Honest status: early prototype, synthetic data only, not piloted with any business. On the
held-out synthetic set (117 messages) the rules get 75.0% recall and 87.3% precision with 2 silent
errors; those are synthetic messages and not a prediction for real chats.

Repository: https://github.com/shekibahmed/ChatterPilot (`.mcp.json` is included, so Claude Code
picks it up in the repository)

Questions for you: would you want an accept tool behind a human-in-the-loop confirmation instead?
How do you handle "the agent proposes, a person decides" in your own MCP servers?

---

## r/LocalLLaMA (conditional)

**Post only if one of these is true:** a local-model adapter exists, or the owner is comfortable
posting a design question. Today the core uses **no model at all**, so a post that implies "runs a
local LLM" would be dishonest. The draft below is the design-question version.

**Check before posting:** whether posts without a local-model component are allowed; required
flair (for example a discussion or resources flair); rules on self-promotion.

**Title:** Design question: a boundary for letting a local model propose order lines from chat
messages without trusting its output

**Body:**

I built a local-first prototype (ChatterPilot, MIT) that turns WhatsApp order messages into drafts
a person accepts. To be clear up front: it does not use a model today. Drafting is deterministic
rules plus the shop's price list, and it runs offline.

I have written the boundary a model would have to pass through, and I would like feedback from
people who run local models before I write an adapter:

- A model may only propose order lines as character spans of the message it was given. Products,
  prices and totals stay with deterministic catalogue code.
- `validateExtraction` quarantines unknown ids, duplicates, non-list output, spans outside the text
  and non-numeric quantities, so text injected into a chat cannot add content to a draft.
- A batch needs consent bound to provider, exact model, recipient, a hash of the exact items and a
  maximum estimated cost (cost would be zero for a local model, but the binding is the same).
- Timeouts count as uncertain and are never retried automatically.

The boundary is tested offline with a fixture provider (`packages/providers`). There is no real
adapter yet, local or cloud.

Questions: which small local models handle span extraction from short Hinglish/English messages
well? Would you rather see an Ollama or a llama.cpp server adapter? Is span-only output too strict
for messages like "dedh dozen elbow"?

Repository: https://github.com/shekibahmed/ChatterPilot (early prototype, synthetic data only)

---

## r/smallbusiness

**Check before posting:** this kind of subreddit usually restricts promotion strictly; check
whether links to your own project are allowed at all, whether there is a weekly promotion thread,
and whether a question-first post without a link is the only acceptable form. If links are not
allowed, post the question below without the link and answer with it only if someone asks.

**Title:** If you take orders on WhatsApp and re-type them somewhere, what goes wrong most often?

**Body:**

Disclosure: I am building a free, open-source (MIT) prototype for this problem, so I have an
interest. I am asking because I have only tested it on invented data and I would rather learn how
people actually work before building more.

The pattern I am trying to help with: customers or staff send orders in a WhatsApp group ("40 bags
cement, 120 sq ft tiles"), someone corrects it later ("make it 45"), and then a person re-types the
order into a spreadsheet, Tally or another billing tool.

The failures I would expect from how this works, and which I want you to confirm or correct, are:
corrections that get missed, last month's price typed instead of this month's, two customers with
the same name, and no way to show where a disputed number came from.

Questions:

1. Who does the re-typing in your business, and how long does it take on a busy day?
2. Which mistake costs you the most?
3. Would you ever let software read your chats if it stayed on your own computer, or is that a
   non-starter?

If you are curious about the prototype (it runs on your own computer, nothing is uploaded, a person
checks and accepts every order, and it has not been tried with a real business yet):
https://github.com/shekibahmed/ChatterPilot. Please do not share real chats or customer details
here or there; an invented example of the format is plenty.

---

## r/developersIndia (preferred) or r/IndiaStartups

Pick one of the two, not both in the same week.

**Check before posting:** r/developersIndia usually routes personal projects to a specific flair or
showcase thread and may have account-age or karma minimums; r/IndiaStartups may require a
particular flair for feedback requests and may disallow links in the post body. Read both sidebars
on the day.

### Version for r/developersIndia

**Title:** I built an open-source tool that turns WhatsApp order chats (English, Hinglish,
Devanagari digits) into drafts where every value cites its source

**Body:**

I built ChatterPilot (MIT, TypeScript, local-first). Many shops here take orders in WhatsApp
groups and someone re-types them into Tally or a spreadsheet. This prototype reads a chat export,
matches lines against the shop's price list, and prepares drafts a person checks and accepts.

Parts that may interest developers:

- **Hinglish and Indic scripts.** Unit words like *bori, peti, nag, darjan*, number words like *do,
  pachas, dedh, sawa do*, and digits in Devanagari, Bengali, Gujarati, Tamil and other scripts,
  normalised one-for-one so evidence spans stay exact. Quantities in words are always flagged for a
  person. Shops add their own words in `lexicon.json`.
- **Money as integers.** Paise, BigInt for intermediate products, half-up rounding in one function,
  Western and Indian digit grouping (1,20,000.50) parsed strictly.
- **Experimental exports** for Tally Prime, ERPNext, Zoho Books and UBL 2.1. Not yet loaded into
  the real tools: if you have a test company, this is where help is most useful.
- **An MCP server** so Claude Code, Codex or Cursor can draft orders, with no tool to accept them.

Honest status: early prototype, synthetic data only, no pilots. On a held-out set of 117 synthetic
messages (written by AI agents that did not see the code), the rules reach 75.0% recall and 87.3%
precision with 2 silent errors. By language, measured one revision earlier when overall held-out
recall was 72.8%: Hinglish 81.1% recall, English 59.4%, Devanagari 71.4% (7 lines). Synthetic, so
not a prediction for real chats.

Repo: https://github.com/shekibahmed/ChatterPilot

Looking for: native speakers of Marathi, Gujarati, Tamil or Bengali who can describe how orders are
actually written (invented examples only), and anyone with a Tally/ERPNext/Zoho test company.

### Version for r/IndiaStartups

**Title:** Validating a problem: re-typing WhatsApp orders into Tally. Open-source prototype,
looking for people who do this daily

**Body:**

Disclosure: I built this, and it is free and open source (MIT).

Many distributors and shops take orders in WhatsApp groups, then someone re-types them into Tally
or a spreadsheet. I built a prototype that reads a chat export on the shop's own computer and
prepares order drafts where every number shows where it came from (the chat line, the price list
row, or the calculation). Unclear items are flagged, never guessed, and a person accepts every
order before anything is exported.

It is an early prototype tested only on invented data. I am not claiming it saves time, because it
has not been measured with a real business. That is what I want to do next, with consent.

What I would like to hear from founders and operators:

- Is re-typing WhatsApp orders a real cost in your business or your customers' businesses?
- Would a shop owner trust a tool like this if it ran only on their computer?
- What would make you try it: a one-click installer, a Tally import that is proven to load, Hindi UI?

Repo (with a page for shop owners, docs/for-shops.md): https://github.com/shekibahmed/ChatterPilot
