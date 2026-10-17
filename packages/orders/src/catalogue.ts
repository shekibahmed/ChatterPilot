import { createHash } from "node:crypto";
import { parseAmountToMinor, parseCsv } from "@chatterpilot/core";
import { canonicalUnit } from "./units.ts";

export interface AltUnit {
  readonly unit: string;
  /** Base units per one alt unit, scaled by 1000 (e.g. box of 16 sq ft -> 16000). */
  readonly factorMilli: number;
  readonly text: string;
}

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly unit: string;
  readonly altUnits: readonly AltUnit[];
  /** Price per base unit in minor units, or null when the catalogue has no price. */
  readonly priceMinor: number | null;
  readonly priceText: string;
  readonly currency: string;
  readonly effectiveFrom: string | null;
  readonly confirmedOn: string | null;
  /** Tax rate in percent scaled by 1000 (18% -> 18000), or null when not supplied. */
  readonly taxRateMilli: number | null;
  /** 1-based CSV line. */
  readonly row: number;
}

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly row: number;
}

export interface Catalogue {
  /** Content hash of the catalogue files; any edit gives a new version. */
  readonly version: string;
  readonly maintainer: string | null;
  readonly stalePriceDays: number;
  readonly products: readonly Product[];
  readonly customers: readonly Customer[];
}

export type CatalogueFile = "products.csv" | "customers.csv" | "catalogue.json";

export interface CatalogueIssue {
  readonly severity: "error" | "warning";
  readonly file: CatalogueFile;
  readonly row: number | null;
  readonly column: string | null;
  readonly code: string;
  readonly message: string;
}

export interface CatalogueFiles {
  readonly products: string;
  readonly customers: string;
  readonly meta?: string;
}

const PRODUCT_COLUMNS = [
  "product_id",
  "name",
  "aliases",
  "unit",
  "alt_units",
  "price",
  "currency",
  "price_effective_from",
  "price_confirmed_on",
  "tax_rate_percent",
] as const;
const CUSTOMER_COLUMNS = ["customer_id", "name", "aliases"] as const;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_STALE_DAYS = 30;

