export function ExportView() {
  return (
    <section>
      <h1>Export accepted orders</h1>
      <p>
        Only accepted orders are exported, exactly as they were when accepted. Each row keeps the
        chat line it came from, any human edits, the catalogue version and a fingerprint of the
        accepted draft. Spreadsheet formulas in chat text are neutralised.
      </p>
      <div className="actions">
        <a className="button primary" href="/api/export/orders.csv" download>
          Download CSV
        </a>
        <a className="button" href="/api/export/orders.json" download>
          Download JSON (with full provenance)
        </a>
      </div>
    </section>
  );
}
