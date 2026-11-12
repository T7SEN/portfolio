import { expect, test, type Page, type Response } from "@playwright/test";

import { findDeferredLibraries } from "../../scripts/budget-lib.mjs";
import { headlines } from "../../src/content/hero";
import { PARTICLES } from "../../src/engine/config";
import {
  FPS_TOLERANCE,
  PASS_MEDIAN_MS,
  WARM_UP_MS,
  WINDOW_MS,
  measureFrames,
  readSurface,
  watchErrors,
} from "../gpu/frame-times";
import { afterTwoFrames, frameRateEvents } from "../support/tiers";

// The home page of the production build, headed, on this machine's GPU: the
// order the field arrives in, the headline swap and the frame rate.

const FIELD = '[data-testid="engine-field"]';
const CANVAS = `${FIELD} [data-part="host"] > canvas`;
const STILL = `${FIELD} img[data-part="still"]`;

interface FieldSample {
  at: number;
  ready: string | null;
  tier: string | null;
  opacity: string;
  hasCanvas: boolean;
  headline: string | null;
  headlineTop: number | null;
  subLineTop: number | null;
}

interface FieldLog {
  samples: FieldSample[];
  /** Every change of the h1's text, with the tier on the wrapper then. */
  swaps: { at: number; text: string | null; tier: string | null }[];
  /** Layout shifts without recent input, as Chrome reports them. */
  shifts: { at: number; value: number }[];
}

/**
 * Records, from before any page script runs, what the field's wrapper and
 * the hero headline look like on every frame until the field has faded in.
 */
async function recordField(page: Page): Promise<void> {
  await page.addInitScript((selector) => {
    const log: FieldLog = { samples: [], swaps: [], shifts: [] };
    Object.defineProperty(window, "fieldLog", { value: log });
    const FADE_MS = 1_500;
    let readyAt: number | null = null;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) {
          log.shifts.push({ at: shift.startTime, value: shift.value });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    const sample = (now: number) => {
      const wrapper = document.querySelector<HTMLElement>(selector);
      const h1 = document.getElementById("hero-headline");
      if (wrapper !== null) {
        const ready = wrapper.dataset.ready ?? null;
        const subLine = h1?.parentElement?.nextElementSibling ?? null;
        log.samples.push({
          at: now,
          ready,
          tier: wrapper.dataset.tier ?? null,
          opacity: getComputedStyle(wrapper).opacity,
          hasCanvas:
            wrapper.querySelector('[data-part="host"] > canvas') !== null,
          headline: h1?.textContent ?? null,
          headlineTop: h1?.getBoundingClientRect().top ?? null,
          subLineTop: subLine?.getBoundingClientRect().top ?? null,
        });
        if (ready === "true" && readyAt === null) readyAt = now;
      }
      if (readyAt === null || now - readyAt < FADE_MS) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);

    document.addEventListener("DOMContentLoaded", () => {
      const h1 = document.getElementById("hero-headline");
      if (h1 === null) return;
      new MutationObserver(() => {
        log.swaps.push({
          at: performance.now(),
          text: h1.textContent,
          tier:
            document.querySelector<HTMLElement>(selector)?.dataset.tier ?? null,
        });
      }).observe(h1, { childList: true, characterData: true, subtree: true });
    });
  }, FIELD);
}

function readFieldLog(page: Page): Promise<FieldLog> {
  return page.evaluate(
    () => (window as unknown as { fieldLog: FieldLog }).fieldLog,
  );
}

function collectScripts(page: Page): Response[] {
  const scripts: Response[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith(".js"))
      scripts.push(response);
  });
  return scripts;
}

/** The URLs of the script responses that hold three.js. */
async function threeScripts(scripts: Response[]): Promise<string[]> {
  const urls: string[] = [];
  for (const response of scripts) {
    const source = await response.text();
    if (findDeferredLibraries(source).includes("three.js")) {
      urls.push(response.url());
    }
  }
  return urls;
}

