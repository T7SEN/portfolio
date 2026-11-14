import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { withoutLoader } from "./support/loader";

// Every tab opens the home page with no loader cover: withoutLoader
// serves each page with its inline script emptied, as a blocked script
// leaves it. e2e/loader.spec.ts covers the cover (REQ-LOAD-01).
test.beforeEach(async ({ context }) => {
  await withoutLoader(context);
});

// Records what WebGPU and WebGL2 report in this browser, headless in the
// desktop project and headed in playwright.gpu.config.ts. The result decides
// whether tier 1 can be checked headless (rule D6). It asserts only a secure
// context, so a missing navigator.gpu is never caused by the page itself.
test("REQ-TIER-01 WebGPU probe records what this browser reports", async ({
  page,
  browser,
  browserName,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "Phones get tier 2 (REQ-TIER-02); the probe runs on desktop",
  );

  await page.goto("/");
  const result = await page.evaluate(async () => {
    const report: Record<string, unknown> = {
      secureContext: window.isSecureContext,
      gpu: "gpu" in navigator,
    };

    if ("gpu" in navigator) {
      const adapter = await navigator.gpu.requestAdapter();
      report.adapter = adapter !== null;
      if (adapter) {
        const info = adapter.info as GPUAdapterInfo & {
          isFallbackAdapter?: boolean;
        };
        report.vendor = info.vendor || null;
        report.architecture = info.architecture || null;
        report.device = info.device || null;
        report.description = info.description || null;
        report.isFallbackAdapter = info.isFallbackAdapter ?? null;
        report.features = adapter.features.size;
      }
    }

    const gl = document.createElement("canvas").getContext("webgl2");
    report.webgl2 = gl !== null;
    if (gl) report.webgl2Renderer = gl.getParameter(gl.RENDERER);
    return report;
  });

  const record = {
    project: testInfo.project.name,
    headless: testInfo.project.use.headless ?? true,
    browser: `${browserName} ${browser.version()}`,
    ...result,
  };
  console.log(`webgpu-probe ${JSON.stringify(record)}`);
  writeFileSync(
    testInfo.outputPath("webgpu-probe.json"),
    JSON.stringify(record, null, 2),
  );
  expect(result.secureContext).toBe(true);
});
