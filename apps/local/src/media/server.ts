/**
 * Starts the synthetic demo server on a throwaway workspace for the media recorder, the same way
 * the browser tests do (apps/local/e2e/playwright.config.ts). Synthetic data only.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ROOT = new URL("../../../../", import.meta.url).pathname;

export interface DemoServer {
  url: string;
  workspace: string;
  stop(): Promise<void>;
}

export async function startDemo(port: number): Promise<DemoServer> {
  const dir = mkdtempSync(join(tmpdir(), "chatterpilot-media-"));
  const workspace = join(dir, "ws");
  const child = spawn(
    process.execPath,
    ["apps/local/src/cli.ts", "demo", "--port", String(port), "--workspace", workspace],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );
  const url = `http://127.0.0.1:${port}`;
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  const stop = async () => {
    if (!exited) {
      child.kill("SIGTERM");
      const killer = setTimeout(() => child.kill("SIGKILL"), 3000);
      await new Promise((resolve) => child.once("exit", resolve));
      clearTimeout(killer);
    }
    rmSync(dir, { recursive: true, force: true });
  };
  process.once("exit", () => {
    if (!exited) child.kill("SIGKILL");
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exited) break;
    try {
      const res = await fetch(`${url}/api/status`);
      if (res.ok) return { url, workspace, stop };
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await stop();
  throw new Error(`Demo server did not start on port ${port} (run "pnpm build:web" first?)`);
}
