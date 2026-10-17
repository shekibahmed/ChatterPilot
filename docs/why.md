# Why ChatterPilot exists

## The everyday problem

In many small businesses, especially in India, WhatsApp is the order book. A customer writes
"40 bags cement, 120 sq ft white tiles, deliver Thursday". Ten minutes later: "sorry make it 45
bags". A voice note follows. Someone at the shop then reads back through the group and re-types
the order into a billing app, a spreadsheet or an ERP.

That re-typing is slow and error-prone in predictable ways:

- **Corrections get lost.** The second message changes the first, but they sit far apart.
- **Prices drift.** The person typing remembers last month's rate, not the current one.
- **Names are ambiguous.** "Kumar" could be two different customers; "tiles" could be five products.
- **Nothing is traceable.** When a number is disputed, nobody can show where it came from.

Moving everyone to a new app rarely works. Customers and suppliers stay on WhatsApp.

## What automation can honestly do here

Modern tools can read the chat, find the order-like messages, match them against the business's own
price list and prepare a draft. That removes most of the re-typing. They cannot know things the
chat does not say, and they should not pretend to.

ChatterPilot is built around that boundary:

1. **The chat is evidence, not truth.** Every proposed value links to the exact words in the exact
   message, or to the catalogue row it came from, or to the calculation that produced it.
2. **The owner's catalogue is the authority for prices and tax.** A price mentioned in chat is not
   silently trusted, and a missing price is never invented.
3. **Unknown stays unknown.** If the unit, product or customer is unclear, the draft says so and
   waits for a person.
4. **People decide.** Corrections need a reason and are recorded. Nothing is exported until someone
   accepts it, and an accepted order is frozen with a fingerprint.
5. **Local first.** The chat never has to leave the shop's computer. Optional AI features (planned)
   will be opt-in, use the owner's own key, and show what would be sent before anything is sent.

This is deliberately less "magical" than fully automatic order entry. It is meant to be trustworthy
enough that a busy owner can rely on it, and transparent enough that mistakes are easy to catch.

## What is not claimed

No time savings, accuracy figures or customer results are claimed yet. The current demo uses
invented data. The plan is to measure, with consenting businesses, how long review and correction
take compared with re-typing; how often critical fields are wrong or flagged; and whether owners keep
using it. If it does not reduce total work, the right answer is to narrow or change it, not to add
features.

## Where this can go

- Voice notes: transcription with names and numbers highlighted for checking.
- Staff forwarding selected messages through a private Telegram bot.
- Filling the shop's existing billing or ERP form, with a read-back check and a hard stop before
  anything is submitted without approval.
- Operational dashboards (pending follow-ups, repeated complaints, delivery status) that always
  show how complete the underlying chat record is.

Each of these is a separate, permission-gated step. The foundation (evidence, review and exact
arithmetic) comes first.
