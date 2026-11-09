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
      testIgnore: /vitals\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phone",
      testIgnore: /vitals\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        channel: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
    // Lab vitals run after the other projects, one test at a time, so no
    // other browser competes for the CPU while they measure (D-019).
    {
      name: "phone-vitals",
      testMatch: /vitals\.spec\.ts/,
      dependencies: ["desktop", "phone"],
      workers: 1,
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
