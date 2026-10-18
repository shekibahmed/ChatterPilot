import type { Exclusion, Metric } from "@chatterpilot/orders";
import { type ReactNode, useEffect, useState } from "react";
import { api, type Dashboard as DashboardData } from "../api.ts";
import { money, quantity } from "../format.ts";

function MetricFrame({ metric, children }: { metric: Metric<unknown>; children: ReactNode }) {
  return (
    <section className="panel metric-panel" aria-label={metric.title}>
      <h2>{metric.title}</h2>
      {children}
      <Exclusions items={metric.excluded} />
      <details>
        <summary>How this is calculated</summary>
        <p>{metric.definition}</p>
        {metric.window && (
          <p className="muted">
            Window: {metric.window.from} to {metric.window.to}
          </p>
        )}
      </details>
    </section>
  );
}

function Exclusions({ items }: { items: readonly Exclusion[] }) {
  if (items.length === 0) return null;
  return (
    <p className="muted small">
      Not included: {items.map((e) => `${e.count} ${e.reason}`).join("; ")}.
    </p>
  );
}

interface Bar {
  key: string;
  label: string;
  value: number | null;
  display: string;
}

/** Single-series bar chart; days without data are drawn as hatched "no data", not zero. */
function BarChart({ bars, title }: { bars: Bar[]; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value ?? 0));
  const current = active === null ? null : bars[active];
  return (
    <figure className="chart">
      <div className="tooltip" aria-live="polite">
        {current ? `${current.label}: ${current.display}` : "Hover or focus a bar for its value"}
      </div>
      <div className="bars" role="img" aria-label={title}>
        {bars.map((b, i) => (
          <button
            type="button"
            key={b.key}
            className="bar-slot"
            aria-label={`${b.label}: ${b.display}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
          >
            {b.value === null ? (
              <div className="bar no-data" title={`${b.label}: no data`} />
            ) : (
              <div
                className={active === i ? "bar active" : "bar"}
                style={{ height: b.value === 0 ? "0" : `${Math.max(2, (b.value / max) * 100)}%` }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="axis">
        <span>{bars[0]?.label}</span>
        <span>{bars.at(-1)?.label}</span>
      </div>
      <details>
        <summary>Table view</summary>
        <table className="table compact">
          <tbody>
            {bars.map((b) => (
              <tr key={b.key}>
                <td>{b.label}</td>
                <td>{b.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function ProductsTable({ rows }: { rows: DashboardData["products"]["value"] }) {
  return (
    <table className="table compact">
      <thead>
        <tr>
          <th>Product</th>
          <th>Quantity</th>
          <th>Lines</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={`${p.productId}-${p.baseUnit}`}>
            <td>{p.name}</td>
            <td>
              {quantity(p.quantityMilli)} {p.baseUnit}
            </td>
            <td>{p.lines}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CustomersTable({ rows }: { rows: DashboardData["customers"]["value"] }) {
  return (
    <table className="table compact">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Orders</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.customerId}>
            <td>{c.name}</td>
            <td>{c.orders}</td>
            <td>{c.totals.map((t) => money(t.totalMinor, t.currency)).join(" + ") || "unknown"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IssuesTable({ rows }: { rows: DashboardData["openIssues"]["value"] }) {
  return (
    <table className="table compact">
      <thead>
        <tr>
          <th>Issue</th>
          <th>Count</th>
          <th>Drafts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.code}>
            <td>{row.code.replaceAll("_", " ")}</td>
            <td>{row.count}</td>
            <td>
              <DraftLinks ids={row.draftIds} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DraftLinks({ ids }: { ids: readonly string[] }) {
  return (
    <>
      {ids.map((id, n) => (
        <a key={id} href={`#/draft/${id}`}>
          {n > 0 ? ", " : ""}open draft {n + 1}
        </a>
      ))}
    </>
  );
}

