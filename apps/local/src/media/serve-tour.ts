/**
 * Serves the interactive tour locally: `pnpm media:tour` → http://127.0.0.1:4318/media/tour.html.
 * Static files from docs/ only, loopback only, with HTTP range requests so the video can seek.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { ROOT } from "./server.ts";

const DOCS = join(ROOT, "docs");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

/** Resolves a URL path inside docs/, or null if it would escape it. */
export function resolveDocPath(urlPath: string): string | null {
  const path = normalize(decodeURIComponent(urlPath.split("?")[0] ?? "/"));
  const file = join(DOCS, path === `${sep}` || path === "/" ? "media/tour.html" : path);
  return file === DOCS || file.startsWith(`${DOCS}${sep}`) ? file : null;
}

/** Parses a single `bytes=a-b` range; null for absent or unsatisfiable ranges. */
export function parseRange(header: string | undefined, size: number): [number, number] | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === "" || m[2] === "" ? size - 1 : Number(m[2]);
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  return start <= end ? [start, end] : null;
}

export function serveTour(port: number): Server {
  return createServer((req, res) => {
    const file = resolveDocPath(req.url ?? "/");
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    const size = statSync(file).size;
    const headers = {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
    };
    const range = parseRange(req.headers.range, size);
    if (req.headers.range && !range) {
      res.writeHead(416, { "content-range": `bytes */${size}` }).end();
      return;
    }
    if (range) {
      const [start, end] = range;
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": end - start + 1,
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "content-length": size });
    createReadStream(file).pipe(res);
  }).listen(port, "127.0.0.1");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4318);
  serveTour(port);
  console.log(`Tour: http://127.0.0.1:${port}/media/tour.html (Ctrl+C to stop)`);
}
