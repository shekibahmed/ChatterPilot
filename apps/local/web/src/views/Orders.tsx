import { useEffect, useState } from "react";
import { go } from "../App.tsx";
import { api, type DraftSummary, type Status, type StoredMessage } from "../api.ts";
import { shortTime } from "../format.ts";

export function Orders({ reviewer, status }: { reviewer: string; status: Status | null }) {
  const [suggestions, setSuggestions] = useState<StoredMessage[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .suggestions()
      .then(setSuggestions)
      .catch((e: Error) => setError(e.message));
    api
      .drafts()
      .then(setDrafts)
      .catch((e: Error) => setError(e.message));
  }, []);

  const create = async (id: string) => {
    try {
      const view = await api.createDraft([id], reviewer);
      go(`/draft/${view.record.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="split">
      <div>
        <h1>Suggested orders</h1>
        {!status?.catalogue && (
          <p className="alert">Load a catalogue first: chatterpilot catalogue load &lt;dir&gt;</p>
        )}
        <p className="muted">
          Messages that mention catalogue products. A suggestion is not an order until you review
          it.
        </p>
        {error && <p className="alert">{error}</p>}
        {suggestions.length === 0 && <p className="muted">No new suggestions.</p>}
        <ul className="list">
          {suggestions.map((m) => (
            <li key={m.id} className="suggestion">
              <div>
                <span className="muted">
                  {m.sourceName} · line {m.startLine} · {shortTime(m.localDateTime)} · {m.author}
                </span>
                <p className="body">{m.body}</p>
              </div>
              <button type="button" className="primary" onClick={() => create(m.id)}>
                Draft order
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h1>Drafts</h1>
        {drafts.length === 0 && <p className="muted">No drafts yet.</p>}
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Total</th>
              <th>Open issues</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id}>
                <td>
                  <a href={`#/draft/${d.id}`} className={`status status-${d.status}`}>
                    {d.status}
                  </a>
                </td>
                <td>{d.customer ?? <span className="muted">unknown</span>}</td>
                <td>{d.orderDate ?? "unknown"}</td>
                <td>{d.total ?? <span className="muted">unknown</span>}</td>
                <td>{d.openIssues}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
