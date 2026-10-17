import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 4320;
// A fresh, throwaway demo workspace per run (synthetic data only).
const workspace = join(mkdtempSync(join(tmpdir(), "chatterpilot-e2e-")), "ws");
const root = new URL("../../../", import.meta.url).pathname;

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: join(tmpdir(), "chatterpilot-e2e-results"),
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } },
    },
  ],
  webServer: [
    {
      command: `node apps/local/src/cli.ts demo --port ${PORT} --workspace ${workspace}`,
      cwd: root,
      url: `http://127.0.0.1:${PORT}/api/status`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    // Synthetic MockBooks targets for the order connector (normal and with injected faults).
    ...[
      [4330, ""],
      [4331, "--drift"],
      [4332, "--layout-v2"],
      [4333, "--lost-response"],
      [4334, "--reset-after-save"],
    ].map(([port, flag]) => ({
      command: `node fixtures/mock-order-app/server.ts --port ${port} ${flag}`,
      cwd: root,
      url: `http://127.0.0.1:${port}/api/stats`,
      reuseExistingServer: false,
      timeout: 30_000,
    })),
  ],
});
