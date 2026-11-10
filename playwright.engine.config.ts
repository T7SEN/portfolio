import { defineConfig, devices } from "@playwright/test";

const PORT = 3102;

// Local only: the engine page exists only on the development server, so this
// run starts one and stops it when the run ends. The browser is headed, on
// this machine's real GPU, because headless WebGL2 may render in software
// (REQ-ENG-06). Never pass --disable-gpu: it turns off WebGL and WebGPU.
export default defineConfig({
  testDir: "./e2e/gpu",
  // A folder of its own, so this run leaves the gate's screenshots in place.
  outputDir: "./test-results/engine",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [
    {
      name: "engine",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        headless: false,
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