const FIELD_CASES = [
  {
    title:
      "REQ-PERF-07 REQ-CNT-10 REQ-PERF-03 REQ-PERF-06 home at 1280 x 800: the field comes after the content and holds its frame rate",
    viewport: { width: 1280, height: 800 },
    hideWebGpu: false,
  },
  {
    title:
      "REQ-PERF-07 REQ-CNT-10 REQ-PERF-03 REQ-PERF-06 home at 1920 x 1080: the field comes after the content and holds its frame rate",
    viewport: { width: 1920, height: 1080 },
    hideWebGpu: false,
  },
  {
    title:
      "REQ-TIER-01 REQ-ENG-06 REQ-TIER-05 home at 1280 x 800 without WebGPU: tier 2 comes after the content and holds its frame rate",
    viewport: { width: 1280, height: 800 },
    hideWebGpu: true,
  },
] as const;

for (const { title, viewport, hideWebGpu } of FIELD_CASES) {
  test(title, async ({ page, browser, browserName }, testInfo) => {
    await page.setViewportSize(viewport);
    const { errors, warnings } = watchErrors(page);
    const scripts = collectScripts(page);
    await recordField(page);
    if (hideWebGpu) {
      await page.addInitScript(() => {
        Reflect.deleteProperty(Navigator.prototype, "gpu");
      });
    }

    await page.goto("/");
    const field = page.locator(FIELD);
    await expect(field).toHaveAttribute("data-ready", "true", {
      timeout: 90_000,
    });
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);

    const tier = Number(await field.getAttribute("data-tier"));
    const reason = await field.getAttribute("data-tier-reason");
    if (tier !== 1 && tier !== 2) {
      throw new Error(`No field to measure on tier ${tier} (${reason})`);
    }
    // The title names the tier, so the tier is asserted: a probe that found
    // this PC slow would otherwise pass as tier 2 under a tier 1 title.
    expect({ tier, reason }).toEqual(
      hideWebGpu
        ? { tier: 2, reason: "no-webgpu" }
        : { tier: 1, reason: "probe-pass" },
    );

    const summary = await measureFrames(page, FIELD);
    const surface = await readSurface(page, CANVAS);
    await expect(field).toHaveCSS("opacity", "1");
    await page.screenshot({ path: testInfo.outputPath("home.png") });

    const log = await readFieldLog(page);
    const timing = await page.evaluate(() => ({
      firstContentfulPaint:
        performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
        null,
      resources: performance
        .getEntriesByType("resource")
        .map((entry) => ({ url: entry.name, startTime: entry.startTime })),
    }));
    const threeUrls = await threeScripts(scripts);
    const threeStarts = timing.resources
      .filter((resource) => threeUrls.includes(resource.url))
      .map((resource) => resource.startTime);
    const firstThreeRequest = Math.min(...threeStarts);

    const size = `${viewport.width}x${viewport.height}`;
    const particles = tier === 1 ? PARTICLES.tier1 : PARTICLES.tier2Desktop;
    const line =
      `frame-rate tier ${tier} ${surface.backend} particles ${particles} ` +
      `frames ${summary.frames} median ${summary.medianMs.toFixed(2)} ms ` +
      `p95 ${summary.p95Ms.toFixed(2)} ms reason ${reason} ` +
      `browser ${browserName} ${browser.version()} page / viewport ${size}`;

    const readyIndex = log.samples.findIndex(
      (sample) => sample.ready === "true",
    );
    const swapIndex = log.samples.findIndex(
      (sample) => sample.headline === headlines.gpu,
    );
    const beforeSwap = log.samples[swapIndex - 1];
    const atSwap = log.samples[swapIndex];
    const last = log.samples.at(-1);
    const shiftTotal = log.shifts.reduce((sum, shift) => sum + shift.value, 0);
    const order =
      `home-field ${size}: first contentful paint ` +
      `${timing.firstContentfulPaint?.toFixed(0)} ms, three.js first requested ` +
      `${firstThreeRequest.toFixed(0)} ms (${threeUrls.length} chunks), headline ` +
      `swap ${log.swaps[0]?.at.toFixed(0)} ms on tier ${log.swaps[0]?.tier}, ` +
      `ready ${log.samples[readyIndex]?.at.toFixed(0)} ms, ` +
      `${readyIndex} frames sampled before ready all at opacity 0: ` +
      `${log.samples.slice(0, readyIndex).every((sample) => sample.opacity === "0")}, ` +
      `layout shift total ${shiftTotal.toFixed(4)}`;
    const evidence =
      `frame-rate evidence ${size}: engine ${summary.engineFps.toFixed(2)} fps, ` +
      `page ${summary.pageFps.toFixed(2)} fps over ${summary.readouts} frameRate ` +
      `events; canvas ${surface.width} x ${surface.height}; gpu ${surface.gpu}; ` +
      `warm-up ${WARM_UP_MS} ms, window ${WINDOW_MS} ms; ` +
      `${warnings.length} console warnings`;
    console.log(line);
    console.log(evidence);
    console.log(order);
    for (const warning of new Set(warnings)) console.log(`warning: ${warning}`);
    testInfo.annotations.push(
      { type: "frame-rate", description: line },
      { type: "frame-rate evidence", description: evidence },
      { type: "home-field", description: order },
    );

    expect(errors, "no page or console errors").toEqual([]);

    // REQ-PERF-07: the wrapper is transparent on every frame before ready,
    // while the canvas already exists, and three.js is asked for only after
    // the content has painted.
    expect(readyIndex).toBeGreaterThan(0);
    const unseen = log.samples.slice(0, readyIndex);
    expect(unseen.filter((sample) => sample.opacity !== "0")).toEqual([]);
    expect(unseen.some((sample) => sample.hasCanvas)).toBe(true);
    expect(timing.firstContentfulPaint).not.toBeNull();
    expect(threeUrls.length).toBeGreaterThan(0);
    expect(threeStarts.length).toBe(threeUrls.length);
    expect(firstThreeRequest).toBeGreaterThan(timing.firstContentfulPaint ?? 0);

    // REQ-CNT-10: the tiers 1 and 2 line shows only once the engine has
    // reported tier 1 or 2 and its field has drawn. REQ-PERF-03: the swap
    // moves nothing.
    expect(log.samples[0]?.headline).toBe(headlines.still);
    expect(log.swaps).toHaveLength(1);
    expect(log.swaps[0]?.text).toBe(headlines.gpu);
    expect(log.swaps[0]?.tier).toBe(String(tier));
    expect(
      log.samples.filter(
        (sample) =>
          sample.headline === headlines.gpu &&
          (sample.tier !== String(tier) || sample.ready !== "true"),
      ),
    ).toEqual([]);
    expect(swapIndex).toBeGreaterThan(0);
    expect(beforeSwap?.headline).toBe(headlines.still);
    expect(atSwap?.headlineTop).toBe(beforeSwap?.headlineTop);
    expect(atSwap?.subLineTop).toBe(beforeSwap?.subLineTop);
    expect(last?.headlineTop).toBe(beforeSwap?.headlineTop);
    expect(last?.subLineTop).toBe(beforeSwap?.subLineTop);
    expect(
      log.shifts.filter((shift) => shift.at >= (log.swaps[0]?.at ?? 0)),
    ).toEqual([]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      headlines.gpu,
    );

    // REQ-PERF-06, REQ-ENG-06: the frame rate, checked against the engine's.
    expect(surface.backend).toBe(tier === 1 ? "webgpu" : "webgl2");
    expect(surface.isSoftware, `a real GPU, not ${surface.gpu}`).toBe(false);
    expect(summary.readouts).toBeGreaterThan(5);
    expect(
      Math.abs(summary.engineFps - summary.pageFps) / summary.pageFps,
      "the engine's frame rate matches the page's own count",
    ).toBeLessThanOrEqual(FPS_TOLERANCE);
    expect(summary.medianMs).toBeLessThanOrEqual(PASS_MEDIAN_MS[tier]);
    // The median ignores gaps, so the frame count is held to it: a window
    // that stalled for more than a twentieth of its length fails here.
    expect(
      summary.frames,
      "the window holds the frames its own median promises",
    ).toBeGreaterThanOrEqual((0.95 * WINDOW_MS) / summary.medianMs);
  });
}