export function Dashboard() {
  const [scope, setScope] = useState<"accepted" | "all">("accepted");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .dashboard(scope)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [scope]);

  if (error) return <p className="alert">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const d: DashboardData = data;
  const currencies = new Set(d.orderValueByDay.value.map((row) => row.currency));
  // One currency: a continuous day axis (0 on covered days without orders, "no data" on gaps).
  // Several currencies are never added together, so each date/currency pair gets its own bar.
  const valueBars: Bar[] =
    currencies.size <= 1
      ? d.activity.value.map((day) => {
          const row = d.orderValueByDay.value.find((r) => r.date === day.date);
          const currency = [...currencies][0] ?? null;
          return {
            key: day.date,
            label: day.date,
            value: day.covered ? (row?.totalMinor ?? 0) : null,
            display: !day.covered
              ? "no data"
              : row
                ? `${money(row.totalMinor, row.currency)} from ${row.orders} order${row.orders === 1 ? "" : "s"}`
                : `${money(0, currency)} (no orders in this view)`,
          };
        })
      : d.orderValueByDay.value.map((row) => ({
          key: `${row.date}-${row.currency}`,
          label: `${row.date} (${row.currency})`,
          value: row.totalMinor,
          display: `${money(row.totalMinor, row.currency)} from ${row.orders} order${row.orders === 1 ? "" : "s"}`,
        }));
  const activityBars: Bar[] = d.activity.value.map((day) => ({
    key: day.date,
    label: day.date,
    value: day.messages,
    display: day.messages === null ? "no data" : `${day.messages} messages`,
  }));
  const cov = d.coverage;
  const cmp = d.weekComparison.value;

  return (
    <section>
      <div className="dash-head">
        <h1>Dashboard</h1>
        <fieldset className="segmented" aria-label="Which orders to count">
          <button
            type="button"
            aria-pressed={scope === "accepted"}
            onClick={() => setScope("accepted")}
          >
            Accepted orders only
          </button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
            Include open drafts
          </button>
        </fieldset>
      </div>
      {cov.window ? (
        <p className={cov.value.gaps.length > 0 ? "issues" : "note"} data-testid="coverage">
          Based on chats from {cov.window.from} to {cov.window.to} ({cov.value.coveredDays} of{" "}
          {cov.value.days} days covered
          {cov.value.gaps.length > 0 &&
            `; no data for ${cov.value.gaps.map((g) => `${g.from}–${g.to}`).join(", ")}`}
          ). Imported chats are an incomplete record of the business.
        </p>
      ) : (
        <p className="issues">No chats imported yet.</p>
      )}

      <div className="cards">
        {(
          [
            ["Suggested, not drafted", d.pipeline.value.suggested],
            ["Open drafts", d.pipeline.value.open],
            ["Accepted orders", d.pipeline.value.accepted],
            ["Rejected", d.pipeline.value.rejected],
          ] as const
        ).map(([label, n]) => (
          <div className="card" key={label}>
            <span className="metric">{n}</span>
            <span className="label">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid2">
        <MetricFrame metric={d.orderValueByDay}>
          {d.orderValueByDay.value.length === 0 ? (
            <p className="muted">No orders with a known total in this view yet.</p>
          ) : (
            <BarChart title="Order value by order date" bars={valueBars} />
          )}
        </MetricFrame>
        <MetricFrame metric={d.activity}>
          <BarChart title="Text messages per day" bars={activityBars} />
        </MetricFrame>
      </div>

      <MetricFrame metric={d.weekComparison}>
        {cmp.status === "ok" ? (
          <p>
            {money(cmp.current.totalMinor, cmp.currency)} ({cmp.current.orders} orders) vs{" "}
            {money(cmp.previous.totalMinor, cmp.currency)} ({cmp.previous.orders} orders):{" "}
            <strong>
              {cmp.changePercent === null
                ? "n/a"
                : `${cmp.changePercent > 0 ? "+" : ""}${cmp.changePercent}%`}
            </strong>
          </p>
        ) : (
          <p className="muted" data-testid="comparison">
            Insufficient comparable data. {cmp.reason}
          </p>
        )}
      </MetricFrame>

      <div className="grid2">
        <MetricFrame metric={d.products}>
          <ProductsTable rows={d.products.value} />
        </MetricFrame>
        <MetricFrame metric={d.customers}>
          <CustomersTable rows={d.customers.value} />
        </MetricFrame>
      </div>

      <MetricFrame metric={d.openIssues}>
        {d.openIssues.value.length === 0 ? (
          <p className="muted">No open issues.</p>
        ) : (
          <IssuesTable rows={d.openIssues.value} />
        )}
      </MetricFrame>
    </section>
  );
}
