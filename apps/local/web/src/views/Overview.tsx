import type { Status } from "../api.ts";
import { shortTime } from "../format.ts";

export function Overview({ status }: { status: Status | null }) {
  if (!status) return <p className="muted">Loading…</p>;
  const messages = status.imports.reduce((n, i) => n + i.messages, 0);
  const first =
    status.imports
      .map((i) => i.coverage.first)
      .filter(Boolean)
      .sort()[0] ?? null;
  const last =
    status.imports
      .map((i) => i.coverage.last)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  return (
    <section>
      <h1>Turn WhatsApp order messages into checked, source-linked drafts</h1>
      <div className="cards">
        <div className="card">
          <span className="metric">{status.imports.length}</span>
          <span className="label">chat exports imported</span>
        </div>
        <div className="card">
          <span className="metric">{messages}</span>
          <span className="label">messages kept unchanged</span>
        </div>
        <div className="card">
          <span className="metric small">
            {shortTime(first)} → {shortTime(last)}
          </span>
          <span className="label">period covered by imports (local time)</span>
        </div>
        <div className="card">
          <span className="metric small">
            {status.catalogue ? status.catalogue.version : "none"}
          </span>
          <span className="label">
            {status.catalogue
              ? `catalogue: ${status.catalogue.products} products, ${status.catalogue.customers} customers`
              : "no catalogue loaded — run `chatterpilot catalogue load <dir>`"}
          </span>
        </div>
      </div>
      <ol className="steps">
        <li>
          <strong>Import</strong> a WhatsApp chat export (TXT or ZIP). Nothing leaves this computer.
        </li>
        <li>
          <strong>Suggest</strong>: messages that mention catalogue products become order
          suggestions.
        </li>
        <li>
          <strong>Review</strong>: every value shows where it came from — a chat line, the
          catalogue, a calculation or your edit. Unknowns stay unknown.
        </li>
        <li>
          <strong>Export</strong> accepted orders as CSV or JSON for your billing or ERP tool.
        </li>
      </ol>
    </section>
  );
}