const STILL_CASES = [
  { viewport: { width: 1280, height: 800 }, file: "/still/field-wide.webp" },
  { viewport: { width: 375, height: 812 }, file: "/still/field-tall.webp" },
] as const;

for (const { viewport, file } of STILL_CASES) {
  test(`REQ-TIER-03 REQ-CNT-10 REQ-PERF-05 home at ${viewport.width} x ${viewport.height} with Save-Data: the still covers the screen and no three.js loads`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const { errors } = watchErrors(page);
    const scripts = collectScripts(page);
    await recordField(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", {
        value: { saveData: true },
        configurable: true,
      });
    });

    await page.goto("/");
    const field = page.locator(FIELD);
    await expect(field).toHaveAttribute("data-ready", "true", {
      timeout: 90_000,
    });
    await expect(field).toHaveAttribute("data-tier", "3");
    await expect(field).toHaveAttribute("data-tier-reason", "save-data");
    await expect(page.locator(CANVAS)).toHaveCount(0);

    const still = page.locator(STILL);
    await expect(still).toHaveCSS("opacity", "1");
    await expect(field).toHaveCSS("opacity", "1");
    const picture = await still.evaluate((image) => {
      if (!(image instanceof HTMLImageElement)) return null;
      const box = image.getBoundingClientRect();
      return {
        source: new URL(image.currentSrc).pathname,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        fit: getComputedStyle(image).objectFit,
        covers:
          box.left <= 0 &&
          box.top <= 0 &&
          box.right >= document.documentElement.clientWidth &&
          box.bottom >= window.innerHeight,
      };
    });
    // Late requests would land in this time.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: testInfo.outputPath("home-still.png") });

    const log = await readFieldLog(page);
    const threeUrls = await threeScripts(scripts);
    console.log(
      `home-still ${viewport.width}x${viewport.height}: ${JSON.stringify(picture)}, ` +
        `${scripts.length} scripts requested, ${threeUrls.length} with three.js, ` +
        `headline changes ${log.swaps.length}`,
    );

    expect(picture).toEqual({
      source: file,
      naturalWidth: file.includes("wide") ? 1920 : 1080,
      naturalHeight: file.includes("wide") ? 1080 : 1920,
      fit: "cover",
      covers: true,
    });
    expect(threeUrls).toEqual([]);
    expect(log.swaps).toEqual([]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      headlines.still,
    );
    expect(errors).toEqual([]);
  });
}

