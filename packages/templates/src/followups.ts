import { type Field, type Provenance, parseAmountToMinor } from "@chatterpilot/core";

/**
 * Follow-ups template: the open loops in a shop's chats. Customers chasing a delivery, reporting a
 * short or damaged supply, promising or reporting a payment, or asking for a quote; and the
 * messages that close those loops ("mil gaya", "received, thanks"). Deterministic keyword rules
 * (English and romanised Hindi) with evidence spans; links that are inferred rather than explicit
 * are marked for review. Nothing here verifies a payment or a delivery.
 */

export const FOLLOWUPS_TEMPLATE_VERSION = "followups/1";

export interface FollowupMessage {
  readonly id: string;
  readonly author: string | null;
  readonly localDateTime: string | null;
  readonly startLine: number;
  readonly body: string;
}

export type FollowupKind =
  | "delivery_chase"
  | "complaint"
  | "payment_promise"
  | "payment_report"
  | "quote_request"
  | "resolution";

export interface FollowupItem {
  readonly id: string;
  readonly kind: FollowupKind;
  readonly messageId: string;
  readonly occurredAt: string | null;
  /** Who wrote it, exactly as in the export. */
  readonly author: string | null;
  /** The phrase that triggered the rule. */
  readonly trigger: Field<string>;
  /** Payments only: an amount written in the message. Reported or promised, never verified. */
  readonly amount: Field<number>;
  /** Payment promises only: when, as written ("kal", "tomorrow", "15 tarikh"). */
  readonly due: Field<string>;
  readonly links: FollowupLink[];
}

export interface FollowupLink {
  readonly type: "repeat_of" | "resolves";
  readonly itemId: string;
  /** Always "needs_review": these links are inferred from author and timing. */
  readonly strength: "needs_review";
  readonly basis: string;
}

const RULES: readonly { kind: Exclude<FollowupKind, "resolution">; re: RegExp }[] = [
  {
    kind: "delivery_chase",
    re: /\b(?:abhi tak (?:nahi|nahin) (?:aaya|aayi|aaye|mila|mili|pahunch\w*)|kab tak (?:aayega|aayegi|aaenge|bhejoge|milega)|kab (?:aayega|aayegi|bhejoge)|where is (?:my|the|our) (?:\w+ ){0,2}(?:order|delivery|material|maal|truck)|not (?:yet )?(?:received|delivered)|still (?:waiting|not received)|any update on (?:my|the) (?:order|delivery)|delivery (?:kab|status))\b/iu,
  },
  {
    kind: "complaint",
    re: /\b(?:\d+\s*(?:\w+\s+)?(?:short|kam|missing)|kam (?:aaya|aaye|aayi|tha|the|thi|hai|mila|mile)|toot (?:gaye|gaya|gayi)|tut (?:gaye|gaya)|broken|damaged?|leak(?:ing|age)?|wrong (?:item|material|size|colour|color|product)|galat (?:maal|saman|size|item)|defective|kharab|quality (?:issue|problem|kharab))\b/iu,
  },
  {
    kind: "payment_promise",
    re: /\b(?:will (?:pay|transfer|send (?:the )?payment)|(?:payment|paise|cheque|check) (?:kal|parso|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2} tarikh)|(?:kal|parso|tomorrow) (?:tak )?(?:payment|paise|pay) (?:kar|bhej|de) ?(?:dunga|denge|dege|doonga|du)|cheque will come|payment (?:kar dunga|kar denge|bhej dunga|bhej denge|de dunga|de denge))\b/iu,
  },
  {
    kind: "payment_report",
    re: /\b(?:payment (?:done|made|sent|kar diya|kar di|bhej diya|bhej di)|paid|paise bhej diye|transferred|neft (?:done|kar diya)|upi (?:done|kar diya|se bhej diya)|gpay (?:kar diya|done)|amount (?:sent|transferred))\b/iu,
  },
  {
    kind: "quote_request",
    re: /\b(?:quotation|quote for|rate (?:batao|bhejo|kya hai|list)|bhav (?:batao|kya hai)|price list|best (?:rate|price)|kitne ka (?:padega|hoga))\b/iu,
  },
];