export function isIsoDate(text: string): boolean {
  const m = DATE_RE.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const splitList = (text: string) =>
  text
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/** Lowercase, punctuation-insensitive key used for alias collision checks and matching. */
export function matchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Table<C extends string> = { rows: { values: Record<C, string>; row: number }[] } | null;

function readTable<C extends string>(
  text: string,
  file: CatalogueFile,
  columns: readonly C[],
  required: readonly C[],
  issues: CatalogueIssue[],
): Table<C> {
  const parsed = parseCsv(text);
  if (!parsed.ok) {
    issues.push({
      severity: "error",
      file,
      row: parsed.line,
      column: null,
      code: "csv_malformed",
      message: `Malformed CSV (${parsed.reason}).`,
    });
    return null;
  }
  const [header, ...body] = parsed.rows;
  const names = (header ?? []).map((h) => h.trim().toLowerCase());
  const missing = required.filter((c) => !names.includes(c));
  for (const c of missing) {
    issues.push({
      severity: "error",
      file,
      row: 1,
      column: c,
      code: "missing_column",
      message: `Required column "${c}" is missing.`,
    });
  }
  if (missing.length > 0) return null;
  for (const n of names) {
    if (!(columns as readonly string[]).includes(n)) {
      issues.push({
        severity: "warning",
        file,
        row: 1,
        column: n,
        code: "unknown_column",
        message: `Column "${n}" is not used.`,
      });
    }
  }
  return {
    rows: body.map((cells, i) => {
      // The real line in the file, so catalogue citations and issues point at the right row.
      const row = parsed.rowLines[i + 1] ?? i + 2;
      if (cells.length !== names.length) {
        issues.push({
          severity: "error",
          file,
          row,
          column: null,
          code: "row_width",
          message: `Expected ${names.length} fields, found ${cells.length}.`,
        });
      }
      const values = Object.fromEntries(
        columns.map((c) => [c, (cells[names.indexOf(c)] ?? "").trim()]),
      );
      return { values: values as Record<C, string>, row };
    }),
  };
}

/** Validate and load the owner-maintained catalogue. Any error makes it unusable for drafts. */
export function loadCatalogue(files: CatalogueFiles): {
  catalogue: Catalogue | null;
  issues: CatalogueIssue[];
} {
  const issues: CatalogueIssue[] = [];
  const issue = (
    severity: CatalogueIssue["severity"],
    file: CatalogueFile,
    row: number | null,
    column: string | null,
    code: string,
    message: string,
  ) => issues.push({ severity, file, row, column, code, message });

  let maintainer: string | null = null;
  let stalePriceDays = DEFAULT_STALE_DAYS;
  if (files.meta !== undefined) {
    try {
      const meta = JSON.parse(files.meta) as { maintainer?: unknown; stalePriceDays?: unknown };
      if (typeof meta.maintainer === "string" && meta.maintainer.trim())
        maintainer = meta.maintainer.trim();
      if (meta.stalePriceDays !== undefined) {
        if (Number.isInteger(meta.stalePriceDays) && (meta.stalePriceDays as number) > 0) {
          stalePriceDays = meta.stalePriceDays as number;
        } else {
          issue(
            "error",
            "catalogue.json",
            null,
            "stalePriceDays",
            "invalid_setting",
            "stalePriceDays must be a positive whole number.",
          );
        }
      }
    } catch {
      issue(
        "error",
        "catalogue.json",
        null,
        null,
        "invalid_json",
        "catalogue.json is not valid JSON.",
      );
    }
  }
  if (maintainer === null) {
    issue(
      "warning",
      "catalogue.json",
      null,
      "maintainer",
      "no_maintainer",
      "No catalogue maintainer is recorded.",
    );
  }

  const products: Product[] = [];
  const productTable = readTable(
    files.products,
    "products.csv",
    PRODUCT_COLUMNS,
    ["product_id", "name", "unit", "price", "currency"],
    issues,
  );
  const seenProducts = new Set<string>();
  for (const { values: v, row } of productTable?.rows ?? []) {
    const err = (column: string, code: string, message: string) =>
      issue("error", "products.csv", row, column, code, message);
    const warn = (column: string, code: string, message: string) =>
      issue("warning", "products.csv", row, column, code, message);
    let ok = true;
    if (!ID_RE.test(v.product_id)) {
      err("product_id", "invalid_id", `Invalid product id "${v.product_id}".`);
      ok = false;
    } else if (seenProducts.has(v.product_id)) {
      err("product_id", "duplicate_id", `Product id ${v.product_id} appears more than once.`);
      ok = false;
    }
    seenProducts.add(v.product_id);
    if (!v.name) {
      err("name", "missing_value", "Product name is empty.");
      ok = false;
    }
    const unit = canonicalUnit(v.unit);
    if (!unit) {
      err("unit", "invalid_unit", `Unknown unit "${v.unit}".`);
      ok = false;
    }
    const altUnits: AltUnit[] = [];
    for (const spec of splitList(v.alt_units)) {
      const m = /^(.+?)\s*[:=]\s*([\d.]+)$/.exec(spec);
      const altUnit = m ? canonicalUnit(m[1] ?? "") : null;
      const factor = m ? parseAmountToMinor(m[2] ?? "", 3) : null;
      if (!m || !altUnit || !factor?.ok || factor.minor === 0 || altUnit === unit) {
        err(
          "alt_units",
          "invalid_alt_unit",
          `Alternative unit "${spec}" must look like "box:16" (a different unit and a positive number of base units).`,
        );
        ok = false;
      } else {
        altUnits.push({ unit: altUnit, factorMilli: factor.minor, text: spec });
      }
    }
    let priceMinor: number | null = null;
    if (!v.price) {
      warn("price", "price_missing", "No price; drafts with this product will need a price.");
    } else {
      const price = parseAmountToMinor(v.price, 2);
      if (!price.ok) {
        err(
          "price",
          "invalid_price",
          `Price "${v.price}" is not a plain non-negative amount (${price.reason}).`,
        );
        ok = false;
      } else {
        priceMinor = price.minor;
      }
    }
    if (!/^[A-Z]{3}$/.test(v.currency)) {
      err(
        "currency",
        "invalid_currency",
        `Currency "${v.currency}" must be a 3-letter ISO code such as INR.`,
      );
      ok = false;
    }
    for (const column of ["price_effective_from", "price_confirmed_on"] as const) {
      if (v[column] && !isIsoDate(v[column])) {
        err(column, "invalid_date", `Date "${v[column]}" must be YYYY-MM-DD.`);
        ok = false;
      }
    }
    if (v.price && !v.price_confirmed_on) {
      warn(
        "price_confirmed_on",
        "price_unconfirmed",
        "Price has no confirmation date, so its age is unknown.",
      );
    }
    let taxRateMilli: number | null = null;
    if (v.tax_rate_percent) {
      const rate = parseAmountToMinor(v.tax_rate_percent, 3);
      if (!rate.ok || rate.minor > 100_000) {
        err(
          "tax_rate_percent",
          "invalid_tax_rate",
          `Tax rate "${v.tax_rate_percent}" must be between 0 and 100.`,
        );
        ok = false;
      } else {
        taxRateMilli = rate.minor;
      }
    } else {
      warn("tax_rate_percent", "tax_rate_missing", "No tax rate supplied; it will not be guessed.");
    }
    if (ok && unit) {
      products.push({
        id: v.product_id,
        name: v.name,
        aliases: splitList(v.aliases),
        unit,
        altUnits,
        priceMinor,
        priceText: v.price,
        currency: v.currency,
        effectiveFrom: v.price_effective_from || null,
        confirmedOn: v.price_confirmed_on || null,
        taxRateMilli,
        row,
      });
    }
  }

  const customers: Customer[] = [];
  const customerTable = readTable(
    files.customers,
    "customers.csv",
    CUSTOMER_COLUMNS,
    ["customer_id", "name"],
    issues,
  );
  const seenCustomers = new Set<string>();
  for (const { values: v, row } of customerTable?.rows ?? []) {
    if (!ID_RE.test(v.customer_id)) {
      issue(
        "error",
        "customers.csv",
        row,
        "customer_id",
        "invalid_id",
        `Invalid customer id "${v.customer_id}".`,
      );
    } else if (seenCustomers.has(v.customer_id)) {
      issue(
        "error",
        "customers.csv",
        row,
        "customer_id",
        "duplicate_id",
        `Customer id ${v.customer_id} appears more than once.`,
      );
    } else if (!v.name) {
      issue("error", "customers.csv", row, "name", "missing_value", "Customer name is empty.");
    } else {
      customers.push({ id: v.customer_id, name: v.name, aliases: splitList(v.aliases), row });
    }
    seenCustomers.add(v.customer_id);
  }

  // Names/aliases shared by different records are allowed but make matching ambiguous.
  const sharedKeys = (
    file: CatalogueFile,
    records: readonly { id: string; name: string; aliases: readonly string[]; row: number }[],
  ) => {
    const owners = new Map<string, Set<string>>();
    for (const r of records) {
      for (const key of [r.name, ...r.aliases].map(matchKey)) {
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key)?.add(r.id);
      }
    }
    for (const [key, ids] of owners) {
      if (ids.size > 1) {
        issue(
          "warning",
          file,
          null,
          "aliases",
          "shared_alias",
          `"${key}" refers to ${[...ids].join(", ")}; chats using it will need review.`,
        );
      }
    }
  };
  sharedKeys("products.csv", products);
  sharedKeys("customers.csv", customers);

  const version = createHash("sha256")
    .update(
      `products.csv\0${files.products}\0customers.csv\0${files.customers}\0catalogue.json\0${files.meta ?? ""}`,
    )
    .digest("hex")
    .slice(0, 16);
  const hasErrors = issues.some((i) => i.severity === "error");
  return {
    catalogue: hasErrors ? null : { version, maintainer, stalePriceDays, products, customers },
    issues,
  };
}