test("REQ-ENG-01 REQ-ENG-07 leaving home pauses the field and coming back shows the same canvas", async ({
  page,
}) => {
  const { errors } = watchErrors(page);
  await page.goto("/");
  const field = page.locator(FIELD);
  await expect(field).toHaveAttribute("data-ready", "true", {
    timeout: 90_000,
  });
  const canvas = await page.locator(CANVAS).elementHandle();

  const rateEvents = (waitMs: number) => frameRateEvents(page, waitMs);
  const running = await rateEvents(2_500);
  expect(running).toBeGreaterThan(0);

  await page
    .getByRole("navigation", { name: "Site controls" })
    .getByRole("link", { name: "Work" })
    .click();
  await page.waitForURL("**/work");
  await expect(field).toBeHidden();
  // The engine hears of the hidden host one frame late.
  await afterTwoFrames(page);
  const away = await rateEvents(2_500);
  expect(
    await page
      .locator(CANVAS)
      .evaluate((element, old) => element === old, canvas),
    "the canvas is kept while another route shows",
  ).toBe(true);

  await page.getByRole("link", { name: "T7SEN, home" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(field).toBeVisible();
  const back = await rateEvents(2_500);
  expect(
    await page
      .locator(CANVAS)
      .evaluate((element, old) => element === old, canvas),
    "the same canvas shows again on home",
  ).toBe(true);

  console.log(
    `home-field routes: frameRate events in 2,500 ms on home ${running}, on /work ${away}, back on home ${back}`,
  );
  expect(away).toBe(0);
  expect(back).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
