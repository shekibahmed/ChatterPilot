import type { OrderDraft } from "@chatterpilot/orders";

/** An accepted order exactly as frozen at acceptance. Exporters never read unaccepted drafts. */
export interface AcceptedOrder {
  readonly id: string;
  readonly acceptedAt: string | null;
  readonly acceptedBy: string | null;
  readonly snapshotSha256: string;
  readonly draft: OrderDraft;
}

/**
 * Names the target system uses for this business's masters. Exporters use catalogue names when a
 * mapping is missing, which only works if the target uses exactly the same names.
 */
export interface ExportMap {
  readonly customers?: Readonly<Record<string, string>>;
  readonly products?: Readonly<Record<string, string>>;
  readonly units?: Readonly<Record<string, string>>;
  /** Seller (this business) name, used by formats that need it (UBL). */
  readonly seller?: string;
  /** Tally: company name and voucher type name. */
  readonly tallyCompany?: string;
  readonly tallyVoucherType?: string;
  /** ERPNext: naming series for new Sales Orders. */
  readonly erpnextSeries?: string;
}

export interface ExportFile {
  readonly fileName: string;
  readonly mediaType: string;
  readonly content: string;
}

export interface ExportResult {
  /** One or more files (UBL writes one document per order). */
  readonly files: readonly ExportFile[];
  /** Things a person must check before importing the file. */
  readonly warnings: readonly string[];
}

export class ExportRefused extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Export refused: ${problems.join(" ")}`);
    this.name = "ExportRefused";
    this.problems = problems;
  }
}

export interface ExportTarget {
  readonly id: string;
  readonly label: string;
  /** How well the format is verified; shown to people and agents. */
  readonly maturity: "stable" | "experimental";
  readonly notes: string;
  render(orders: readonly AcceptedOrder[], map?: ExportMap): ExportResult;
}

/** Stable reference per accepted version, for the target's voucher/reference field. */
export const orderReference = (o: AcceptedOrder) =>
  `CP-${o.snapshotSha256.slice(0, 10).toUpperCase()}`;
