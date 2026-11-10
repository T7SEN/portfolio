import { expect, test } from "@playwright/test";

import { PARTICLES } from "../../src/engine/config";
import {
  FPS_TOLERANCE,
  PASS_MEDIAN_MS,
  WARM_UP_MS,
  WINDOW_MS,
  measureFrames,
  readSurface,
  watchErrors,
} from "./frame-times";

// The real engine on the development page, headed, on this machine's GPU:
// 1280 x 800 at a device pixel ratio of 1, with the host filling the window.

const VIEW = '[data-testid="engine-view"]';
const CANVAS = `${VIEW} [data-part="host"] > canvas`;

const CASES = [
  {
    title:
      "REQ-ENG-05 REQ-ENG-06 REQ-TIER-05 tier 2 forced: 100,000 particles on WebGL2 hold 30 fps",
    query: "tier=2&count=100000",
    count: 100_000,
    forced: 2,
  },
  {
    title:
      "REQ-ENG-05 REQ-ENG-06 REQ-TIER-05 tier 2 forced: 250,000 particles on WebGL2 hold 30 fps",
    query: "tier=2&count=250000",
    count: 250_000,
    forced: 2,
  },
  {
    title:
      "REQ-PERF-06 REQ-TIER-05 tier 1 forced: 1,000,000 particles on WebGPU hold 60 fps",
    query: "tier=1&count=1000000",
    count: 1_000_000,
    forced: 1,
  },
  {
    title:
      "REQ-TIER-01 REQ-PERF-06 no tier forced: the probe's tier holds its frame rate",
    query: "",
    count: null,
    forced: null,
  },
] as const;

for (const { title, query, count, forced } of CASES) {
  test(title, async ({ page, browser, browserName }, testInfo) => {
    const { errors, warnings } = watchErrors(page);

    await page.goto(`/engine?bare=1${query === "" ? "" : `&${query}`}`);
    const view = page.locator(VIEW);
    await expect(view).toHaveAttribute("data-ready", "true", {
      timeout: 90_000,
    });
    expect(await view.getAttribute("data-error")).toBe("");
    await expect(view).toHaveAttribute("data-status", "running");
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);

    const tier = Number(await view.getAttribute("data-tier"));
    const reason = await view.getAttribute("data-tier-reason");
    if (tier !== 1 && tier !== 2) {
      throw new Error(`No field to measure on tier ${tier} (${reason})`);
    }
    // A forced tier 1 that fell back inside the renderer would otherwise be
    // measured as tier 2 and pass under a tier 1 title.
    if (forced !== null) {
      expect({ tier, reason }).toEqual({ tier: forced, reason: "forced" });
    }

    // The cursor force stays on through the measurement: the pointer ends
    // over the field and rests there.
    const host = view.locator('[data-part="host"]');
    const box = await host.boundingBox();
    if (box === null) throw new Error("The engine host has no box");
    expect(box.width).toBe(1280);
    expect(box.height).toBe(800);
    for (const [x, y] of [
      [0.3, 0.4],
      [0.7, 0.6],
      [0.62, 0.5],
    ] as const) {
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y, {
        steps: 12,
      });
    }

    const summary = await measureFrames(page, VIEW);
    const surface = await readSurface(page, CANVAS);
    await page.locator(CANVAS).screenshot({
      path: testInfo.outputPath("field.png"),
    });

    // The count is the one asked for: the engine publishes no count of its
    // own, so a tier's default is read from the engine's config.
    const particles =
      count ?? (tier === 1 ? PARTICLES.tier1 : PARTICLES.tier2Desktop);
    const line =
      `frame-rate tier ${tier} ${surface.backend} particles ${particles} ` +
      `frames ${summary.frames} median ${summary.medianMs.toFixed(2)} ms ` +
      `p95 ${summary.p95Ms.toFixed(2)} ms reason ${reason} ` +
      `browser ${browserName} ${browser.version()}`;
    const evidence =
      `frame-rate evidence: engine ${summary.engineFps.toFixed(2)} fps, page ` +
      `${summary.pageFps.toFixed(2)} fps over ${summary.readouts} frameRate ` +
      `events; canvas ${surface.width} x ${surface.height}; gpu ${surface.gpu}; ` +
      `warm-up ${WARM_UP_MS} ms, window ${WINDOW_MS} ms; ` +
      `${warnings.length} console warnings`;
    console.log(line);
    console.log(evidence);
    for (const warning of new Set(warnings)) console.log(`warning: ${warning}`);
    testInfo.annotations.push(
      { type: "frame-rate", description: line },
      { type: "frame-rate evidence", description: evidence },
    );

    expect(errors, "no page or console errors").toEqual([]);
    await expect(view).toHaveAttribute("data-status", "running");
    expect(surface.backend).toBe(tier === 1 ? "webgpu" : "webgl2");
    expect(surface.isSoftware, `a real GPU, not ${surface.gpu}`).toBe(false);
    expect(summary.readouts).toBeGreaterThan(5);
    expect(
      Math.abs(summary.engineFps - summary.pageFps) / summary.pageFps,
      "the engine's frame rate matches the page's own count",
    ).toBeLessThanOrEqual(FPS_TOLERANCE);
    expect(summary.medianMs).toBeLessThanOrEqual(PASS_MEDIAN_MS[tier]);
  });
}
