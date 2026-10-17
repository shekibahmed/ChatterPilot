import {
  divideRoundHalfUp,
  type Field,
  type Provenance,
  parseAmountToMinor,
  toSafeMinor,
  unknownField,
} from "@chatterpilot/core";
import type { Catalogue, Customer, Product } from "./catalogue.ts";
import { extractOrderLines } from "./extract.ts";
import { matchRecord } from "./match.ts";
import { canonicalUnit } from "./units.ts";

/** Version of the arithmetic below; stored with every draft so totals can be re-derived. */
export const DRAFT_FORMULA_VERSION = "order-draft/1";

export interface SourceMessage {
  readonly id: string;
  readonly startLine: number;
  readonly endLine: number;
  /** Timestamp exactly as written in the export. */
  readonly timestampText: string;
  /** Floating local date-time from the export ("2026-01-12T10:04:00"), or null. */
  readonly localDateTime: string | null;
  readonly body: string;
}

export type IssueCode =
  | "no_lines"
  | "customer_unresolved"
  | "customer_ambiguous"
  | "order_date_unknown"
  | "product_unresolved"
  | "product_ambiguous"
  | "product_fuzzy"
  | "quantity_invalid"
  | "unit_missing"
  | "unit_incompatible"
  | "price_missing"
  | "price_unconfirmed"
  | "price_stale"
  | "price_not_yet_effective"
  | "tax_rate_missing"
  | "mixed_currency";

export interface DraftIssue {
  readonly code: IssueCode;
  /** Field path, e.g. "lines[1].unitPrice", or "customer". */
  readonly field: string;
  readonly message: string;
}

export interface ProductRef {
  readonly productId: string;
  readonly name: string;
}

export interface CustomerRef {
  readonly customerId: string;
  readonly name: string;
}

export interface Quantity {
  /** Quantity scaled by 1000 (2.5 -> 2500). */
  readonly milli: number;
  readonly text: string;
}

export interface DraftLine {
  readonly sourceText: string;
  readonly product: Field<ProductRef>;
  readonly quantity: Field<Quantity>;
  readonly unit: Field<string>;
  /** Quantity converted to the product's base unit (scaled by 1000). */
  readonly baseQuantity: Field<Quantity>;
  readonly unitPrice: Field<number>;
  readonly amount: Field<number>;
  readonly taxRate: Field<number>;
  readonly tax: Field<number>;
}

export interface OrderDraft {
  readonly formulaVersion: string;
  readonly catalogueVersion: string;
  readonly sourceMessageIds: readonly string[];
  readonly orderDate: Field<string>;
  readonly customer: Field<CustomerRef>;
  readonly currency: Field<string>;
  readonly lines: readonly DraftLine[];
  readonly subtotal: Field<number>;
  readonly taxTotal: Field<number>;
  readonly total: Field<number>;
  /** Every issue must be resolved by a person before the draft can be used. */
  readonly issues: readonly DraftIssue[];
}

const ok = <T>(value: T, evidence: Provenance[]): Field<T> => ({ value, status: "ok", evidence });
const review = <T>(value: T | null, evidence: Provenance[]): Field<T> => ({
  value,
  status: "needs_review",
  evidence,
});
const computed = (formula: string, inputs: string[]): Provenance => ({
  kind: "computed",
  formula,
  inputs,
});

