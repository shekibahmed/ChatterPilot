import type { FollowupItem, FollowupSummary } from "@chatterpilot/templates";
import { useEffect, useState } from "react";

const KIND: Record<string, string> = {
  delivery_chase: "Waiting for delivery",
  complaint: "Complaint",
  payment_promise: "Payment promised",
  payment_report: "Payment reported",
  quote_request: "Quote requested",
  resolution: "Closed",
};

const age = (hours: number | null) =>
  hours === null ? "?" : hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} h`;
const money = (minor: number) =>
  (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Followups() {
  const [data, setData] = useState<{ items: FollowupItem[]; summary: FollowupSummary } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/followups")
      .then((r) => r.json() as Promise<{ items: FollowupItem[]; summary: FollowupSummary }>)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <p className="alert">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { summary, items } = data;

  return (
    <section>
      <h1>Open follow-ups</h1>
      <p className="muted">
        Deliveries customers are chasing, complaints, payments and quote requests found in the
        imported chats by simple rules. Links between messages ("asked again", "closed") are guesses
        from who wrote and when: check them. Ages run to the latest follow-up found (
        {summary.asOf?.replace("T", " ") ?? "unknown"}), not to today.
      </p>
      {summary.open.length === 0 ? (
        <p>Nothing open in the imported chats.</p>
      ) : (
        <table data-testid="open-followups">
          <thead>
            <tr>
              <th>What</th>
              <th>Who</th>
              <th>Open for</th>
              <th>Asked</th>
              <th>Words</th>
            </tr>
          </thead>
          <tbody>
            {summary.open.map((o) => (
              <tr key={o.itemId}>
                <td>{KIND[o.kind] ?? o.kind}</td>
                <td>{o.author ?? "?"}</td>
                <td>{age(o.ageHours)}</td>
                <td>{o.repeats > 0 ? `${o.repeats + 1} times` : "once"}</td>
                <td>“{o.text}”</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        {summary.resolved} closed (to check). Payments promised: ₹{money(summary.promisedMinor)}.
        Payments reported: ₹{money(summary.reportedPaidMinor)}. Neither is a verified payment: check
        your bank or books.
      </p>
      <details>
        <summary>All {items.length} items</summary>
        <ul className="issues">
          {items.map((i) => (
            <li key={i.id}>
              {i.occurredAt?.replace("T", " ") ?? "?"} · {KIND[i.kind] ?? i.kind} ·{" "}
              {i.author ?? "?"} · “{i.trigger.value}” (line{" "}
              {i.trigger.evidence[0]?.kind === "message" ? i.trigger.evidence[0].startLine : "?"})
              {i.links.map((l) => (
                <span key={l.itemId} className="badge warn">
                  {l.type === "resolves" ? "closes" : "asks again"} {l.itemId} (check)
                </span>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
