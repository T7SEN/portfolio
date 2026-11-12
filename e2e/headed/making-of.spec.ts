import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { PARTICLES } from "../../src/engine/config";
import { calmProgress } from "../../src/engine/runtime/story";
import { LIVE_PASSES } from "../../src/engine/story";
import {
  PASS_MEDIAN_MS,
  WINDOW_MS,
  measureFrames,
  watchErrors,
  type FrameSummary,
} from "../gpu/frame-times";
import { scrollToPlace, waitForStory } from "../support/story";
import { FIELD } from "../support/tiers";

// The making-of study's frame times (REQ-PERF-06, REQ-TIER-05, REQ-ENG-09):
// the production home page, headed, on this machine's GPU, with the pass
// viewer in the middle of the window and its live cards drawing. The lines
// it prints are the raw record behind the study's figures. Frame times are
// read from requestAnimationFrame, which never runs faster than the display,
// so a median on the display's refresh interval is that interval, not the
// GPU's cost.
//
// With CAPTURE_STUDY_SHOT set to a folder, one more test saves the field
// chapter with the T7SEN wordmark formed, on tier 1 at twice the pixel
// density, for the study's screenshot.

const TIERS = [
  {
    tier: 1,
    hideWebGpu: false,
    reason: "probe-pass",
    backend: "WebGPU",
    particles: PARTICLES.tier1,
  },
  {
    tier: 2,
    hideWebGpu: true,
    reason: "no-webgpu",
    backend: "WebGL2",
    particles: PARTICLES.tier2Desktop,
  },
] as const;
type TierSetup = (typeof TIERS)[number];

const VIEWER = "[data-pass-viewer]";
const LIVE_FACE = "[data-pass-face][data-live]";
// The field needs about a second and a half to gather after a jump.
const SETTLE_MS = 3_000;
// As the headed story spec holds each chapter: at least this share of the
// frames the tier's pass line promises in the window.
const PASS_LINE_SHARE = 0.95;
const CAPTURE_DIR = process.env.CAPTURE_STUDY_SHOT;

async function openHome(page: Page, setup: TierSetup) {
  if (setup.hideWebGpu) {
    await page.addInitScript(() => {
      Reflect.deleteProperty(Navigator.prototype, "gpu");
    });
  }
  await page.goto("/");
  const field = page.locator(FIELD);
  await expect(field).toHaveAttribute("data-ready", "true", {
    timeout: 90_000,
  });
  expect({
    tier: Number(await field.getAttribute("data-tier")),
    reason: await field.getAttribute("data-tier-reason"),
  }).toEqual({ tier: setup.tier, reason: setup.reason });
  await waitForStory(page);
}

/** Puts the pass viewer in the middle of the window and lets the field settle. */
async function viewPasses(page: Page) {
  await page.locator(VIEWER).evaluate((viewer) => {
    const box = viewer.getBoundingClientRect();
    const top = window.scrollY + box.top + box.height / 2 - innerHeight / 2;
    window.scrollTo({ top: Math.round(top), behavior: "instant" });
  });
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.locator(FIELD)).toHaveAttribute(
    "data-chapter",
    "making-of",
  );
  const viewer = await page.locator(VIEWER).boundingBox();
  expect(viewer, "the pass viewer has a box").not.toBeNull();
  const size = page.viewportSize();
  expect(size).not.toBeNull();
  if (viewer === null || size === null) return;
  expect(viewer.y, "the viewer's top is in the window").toBeGreaterThanOrEqual(
    0,
  );
  expect(
    viewer.y + viewer.height,
    "the viewer's foot is in the window",
  ).toBeLessThanOrEqual(size.height);
}

function framesText(summary: FrameSummary) {
  return (
    `frames ${summary.frames} median ${summary.medianMs.toFixed(2)} ms ` +
    `p95 ${summary.p95Ms.toFixed(2)} ms longest ${summary.longestMs.toFixed(1)} ms ` +
    `engine ${summary.engineFps.toFixed(2)} fps page ${summary.pageFps.toFixed(2)} fps ` +
    `display interval about ${(1000 / summary.pageFps).toFixed(2)} ms`
  );
}

for (const setup of TIERS) {
  test(`REQ-PERF-06 REQ-TIER-05 REQ-ENG-09 tier ${setup.tier} (${setup.backend}, ${setup.reason}) holds its frame rate at 1280 x 800 with the pass viewer in view and its live cards drawing`, async ({
    page,
    browserName,
    browser,
  }) => {
    const { errors } = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHome(page, setup);
    await viewPasses(page);

    const live = await page.locator(LIVE_FACE).count();
    expect(live, "every pass the tier draws live has a live card").toBe(
      LIVE_PASSES[setup.tier].length,
    );

    const summary = await measureFrames(page, FIELD);
    console.log(
      `making-of tier ${setup.tier} ${setup.backend} reason ${setup.reason} ` +
        `particles ${setup.particles} live cards ${live} at 1280 x 800: ` +
        `${framesText(summary)} ` +
        `browser ${browserName} ${browser.version()} on ${new Date().toISOString()}`,
    );

    expect(summary.medianMs).toBeLessThanOrEqual(PASS_MEDIAN_MS[setup.tier]);
    expect(summary.frames).toBeGreaterThanOrEqual(
      Math.floor((PASS_LINE_SHARE * WINDOW_MS) / PASS_MEDIAN_MS[setup.tier]),
    );
    expect(errors).toEqual([]);
  });
}

test.describe("study screenshot", () => {
  test.use({ deviceScaleFactor: 2 });

  test("REQ-CNT-03 captures the field chapter's wordmark on tier 1 for the study's screenshot", async ({
    page,
  }) => {
    test.skip(
      CAPTURE_DIR === undefined,
      "Set CAPTURE_STUDY_SHOT to a folder to capture",
    );
    if (CAPTURE_DIR === undefined) return;
    await page.setViewportSize({ width: 1280, height: 800 });
    const [tier1] = TIERS;
    await openHome(page, tier1);
    await scrollToPlace(page, {
      chapter: "bloom",
      progress: calmProgress("bloom", 0),
    });
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.locator(FIELD)).toHaveAttribute("data-chapter", "bloom");
    mkdirSync(CAPTURE_DIR, { recursive: true });
    const path = join(CAPTURE_DIR, "field-1280.png");
    await page.screenshot({ path });
    console.log(`making-of shot saved: ${path}`);
  });
});
