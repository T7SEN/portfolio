import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Gates run against a production build: run `pnpm build` first.
// channel "chromium" is the full browser in new headless mode. Never pass
// --disable-gpu: it turns off WebGL and WebGPU.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phone",
      use: {
        ...devices["Pixel 5"],
        channel: "chromium",
        viewport: { width: 375, height: 812 },
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
