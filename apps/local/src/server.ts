import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DateOrder } from "@chatterpilot/import-whatsapp";
import type { Workspace } from "@chatterpilot/storage";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ImportError, importExport } from "./import.ts";
import {
  activeCatalogue,
  createDraft,
  type Decision,
  dashboard,
  decide,
  exportCsv,
  exportJson,
  getDraft,
  listDrafts,
  ReviewError,
  suggestions,
} from "./review.ts";

export const DEFAULT_PORT = 4317;
export const CSRF_HEADER = "x-chatterpilot";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const DATE_ORDERS = new Set(["dmy", "mdy", "ymd"]);

const SAFE_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  opus: "audio/ogg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  pdf: "application/pdf",
};

export interface AppOptions {
  readonly port: number;
  /** Directory with the built web UI (index.html + assets), if available. */
  readonly webRoot?: string;
}

/** Keep only harmless characters of an uploaded file name; it is a label, never a path. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9 ._()+-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || "upload";
}

/**
 * The local API. Loopback only: requests must carry a loopback Host, and every state change
 * needs the custom CSRF header plus a same-origin Origin/Sec-Fetch-Site when the browser sends them.
 * No CORS headers are ever returned, so other sites cannot read responses.
 */
export function createApp(ws: Workspace, options: AppOptions): Hono {
  const app = new Hono();
  const allowedHosts = new Set([`127.0.0.1:${options.port}`, `localhost:${options.port}`]);
  const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));

  app.use("*", async (c, next) => {
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    if (!allowedHosts.has(host)) return c.text("Forbidden host", 403);
    if (!["GET", "HEAD"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      const site = c.req.header("sec-fetch-site");
      if (c.req.header(CSRF_HEADER) !== "1")
        return c.json({ error: "Missing request header." }, 403);
      if (origin !== undefined && !allowedOrigins.has(origin)) {
        return c.json({ error: "Cross-origin request refused." }, 403);
      }
      if (site !== undefined && site !== "same-origin" && site !== "none") {
        return c.json({ error: "Cross-site request refused." }, 403);
      }
    }
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cross-Origin-Resource-Policy", "same-origin");
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
  });

  app.onError((err, c) => {
    if (err instanceof ReviewError) return c.json({ error: err.message }, err.status);
    if (err instanceof ImportError) return c.json({ error: err.message, code: err.code }, 400);
    console.error("ChatterPilot server error:", err instanceof Error ? err.name : "unknown");
    return c.json({ error: "Something went wrong. Nothing was changed." }, 500);
  });

  app.get("/api/status", (c) => {
    const catalogue = activeCatalogue(ws);
    return c.json({
      workspace: ws.info(),
      catalogue: catalogue && {
        version: catalogue.version,
        maintainer: catalogue.maintainer,
        stalePriceDays: catalogue.stalePriceDays,
        products: catalogue.products.length,
        customers: catalogue.customers.length,
      },
      imports: ws.importSummaries(),
    });
  });

  app.get("/api/catalogue", (c) => {
    const catalogue = activeCatalogue(ws);
    if (!catalogue) return c.json({ products: [], customers: [] });
    return c.json({
      version: catalogue.version,
      products: catalogue.products.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        altUnits: p.altUnits.map((a) => a.unit),
      })),
      customers: catalogue.customers.map((cu) => ({ id: cu.id, name: cu.name })),
    });
  });

  app.get("/api/imports/:id/messages", (c) => c.json(ws.reviews.batchMessages(c.req.param("id"))));

  app.post("/api/imports", bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 1024 * 1024 }), async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    const dateOrder = form.get("dateOrder");
    if (!(file instanceof File)) return c.json({ error: "Choose a WhatsApp export file." }, 400);
    if (dateOrder !== null && (typeof dateOrder !== "string" || !DATE_ORDERS.has(dateOrder))) {
      return c.json({ error: "Unknown date order." }, 400);
    }
    const dir = join(ws.dir, "uploads", randomUUID());
    mkdirSync(dir, { recursive: true });
    const path = join(dir, safeFileName(file.name));
    try {
      writeFileSync(path, Buffer.from(await file.arrayBuffer()));
      const outcome = await importExport(
        ws,
        path,
        dateOrder ? { dateOrder: dateOrder as DateOrder } : {},
      );
      return c.json(outcome);
    } catch (err) {
      if (err instanceof ImportError) {
        return c.json(
          { error: err.message, code: err.code, detectedDateOrder: err.detectedDateOrder },
          400,
        );
      }
      throw err;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  app.get("/api/suggestions", (c) => c.json(suggestions(ws)));
  app.get("/api/dashboard", (c) =>
    c.json(dashboard(ws, c.req.query("scope") === "all" ? "all" : "accepted")),
  );
  app.get("/api/drafts", (c) => c.json(listDrafts(ws)));
  app.post("/api/drafts", async (c) => {
    const body = (await c.req.json()) as { messageIds?: unknown; reviewer?: unknown };
    const ids = Array.isArray(body.messageIds)
      ? body.messageIds.filter((x) => typeof x === "string")
      : [];
    return c.json(createDraft(ws, ids, String(body.reviewer ?? "")), 201);
  });
  app.get("/api/drafts/:id", (c) => c.json(getDraft(ws, c.req.param("id"))));
  app.post("/api/drafts/:id/decisions", async (c) => {
    const body = (await c.req.json()) as {
      decision?: Decision;
      reviewer?: unknown;
      reason?: unknown;
    };
    if (!body.decision || typeof body.decision !== "object") {
      return c.json({ error: "Missing decision." }, 400);
    }
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    return c.json(
      decide(ws, c.req.param("id"), body.decision, String(body.reviewer ?? ""), reason),
    );
  });

  app.get("/api/export/orders.csv", (c) => {
    c.header("Content-Disposition", 'attachment; filename="chatterpilot-orders.csv"');
    return c.body(exportCsv(ws), 200, { "Content-Type": "text/csv; charset=utf-8" });
  });
  app.get("/api/export/orders.json", (c) => {
    c.header("Content-Disposition", 'attachment; filename="chatterpilot-orders.json"');
    return c.body(exportJson(ws), 200, { "Content-Type": "application/json; charset=utf-8" });
  });

  app.get("/api/attachments/:id", (c) => {
    const row = ws.db
      .prepare("SELECT file_name, blob_sha256, content_check FROM attachment WHERE id = ?")
      .get(c.req.param("id")) as
      | { file_name: string; blob_sha256: string; content_check: string }
      | undefined;
    if (!row) return c.json({ error: "Not found." }, 404);
    const ext = row.file_name.split(".").pop()?.toLowerCase() ?? "";
    const type = row.content_check === "match" ? SAFE_MEDIA_TYPES[ext] : undefined;
    const bytes = readFileSync(ws.blobs.pathFor(row.blob_sha256));
    if (!type) {
      c.header("Content-Disposition", `attachment; filename="${safeFileName(row.file_name)}"`);
    }
    return c.body(bytes, 200, { "Content-Type": type ?? "application/octet-stream" });
  });

  app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

  const webRoot = options.webRoot;
  if (webRoot && existsSync(join(webRoot, "index.html"))) {
    app.use("/*", serveStatic({ root: webRoot }));
    app.get("*", (c) => c.html(readFileSync(join(webRoot, "index.html"), "utf8")));
  } else {
    app.get("*", (c) =>
      c.text("The web UI is not built. Run: pnpm --filter @chatterpilot/local build:web", 503),
    );
  }
  return app;
}

/** Serve on the loopback interface only. */
export function startServer(
  ws: Workspace,
  options: AppOptions,
): Promise<{ url: string; close: () => void }> {
  const app = createApp(ws, options);
  return new Promise((resolve) => {
    const server = serve(
      { fetch: app.fetch, hostname: "127.0.0.1", port: options.port },
      (info) => {
        resolve({ url: `http://127.0.0.1:${info.port}`, close: () => server.close() });
      },
    );
  });
}
