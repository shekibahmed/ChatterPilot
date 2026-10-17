import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOrderDraft,
  type Catalogue,
  type CatalogueIssue,
  extractOrderLines,
  loadCatalogue,
  matchRecord,
  type OrderDraft,
  type SourceMessage,
} from "@chatterpilot/orders";
import type { Workspace } from "@chatterpilot/storage";

/** Read products.csv, customers.csv and optional catalogue.json from a directory. */
export function readCatalogueDir(dir: string): {
  catalogue: Catalogue | null;
  issues: CatalogueIssue[];
} {
  const file = (name: string) => join(dir, name);
  const meta = existsSync(file("catalogue.json"))
    ? readFileSync(file("catalogue.json"), "utf8")
    : undefined;
  return loadCatalogue({
    products: readFileSync(file("products.csv"), "utf8"),
    customers: readFileSync(file("customers.csv"), "utf8"),
    ...(meta === undefined ? {} : { meta }),
  });
}

interface MessageRow {
  id: string;
  start_line: number;
  end_line: number;
  timestamp_text: string;
  local_datetime: string | null;
  body: string;
  author: string | null;
  source_name: string;
}

export interface OrderCandidate {
  readonly message: SourceMessage;
  readonly author: string | null;
  readonly sourceName: string;
}

/**
 * Suggest messages that look like orders: text messages with at least one line whose product
 * matches the catalogue. A suggestion only; a person chooses what becomes a draft.
 */
export function suggestOrderMessages(workspace: Workspace, catalogue: Catalogue): OrderCandidate[] {
  const rows = workspace.db
    .prepare(
      `SELECT m.id, m.start_line, m.end_line, m.timestamp_text, m.local_datetime, m.body, m.author,
              b.source_name
       FROM message m JOIN import_batch b ON b.id = m.import_batch_id
       WHERE m.kind = 'text'
       ORDER BY b.imported_at, m.position`,
    )
    .all() as MessageRow[];
  return rows
    .filter((r) =>
      extractOrderLines(r.body).some((line) => {
        const status = matchRecord(line.productText, catalogue.products, (p) => [
          p.name,
          ...p.aliases,
        ]).status;
        return status === "resolved" || status === "fuzzy";
      }),
    )
    .map((r) => ({
      message: {
        id: r.id,
        startLine: r.start_line,
        endLine: r.end_line,
        timestampText: r.timestamp_text,
        localDateTime: r.local_datetime,
        body: r.body,
      },
      author: r.author,
      sourceName: r.source_name,
    }));
}

export function draftFor(candidate: OrderCandidate, catalogue: Catalogue): OrderDraft {
  return buildOrderDraft([candidate.message], catalogue);
}