const RESOLUTION =
  /\b(?:mil gaya|mil gaye|mil gayi|aa gaya|aa gaye|pahunch gaya|received(?: ok| all| thanks)?|got it|delivered,? thanks|thanks?,? (?:received|got it)|sab (?:sahi|theek) (?:hai|aaya|mila)|problem solved|issue resolved|ho gaya,? thanks)\b/iu;

// Amounts: "15000", "15,000", "1,50,000", "₹ 2500.50"; a payment needs one written near it.
const AMOUNT =
  /(?:rs\.?|inr|₹)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d{3,}(?:\.\d{1,2})?)(?![\d%])/iu;
const DUE =
  /\b(?:kal|parso|aaj|today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*tarikh|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)\b/iu;

const unknown = <T>(): Field<T> => ({ value: null, status: "unknown", evidence: [] });

function span(msg: FollowupMessage, start: number, end: number): Provenance {
  const line = msg.startLine + (msg.body.slice(0, start).match(/\n/g)?.length ?? 0);
  const endLine = msg.startLine + (msg.body.slice(0, end).match(/\n/g)?.length ?? 0);
  return {
    kind: "message",
    messageId: msg.id,
    startLine: line,
    endLine,
    span: { start, end },
    text: msg.body.slice(start, end),
  };
}

function found(msg: FollowupMessage, m: RegExpExecArray, group = 0): Field<string> {
  const text = m[group] ?? m[0];
  const start = m.index + (group === 0 ? 0 : m[0].indexOf(text));
  return { value: text, status: "ok", evidence: [span(msg, start, start + text.length)] };
}

/** Items in one message (zero or more). Links are added by `linkFollowups`. */
export function extractFollowups(msg: FollowupMessage): FollowupItem[] {
  // Long pasted messages are cut, like order extraction, so no rule can take long.
  const body = msg.body.length > 2000 ? msg.body.slice(0, 2000) : msg.body;
  const m = { ...msg, body };
  const items: FollowupItem[] = [];
  const add = (kind: FollowupKind, trigger: Field<string>, extra: Partial<FollowupItem> = {}) =>
    items.push({
      id: `${msg.id}#${items.length}`,
      kind,
      messageId: msg.id,
      occurredAt: msg.localDateTime,
      author: msg.author,
      trigger,
      amount: unknown(),
      due: unknown(),
      links: [],
      ...extra,
    });

  for (const rule of RULES) {
    const hit = rule.re.exec(body);
    if (!hit) continue;
    if (rule.kind === "payment_promise" || rule.kind === "payment_report") {
      const amountHit = AMOUNT.exec(body);
      let amount: Field<number> = unknown();
      if (amountHit?.[1]) {
        const parsed = parseAmountToMinor(amountHit[1], 2);
        const at = amountHit.index + amountHit[0].indexOf(amountHit[1]);
        amount = parsed.ok
          ? { value: parsed.minor, status: "ok", evidence: [span(m, at, at + amountHit[1].length)] }
          : {
              value: null,
              status: "needs_review",
              evidence: [span(m, at, at + amountHit[1].length)],
            };
      }
      const dueHit = rule.kind === "payment_promise" ? DUE.exec(body) : null;
      add(rule.kind, found(m, hit), { amount, due: dueHit ? found(m, dueHit) : unknown() });
      continue;
    }
    add(rule.kind, found(m, hit));
  }
  const closing = RESOLUTION.exec(body);
  // "Received only 35, 5 short" is a complaint, not a resolution.
  if (closing && !items.some((i) => i.kind === "complaint" || i.kind === "delivery_chase")) {
    add("resolution", found(m, closing));
  }
  return items;
}

