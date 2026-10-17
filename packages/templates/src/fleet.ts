import { createHash } from "node:crypto";
import { type Field, type Provenance, parseAmountToMinor, parseCsv } from "@chatterpilot/core";

/**
 * Fleet/travel operations template (second-template smoke test). Deterministic rules turn chat
 * messages into business events with field provenance and lifecycle links, so updates and
 * cancellations change an existing booking instead of adding a new one, and a reported payment is
 * never confused with a quote or a verified payment.
 */

export const FLEET_TEMPLATE_VERSION = "fleet/1";

export interface Vehicle {
  readonly id: string;
  readonly registration: string;
  readonly aliases: readonly string[];
  readonly row: number;
}

export interface VehicleRegistry {
  /** Content hash of vehicles.csv, cited by vehicle provenance. */
  readonly version: string;
  readonly vehicles: readonly Vehicle[];
  readonly issues: readonly { row: number | null; message: string }[];
}

export function loadVehicles(csv: string): VehicleRegistry {
  const version = createHash("sha256").update(csv).digest("hex").slice(0, 16);
  const parsed = parseCsv(csv);
  if (!parsed.ok) {
    return {
      version,
      vehicles: [],
      issues: [{ row: parsed.line, message: `Malformed CSV (${parsed.reason}).` }],
    };
  }
  const [header = [], ...rows] = parsed.rows;
  const col = (name: string) => header.map((h) => h.trim().toLowerCase()).indexOf(name);
  const [idCol, regCol, aliasCol] = [col("vehicle_id"), col("registration"), col("aliases")];
  if (idCol < 0 || regCol < 0) {
    return {
      version,
      vehicles: [],
      issues: [{ row: 1, message: "vehicles.csv needs vehicle_id and registration columns." }],
    };
  }
  const issues: { row: number | null; message: string }[] = [];
  const vehicles: Vehicle[] = [];
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const row = i + 2;
    const id = (r[idCol] ?? "").trim();
    const registration = (r[regCol] ?? "").trim();
    if (!id || !registration) {
      issues.push({ row, message: "Vehicle id and registration are required." });
      continue;
    }
    if (seen.has(id)) {
      issues.push({ row, message: `Duplicate vehicle id ${id}.` });
      continue;
    }
    seen.add(id);
    const aliases =
      aliasCol < 0
        ? []
        : (r[aliasCol] ?? "")
            .split("|")
            .map((a) => a.trim())
            .filter(Boolean);
    vehicles.push({ id, registration, aliases, row });
  }
  return { version, vehicles, issues };
}

export interface FleetMessage {
  readonly id: string;
  readonly author: string | null;
  readonly localDateTime: string | null;
  readonly startLine: number;
  readonly body: string;
}

export type FleetEventType =
  | "booking_request"
  | "booking_confirmation"
  | "booking_change"
  | "booking_cancellation"
  | "fault_report"
  | "repair_quote"
  | "repair_done"
  | "payment_report";

export interface VehicleRef {
  readonly vehicleId: string;
  readonly registration: string;
}

export interface Amount {
  readonly minor: number;
  /** "quoted" is an estimate; "reported_paid" is someone saying they paid (not verified). */
  readonly kind: "quoted" | "reported_paid";
  readonly text: string;
}

export interface Relation {
  readonly type: "update_of" | "cancels" | "quote_for" | "payment_for" | "resolves";
  readonly eventId: string;
  /** "supported": explicit in the messages; "needs_review": plausible but inferred. */
  readonly strength: "supported" | "needs_review";
  readonly basis: string;
}

export interface FleetEvent {
  readonly id: string;
  readonly type: FleetEventType;
  readonly messageId: string;
  readonly occurredAt: string | null;
  readonly author: string | null;
  readonly vehicle: Field<VehicleRef>;
  readonly bookingRef: Field<string>;
  readonly amount: Field<Amount>;
  /** The message refers to a specific earlier repair ("that repair"). */
  readonly refersToRepair: boolean;
  readonly relations: Relation[];
  readonly notes: string[];
}

