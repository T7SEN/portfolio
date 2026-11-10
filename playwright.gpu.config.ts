import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;

// Local only: a headed browser on this machine's real GPU, against the
// production build (run `pnpm build` first). Frame rates are measured here
// (REQ-PERF-06), and the WebGPU probe runs here to compare headed with
// headless. Never pass --disable-gpu: it turns off WebGL and WebGPU.
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    /webgpu-probe\.spec\.ts$/,
    /[\\/]e2e[\\/]headed[\\/].*\.spec\.ts$/,
  ],
  // A folder of its own, so this run leaves the gate's screenshots in place.
  outputDir: "./test-results/gpu",
  forbidOnly: true,
  retries: 0,
  // One browser at a time: a second one would share the GPU and the display
  // with the field being measured.
  workers: 1,
  timeout: 180_000,
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
