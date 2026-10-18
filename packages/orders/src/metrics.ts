import type { OrderDraft } from "./draft.ts";

/**
 * Deterministic dashboard metrics. Every figure is computed in code (never by a model), carries a
 * plain-language definition, states its window, coverage and exclusions, and lists the drafts or
 * days behind it so a person can drill down.
 */

export type MetricScope = "accepted" | "all";

export interface DashboardInput {
  /** Imported exports with their first/last local timestamps. */
  readonly coverage: readonly {
    readonly sourceName: string;
    readonly first: string | null;
    readonly last: string | null;
  }[];
  /** Text messages per local date across all imports. */
  readonly messagesPerDay: readonly { readonly date: string; readonly count: number }[];
  readonly pendingSuggestions: number;
  readonly drafts: readonly {
    readonly id: string;
    readonly status: "open" | "accepted" | "rejected";
    readonly draft: OrderDraft;
  }[];
  /** Money metrics default to accepted (reviewed) orders only. */
  readonly scope: MetricScope;
}

export interface Exclusion {
  readonly reason: string;
  readonly count: number;
}

export interface Metric<T> {
  readonly title: string;
  readonly definition: string;
  readonly unit: string;
  readonly window: { readonly from: string; readonly to: string } | null;
  readonly value: T;
  readonly excluded: readonly Exclusion[];
}

export interface Dashboard {
  readonly scope: MetricScope;
  readonly coverage: Metric<{
    days: number;
    coveredDays: number;
    gaps: { from: string; to: string }[];
    sources: { sourceName: string; from: string | null; to: string | null }[];
  }>;
  readonly activity: Metric<{ date: string; covered: boolean; messages: number | null }[]>;
  readonly pipeline: Metric<{
    suggested: number;
    open: number;
    accepted: number;
    rejected: number;
  }>;
  readonly orderValueByDay: Metric<
    { date: string; currency: string; totalMinor: number; orders: number; draftIds: string[] }[]
  >;
  readonly openIssues: Metric<{ code: string; count: number; draftIds: string[] }[]>;
  readonly products: Metric<
    {
      productId: string;
      name: string;
      baseUnit: string;
      quantityMilli: number;
      lines: number;
      draftIds: string[];
    }[]
  >;
  readonly customers: Metric<
    {
      customerId: string;
      name: string;
      orders: number;
      totals: { currency: string; totalMinor: number }[];
      draftIds: string[];
    }[]
  >;
  readonly weekComparison: Metric<
    | {
        status: "ok";
        currency: string;
        current: { from: string; to: string; totalMinor: number; orders: number };
        previous: { from: string; to: string; totalMinor: number; orders: number };
        changePercent: number | null;
      }
    | { status: "insufficient"; reason: string }
  >;
}

