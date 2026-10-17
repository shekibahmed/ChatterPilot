/**
 * Every value in a reviewable record carries typed provenance. A catalogue price never cites a
 * chat message, a computed total cites its inputs and formula, and a human correction keeps the
 * reviewer, time, reason and previous value.
 */
export type Provenance =
  | {
      readonly kind: "message";
      readonly messageId: string;
      /** 1-based source lines in the original export. */
      readonly startLine: number;
      readonly endLine: number;
      /** Character offsets within the message body, end exclusive. */
      readonly span: { readonly start: number; readonly end: number };
      readonly text: string;
    }
  | {
      readonly kind: "catalogue";
      readonly catalogueVersion: string;
      readonly table: "products" | "customers" | "vehicles";
      readonly recordId: string;
      /** 1-based CSV line of the record. */
      readonly row: number;
      readonly column: string;
    }
  | {
      readonly kind: "computed";
      readonly formula: string;
      readonly inputs: readonly string[];
    }
  | {
      readonly kind: "human";
      readonly reviewer: string;
      readonly at: string;
      readonly reason: string;
      readonly previous: unknown;
    };

export type FieldStatus = "ok" | "needs_review" | "unknown";

export interface Field<T> {
  readonly value: T | null;
  readonly status: FieldStatus;
  readonly evidence: readonly Provenance[];
}

export const unknownField = <T>(): Field<T> => ({ value: null, status: "unknown", evidence: [] });
