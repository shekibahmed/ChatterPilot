/**
 * WhatsApp export timestamps are locale-formatted wall-clock text with no timezone.
 * We keep the original text, decide day/month order across the whole export (never per line),
 * and produce a floating local date-time. Applying a timezone is a later, explicit step.
 */

export type DateOrder = "dmy" | "mdy" | "ymd";
export type DateOrderDetection = DateOrder | "ambiguous" | "conflict";

export interface TimestampParts {
  /** First, second and third numeric date components exactly as written. */
  readonly p1: string;
  readonly p2: string;
  readonly p3: string;
  readonly hour: number;
  readonly minute: number;
  readonly second: number | null;
  /** "a" or "p" for 12-hour clocks, null for 24-hour clocks. */
  readonly meridiem: "a" | "p" | null;
}

const SP = "[ \\u00A0\\u202F]";
const TIMESTAMP_RE = new RegExp(
  String.raw`^(\d{1,4})([./-])(\d{1,2})\2(\d{1,4}),?${SP}+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:${SP}?([AaPp])\.?${SP}?[Mm]\.?)?$`,
);

export function parseTimestampText(text: string): TimestampParts | null {
  const m = TIMESTAMP_RE.exec(text);
  if (!m) return null;
  const [, p1 = "", , p2 = "", p3 = "", h = "", min = "", s, mer] = m;
  // Either year-first (2024-12-31) or a 2/4-digit year last (31/12/24, 12/31/2024).
  const validShape =
    p1.length === 4 ? p3.length <= 2 : p1.length <= 2 && (p3.length === 2 || p3.length === 4);
  if (!validShape) return null;
  return {
    p1,
    p2,
    p3,
    hour: Number(h),
    minute: Number(min),
    second: s === undefined ? null : Number(s),
    meridiem: mer === undefined ? null : (mer.toLowerCase() as "a" | "p"),
  };
}

function couldBe(parts: TimestampParts, order: DateOrder): boolean {
  const a = Number(parts.p1);
  const b = Number(parts.p2);
  if (order === "ymd") return parts.p1.length === 4;
  if (parts.p1.length === 4) return false;
  if (order === "dmy") return a >= 1 && a <= 31 && b >= 1 && b <= 12;
  return a >= 1 && a <= 12 && b >= 1 && b <= 31;
}

const ORDERS = ["dmy", "mdy", "ymd"] as const;

/**
 * Decide date order from every timestamp in an export. Ambiguity is reported, never guessed.
 * Timestamps that fit no order at all (corrupt lines) are left out here and fail individually
 * at resolution, so one bad line cannot hide the order of the rest.
 */
export function detectDateOrder(all: readonly TimestampParts[]): DateOrderDetection {
  const usable = all.filter((p) => ORDERS.some((order) => couldBe(p, order)));
  const candidates = ORDERS.filter((order) => usable.every((p) => couldBe(p, order)));
  if (candidates.length === 1) return candidates[0] as DateOrder;
  return candidates.length === 0 ? "conflict" : "ambiguous";
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * Resolve to a floating ISO-like local date-time ("2024-12-31T21:41:00"), or null if the
 * components are impossible under the given order (e.g. 31/02, 13 PM).
 */
export function toLocalDateTime(parts: TimestampParts, order: DateOrder): string | null {
  if (!couldBe(parts, order)) return null;
  let year: number;
  let month: number;
  let day: number;
  if (order === "ymd") {
    [year, month, day] = [Number(parts.p1), Number(parts.p2), Number(parts.p3)];
  } else {
    const yy = Number(parts.p3);
    year = parts.p3.length === 2 ? 2000 + yy : yy;
    [day, month] =
      order === "dmy" ? [Number(parts.p1), Number(parts.p2)] : [Number(parts.p2), Number(parts.p1)];
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;

  let hour = parts.hour;
  if (parts.meridiem === null) {
    if (hour > 23) return null;
  } else {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (parts.meridiem === "p" ? 12 : 0);
  }
  const second = parts.second ?? 0;
  if (parts.minute > 59 || second > 59) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(parts.minute)}:${pad(second)}`;
}