export interface FleetOptions {
  /** Booking reference pattern; the default matches "BK-1021". */
  readonly bookingRef?: RegExp;
}

const unknown = <T>(): Field<T> => ({ value: null, status: "unknown", evidence: [] });

function span(msg: FleetMessage, start: number, end: number): Provenance {
  const line = msg.startLine + (msg.body.slice(0, start).match(/\n/g)?.length ?? 0);
  return {
    kind: "message",
    messageId: msg.id,
    startLine: line,
    endLine: line,
    span: { start, end },
    text: msg.body.slice(start, end),
  };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findVehicles(msg: FleetMessage, vehicles: readonly Vehicle[]) {
  const hits: { vehicle: Vehicle; start: number; end: number }[] = [];
  for (const v of vehicles) {
    for (const name of [v.registration, ...v.aliases]) {
      // "AB-12", "AB 12" and "AB12" are the same registration.
      const flexible = escapeRegExp(name).replace(/-|\s+/g, "[-\\s]?");
      const m = new RegExp(`(?<![A-Za-z0-9])${flexible}(?![A-Za-z0-9])`, "i").exec(msg.body);
      if (m) {
        hits.push({ vehicle: v, start: m.index, end: m.index + m[0].length });
        break;
      }
    }
  }
  return hits;
}

const AMOUNT = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const QUOTE_RE = new RegExp(
  String.raw`\b(?:quoted?|estimate[d]?)\b(?:\s+(?:at|of|is|for))?\s*(?:rs\.?|inr|₹)?\s*${AMOUNT}`,
  "i",
);
const PAID_RE = new RegExp(String.raw`\bpaid\s+(?:rs\.?|inr|₹)?\s*${AMOUNT}`, "i");
const FAULT_RE =
  /\b(?:issue|problem|fault|breakdown|puncture|noise|leak|not working|need check|overheat\w*)\b/i;
const DONE_RE = /\b(?:fixed|repaired|resolved|ready)\b/i;
const CANCEL_RE = /\bcancel(?:l?ed)?\b/i;
const CHANGE_RE = /\b(?:change[ds]?|shift(?:ed)?|reschedul\w*|postpone[ds]?)\b/i;
const CONFIRM_RE = /\bconfirm(?:ed)?\b/i;
const REQUEST_RE = /\b(?:request|booking|book)\b/i;

function amountField(msg: FleetMessage, m: RegExpExecArray, kind: Amount["kind"]): Field<Amount> {
  const text = m[1] ?? "";
  const parsed = parseAmountToMinor(text, 2);
  const start = m.index + m[0].lastIndexOf(text);
  if (!parsed.ok)
    return {
      value: null,
      status: "needs_review",
      evidence: [span(msg, start, start + text.length)],
    };
  return {
    value: { minor: parsed.minor, kind, text },
    status: "ok",
    evidence: [span(msg, start, start + text.length)],
  };
}

/** Extract events from one message (zero, one or several). Links are added by `linkFleetEvents`. */
export function extractFleetEvents(
  msg: FleetMessage,
  registry: VehicleRegistry,
  options: FleetOptions = {},
): FleetEvent[] {
  const vehicles = registry.vehicles;
  const refersToRepair = /\b(?:that|the|this)\s+repair\b/i.test(msg.body);
  const events: FleetEvent[] = [];
  const add = (
    type: FleetEventType,
    fields: Partial<Pick<FleetEvent, "vehicle" | "bookingRef" | "amount">>,
  ) =>
    events.push({
      id: `${msg.id}#${events.length}`,
      type,
      messageId: msg.id,
      occurredAt: msg.localDateTime,
      author: msg.author,
      vehicle: fields.vehicle ?? unknown(),
      bookingRef: fields.bookingRef ?? unknown(),
      amount: fields.amount ?? unknown(),
      refersToRepair,
      relations: [],
      notes: [],
    });

  const vehicleHits = findVehicles(msg, vehicles);
  const firstVehicle = vehicleHits[0];
  const vehicle: Field<VehicleRef> = firstVehicle
    ? {
        value: {
          vehicleId: firstVehicle.vehicle.id,
          registration: firstVehicle.vehicle.registration,
        },
        status: vehicleHits.length === 1 ? "ok" : "needs_review",
        evidence: [
          span(msg, firstVehicle.start, firstVehicle.end),
          {
            kind: "catalogue",
            catalogueVersion: registry.version,
            table: "vehicles",
            recordId: firstVehicle.vehicle.id,
            row: firstVehicle.vehicle.row,
            column: "registration",
          },
        ],
      }
    : unknown();

  const refRe = new RegExp((options.bookingRef ?? /\bBK-\d{3,6}\b/i).source, "i");
  const ref = refRe.exec(msg.body);
  if (ref) {
    const bookingRef: Field<string> = {
      value: ref[0].toUpperCase(),
      status: "ok",
      evidence: [span(msg, ref.index, ref.index + ref[0].length)],
    };
    const type: FleetEventType = CANCEL_RE.test(msg.body)
      ? "booking_cancellation"
      : CHANGE_RE.test(msg.body)
        ? "booking_change"
        : CONFIRM_RE.test(msg.body)
          ? "booking_confirmation"
          : "booking_request";
    if (type !== "booking_request" || REQUEST_RE.test(msg.body)) add(type, { bookingRef, vehicle });
  }

  if (firstVehicle && !ref) {
    if (FAULT_RE.test(msg.body)) add("fault_report", { vehicle });
    if (DONE_RE.test(msg.body)) add("repair_done", { vehicle });
  }
  const quote = QUOTE_RE.exec(msg.body);
  if (quote) add("repair_quote", { vehicle, amount: amountField(msg, quote, "quoted") });
  const paid = PAID_RE.exec(msg.body);
  if (paid) add("payment_report", { vehicle, amount: amountField(msg, paid, "reported_paid") });
  return events;
}

const HOURS_48 = 48 * 3600 * 1000;
const time = (e: FleetEvent) => (e.occurredAt ? Date.parse(`${e.occurredAt}Z`) : Number.NaN);

/** Add lifecycle and money links between events, in chronological (export) order. */
export function linkFleetEvents(events: readonly FleetEvent[]): FleetEvent[] {
  const out = events.map((e) => ({ ...e, relations: [...e.relations], notes: [...e.notes] }));
  const firstForBooking = new Map<string, FleetEvent>();
  for (const e of out) {
    const v = e.vehicle.value?.vehicleId;
    if (e.bookingRef.value) {
      const origin = firstForBooking.get(e.bookingRef.value);
      if (!origin) {
        firstForBooking.set(e.bookingRef.value, e);
        if (e.type !== "booking_request")
          e.notes.push("No earlier request for this booking in the imported chats.");
      } else {
        e.relations.push({
          type: e.type === "booking_cancellation" ? "cancels" : "update_of",
          eventId: origin.id,
          strength: "supported",
          basis: `same booking reference ${e.bookingRef.value}`,
        });
      }
    }
    if (e.type === "repair_quote") {
      const sameMessage = out.find((f) => f.type === "fault_report" && f.messageId === e.messageId);
      const earlier = [...out]
        .reverse()
        .find(
          (f) =>
            f.type === "fault_report" &&
            v &&
            f.vehicle.value?.vehicleId === v &&
            time(f) <= time(e) &&
            f !== e,
        );
      const fault = sameMessage ?? earlier;
      if (fault) {
        e.relations.push({
          type: "quote_for",
          eventId: fault.id,
          strength: sameMessage ? "supported" : "needs_review",
          basis: sameMessage
            ? "fault and quote in the same message"
            : `latest earlier fault for ${fault.vehicle.value?.registration}`,
        });
      }
    }
    if (e.type === "payment_report" && e.amount.value) {
      const amount = e.amount.value.minor;
      const paidQuotes = new Set(
        out.flatMap((p) =>
          p.relations.filter((r) => r.type === "payment_for").map((r) => r.eventId),
        ),
      );
      const open = out.filter(
        (q) =>
          q.type === "repair_quote" &&
          q.amount.value?.minor === amount &&
          !paidQuotes.has(q.id) &&
          time(q) <= time(e),
      );
      const byVehicle = v ? open.filter((q) => q.vehicle.value?.vehicleId === v) : [];
      if (byVehicle.length === 1 && byVehicle[0]) {
        e.relations.push({
          type: "payment_for",
          eventId: byVehicle[0].id,
          strength: "supported",
          basis: "same vehicle and amount",
        });
      } else if (!v && e.refersToRepair) {
        const recent = open.filter((q) => q.author === e.author && time(e) - time(q) <= HOURS_48);
        if (recent.length === 1 && recent[0]) {
          e.relations.push({
            type: "payment_for",
            eventId: recent[0].id,
            strength: "needs_review",
            basis: "same amount, same person, within 48 hours; no vehicle named",
          });
        } else {
          e.notes.push("Payment not linked to a quote: not enough evidence.");
        }
      } else if (!v) {
        e.notes.push("Payment not linked to a quote: no vehicle or specific repair is named.");
      } else {
        e.notes.push("Payment not linked to a quote: no open quote with this vehicle and amount.");
      }
    }
    if (e.type === "repair_done" && v) {
      const fault = [...out]
        .reverse()
        .find(
          (f) =>
            f.type === "fault_report" && f.vehicle.value?.vehicleId === v && time(f) <= time(e),
        );
      if (fault)
        e.relations.push({
          type: "resolves",
          eventId: fault.id,
          strength: "supported",
          basis: "same vehicle, later message",
        });
    }
  }
  return out;
}

export interface BookingState {
  readonly ref: string;
  readonly status: "requested" | "confirmed" | "changed" | "cancelled";
  readonly eventIds: readonly string[];
}

export interface FleetSummary {
  readonly bookings: readonly BookingState[];
  readonly faults: readonly {
    eventId: string;
    vehicle: string | null;
    status: "open" | "resolved";
  }[];
  /** Quotes and reported payments are kept apart; neither is a verified expense. */
  readonly quotedMinor: number;
  readonly reportedPaidMinor: number;
  readonly eventsByType: Readonly<Record<string, number>>;
}

export function summariseFleet(events: readonly FleetEvent[]): FleetSummary {
  const bookings = new Map<string, { status: BookingState["status"]; eventIds: string[] }>();
  const statusOf: Partial<Record<FleetEventType, BookingState["status"]>> = {
    booking_request: "requested",
    booking_confirmation: "confirmed",
    booking_change: "changed",
    booking_cancellation: "cancelled",
  };
  for (const e of events) {
    const ref = e.bookingRef.value;
    const status = statusOf[e.type];
    if (!ref || !status) continue;
    const b = bookings.get(ref) ?? { status, eventIds: [] };
    if (b.status !== "cancelled") b.status = status;
    b.eventIds.push(e.id);
    bookings.set(ref, b);
  }
  const resolved = new Set(
    events.flatMap((e) => e.relations.filter((r) => r.type === "resolves").map((r) => r.eventId)),
  );
  const eventsByType: Record<string, number> = {};
  for (const e of events) eventsByType[e.type] = (eventsByType[e.type] ?? 0) + 1;
  const sum = (kind: Amount["kind"]) =>
    events.reduce((acc, e) => acc + (e.amount.value?.kind === kind ? e.amount.value.minor : 0), 0);
  return {
    bookings: [...bookings].map(([ref, b]) => ({ ref, ...b })),
    faults: events
      .filter((e) => e.type === "fault_report")
      .map((e) => ({
        eventId: e.id,
        vehicle: e.vehicle.value?.registration ?? null,
        status: resolved.has(e.id) ? "resolved" : "open",
      })),
    quotedMinor: sum("quoted"),
    reportedPaidMinor: sum("reported_paid"),
    eventsByType,
  };
}
