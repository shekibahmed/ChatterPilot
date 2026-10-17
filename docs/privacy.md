# Privacy and consent (India)

> **General information, not legal advice.** Written on 2026-10-17 from the official texts of the
> Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025 (links below). Commencement
> dates may change; check the current position, and ask a qualified adviser for your situation.

Order chats contain your customers' and staff's personal data: names, phone numbers, addresses,
what they buy, sometimes payment details. ChatterPilot is built so that this data stays on your
computer. The law still applies to what you do with it.

## Where the law stands (October 2026)

- The **DPDP Act, 2023** is law. The **DPDP Rules, 2025** were notified in November 2025
  (G.S.R. 846(E)) with a phased start: rules on the Data Protection Board applied at once; consent
  managers from about **November 2026**; the main duties for businesses (notice, consent, security,
  breach reporting, rights, erasure) from about **May 2027**. Secondary sources report a proposal
  to shorten this timeline; at the time of writing we could not confirm it was adopted.
- A business that decides how its customers' chats are used is a **Data Fiduciary**. The Act's
  exclusion for "personal or domestic purpose" (s. 3(c)(i)) covers individuals' private use, not a
  shop's orders.
- We found no notified exemption for small businesses. The Act allows the Government to exempt
  classes such as startups from some duties (s. 17(3)); security and breach duties would still apply.

Sources: [Act (MeitY PDF)](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf),
[Rules (MeitY PDF)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf),
[PIB backgrounder](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf).

## Why processing an order message is usually allowed

Section 7(a) lets a business process personal data "for the specified purpose for which the Data
Principal has voluntarily provided her personal data". The Act's own examples are close to ours (a
customer giving details to a pharmacy for a receipt; a person messaging a broker about a rental).
A customer who sends an order on WhatsApp has provided it for that order. That covers drafting,
checking and recording the order. It does not cover using the chats for marketing or to train an
AI model, and it ends if the customer says stop. (This reading is ours; there is no official
guidance yet.)

## Ten practical habits

1. **Use chats only for the orders they contain.** No marketing lists, no model training.
2. **Tell customers, in one plain sentence**, for example on your invoice or WhatsApp profile:
   "We keep your order messages to process and record your orders. To see, correct or delete them,
   contact <name, number>." Name a contact person (s. 8(9), Rule 9).
3. **Export only what you need**: order chats, without media. Not family or unrelated groups.
4. **Protect the computer**: disk encryption, a screen lock, separate user accounts, backups. Rule 6
   expects encryption or masking, access control, logs and backups as a minimum.
5. **Delete stray copies**: the export you emailed to yourself, the ZIP in Downloads, the copy on a
   pen drive. ChatterPilot keeps its own copy inside the `workspaces` folder.
6. **Keep a retention period in writing.** Rule 8(3) asks every business to keep personal data and
   processing logs for at least one year; the Act asks you to erase data once the purpose is served;
   tax law may need order records for longer. Decide a period with your accountant.
7. **Plan for a breach** (a lost laptop counts): tell affected customers without delay and the Data
   Protection Board without delay, with details within 72 hours (Rule 7). Rule 7 has no size threshold.
8. **Answer requests**: be able to find, correct and delete a customer's messages, and publish how to
   ask. Rule 14 sets an outer limit of 90 days for grievances; aim for much faster.
9. **Think before turning on any cloud AI.** ChatterPilot never sends chat text anywhere unless a
   person turns on a provider (not available yet). If you do, the provider becomes your Data
   Processor: use one under a written contract with security terms (s. 8(2), Rule 6), check whether
   it stores or trains on your data and where, and say so in your notice.
10. **Remember the other people in the chat**: staff and group members are data principals too;
    take extra care with anything about children (s. 9).

## What ChatterPilot does to help

- Runs on your computer; the review app listens only on `127.0.0.1`; no account, no telemetry.
- Imports only the files you choose; never searches your disk or connects to WhatsApp.
- Keeps every value linked to the message it came from, so correcting or explaining a record is quick.
- Exports only orders a person accepted.

What it does **not** do yet: delete a single customer's messages from a workspace with one
command, or keep a log of who viewed what. Until it does, deleting a workspace folder removes
everything in it.

## WhatsApp's terms

WhatsApp describes "Export chat" in its own help pages. Its consumer Terms of Service restrict
"non-personal use" of the personal app unless authorised, and require that you have the rights to
information you submit; WhatsApp Business has separate terms. Check which app and terms your
business uses.

## Open questions we could not settle

Exact commencement days (sources differ by a day), whether the shortened timeline was adopted,
whether a notice is strictly required when relying on s. 7(a) alone, and how the one-year
retention rule and the erasure duty fit together for small businesses. These need an adviser.
