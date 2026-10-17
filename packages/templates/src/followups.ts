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

// Money context: payments need a money word or a money-like amount, so "40 bags bhej diye" or
// "maal bhej diya, please check" (the shop sending goods) is not a payment.
const MONEY =
  /(?:payment|pay|paid|transfer|paise|paisa|rupees?|rs\.?|₹|inr|upi|g ?pay|phone ?pe|paytm|neft|imps|rtgs|cheque|dues|amount|रुपये|रुपए|पैसे|पेमेंट|फोनपे|\b(?:bill|balance|hisab|hisaab|dues)\b.*\b(?:clear|settle|chuka|pay)\p{L}*)/iu;

const RULES: readonly {
  kind: Exclude<FollowupKind, "resolution">;
  re: RegExp;
  needs?: RegExp;
}[] = [
  {
    kind: "delivery_chase",
    re: /(?:abhi tak(?:\s+\p{L}+){0,2}\s+(?:nahi|nahin|nhi)\s+(?:aaya|aayi|aaye|aai|mila|mili|mile|pahuncha|pahunchi|pahunch\p{L}*)|(?:order|maal|saman|delivery|gaadi|gadi|truck|tempo)(?:\s+#?\w+)?\s+(?:ka|ki)\s+kya\s+hua|(?:kahan|kaha|kidhar)\s+(?:hai|h)\s+(?:gaadi|gadi|truck|tempo|maal|order|delivery)|(?:gaadi|gadi|truck|tempo|maal|order|delivery)\s+(?:kahan|kaha|kidhar)\s+(?:hai|h)|kab (?:tak )?(?:aayega|aayegi|aaenge|aaega|bhejoge|bhej rahe|milega|pahunchega|pahunchegi)|jaldi (?:bhijwa|bhej|bhejo|bhejiye)|kaam ruka|where is (?:my|the|our)(?:\s+\w+){0,3}\s+(?:order|delivery|material|maal|truck|cement|tiles|goods)|not (?:yet )?(?:received|delivered|arrived|reached)|still (?:waiting|not here|not received|not delivered|not arrived)|(?:has not|hasn't|haven't|have not) (?:arrived|reached|come)|supposed to (?:arrive|reach|come|be delivered)|any update on (?:my|the) (?:order|delivery)|delivery (?:kab|status)|अभी तक(?:\s+\S+){0,2}\s+नहीं\s+(?:आया|आई|आए|मिला|मिली|पहुँचा|पहुंचा)|कब (?:भेज|आएगा|आएगी|पहुंचेगा))/iu,
  },
  {
    kind: "complaint",
    re: /(?:\b\d+\s*(?:\p{L}+\s+)?(?:short|missing)\b|\b(?:are|is|was|were|came|aaya|aaye)\s+short\b|\bonly \d+ (?:came|arrived|received|delivered)|\b(?:sirf|only) \d+ (?:aaye|aayi|aaya|mile|mila)|\bkam (?:aaya|aaye|aayi|tha|the|thi|hai|mila|mile)\b|\b(?:toot|tut|toote|tooti|tuti|tute)\b|\b(?:phat|phate|phati|fate|fati)\b|\bbroken\b|\bdamaged?\b|\bleak(?:ing|age|s)?\b|\bwrong (?:item|material|size|colou?r|product|grade|quantity)\b|\bgalat\b|\bdefective\b|\bkharab\b|\b(?:poor|bad|low) quality\b|\bquality (?:issue|problem|kharab)\b|\bweak\b|टूट|खराब|कमज़ोर|कमजोर|गलत|क्वालिटी)/iu,
  },
  {
    kind: "payment_promise",
    re: /(?:\bwill (?:pay|clear|transfer|send|settle)\b|\b(?:bhej|de|kar|clear kar|transfer kar|chuka)\s*(?:dunga|doonga|dungi|denge|dege)\b|\b(?:payment|paise|cheque|check)\s+(?:kal|parso|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2} tarikh)\b|\bcheque will come\b|(?:दे|भेज|कर) (?:दूंगा|दूँगा|देंगे|दूंगी))/iu,
    needs: MONEY,
  },
  {
    kind: "payment_report",
    re: /(?:\bpayment(?:\s+of)?(?:\s+(?:rs\.?|₹)?\s*[\d,]+)?\s+(?:done|made|sent|kar diya|kar di|bhej diya|bhej di)\b|\b(?:i have |i've |have )?paid\b|\b(?:bhej|kar|transfer kar|de)\s*(?:diya|diye|di|dia)\b|\btransferred\b|\b(?:neft|upi|imps|gpay|g pay|phonepe|paytm)\s+(?:done|kar diya|se bhej diya|kar diye)\b|\bamount (?:sent|transferred)\b|(?:कर|भेज|दे) (?:दिए|दिया|दी))/iu,
    needs: MONEY,
  },
  {
    kind: "quote_request",
    re: /(?:\bquotation\b|\bquote for\b|\b(?:share|send|give|tell)\s+(?:me\s+)?(?:the\s+|your\s+)?(?:price|rate|quote|prices|rates)\b|\b(?:price|rate|rates|prices) (?:for|of)\b|\b(?:rate|bhav) (?:batao|bata do|bhejo|kya|list)\b|\b(?:kya|ka) (?:rate|bhav)\b|\brate chal\b|\bprice list\b|\bbest (?:rate|price)\b|\bkitne ka (?:padega|hoga)\b|कोटेशन|(?:रेट|भाव) (?:क्या|बताओ|भेजो))/iu,
  },
];

const RESOLUTION =
  /(?:\b(?:mil gaya|mil gaye|mil gayi|aa gaya|aa gaye|aa gayi|pahunch gaya|pahunch gayi|pahunch gaye|received(?: ok| all| thanks)?|got it|delivered,? thanks|thanks?,? (?:received|got it)|sab (?:sahi|theek|thik) (?:hai|aaya|mila)|koi problem nahi|(?:problem|issue) (?:solved|resolved|solve ho gayi|solve ho gaya)|solved|ho gaya,? thanks)\b|मिल गया|मिल गई|आ गया|पहुँच गया|पहुंच गया)/iu;

// Amounts: "15000", "15,000", "1,50,000", "₹ 2500.50"; a payment needs one written near it.
const AMOUNT =
  /(?:rs\.?|inr|₹)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d{3,}(?:\.\d{1,2})?|\d+(?:\.\d)?k)(?![\d%\p{L}])/iu;
/**
 * The first number that reads as money: currency-marked ("Rs 7,500", "₹2500", "18,450 rupees") or
 * a plain amount that is not a bill/order/plot number, a date, a year, a phone number or a
 * quantity of goods. Anything else is left unknown rather than guessed.
 */
function findAmount(body: string): { text: string; start: number } | null {
  const re = new RegExp(AMOUNT.source, "giu");
  for (const m of body.matchAll(re)) {
    const text = m[1];
    if (!text) continue;
    const start = m.index + m[0].indexOf(text);
    const before = body.slice(Math.max(0, start - 14), start);
    const after = body.slice(start + text.length, start + text.length + 12);
    const marked =
      /(?:rs\.?|inr|₹)\s*$/iu.test(before) || /^\s*(?:rupees?|rs\b|\/-|रुपये|रुपए)/iu.test(after);
    if (marked) return { text, start };
    const digits = text.replace(/\D/g, "");
    if (
      /(?:bill|invoice|inv|no\.?|number|#|ref|order|plot|flat|site|room|gate|pin|code)\s*[:#.-]?\s*$/iu.test(
        before,
      )
    )
      continue;
    if (/^[-/.]\d|^\s*(?:am|pm|baje)\b/iu.test(after) || /\d[-/.]$/.test(before)) continue;
    if (!text.includes(",") && digits.length >= 8) continue;
    if (/^(?:19|20)\d{2}$/.test(text)) continue;
    if (
      /^\s*(?:bags?|bori|box(?:es)?|kg|kgs|ton|tons|sq\s*ft|sqft|pcs|nos|pieces?|litre|ltr|rolls?|bundles?|sheets?|nag|feet|ft|mm|m)\b/iu.test(
        after,
      )
    )
      continue;
    return { text, start };
  }
  return null;
}

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
    const amountHit = rule.needs ? findAmount(body) : null;
    if (rule.needs && !rule.needs.test(body) && !amountHit) continue;
    if (rule.kind === "payment_promise" || rule.kind === "payment_report") {
      let amount: Field<number> = unknown();
      if (amountHit) {
        // "15k" is 15,000.
        const k = /^(\d+(?:\.\d)?)k$/i.exec(amountHit.text);
        const parsed = k
          ? parseAmountToMinor(String(Number(k[1]) * 1000), 2)
          : parseAmountToMinor(amountHit.text, 2);
        const evidence = [span(m, amountHit.start, amountHit.start + amountHit.text.length)];
        amount = parsed.ok
          ? { value: parsed.minor, status: "ok", evidence }
          : { value: null, status: "needs_review", evidence };
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
