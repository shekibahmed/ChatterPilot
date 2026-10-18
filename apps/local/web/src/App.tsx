import { useCallback, useEffect, useState } from "react";
import { api, type Status } from "./api.ts";
import { Dashboard } from "./views/Dashboard.tsx";
import { DraftReview } from "./views/DraftReview.tsx";
import { ExportView } from "./views/Export.tsx";
import { Followups } from "./views/Followups.tsx";
import { Imports } from "./views/Imports.tsx";
import { Orders } from "./views/Orders.tsx";
import { Overview } from "./views/Overview.tsx";

type Route =
  | { view: "overview" }
  | { view: "imports"; batchId?: string }
  | { view: "orders" }
  | { view: "draft"; id: string }
  | { view: "dashboard" }
  | { view: "followups" }
  | { view: "export" };

function parseRoute(hash: string): Route {
  const [view, id] = hash.replace(/^#\/?/, "").split("/");
  if (view === "imports") return id ? { view, batchId: decodeURIComponent(id) } : { view };
  if (view === "orders") return { view };
  if (view === "draft" && id) return { view, id: decodeURIComponent(id) };
  if (view === "export") return { view };
  if (view === "dashboard") return { view };
  if (view === "followups") return { view };
  return { view: "overview" };
}

export const go = (path: string) => {
  window.location.hash = path;
};

function readReviewer(): string {
  try {
    return localStorage.getItem("chatterpilot.reviewer") ?? "Owner";
  } catch {
    return "Owner";
  }
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState(readReviewer);

  const refresh = useCallback(() => {
    api
      .status()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    refresh();
    return () => window.removeEventListener("hashchange", onHash);
  }, [refresh]);

  const saveReviewer = (name: string) => {
    setReviewer(name);
    try {
      localStorage.setItem("chatterpilot.reviewer", name);
    } catch {
      // Browser storage is optional; the name still applies for this session.
    }
  };

  const nav: [Route["view"], string, string][] = [
    ["overview", "Overview", "#/"],
    ["imports", "Imports", "#/imports"],
    ["orders", "Orders", "#/orders"],
    ["dashboard", "Dashboard", "#/dashboard"],
    ["followups", "Follow-ups", "#/followups"],
    ["export", "Export", "#/export"],
  ];
  const active = route.view === "draft" ? "orders" : route.view;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>ChatterPilot</strong>
            <span className="muted"> {status?.workspace.name ?? ""}</span>
          </div>
        </div>
        <label className="reviewer">
          Reviewing as
          <input
            aria-label="Reviewer name"
            value={reviewer}
            maxLength={80}
            onChange={(e) => saveReviewer(e.target.value)}
          />
        </label>
      </header>
      <nav className="tabs" aria-label="Sections">
        {nav.map(([view, label, href]) => (
          <a key={view} href={href} className={active === view ? "tab active" : "tab"}>
            {label}
          </a>
        ))}
      </nav>
      <main className="content">
        {error && <p className="alert">Cannot reach the local ChatterPilot server: {error}</p>}
        {route.view === "overview" && <Overview status={status} />}
        {route.view === "imports" && (
          <Imports status={status} batchId={route.batchId} onImported={refresh} />
        )}
        {route.view === "orders" && <Orders reviewer={reviewer} status={status} />}
        {route.view === "draft" && <DraftReview id={route.id} reviewer={reviewer} />}
        {route.view === "dashboard" && <Dashboard />}
        {route.view === "followups" && <Followups />}
        {route.view === "export" && <ExportView />}
      </main>
      <footer className="footer muted">
        Runs on this computer only. Imported chats are an incomplete record; every order needs a
        person's review.
      </footer>
    </div>
  );
}
