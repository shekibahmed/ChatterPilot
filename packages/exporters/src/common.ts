import { formatMinor } from "@chatterpilot/core";
import type { DraftLine } from "@chatterpilot/orders";
import { type AcceptedOrder, type ExportMap, ExportRefused } from "./types.ts";

export interface FlatLine {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: string;
  readonly unit: string;
  /** Quantity in the product's base unit (what the price is per). */
  readonly baseQuantity: string;
  readonly baseUnit: string;
  readonly unitPrice: string;
  readonly amount: string;
  readonly taxRate: string | null;
  readonly tax: string | null;
}

export interface FlatOrder {
  readonly order: AcceptedOrder;
  readonly reference: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly orderDate: string;
  readonly currency: string;
  readonly lines: readonly FlatLine[];
  readonly subtotal: string;
  readonly taxTotal: string | null;
  readonly total: string | null;
}

const qty = (milli: number) => formatMinor(milli, 3).replace(/\.?0+$/, "");

/** Flatten accepted orders into exportable values; refuses anything unknown. */
export function flatten(
  orders: readonly AcceptedOrder[],
  reference: (o: AcceptedOrder) => string,
): FlatOrder[] {
  const problems: string[] = [];
  const flat = orders.flatMap((order): FlatOrder[] => {
    const d = order.draft;
    const where = `Order ${order.id.slice(0, 8)}`;
    const customer = d.customer.value;
    const lines = d.lines
      .filter((l: DraftLine) => !l.excluded)
      .flatMap((l, i): FlatLine[] => {
        const p = l.product.value;
        const q = l.quantity.value;
        const b = l.baseQuantity.value;
        if (
          !p ||
          !q ||
          !l.unit.value ||
          !b ||
          l.unitPrice.value === null ||
          l.amount.value === null
        ) {
          problems.push(`${where} line ${i + 1} has an unknown value.`);
          return [];
        }
        return [
          {
            productId: p.productId,
            productName: p.name,
            quantity: qty(q.milli),
            unit: l.unit.value,
            baseQuantity: qty(b.milli),
            baseUnit: b.text.split(" ").at(-1) ?? l.unit.value,
            unitPrice: formatMinor(l.unitPrice.value),
            amount: formatMinor(l.amount.value),
            taxRate: l.taxRate.value === null ? null : qty(l.taxRate.value),
            tax: l.tax.value === null ? null : formatMinor(l.tax.value),
          },
        ];
      });
    if (!customer || !d.orderDate.value || !d.currency.value || d.subtotal.value === null) {
      problems.push(`${where} has an unknown customer, date, currency or subtotal.`);
      return [];
    }
    return [
      {
        order,
        reference: reference(order),
        customerId: customer.customerId,
        customerName: customer.name,
        orderDate: d.orderDate.value,
        currency: d.currency.value,
        lines,
        subtotal: formatMinor(d.subtotal.value),
        taxTotal: d.taxTotal.value === null ? null : formatMinor(d.taxTotal.value),
        total: d.total.value === null ? null : formatMinor(d.total.value),
      },
    ];
  });
  if (problems.length > 0) throw new ExportRefused(problems);
  return flat;
}

/** Target names from the map, falling back to catalogue names (with a warning to check them). */
export function namer(map: ExportMap | undefined, warnings: string[]) {
  const fallbacks = new Set<string>();
  const pick = (kind: "customers" | "products" | "units", id: string, fallback: string) => {
    const mapped = map?.[kind]?.[id];
    if (mapped) return mapped;
    fallbacks.add(kind);
    return fallback;
  };
  return {
    customer: (o: FlatOrder) => pick("customers", o.customerId, o.customerName),
    product: (l: FlatLine) => pick("products", l.productId, l.productName),
    unit: (code: string) => pick("units", code, code),
    finish() {
      for (const kind of fallbacks) {
        warnings.push(
          `Some ${kind} use ChatterPilot names because export-map.json has no entry; they must match the target system's names exactly.`,
        );
      }
    },
  };
}

/** Escape text for XML element content and attributes; drop characters XML 1.0 forbids. */
export function xml(text: string): string {
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removing characters XML forbids.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

export const compactDate = (iso: string) => iso.replaceAll("-", "");