const DAY = 86_400_000;
const toDate = (iso: string) => iso.slice(0, 10);
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
function* eachDay(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** Minimum accepted orders in each week before a week-on-week comparison is shown. */
export const MIN_ORDERS_FOR_COMPARISON = 3;

export function computeDashboard(input: DashboardInput): Dashboard {
  // Coverage: union of each import's first..last local date. Exports are snapshots, not feeds.
  const spans = input.coverage
    .filter((c) => c.first && c.last)
    .map((c) => ({ from: toDate(c.first as string), to: toDate(c.last as string) }));
  const covered = new Set<string>();
  for (const s of spans) for (const d of eachDay(s.from, s.to)) covered.add(d);
  const allDays = [...covered].sort();
  const from = allDays[0] ?? null;
  const to = allDays.at(-1) ?? null;
  const window = from && to ? { from, to } : null;
  const gaps: { from: string; to: string }[] = [];
  if (from && to) {
    let gapStart: string | null = null;
    for (const d of eachDay(from, to)) {
      if (!covered.has(d)) gapStart ??= d;
      else if (gapStart) {
        gaps.push({ from: gapStart, to: addDays(d, -1) });
        gapStart = null;
      }
    }
  }
  const totalDays = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1 : 0;

  const perDay = new Map(input.messagesPerDay.map((m) => [m.date, m.count]));
  const activity =
    from && to
      ? [...eachDay(from, to)].map((date) => ({
          date,
          covered: covered.has(date),
          messages: covered.has(date) ? (perDay.get(date) ?? 0) : null,
        }))
      : [];

  const accepted = input.drafts.filter((d) => d.status === "accepted");
  const open = input.drafts.filter((d) => d.status === "open");
  const rejected = input.drafts.filter((d) => d.status === "rejected");
  const inScope = input.scope === "accepted" ? accepted : [...accepted, ...open];

  // Order value by order date and currency.
  const unknownTotal = inScope.filter(
    (d) => d.draft.total.value === null || !d.draft.orderDate.value,
  );
  const valueRows = new Map<
    string,
    { date: string; currency: string; totalMinor: number; orders: number; draftIds: string[] }
  >();
  for (const d of inScope) {
    const total = d.draft.total.value;
    const date = d.draft.orderDate.value;
    const currency = d.draft.currency.value;
    if (total === null || !date || !currency) continue;
    const key = `${date}|${currency}`;
    const row = valueRows.get(key) ?? { date, currency, totalMinor: 0, orders: 0, draftIds: [] };
    row.totalMinor += total;
    row.orders += 1;
    row.draftIds.push(d.id);
    valueRows.set(key, row);
  }
  const valueExclusions: Exclusion[] = [
    ...(input.scope === "accepted" && open.length > 0
      ? [{ reason: "open drafts not yet reviewed", count: open.length }]
      : []),
    ...(unknownTotal.length > 0
      ? [{ reason: "drafts with an unknown total or date", count: unknownTotal.length }]
      : []),
    ...(rejected.length > 0 ? [{ reason: "rejected drafts", count: rejected.length }] : []),
  ];

  // Open review work by issue type.
  const issues = new Map<string, { code: string; count: number; draftIds: string[] }>();
  for (const d of open) {
    for (const issue of d.draft.issues) {
      const row = issues.get(issue.code) ?? { code: issue.code, count: 0, draftIds: [] };
      row.count += 1;
      if (!row.draftIds.includes(d.id)) row.draftIds.push(d.id);
      issues.set(issue.code, row);
    }
  }

  // Product quantities in base units (accepted, non-excluded lines).
  const products = new Map<
    string,
    {
      productId: string;
      name: string;
      baseUnit: string;
      quantityMilli: number;
      lines: number;
      draftIds: string[];
    }
  >();
  let productExcluded = 0;
  for (const d of inScope) {
    for (const line of d.draft.lines) {
      if (line.excluded) continue;
      const p = line.product.value;
      const base = line.baseQuantity.value;
      if (!p || !base) {
        productExcluded++;
        continue;
      }
      const baseUnit = base.text.split(" ").at(-1) ?? "";
      const key = `${p.productId}|${baseUnit}`;
      const row = products.get(key) ?? {
        productId: p.productId,
        name: p.name,
        baseUnit,
        quantityMilli: 0,
        lines: 0,
        draftIds: [],
      };
      row.quantityMilli += base.milli;
      row.lines += 1;
      if (!row.draftIds.includes(d.id)) row.draftIds.push(d.id);
      products.set(key, row);
    }
  }

  // Customers.
  const customers = new Map<
    string,
    {
      customerId: string;
      name: string;
      orders: number;
      totals: { currency: string; totalMinor: number }[];
      draftIds: string[];
    }
  >();
  let unknownCustomer = 0;
  for (const d of inScope) {
    const c = d.draft.customer.value;
    if (!c) {
      unknownCustomer++;
      continue;
    }
    const row = customers.get(c.customerId) ?? {
      customerId: c.customerId,
      name: c.name,
      orders: 0,
      totals: [],
      draftIds: [],
    };
    row.orders += 1;
    row.draftIds.push(d.id);
    const currency = d.draft.currency.value;
    if (d.draft.total.value !== null && currency) {
      const t = row.totals.find((x) => x.currency === currency);
      if (t) t.totalMinor += d.draft.total.value;
      else row.totals.push({ currency, totalMinor: d.draft.total.value });
    }
    customers.set(c.customerId, row);
  }

  // Week-on-week: only when both 7-day windows are fully covered and have enough orders.
  let comparison: Dashboard["weekComparison"]["value"];
  let comparisonWindow: { from: string; to: string } | null = null;
  if (!to) {
    comparison = { status: "insufficient", reason: "No imported messages yet." };
  } else {
    const current = { from: addDays(to, -6), to };
    const previous = { from: addDays(to, -13), to: addDays(to, -7) };
    comparisonWindow = { from: previous.from, to: current.to };
    const fullyCovered = [...eachDay(previous.from, current.to)].every((d) => covered.has(d));
    const sum = (w: { from: string; to: string }) => {
      const rows = [...valueRows.values()].filter((r) => r.date >= w.from && r.date <= w.to);
      return {
        ...w,
        totalMinor: rows.reduce((a, r) => a + r.totalMinor, 0),
        orders: rows.reduce((a, r) => a + r.orders, 0),
        currencies: new Set(rows.map((r) => r.currency)),
      };
    };
    const cur = sum(current);
    const prev = sum(previous);
    const currencies = new Set([...cur.currencies, ...prev.currencies]);
    if (!fullyCovered) {
      comparison = {
        status: "insufficient",
        reason: `The imported chats do not cover every day from ${previous.from} to ${current.to}, so a change could just reflect missing messages.`,
      };
    } else if (cur.orders < MIN_ORDERS_FOR_COMPARISON || prev.orders < MIN_ORDERS_FOR_COMPARISON) {
      comparison = {
        status: "insufficient",
        reason: `Each week needs at least ${MIN_ORDERS_FOR_COMPARISON} orders in scope (found ${prev.orders} and ${cur.orders}).`,
      };
    } else if (currencies.size !== 1) {
      comparison = { status: "insufficient", reason: "Orders are in more than one currency." };
    } else {
      comparison = {
        status: "ok",
        currency: [...currencies][0] as string,
        current: { from: cur.from, to: cur.to, totalMinor: cur.totalMinor, orders: cur.orders },
        previous: {
          from: prev.from,
          to: prev.to,
          totalMinor: prev.totalMinor,
          orders: prev.orders,
        },
        changePercent:
          prev.totalMinor === 0
            ? null
            : Math.round(((cur.totalMinor - prev.totalMinor) / prev.totalMinor) * 1000) / 10,
      };
    }
  }

  const scopeText =
    input.scope === "accepted"
      ? "accepted (reviewed) orders"
      : "accepted and open (unreviewed) drafts";
  return {
    scope: input.scope,
    coverage: {
      title: "Import coverage",
      definition:
        "Days between the first and last message of each imported export. Exports are snapshots: days outside them, or gaps between them, have no data.",
      unit: "days",
      window,
      value: {
        days: totalDays,
        coveredDays: covered.size,
        gaps,
        sources: input.coverage.map((c) => ({
          sourceName: c.sourceName,
          from: c.first ? toDate(c.first) : null,
          to: c.last ? toDate(c.last) : null,
        })),
      },
      excluded: [],
    },
    activity: {
      title: "Chat activity per day",
      definition:
        "Text messages per local date in the imported exports. Message volume is not a measure of anyone's productivity.",
      unit: "messages",
      window,
      value: activity,
      excluded: activity.some((a) => !a.covered)
        ? [
            {
              reason: "days not covered by any import",
              count: activity.filter((a) => !a.covered).length,
            },
          ]
        : [],
    },
    pipeline: {
      title: "Order pipeline",
      definition: "Suggested messages not yet drafted, and drafts by review status.",
      unit: "count",
      window,
      value: {
        suggested: input.pendingSuggestions,
        open: open.length,
        accepted: accepted.length,
        rejected: rejected.length,
      },
      excluded: [],
    },
    orderValueByDay: {
      title: "Order value by order date",
      definition: `Sum of draft totals (including tax) for ${scopeText}, grouped by order date and currency. Currencies are never converted or added together.`,
      unit: "minor currency units",
      window,
      value: [...valueRows.values()].sort(
        (a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency),
      ),
      excluded: valueExclusions,
    },
    openIssues: {
      title: "Open review work",
      definition: "Issues that block acceptance in open drafts, by type.",
      unit: "issues",
      window: null,
      value: [...issues.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
      excluded: [],
    },
    products: {
      title: "Quantities by product",
      definition: `Sum of included line quantities, converted to each product's base unit, for ${scopeText}.`,
      unit: "base units",
      window,
      value: [...products.values()].sort((a, b) => a.name.localeCompare(b.name)),
      excluded:
        productExcluded > 0
          ? [{ reason: "lines with unknown product or quantity", count: productExcluded }]
          : [],
    },
    customers: {
      title: "Orders by customer",
      definition: `Number and value of ${scopeText} per catalogue customer.`,
      unit: "orders",
      window,
      value: [...customers.values()].sort(
        (a, b) => b.orders - a.orders || a.name.localeCompare(b.name),
      ),
      excluded:
        unknownCustomer > 0
          ? [{ reason: "orders without a known customer", count: unknownCustomer }]
          : [],
    },
    weekComparison: {
      title: "Last 7 days vs previous 7 days",
      definition: `Order value of ${scopeText} in the 7 days ending on the last covered day, compared with the 7 days before.`,
      unit: "percent change",
      window: comparisonWindow,
      value: comparison,
      excluded: [],
    },
  };
}
