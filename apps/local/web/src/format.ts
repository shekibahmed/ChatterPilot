import type { Provenance } from "@chatterpilot/core";

/** Minor units to a grouped decimal string, e.g. 2835520 -> "28,355.20". */
export function money(minor: number | null, currency?: string | null): string {
  if (minor === null) return "unknown";
  const whole = Math.trunc(minor / 100);
  const cents = String(Math.abs(minor % 100)).padStart(2, "0");
  const grouped = whole.toLocaleString("en-IN");
  return `${currency ? `${currency} ` : ""}${grouped}.${cents}`;
}

/** Quantity scaled by 1000 to text, e.g. 2500 -> "2.5". */
export function quantity(milli: number | null): string {
  if (milli === null) return "unknown";
  const whole = Math.trunc(milli / 1000);
  const fraction = String(milli % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function percent(milli: number | null): string {
  return milli === null ? "unknown" : `${quantity(milli)}%`;
}

export function sourceLabel(p: Provenance): string {
  switch (p.kind) {
    case "message":
      return p.startLine === p.endLine
        ? `Chat line ${p.startLine}`
        : `Chat lines ${p.startLine}–${p.endLine}`;
    case "transcript":
      return `Voice note line ${p.startLine}`;
    case "catalogue":
      return `${p.table}.csv row ${p.row}`;
    case "computed":
      return "Calculated";
    case "human":
      return `Edited by ${p.reviewer}`;
  }
}

export function sourceDetail(p: Provenance): string {
  switch (p.kind) {
    case "message":
      return p.text ? `“${p.text}”` : "Message timestamp";
    case "transcript":
      return `“${p.text}” from a ${p.origin === "manual" ? "person-supplied" : "provider"} transcript`;
    case "catalogue":
      return `Catalogue ${p.catalogueVersion}, ${p.recordId}, column ${p.column}`;
    case "computed":
      return p.formula;
    case "human":
      return `${p.reason} (${new Date(p.at).toLocaleString()}); was ${JSON.stringify(p.previous)}`;
  }
}

export const shortTime = (iso: string | null) =>
  iso ? iso.replace("T", " ").slice(0, 16) : "unknown time";
