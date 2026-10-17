import {
  divideRoundHalfUp,
  type Field,
  type Provenance,
  parseAmountToMinor,
  toSafeMinor,
  unknownField,
} from "@chatterpilot/core";
import type { Catalogue, Customer, Product } from "./catalogue.ts";
import { type ExtractedLine, extractOrderLines } from "./extract.ts";
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

/** A reviewer's replacement for one machine-proposed value. */
export interface Override<T> {
  readonly value: T;
  readonly reviewer: string;
  readonly at: string;
  readonly reason: string;
}

export interface LineOverrides {
  readonly product?: Override<string>;
  readonly quantity?: Override<number>;
  readonly unit?: Override<string>;
  readonly unitPrice?: Override<number>;
  readonly taxRate?: Override<number>;
  readonly excluded?: Override<boolean>;
}

/** Human decisions applied on top of the machine draft. Line keys are machine line indexes. */
export interface DraftOverrides {
  readonly customer?: Override<string>;
  readonly lines?: Readonly<Record<number, LineOverrides>>;
}

/** An override that cannot apply (unknown product/customer/unit, invalid number). */
export class OverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverrideError";
  }
}

export interface DraftLine {
  readonly sourceText: string;
  /** Excluded by a reviewer: kept for audit, left out of totals and issues. */
  readonly excluded: boolean;
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

/** Replace a machine value with a reviewer's, keeping the reviewer, reason and previous value. */
function human<T>(
  o: Override<unknown>,
  value: T,
  previous: unknown,
  keep: readonly Provenance[],
): Field<T> {
  return {
    value,
    status: "ok",
    evidence: [
      { kind: "human", reviewer: o.reviewer, at: o.at, reason: o.reason, previous },
      ...keep,
    ],
  };
}

const chatEvidence = (f: Field<unknown>) => f.evidence.filter((e) => e.kind === "message");

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

function formatQuantity(milli: number): string {
  const whole = Math.trunc(milli / 1000);
  const fraction = String(milli % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

interface LineContext {
  readonly catalogue: Catalogue;
  readonly msg: SourceMessage;
  readonly extracted: ExtractedLine;
  readonly index: number;
  readonly orderDateText: string | null;
  readonly overrides: LineOverrides;
}

/** Resolve, price and tax one extracted line, applying any reviewer overrides. */
function buildLine(ctx: LineContext): { line: DraftLine; issues: DraftIssue[] } {
  const { catalogue, msg, extracted, index, orderDateText, overrides: ov } = ctx;
  const issues: DraftIssue[] = [];
  const path = (f: string) => `lines[${index}].${f}`;
  const issue = (code: IssueCode, field: keyof LineOverrides, message: string) => {
    if (!ov[field]) issues.push({ code, field: path(field), message });
  };
  const productEvidence = messageEvidence(
    msg,
    extracted.productSpan.start,
    extracted.productSpan.end,
  );
  const lineEvidence = messageEvidence(msg, extracted.span.start, extracted.span.end);

  // Product
  const match = matchRecord(extracted.productText, catalogue.products, productKeys);
  let p: Product | null = match.record;
  let product: Field<ProductRef>;
  if (p && match.status === "resolved") {
    product = ok({ productId: p.id, name: p.name }, [
      productEvidence,
      catalogueEvidence(catalogue, p, "aliases"),
    ]);
  } else if (p && match.status === "fuzzy") {
    product = review({ productId: p.id, name: p.name }, [
      productEvidence,
      catalogueEvidence(catalogue, p, "aliases"),
    ]);
    issue(
      "product_fuzzy",
      "product",
      `"${extracted.productText}" looks like ${p.name}; confirm it.`,
    );
  } else if (match.status === "ambiguous") {
    product = review<ProductRef>(null, [productEvidence]);
    issue(
      "product_ambiguous",
      "product",
      `"${extracted.productText}" could be ${match.candidates.map((c) => c.name).join(" or ")}.`,
    );
  } else {
    product = review<ProductRef>(null, [productEvidence]);
    issue("product_unresolved", "product", `"${extracted.productText}" is not in the catalogue.`);
  }
  if (ov.product) {
    const chosen = catalogue.products.find((c) => c.id === ov.product?.value);
    if (!chosen) throw new OverrideError(`Unknown product ${ov.product.value}.`);
    product = human(ov.product, { productId: chosen.id, name: chosen.name }, product.value, [
      ...chatEvidence(product),
      catalogueEvidence(catalogue, chosen, "product_id"),
    ]);
    p = chosen;
  }

  // Quantity
  const qtyParsed = parseAmountToMinor(extracted.quantityText, 3);
  let quantity: Field<Quantity>;
  if (qtyParsed.ok && qtyParsed.minor > 0) {
    quantity = ok({ milli: qtyParsed.minor, text: extracted.quantityText }, [lineEvidence]);
  } else {
    quantity = review<Quantity>(null, [lineEvidence]);
    issue("quantity_invalid", "quantity", `Quantity "${extracted.quantityText}" is not usable.`);
  }
  if (ov.quantity) {
    if (!Number.isSafeInteger(ov.quantity.value) || ov.quantity.value <= 0) {
      throw new OverrideError("Quantity must be a positive number.");
    }
    quantity = human(
      ov.quantity,
      { milli: ov.quantity.value, text: formatQuantity(ov.quantity.value) },
      quantity.value,
      chatEvidence(quantity),
    );
  }

  // Unit: as written, or the catalogue's counting unit when none is written.
  let unit: Field<string> = unknownField();
  const writtenUnit = extracted.unitText ? canonicalUnit(extracted.unitText) : null;
  if (writtenUnit) {
    unit = ok(writtenUnit, [lineEvidence]);
  } else if (p && p.unit === "piece") {
    unit = ok("piece", [catalogueEvidence(catalogue, p, "unit")]);
  } else if (p) {
    issue("unit_missing", "unit", `No unit given; ${p.name} is sold per ${p.unit}.`);
  }
  if (ov.unit) {
    const code = canonicalUnit(ov.unit.value);
    if (!code) throw new OverrideError(`Unknown unit ${ov.unit.value}.`);
    unit = human(ov.unit, code, unit.value, chatEvidence(unit));
  }
  let factorMilli: number | null = null;
  if (p && unit.value) {
    if (unit.value === p.unit) {
      factorMilli = 1000;
    } else {
      const alt = p.altUnits.find((a) => a.unit === unit.value);
      if (alt) {
        factorMilli = alt.factorMilli;
      } else {
        // Even a reviewer cannot sell a product by a unit the catalogue does not define.
        unit = review(unit.value, [...unit.evidence]);
        issues.push({
          code: "unit_incompatible",
          field: path("unit"),
          message: `${p.name} cannot be sold by ${unit.value}.`,
        });
      }
    }
  }

  // Base quantity
  let baseQuantity: Field<Quantity> = unknownField();
  if (quantity.value && factorMilli !== null && p) {
    const base = toSafeMinor(
      divideRoundHalfUp(BigInt(quantity.value.milli) * BigInt(factorMilli), 1000n),
    );
    const altEvidence = factorMilli === 1000 ? [] : [catalogueEvidence(catalogue, p, "alt_units")];
    baseQuantity = ok({ milli: base, text: `${formatQuantity(base)} ${p.unit}` }, [
      computed("quantity × unit_factor", [path("quantity"), path("unit")]),
      ...altEvidence,
    ]);
  }

  // Unit price: only from the catalogue or a reviewer.
  let unitPrice: Field<number> = unknownField();
  if (p) {
    if (p.priceMinor === null) {
      issue("price_missing", "unitPrice", `${p.name} has no catalogue price.`);
    } else {
      let status: "ok" | "needs_review" = "ok";
      if (!p.confirmedOn) {
        status = "needs_review";
        issue("price_unconfirmed", "unitPrice", `The price of ${p.name} has no confirmation date.`);
      } else if (
        orderDateText &&
        daysBetween(p.confirmedOn, orderDateText) > catalogue.stalePriceDays
      ) {
        status = "needs_review";
        issue(
          "price_stale",
          "unitPrice",
          `The price of ${p.name} was last confirmed on ${p.confirmedOn}, more than ${catalogue.stalePriceDays} days before the order.`,
        );
      }
      if (p.effectiveFrom && orderDateText && p.effectiveFrom > orderDateText) {
        status = "needs_review";
        issue(
          "price_not_yet_effective",
          "unitPrice",
          `The price of ${p.name} starts on ${p.effectiveFrom}, after the order date.`,
        );
      }
      unitPrice = {
        value: p.priceMinor,
        status,
        evidence: [catalogueEvidence(catalogue, p, "price")],
      };
    }
  }
  if (ov.unitPrice) {
    if (!Number.isSafeInteger(ov.unitPrice.value) || ov.unitPrice.value < 0) {
      throw new OverrideError("Price must be a non-negative amount.");
    }
    unitPrice = human(ov.unitPrice, ov.unitPrice.value, unitPrice.value, unitPrice.evidence);
  }

  let amount: Field<number> = unknownField();
  if (baseQuantity.value && unitPrice.value !== null) {
    const value = toSafeMinor(
      divideRoundHalfUp(BigInt(baseQuantity.value.milli) * BigInt(unitPrice.value), 1000n),
    );
    const status =
      unitPrice.status === "ok" && product.status === "ok" && unit.status === "ok"
        ? "ok"
        : "needs_review";
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

  // Tax: only from the catalogue or a reviewer; never guessed.
  let taxRate: Field<number> = unknownField();
  if (p) {
    if (p.taxRateMilli === null) {
      issue("tax_rate_missing", "taxRate", `${p.name} has no tax rate in the catalogue.`);
    } else {
      taxRate = ok(p.taxRateMilli, [catalogueEvidence(catalogue, p, "tax_rate_percent")]);
    }
  }
  if (ov.taxRate) {
    if (
      !Number.isSafeInteger(ov.taxRate.value) ||
      ov.taxRate.value < 0 ||
      ov.taxRate.value > 100_000
    ) {
      throw new OverrideError("Tax rate must be between 0 and 100 percent.");
    }
    taxRate = human(ov.taxRate, ov.taxRate.value, taxRate.value, taxRate.evidence);
  }
  let tax: Field<number> = unknownField();
  if (amount.value !== null && taxRate.value !== null) {
    tax = {
      value: toSafeMinor(divideRoundHalfUp(BigInt(amount.value) * BigInt(taxRate.value), 100_000n)),
      status: amount.status,
      evidence: [
        computed("round_half_up(amount × tax_rate / 100)", [path("amount"), path("taxRate")]),
      ],
    };
  }

  const excluded = ov.excluded?.value === true;
  return {
    line: {
      sourceText: extracted.text,
      excluded,
      product,
      quantity,
      unit,
      baseQuantity,
      unitPrice,
      amount,
      taxRate,
      tax,
    },
    issues: excluded ? [] : issues,
  };
}

/**
 * Build a reviewable order draft from one or more chat messages and the owner's catalogue.
 * Deterministic and offline: prices, units and tax come only from the catalogue or a reviewer;
 * totals are exact integer arithmetic; anything unknown stays null and raises an issue.
 */
export function buildOrderDraft(
  messages: readonly SourceMessage[],
  catalogue: Catalogue,
  overrides: DraftOverrides = {},
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

  // Customer: a name or alias mentioned in the messages, or the reviewer's choice.
  let customer: Field<CustomerRef> = unknownField();
  const customerIssues: DraftIssue[] = [];
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
        customerIssues.push({
          code: "customer_unresolved",
          field: "customer",
          message: `Customer "${record.name}" matched only approximately; confirm it.`,
        });
      }
    }
  } else if (distinct.size > 1 || ambiguousHit) {
    const names = ambiguousHit
      ? ambiguousHit.match.candidates.map((c) => c.name)
      : resolved.map((h) => h.match.record?.name ?? "");
    customerIssues.push({
      code: "customer_ambiguous",
      field: "customer",
      message: `The messages could refer to several customers: ${names.join(", ")}.`,
    });
  } else {
    customerIssues.push({
      code: "customer_unresolved",
      field: "customer",
      message: "No catalogue customer is named in the messages.",
    });
  }
  if (overrides.customer) {
    const chosen = catalogue.customers.find((c) => c.id === overrides.customer?.value);
    if (!chosen) throw new OverrideError(`Unknown customer ${overrides.customer.value}.`);
    customer = human(
      overrides.customer,
      { customerId: chosen.id, name: chosen.name },
      customer.value,
      [...chatEvidence(customer), catalogueEvidence(catalogue, chosen, "customer_id")],
    );
  } else {
    issues.push(...customerIssues);
  }

  const lines: DraftLine[] = [];
  for (const msg of messages) {
    for (const extracted of extractOrderLines(msg.body)) {
      const index = lines.length;
      const built = buildLine({
        catalogue,
        msg,
        extracted,
        index,
        orderDateText,
        overrides: overrides.lines?.[index] ?? {},
      });
      lines.push(built.line);
      issues.push(...built.issues);
    }
  }

  const active = lines.filter((l) => !l.excluded);
  if (active.length === 0) {
    issue("no_lines", "lines", "No order lines were found in the selected messages.");
  }

  const currencies = new Set(
    active.flatMap((l) => {
      const id = l.product.value?.productId;
      const currency = catalogue.products.find((p) => p.id === id)?.currency;
      return currency ? [currency] : [];
    }),
  );
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
    if (active.length === 0 || currency.value === null) return unknownField();
    const fields = active.map(pick);
    if (fields.some((f) => f.value === null)) return unknownField();
    const value = fields.reduce((acc, f) => acc + BigInt(f.value as number), 0n);
    const status = fields.every((f) => f.status === "ok") ? "ok" : "needs_review";
    return { value: toSafeMinor(value), status, evidence: [computed(formula, [input])] };
  };
  const subtotal = sum((l) => l.amount, "sum(included line amounts)", "lines[*].amount");
  const taxTotal = sum((l) => l.tax, "sum(included line taxes)", "lines[*].tax");
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
