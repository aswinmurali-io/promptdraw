// End-to-end checks in a real browser (Chromium): board navigation, type weight and the
// labelled toolbar. Runs its own Vite server on a separate port so it never touches the
// dev server on 5173.
// @lat: [[testing#End-to-end tests]]
import { defineConfig, devices } from "@playwright/test";

const PORT = 5181;
// Node's process, typed locally so the config needs no @types/node.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