const DAY = 24 * 3600 * 1000;
const time = (i: FollowupItem) => (i.occurredAt ? Date.parse(`${i.occurredAt}Z`) : Number.NaN);
const OPENING: ReadonlySet<FollowupKind> = new Set([
  "delivery_chase",
  "complaint",
  "quote_request",
]);

/**
 * Link items in chronological (export) order. A second chase or complaint of the same kind from
 * the same person within 7 days is a repeat; a closing message resolves that person's latest open
 * item within 7 days. Both are inferences and are marked for review.
 */
export function linkFollowups(items: readonly FollowupItem[]): FollowupItem[] {
  const out = items.map((i) => ({ ...i, links: [...i.links] }));
  const open: FollowupItem[] = [];
  for (const item of out) {
    const recent = (i: FollowupItem) =>
      i.author !== null && i.author === item.author && time(item) - time(i) <= 7 * DAY;
    if (OPENING.has(item.kind)) {
      const first = open.find((i) => i.kind === item.kind && recent(i));
      if (first) {
        item.links.push({
          type: "repeat_of",
          itemId: first.id,
          strength: "needs_review",
          basis: "same person and kind within 7 days",
        });
      } else {
        open.push(item);
      }
    }
    if (item.kind === "resolution") {
      const target = [...open].reverse().find(recent);
      if (target) {
        item.links.push({
          type: "resolves",
          itemId: target.id,
          strength: "needs_review",
          basis: "closing message from the same person within 7 days",
        });
        open.splice(open.indexOf(target), 1);
      }
    }
  }
  return out;
}

export interface OpenLoop {
  readonly itemId: string;
  readonly kind: FollowupKind;
  readonly author: string | null;
  readonly since: string | null;
  /** Hours from this item to the latest follow-up item found (not to "now"). */
  readonly ageHours: number | null;
  readonly repeats: number;
  readonly text: string | null;
}

export interface FollowupSummary {
  readonly open: readonly OpenLoop[];
  readonly resolved: number;
  /** Kept apart and never added together: neither is a verified payment. */
  readonly promisedMinor: number;
  readonly reportedPaidMinor: number;
  readonly itemsByKind: Readonly<Record<string, number>>;
  /** Time of the latest follow-up item; ages are measured to this point. */
  readonly asOf: string | null;
}

export function summariseFollowups(items: readonly FollowupItem[]): FollowupSummary {
  const resolvedIds = new Set(
    items.flatMap((i) => i.links.filter((l) => l.type === "resolves").map((l) => l.itemId)),
  );
  const repeats = new Map<string, number>();
  for (const i of items)
    for (const l of i.links)
      if (l.type === "repeat_of") repeats.set(l.itemId, (repeats.get(l.itemId) ?? 0) + 1);
  const times = items.map(time).filter((t) => !Number.isNaN(t));
  const last = times.length > 0 ? Math.max(...times) : null;
  const itemsByKind: Record<string, number> = {};
  for (const i of items) itemsByKind[i.kind] = (itemsByKind[i.kind] ?? 0) + 1;
  const sum = (kind: FollowupKind) =>
    items.reduce((acc, i) => acc + (i.kind === kind ? (i.amount.value ?? 0) : 0), 0);
  return {
    open: items
      .filter(
        (i) =>
          OPENING.has(i.kind) &&
          !resolvedIds.has(i.id) &&
          !i.links.some((l) => l.type === "repeat_of"),
      )
      .map((i) => ({
        itemId: i.id,
        kind: i.kind,
        author: i.author,
        since: i.occurredAt,
        ageHours:
          last === null || Number.isNaN(time(i)) ? null : Math.round((last - time(i)) / 3600000),
        repeats: repeats.get(i.id) ?? 0,
        text: i.trigger.value,
      })),
    resolved: resolvedIds.size,
    promisedMinor: sum("payment_promise"),
    reportedPaidMinor: sum("payment_report"),
    itemsByKind,
    asOf: last === null ? null : new Date(last).toISOString().slice(0, 19),
  };
}
