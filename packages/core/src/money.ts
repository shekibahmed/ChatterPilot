/**
 * Exact money handling. Amounts are stored as integer minor units plus a scale
 * (e.g. 2400.50 at scale 2 -> 240050). Binary floats are never used for money.
 * Callers keep the original amount text alongside the parsed value.
 */

export type AmountParseFailure =
  | "empty"
  | "invalid_format"
  | "invalid_grouping"
  | "too_many_decimals"
  | "out_of_range";

export type AmountParseResult =
  | { ok: true; minor: number; scale: number }
  | { ok: false; reason: AmountParseFailure };

const AMOUNT_RE = /^(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d+))?$/;

/** Western (1,234,567) or Indian (12,34,567) digit grouping; a group never has 1 digit. */
function isValidGrouping(integerPart: string): boolean {
  if (!integerPart.includes(",")) return true;
  const groups = integerPart.split(",");
  const [first, ...rest] = groups;
  if (first === undefined || first.length === 0 || first.length > 3) return false;
  const last = rest.at(-1);
  if (last === undefined || last.length !== 3) return false;
  const middle = rest.slice(0, -1);
  const western = middle.every((g) => g.length === 3);
  const indian = first.length <= 2 && middle.every((g) => g.length === 2);
  return western || indian;
}

/**
 * Parse a plain non-negative decimal amount such as "2,400", "1,20,000.50" or "99.9".
 * Currency symbols, signs and words are rejected; detecting those is the caller's job.
 */
export function parseAmountToMinor(text: string, scale = 2): AmountParseResult {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) {
    throw new RangeError(`unsupported scale ${scale}`);
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  const match = AMOUNT_RE.exec(trimmed);
  if (!match) return { ok: false, reason: "invalid_format" };
  const integerPart = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (!isValidGrouping(integerPart)) return { ok: false, reason: "invalid_grouping" };
  if (fraction.length > scale) return { ok: false, reason: "too_many_decimals" };

  const digits = integerPart.replaceAll(",", "") + fraction.padEnd(scale, "0");
  const minor = BigInt(digits);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, reason: "out_of_range" };
  return { ok: true, minor: Number(minor), scale };
}

/** Format integer minor units as a plain decimal string ("240050", 2 -> "2400.50"). */
export function formatMinor(minor: number, scale = 2): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError("minor units must be a safe integer");
  const negative = minor < 0;
  const digits = Math.abs(minor)
    .toString()
    .padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? `.${digits.slice(digits.length - scale)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}
