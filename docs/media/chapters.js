window.TOUR = {
  duration: 237.73,
  chapters: [
    {
      id: "00-intro",
      title: "What it does",
      start: 0,
      end: 24,
      captions: [],
    },
    {
      id: "01-overview",
      title: "The review app",
      start: 24,
      end: 40.21,
      captions: [
        {
          t: 25.58,
          text: "The review app runs on this computer and needs no internet.",
        },
        {
          t: 30.57,
          text: "The demo opens with invented chat exports already imported.",
        },
        {
          t: 36.16,
          text: "Anita enters her name so each edit records who made it.",
        },
      ],
    },
    {
      id: "02-imports",
      title: "The original chat, untouched",
      start: 40.21,
      end: 56.3,
      captions: [
        {
          t: 41.7,
          text: "The Imports tab lists each chat export that was read.",
        },
        {
          t: 46.83,
          text: "Opening one shows the original text, untouched, with line numbers.",
        },
        {
          t: 52.19,
          text: "The Kumar Builders order is one message on lines 6 to 9.",
        },
      ],
    },
    {
      id: "03-draft",
      title: "From message to draft",
      start: 56.3,
      end: 79.58,
      captions: [
        {
          t: 57.78,
          text: "The Orders tab suggests messages that mention catalogue products.",
        },
        {
          t: 63.09,
          text: "Draft order prepares a draft from the Kumar Builders message.",
        },
        {
          t: 69.66,
          text: "Prices come from the catalogue. The draft total is INR 28,355.20.",
        },
        {
          t: 74.97,
          text: "No open issues are flagged. A later correction is not yet linked.",
        },
      ],
    },
    {
      id: "04-provenance",
      title: "Where each value came from",
      start: 79.58,
      end: 97.8,
      captions: [
        {
          t: 80.57,
          text: "Each field has source labels that show where its value came from.",
        },
        {
          t: 86.88,
          text: "Clicking Chat line 7 on the product field highlights the word cement.",
        },
        {
          t: 93.41,
          text: "The quantity label highlights the exact words 40 bags cement.",
        },
      ],
    },
    {
      id: "05-correction",
      title: "A correction, with reasons",
      start: 97.8,
      end: 127.65,
      captions: [
        {
          t: 98.8,
          text: 'Anita links the later message, "Sorry make it 45 bags cement."',
        },
        {
          t: 105.79,
          text: 'She gives a reason: "Customer corrected cement to 45 bags."',
        },
        {
          t: 116.24,
          text: "She excludes the old 40-bag line. The total is now INR 30,979.20.",
        },
        {
          t: 123.04,
          text: "Accepting the order locks it. The page reads Accepted and frozen.",
        },
      ],
    },
    {
      id: "06-export",
      title: "Export what was accepted",
      start: 127.65,
      end: 151.14,
      captions: [
        {
          t: 129.15,
          text: "Export uses only orders that a person has accepted.",
        },
        {
          t: 134.16,
          text: "The CSV carries the corrected 45 bags, not the original 40.",
        },
        {
          t: 139.62,
          text: "A Zoho Books import file is prepared. It is not yet tried in Zoho.",
        },
        {
          t: 146.47,
          text: "Tally Prime refuses until each name is matched in export-map.json.",
        },
      ],
    },
    {
      id: "07-dashboard",
      title: "A dashboard that shows its gaps",
      start: 151.14,
      end: 172.06,
      captions: [
        {
          t: 153.61,
          text: "The dashboard states its dates: 2026-01-12 to 2026-01-21.",
        },
        {
          t: 157.48,
          text: "It shows the gap as well: no data for 16 to 19 January.",
        },
        {
          t: 162.25,
          text: 'It refuses a week comparison: "Insufficient comparable data".',
        },
        {
          t: 167.39,
          text: "By default it counts accepted orders: INR 30,979.20 on 2026-01-12.",
        },
      ],
    },
    {
      id: "08-followups",
      title: "What is still open",
      start: 172.06,
      end: 190.69,
      captions: [
        {
          t: 173.56,
          text: "Follow-ups list what is still open in the chats.",
        },
        {
          t: 177.91,
          text: "Meera Shah's quote request is listed as open.",
        },
        {
          t: 182.1,
          text: "Promised and reported payments are listed as things to check.",
        },
        {
          t: 186.19,
          text: "A promise or a report is not a verified payment, the page says.",
        },
      ],
    },
    {
      id: "09-agent",
      title: "A coding agent, with limits",
      start: 189.8,
      end: 230.17,
      captions: [
        {
          t: 190.42,
          text: "A coding agent uses MCP, a tool link, to load the catalogue.",
        },
        {
          t: 202.13,
          text: "It imports a Hindi-English chat. Each draft line cites its chat words.",
        },
        {
          t: 208.72,
          text: "Its proposed edit is recorded as agent:demo-agent, with a reason.",
        },
        {
          t: 218.06,
          text: "Export refuses: nothing is accepted. The agent has no accept tool.",
        },
      ],
    },
    {
      id: "10-outro",
      title: "Try it",
      start: 230.17,
      end: 237.7,
      captions: [],
    },
  ],
  benefits: [
    {
      heading: "Every value cites its source",
      body: "Each draft field links to a chat line, a catalogue row, a calculation or a named person's edit. Clicking a source label highlights the words in the original message.",
      proof:
        'packages/orders/src/draft.test.ts: "cites the exact message text and source lines for chat-derived fields"',
    },
    {
      heading: "Unknown stays unknown",
      body: "Missing prices, unclear products and incompatible units become open issues instead of guesses. A draft with open issues cannot be accepted.",
      proof: 'packages/orders/src/draft.test.ts: "never invents a price, unit or tax"',
    },
    {
      heading: "Money is counted in whole units",
      body: "Amounts are stored as whole numbers of the smallest currency unit, so totals carry no decimal rounding error. Totals in different currencies are never added.",
      proof:
        'packages/core/src/money.test.ts: "avoids binary float error"; packages/orders/src/draft.test.ts: "refuses to total mixed currencies"',
    },
    {
      heading: "A person accepts, agents cannot",
      body: "The MCP server lets an agent import, draft and propose edits, each recorded under its name. It has no tool to accept, reject, fill or submit.",
      proof:
        'apps/local/src/mcp.test.ts: "lists the tools with honest hints, and no accept or form-filling tool"',
    },
    {
      heading: "Exports come from accepted orders only",
      body: "CSV, JSON and import files are built only from orders a person has accepted. The import files are experimental. The Tally Prime file is refused until every name is matched.",
      proof:
        'apps/local/src/server.test.ts: "lists targets and prepares files only from accepted orders, refusing Tally without a map"',
    },
  ],
  blurb:
    "This walkthrough follows one invented order through ChatterPilot. A WhatsApp export becomes a source-linked draft, a reviewer records a correction and accepts it, and the accepted order goes to an export. It ends with a coding agent using the same tools over MCP, including what it is not able to do. Everything runs locally on synthetic data, and the product is an early prototype that no real business has piloted yet.",
};
