/**
 * Streamable HTTP transport for the MCP server (MCP spec: one endpoint, POST plus optional SSE).
 * Loopback by default. A non-loopback bind requires --token so the process is not an open reader
 * of the local workspace. There is no hosted URL in this repository.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  type McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { createMcpServer, type McpOptions } from "./mcp.ts";

export const MCP_HTTP_PATH = "/mcp";
export const DEFAULT_MCP_HTTP_PORT = 4318;

export interface McpHttpOptions extends McpOptions {
  /** Bind address. Defaults to 127.0.0.1. */
  readonly host?: string;
  /** TCP port. 0 asks the OS for a free port. Defaults to 4318. */
  readonly port?: number;
  /** When set, every request must send `Authorization: Bearer <token>`. */
  readonly token?: string;
}

export interface McpHttpServer {
  readonly host: string;
  readonly port: number;
  readonly close: () => Promise<void>;
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function bearerOk(expected: string, header: string | undefined): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;
  const got = Buffer.from(header.slice(prefix.length));
  const want = Buffer.from(expected);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

function isInitialize(body: unknown): boolean {
  const one = (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    (value as { method?: unknown }).method === "initialize";
  return Array.isArray(body) ? body.some(one) : one(body);
}

interface Session {
  readonly transport: WebStandardStreamableHTTPServerTransport;
  readonly server: McpServer;
}

export async function startMcpHttpServer(options: McpHttpOptions): Promise<McpHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? DEFAULT_MCP_HTTP_PORT;
  if (!isLoopbackHost(host) && !options.token) {
    throw new Error(
      "Refusing to listen outside loopback without --token. The server can read a local workspace.",
    );
  }
  const sessions = new Map<string, Session>();
  const app = new Hono();

  app.all(MCP_HTTP_PATH, async (c) => {
    if (isLoopbackHost(host)) {
      const blocked = hostHeaderValidationResponse(c.req.raw, localhostAllowedHostnames());
      if (blocked) return blocked;
    }
    if (options.token && !bearerOk(options.token, c.req.header("authorization"))) {
      return c.json({ error: "Unauthorized" }, 401, {
        "WWW-Authenticate": 'Bearer realm="chatterpilot"',
      });
    }
    const sessionId = c.req.header("mcp-session-id");
    if (sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing) return c.json({ error: "Session not found" }, 404);
      return existing.transport.handleRequest(c.req.raw);
    }
    const text = await c.req.text();
    let parsed: unknown;
    try {
      parsed = text === "" ? undefined : JSON.parse(text);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    if (!isInitialize(parsed)) {
      return c.json(
        { error: "Send initialize first. Later calls must include the mcp-session-id header." },
        400,
      );
    }
    let sessionServer: McpServer;
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server: sessionServer });
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    sessionServer = createMcpServer(options);
    await sessionServer.connect(transport);
    return transport.handleRequest(c.req.raw, { parsedBody: parsed });
  });

  app.all("*", (c) => c.json({ error: `ChatterPilot MCP is at ${MCP_HTTP_PATH}` }, 404));

  let bound = port;
  const http: ServerType = await new Promise((resolve) => {
    const listening = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
      bound = info.port;
      resolve(listening);
    });
  });

  return {
    host,
    port: bound,
    close: async () => {
      await Promise.all(
        [...sessions.values()].map(async (session) => {
          await session.transport.close();
          await session.server.close();
        }),
      );
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        http.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
