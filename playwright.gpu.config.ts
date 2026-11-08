import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;

// Local only: a headed browser on this machine's real GPU. Frame rates are
// measured here (REQ-PERF-06), and the WebGPU probe runs here to compare
// headed with headless.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "webgpu-probe.spec.ts",
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [
    {
      name: "gpu",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        headless: false,
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
