# ChatterPilot for shop owners

This page is for the person who runs the business, not for programmers. It explains what
ChatterPilot does, what you need, and how to try it with your own chats safely.

## Is this for you?

It probably is if:

- customers or your sales staff send orders on WhatsApp (in English, Hinglish or a mix);
- someone then re-types those orders into Tally, a spreadsheet, a billing app or a register;
- you have a price list (even a rough one) for the items people order most;
- mistakes come from re-typing: wrong quantity, a missed correction ("make it 45"), an old price.

It is probably **not** for you (yet) if most orders come as photos of handwritten lists, voice
notes without text, or calls. ChatterPilot reads text. Voice notes work only if you already have
a written transcript.

## What it does, in one example

A customer writes:

> Order for Kumar Builders site 2: 40 bags cement, 120 sq ft tiles 2x2 white
> *(an hour later)* Sorry make it 45 bags

ChatterPilot prepares a draft: Kumar Builders, UltraBond Cement 50kg × 45 bags at your price list's
₹410, tiles 120 sq ft at ₹52, totals with tax. **Every number shows where it came from**: the chat
line, your price list row, or the calculation. If something is unclear (a product it doesn't know, a
price that is out of date, a quantity written in words) it is marked for you to check. Nothing is
sent to the customer or to your billing tool until a person accepts it.

## What you need

1. A computer (Windows, Mac or Linux) and someone comfortable installing a program from the command
   line, or a developer/IT person to set it up once. (A one-click installer does not exist yet.)
2. Your price list as two simple spreadsheets saved as CSV: **products** (name, the words customers
   use for it, unit, price, tax %) and **customers** (name, nicknames). See
   [docs/catalogue.md](catalogue.md); start with your 20–50 most ordered items.
3. A WhatsApp chat export (next section).

## Exporting a WhatsApp chat

Only export chats you are allowed to use for your business, and keep the file on your computer.

**Android:** open the chat → tap ⋮ (top right) → **More** → **Export chat** → **Without media** →
save the file to your computer (for example email it to yourself or use a USB cable).

**iPhone:** open the chat → tap the contact or group name at the top → scroll down → **Export
Chat** → **Without Media** → save it to Files or send it to your computer.

You get a `.txt` file (or a `.zip` containing one). ChatterPilot reads either. Menu names change a
little between WhatsApp versions; look for "Export chat".

Tip: export a group with a few weeks of orders first. A later export of the same chat can be
imported again: messages already imported are recognised and not doubled.

## Trying it

Your setup person runs (details in the [README](../README.md)):

```sh
pnpm demo                      # first, the demo with invented data
pnpm chatterpilot init --timezone Asia/Kolkata --name "Your shop"
pnpm chatterpilot catalogue load your-price-list-folder
pnpm chatterpilot import "WhatsApp Chat with Orders.zip"
pnpm chatterpilot serve        # then open http://127.0.0.1:4317 in your browser
```

Then, in the browser: **Orders** shows messages that look like orders → open one → check the
marked fields → **Accept**. **Export** gives you a spreadsheet or an import file for Tally,
ERPNext or Zoho Books (these import files are new: try them on a test company first).

## Honest expectations

- On invented test messages written by others, ChatterPilot drafts about 3 in 4 order lines exactly
  right and flags most of the rest for checking ([docs/evaluation.md](evaluation.md)). Your chats
  will differ; teach it your shop's words in `lexicon.json` and your customers' nicknames in the
  price list, and it improves.
- It never guesses a price: prices come only from your price list.
- It will miss some orders and suggest some messages that are not orders. A person always
  decides.
- It does not reply to customers, read WhatsApp live, or submit anything in your billing tool.

## Privacy

Everything runs on your computer. Nothing is uploaded. Chats contain your customers' personal data:
keep exports and the `workspaces` folder private, delete what you no longer need, and tell
customers how you use their order messages. See [docs/privacy.md](privacy.md).

## Getting help

If your developer or IT person uses an AI coding assistant (Claude Code, Codex, Cursor), they can
point it at this repository: [docs/harnesses.md](harnesses.md) explains how it can set things up,
add your shop's words, and adapt the export to your billing tool.
