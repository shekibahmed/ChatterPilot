import { useEffect, useState } from "react";

interface Target {
  id: string;
  label: string;
  maturity: "stable" | "experimental";
  notes: string;
}

interface Prepared {
  files: { index: number; fileName: string }[];
  warnings: string[];
  notes: string | null;
}

function TargetRow({ target }: { target: Target }) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prepare = async () => {
    setError(null);
    const res = await fetch(`/api/exports/${encodeURIComponent(target.id)}`);
    const body = (await res.json()) as Prepared & { error?: string };
    if (!res.ok) {
      setPrepared(null);
      setError(body.error ?? "Could not prepare the file.");
      return;
    }
    setPrepared(body);
  };

  return (
    <div className="panel">
      <h2>
        {target.label}{" "}
        <span className={`badge ${target.maturity === "experimental" ? "warn" : ""}`}>
          {target.maturity}
        </span>
      </h2>
      <p className="muted">{target.notes}</p>
      <button type="button" onClick={prepare}>
        Prepare file
      </button>
      {error && <p className="alert">{error}</p>}
      {prepared && (
        <>
          {prepared.warnings.length > 0 && (
            <ul className="issues">
              {prepared.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="actions">
            {prepared.files.map((f) => (
              <a
                key={f.index}
                className="button primary"
                href={`/api/exports/${encodeURIComponent(target.id)}/${f.index}`}
                download
              >
                Download {f.fileName}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ExportView() {
  const [targets, setTargets] = useState<Target[]>([]);
  useEffect(() => {
    fetch("/api/exports")
      .then((r) => r.json() as Promise<Target[]>)
      .then(setTargets)
      .catch(() => setTargets([]));
  }, []);

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
      <h1>Import files for other tools</h1>
      <p className="muted">
        These formats are experimental: import into a test company or sandbox first and compare
        totals. Names for customers, products and units come from <code>export-map.json</code> in
        the workspace folder (see docs/exporters.md); without it, ChatterPilot's names are used and
        must match the other tool exactly. Tally refuses to export until every name is mapped.
      </p>
      {targets.map((t) => (
        <TargetRow key={t.id} target={t} />
      ))}
    </section>
  );
}