function messageEvidence(msg: SourceMessage, start: number, end: number): Provenance {
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

function catalogueEvidence(
  catalogue: Catalogue,
  record: Product | Customer,
  column: string,
): Provenance {
  return {
    kind: "catalogue",
    catalogueVersion: catalogue.version,
    table: "unit" in record ? "products" : "customers",
    recordId: record.id,
    row: record.row,
    column,
  };
}

/** Locate a normalised match key ("kumar builders") in the original text, ignoring case/punctuation. */
function findKeySpan(body: string, key: string): { start: number; end: number } | null {
  const words = key.split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const pattern = new RegExp(`(?<![a-z0-9])${words.join("[^a-z0-9]+")}(?![a-z0-9])`, "i");
  const m = pattern.exec(body);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  return Math.round(
    (Date.parse(`${toIsoDate}T00:00:00Z`) - Date.parse(`${fromIsoDate}T00:00:00Z`)) / 86_400_000,
  );
}

const productKeys = (p: Product) => [p.name, ...p.aliases];
const customerKeys = (c: Customer) => [c.name, ...c.aliases];

/**
 * Build a reviewable order draft from one or more chat messages and the owner's catalogue.
 * Deterministic and offline: prices, units and tax come only from the catalogue; totals are
 * exact integer arithmetic; anything unknown stays null and raises an issue.
 */
export function buildOrderDraft(
  messages: readonly SourceMessage[],
  catalogue: Catalogue,
): OrderDraft {
  const issues: DraftIssue[] = [];
  const issue = (code: IssueCode, field: string, message: string) =>
    issues.push({ code, field, message });

  // Order date: the first source message's export timestamp (span 0..0 = message header).
  const first = messages[0];
  const orderDateText = first?.localDateTime?.slice(0, 10) ?? null;
  let orderDate: Field<string> = unknownField();
  if (first && orderDateText) {
    orderDate = ok(orderDateText, [
      {
        kind: "message",
        messageId: first.id,
        startLine: first.startLine,
        endLine: first.startLine,
        span: { start: 0, end: 0 },
        text: first.timestampText,
      },
    ]);
  } else {
    issue("order_date_unknown", "orderDate", "The order date is unknown.");
  }

  // Customer: a name or alias mentioned in the messages.
  let customer: Field<CustomerRef> = unknownField();
  const customerHits = messages.map((m) => ({
    m,
    match: matchRecord(m.body, catalogue.customers, customerKeys),
  }));
  const resolved = customerHits.filter((h) => h.match.record);
  const distinct = new Set(resolved.map((h) => h.match.record?.id));
  const ambiguousHit = customerHits.find((h) => h.match.status === "ambiguous");
  if (distinct.size === 1 && !ambiguousHit) {
    const hit = resolved[0];
    const record = hit?.match.record;
    if (hit && record) {
      const span = findKeySpan(hit.m.body, hit.match.matchedKey ?? "");
      const evidence = [
        ...(span ? [messageEvidence(hit.m, span.start, span.end)] : []),
        catalogueEvidence(catalogue, record, "name"),
      ];
      const ref = { customerId: record.id, name: record.name };
      customer = hit.match.status === "resolved" ? ok(ref, evidence) : review(ref, evidence);
      if (hit.match.status === "fuzzy") {
        issue(
          "customer_unresolved",
          "customer",
          `Customer "${record.name}" matched only approximately; confirm it.`,
        );
      }
    }
  } else if (distinct.size > 1 || ambiguousHit) {
    const names = ambiguousHit
      ? ambiguousHit.match.candidates.map((c) => c.name)
      : resolved.map((h) => h.match.record?.name ?? "");
    issue(
      "customer_ambiguous",
      "customer",
      `The messages could refer to several customers: ${names.join(", ")}.`,
    );
  } else {
    issue("customer_unresolved", "customer", "No catalogue customer is named in the messages.");
  }

  const lines: DraftLine[] = [];
  const currencies = new Set<string>();
  for (const msg of messages) {
    for (const extracted of extractOrderLines(msg.body)) {
      const i = lines.length;
      const path = (f: string) => `lines[${i}].${f}`;
      const productEvidence = messageEvidence(
        msg,
        extracted.productSpan.start,
        extracted.productSpan.end,
      );
      const lineEvidence = messageEvidence(msg, extracted.span.start, extracted.span.end);

      // Product
      const match = matchRecord(extracted.productText, catalogue.products, productKeys);
      const productRecord = match.record;
      let product: Field<ProductRef>;
      if (productRecord && match.status === "resolved") {
        product = ok({ productId: productRecord.id, name: productRecord.name }, [
          productEvidence,
          catalogueEvidence(catalogue, productRecord, "aliases"),
        ]);
      } else if (productRecord && match.status === "fuzzy") {
        product = review({ productId: productRecord.id, name: productRecord.name }, [
          productEvidence,
          catalogueEvidence(catalogue, productRecord, "aliases"),
        ]);
        issue(
          "product_fuzzy",
          path("product"),
          `"${extracted.productText}" looks like ${productRecord.name}; confirm it.`,
        );
      } else if (match.status === "ambiguous") {
        product = review<ProductRef>(null, [productEvidence]);
        issue(
          "product_ambiguous",
          path("product"),
          `"${extracted.productText}" could be ${match.candidates.map((c) => c.name).join(" or ")}.`,
        );
      } else {
        product = review<ProductRef>(null, [productEvidence]);
        issue(
          "product_unresolved",
          path("product"),
          `"${extracted.productText}" is not in the catalogue.`,
        );
      }
      const p = product.status === "ok" || product.status === "needs_review" ? productRecord : null;

      // Quantity
      const qtyParsed = parseAmountToMinor(extracted.quantityText, 3);
      let quantity: Field<Quantity>;
      if (qtyParsed.ok && qtyParsed.minor > 0) {
        quantity = ok({ milli: qtyParsed.minor, text: extracted.quantityText }, [lineEvidence]);
      } else {
        quantity = review<Quantity>(null, [lineEvidence]);
        issue(
          "quantity_invalid",
          path("quantity"),
          `Quantity "${extracted.quantityText}" is not usable.`,
        );
      }

      // Unit: as written, or the catalogue's counting unit when none is written.
      let unit: Field<string> = unknownField();
      let factorMilli: number | null = null;
      const writtenUnit = extracted.unitText ? canonicalUnit(extracted.unitText) : null;
      if (writtenUnit) {
        unit = ok(writtenUnit, [lineEvidence]);
      } else if (p && p.unit === "piece") {
        unit = ok("piece", [catalogueEvidence(catalogue, p, "unit")]);
      } else if (p) {
        issue("unit_missing", path("unit"), `No unit given; ${p.name} is sold per ${p.unit}.`);
      }
      if (p && unit.value) {
        if (unit.value === p.unit) {
          factorMilli = 1000;
        } else {
          const alt = p.altUnits.find((a) => a.unit === unit.value);
          if (alt) {
            factorMilli = alt.factorMilli;
          } else {
            unit = review(unit.value, [...unit.evidence]);
            issue("unit_incompatible", path("unit"), `${p.name} cannot be sold by ${unit.value}.`);
          }
        }
      }

      // Base quantity, price, amount, tax
      let baseQuantity: Field<Quantity> = unknownField();
      if (quantity.value && factorMilli !== null && p) {
        const base = toSafeMinor(
          divideRoundHalfUp(BigInt(quantity.value.milli) * BigInt(factorMilli), 1000n),
        );
        const altEvidence =
          factorMilli === 1000 ? [] : [catalogueEvidence(catalogue, p, "alt_units")];
        baseQuantity = ok({ milli: base, text: `${base / 1000} ${p.unit}` }, [
          computed("quantity × unit_factor", [path("quantity"), path("unit")]),
          ...altEvidence,
        ]);
      }

      let unitPrice: Field<number> = unknownField();
      if (p) {
        currencies.add(p.currency);
        const priceEvidence = [catalogueEvidence(catalogue, p, "price")];
        if (p.priceMinor === null) {
          issue("price_missing", path("unitPrice"), `${p.name} has no catalogue price.`);
        } else {
          let status: "ok" | "needs_review" = "ok";
          if (!p.confirmedOn) {
            status = "needs_review";
            issue(
              "price_unconfirmed",
              path("unitPrice"),
              `The price of ${p.name} has no confirmation date.`,
            );
          } else if (
            orderDateText &&
            daysBetween(p.confirmedOn, orderDateText) > catalogue.stalePriceDays
          ) {
            status = "needs_review";
            issue(
              "price_stale",
              path("unitPrice"),
              `The price of ${p.name} was last confirmed on ${p.confirmedOn}, more than ${catalogue.stalePriceDays} days before the order.`,
            );
          }
          if (p.effectiveFrom && orderDateText && p.effectiveFrom > orderDateText) {
            status = "needs_review";
            issue(
              "price_not_yet_effective",
              path("unitPrice"),
              `The price of ${p.name} starts on ${p.effectiveFrom}, after the order date.`,
            );
          }
          unitPrice = { value: p.priceMinor, status, evidence: priceEvidence };
        }
      }

      let amount: Field<number> = unknownField();
      if (baseQuantity.value && unitPrice.value !== null) {
        const value = toSafeMinor(
          divideRoundHalfUp(BigInt(baseQuantity.value.milli) * BigInt(unitPrice.value), 1000n),
        );
        const status = unitPrice.status === "ok" && product.status === "ok" ? "ok" : "needs_review";
        amount = {
          value,
          status,
          evidence: [
            computed("round_half_up(base_quantity × unit_price)", [
              path("baseQuantity"),
              path("unitPrice"),
            ]),
          ],
        };
      }

      let taxRate: Field<number> = unknownField();
      let tax: Field<number> = unknownField();
      if (p) {
        if (p.taxRateMilli === null) {
          issue("tax_rate_missing", path("taxRate"), `${p.name} has no tax rate in the catalogue.`);
        } else {
          taxRate = ok(p.taxRateMilli, [catalogueEvidence(catalogue, p, "tax_rate_percent")]);
          if (amount.value !== null) {
            tax = {
              value: toSafeMinor(
                divideRoundHalfUp(BigInt(amount.value) * BigInt(p.taxRateMilli), 100_000n),
              ),
              status: amount.status,
              evidence: [
                computed("round_half_up(amount × tax_rate / 100)", [
                  path("amount"),
                  path("taxRate"),
                ]),
              ],
            };
          }
        }
      }

      lines.push({
        sourceText: extracted.text,
        product,
        quantity,
        unit,
        baseQuantity,
        unitPrice,
        amount,
        taxRate,
        tax,
      });
    }
  }

  if (lines.length === 0)
    issue("no_lines", "lines", "No order lines were found in the selected messages.");

  let currency: Field<string> = unknownField();
  if (currencies.size === 1) {
    const [code] = currencies;
    currency = ok(code as string, [
      computed("catalogue currency of every line", ["lines[*].product"]),
    ]);
  } else if (currencies.size > 1) {
    issue(
      "mixed_currency",
      "currency",
      `Lines are priced in different currencies: ${[...currencies].join(", ")}.`,
    );
  }

  const sum = (
    pick: (l: DraftLine) => Field<number>,
    formula: string,
    input: string,
  ): Field<number> => {
    if (lines.length === 0 || currency.value === null) return unknownField();
    const fields = lines.map(pick);
    if (fields.some((f) => f.value === null)) return unknownField();
    const value = fields.reduce((acc, f) => acc + BigInt(f.value as number), 0n);
    const status = fields.every((f) => f.status === "ok") ? "ok" : "needs_review";
    return { value: toSafeMinor(value), status, evidence: [computed(formula, [input])] };
  };
  const subtotal = sum((l) => l.amount, "sum(line amounts)", "lines[*].amount");
  const taxTotal = sum((l) => l.tax, "sum(line taxes)", "lines[*].tax");
  const total: Field<number> =
    subtotal.value !== null && taxTotal.value !== null
      ? {
          value: subtotal.value + taxTotal.value,
          status: subtotal.status === "ok" && taxTotal.status === "ok" ? "ok" : "needs_review",
          evidence: [computed("subtotal + tax_total", ["subtotal", "taxTotal"])],
        }
      : unknownField();

  return {
    formulaVersion: DRAFT_FORMULA_VERSION,
    catalogueVersion: catalogue.version,
    sourceMessageIds: messages.map((m) => m.id),
    orderDate,
    customer,
    currency,
    lines,
    subtotal,
    taxTotal,
    total,
    issues,
  };
}
