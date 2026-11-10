import { writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { ENGINE_ENTRY } from "../scripts/budget-lib.mjs";
import { studies } from "../src/content";
import { about } from "../src/content/about";
import { headlines, heroCopy, STATIC_TIER } from "../src/content/hero";
import { pages } from "../src/content/pages";
import { services } from "../src/content/services";
import { pixelStats } from "./gpu/pixels";
import { expectNoAxeViolations } from "./support/axe";
import {
  afterTwoFrames,
  asTier2,
  asTier3,
  CANVAS,
  collectScripts,
  FIELD,
  frameRateEvents,
  HOST,
  nextFrameRateEvent,
  scriptsHolding,
  STILL,
  waitForField,
  withoutAnyGpu,
} from "./support/tiers";

// The engine behind the home page of the production build, headless. Many
// workers share one GPU here, so nothing in this file asserts a frame rate;
// those are measured headed, alone (e2e/headed).
test.describe.configure({ timeout: 120_000 });

const HERO = heroCopy(STATIC_TIER);

// Longer than two frameRate intervals, so a running field always reports
// inside it.
const QUIET_MS = 2_500;

type Rect = { x: number; y: number; width: number; height: number };

interface FieldSample {
  at: number;
  ready: string | null;
  tier: string | null;
  opacity: string;
  hasCanvas: boolean;
  headline: string | null;
  h1: Rect | null;
  subLine: Rect | null;
}

interface FieldLog {
  samples: FieldSample[];
  /** Every change of the h1's text, with the tier on the wrapper then. */
  swaps: { at: number; text: string | null; tier: string | null }[];
}

/**
 * Records, from before any page script runs, the wrapper and the hero
 * headline on every frame until the field has reported ready.
 */
async function recordField(page: Page): Promise<void> {
  await page.addInitScript((selector) => {
    const log: FieldLog = { samples: [], swaps: [] };
    Object.defineProperty(window, "fieldLog", { value: log });
    // Frames kept after ready, so the fade and the frame after a swap are in.
    const AFTER_READY_MS = 1_500;
    let readyAt: number | null = null;

    const rect = (element: Element | null | undefined): Rect | null => {
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };

    const sample = (now: number) => {
      const wrapper = document.querySelector<HTMLElement>(selector);
      const h1 = document.getElementById("hero-headline");
      if (wrapper !== null) {
        const ready = wrapper.dataset.ready ?? null;
        log.samples.push({
          at: now,
          ready,
          tier: wrapper.dataset.tier ?? null,
          opacity: getComputedStyle(wrapper).opacity,
          hasCanvas:
            wrapper.querySelector('[data-part="host"] > canvas') !== null,
          headline: h1?.textContent ?? null,
          h1: rect(h1),
          subLine: rect(h1?.parentElement?.nextElementSibling),
        });
        if (ready === "true" && readyAt === null) readyAt = now;
      }
      if (readyAt === null || now - readyAt < AFTER_READY_MS) {
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

/** The h1 and the sub-line once fonts and the field have settled. */
async function settledHero(page: Page) {
  await waitForField(page);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const rect = (element: Element | null | undefined) => {
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const h1 = document.getElementById("hero-headline");
    return {
      headline: h1?.textContent ?? null,
      h1: rect(h1),
      subLine: rect(h1?.parentElement?.nextElementSibling),
    };
  });
}

/** The still picture as the page shows it. */
function readStill(page: Page) {
  return page.locator(STILL).evaluate((image) => {
    if (!(image instanceof HTMLImageElement)) return null;
    const box = image.getBoundingClientRect();
    return {
      source: new URL(image.currentSrc).pathname,
      loaded: image.complete && image.naturalWidth > 0,
      fit: getComputedStyle(image).objectFit,
      covers:
        box.left <= 0 &&
        box.top <= 0 &&
        box.right >= document.documentElement.clientWidth &&
        box.bottom >= window.innerHeight,
    };
  });
}

/** Every home section's heading and text, whatever the field is doing. */
async function expectHomeContent(page: Page) {
  const section = (name: string) =>
    page.getByRole("region", { name, exact: true });
  const heading = (name: string) =>
    section(name).getByRole("heading", { level: 2, name, exact: true });

  await expect(page.getByText(HERO.eyebrow, { exact: true })).toBeVisible();
  await expect(
    page.getByText(HERO.subLine, { exact: true }).first(),
  ).toBeVisible();
  for (const name of [HERO.primaryAction, HERO.cornerControl]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }

  await expect(heading("Services")).toBeVisible();
  for (const text of [...services.offers, services.also]) {
    await expect(
      section("Services").getByText(text, { exact: true }),
    ).toBeVisible();
  }

  await expect(heading(pages.work.title)).toBeVisible();
  await expect(
    section(pages.work.title).getByText(pages.work.intro, { exact: true }),
  ).toBeVisible();
  for (const study of studies) {
    await expect(
      section(pages.work.title)
        .getByRole("heading", { level: 3 })
        .filter({ hasText: study.title }),
    ).toBeVisible();
  }

  await expect(heading(pages.about.title)).toBeVisible();
  for (const text of [pages.about.intro, ...about.thread]) {
    await expect(
      section(pages.about.title).getByText(text, { exact: true }),
    ).toBeVisible();
  }

  await expect(heading("Contact")).toBeVisible();
  await expect(
    section("Contact").getByText(pages.contact.intro, { exact: true }),
  ).toBeVisible();
  await expect(
    section("Contact").getByRole("link", {
      name: HERO.secondaryAction,
      exact: true,
    }),
  ).toBeVisible();
}

async function setDocumentHidden(page: Page, hidden: boolean) {
  await page.evaluate((hide) => {
    if (hide) {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
    } else {
      // The own properties go, and the real ones on Document.prototype show
      // again.
      Reflect.deleteProperty(document, "hidden");
      Reflect.deleteProperty(document, "visibilityState");
    }
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("REQ-ENG-01 the host and the canvas survive client navigation, and the field runs after it", async ({
  page,
}) => {
  await asTier2(page);
  await page.goto("/");
  await waitForField(page);

  // A property on the node itself: a new element would not carry it, and a
  // full page load would lose the one on window.
  await page.evaluate(
    ({ host, canvas }) => {
      for (const target of [
        window,
        document.querySelector(host),
        document.querySelector(canvas),
      ]) {
        if (target === null) throw new Error("No host or canvas to mark");
        Object.assign(target, { visitMark: "kept" });
      }
    },
    { host: HOST, canvas: CANVAS },
  );
  const marks = () =>
    page.evaluate(
      ({ host, canvas }) => {
        const read = (target: unknown) =>
          (target as { visitMark?: string } | null)?.visitMark ?? null;
        return {
          page: read(window),
          host: read(document.querySelector(host)),
          canvas: read(document.querySelector(canvas)),
          canvases: document.querySelectorAll("canvas").length,
        };
      },
      { host: HOST, canvas: CANVAS },
    );
  const kept = { page: "kept", host: "kept", canvas: "kept", canvases: 1 };
  const primary = page.getByRole("navigation", { name: "Primary" });
  const field = page.locator(FIELD);

  await primary.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    pages.about.title,
  );
  await expect(field).toBeHidden();
  expect(await marks()).toEqual(kept);

  await primary.getByRole("link", { name: "Work", exact: true }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    pages.work.title,
  );
  await expect(field).toBeHidden();
  expect(await marks()).toEqual(kept);

  await page.getByRole("link", { name: "T7SEN, home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    headlines.gpu,
  );
  await expect(field).toBeVisible();
  expect(await marks()).toEqual(kept);

  await nextFrameRateEvent(page);
  await expect(field).toHaveAttribute("data-ready", "true");
  await expect(field).toHaveAttribute("data-tier", "2");
});

test("REQ-CNT-02 /work loaded directly starts no engine and requests no three.js", async ({
  page,
}) => {
  const scripts = collectScripts(page);
  // Idle, so chunks loaded after first content are caught too.
  await page.goto("/work", { waitUntil: "networkidle" });
  // The engine would load after the page is idle, and its chunks after that.
  await page.waitForTimeout(QUIET_MS);

  expect(scripts.length).toBeGreaterThan(0);
  expect(await scriptsHolding(scripts, "three.js")).toEqual([]);
  expect(await scriptsHolding(scripts, ENGINE_ENTRY)).toEqual([]);

  const field = page.locator(FIELD);
  await expect(field).toBeHidden();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await field.getAttribute("data-tier")).toBeNull();
  expect(await field.getAttribute("data-ready")).toBeNull();
});

test("REQ-CNT-02 REQ-ENG-07 coming from the home page, the field is hidden on /work, reports no frames and keeps its drawing buffer", async ({
  page,
}) => {
  await asTier2(page);
  await page.goto("/");
  await waitForField(page);
  await nextFrameRateEvent(page);
  const bufferSize = () =>
    page
      .locator(CANVAS)
      .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]);
  const shown = await bufferSize();

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Work", exact: true })
    .click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    pages.work.title,
  );

  await expect(page.locator(FIELD)).toBeHidden();
  await afterTwoFrames(page);
  expect(await frameRateEvents(page, QUIET_MS)).toBe(0);
  // A hidden canvas is not a small one: it must not be sized down to nothing.
  expect(await bufferSize()).toEqual(shown);
});

test("REQ-TIER-02 a phone settles on tier 2 with reason phone", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "Only the phone project has a coarse pointer",
  );

  await page.goto("/");
  expect(await waitForField(page)).toEqual({ tier: 2, reason: "phone" });
  await expect(page.locator(CANVAS)).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    headlines.gpu,
  );
});

test("REQ-TIER-01 a desktop without navigator.gpu settles on tier 2 with reason no-webgpu", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Phones get tier 2 before WebGPU is looked at (REQ-TIER-02)",
  );

  await asTier2(page);
  await page.goto("/");
  expect(await waitForField(page)).toEqual({ tier: 2, reason: "no-webgpu" });
  await expect(page.locator(CANVAS)).toHaveCount(1);
});

test("REQ-TIER-01 a desktop with WebGPU settles on tier 1 through the probe, or on tier 2 with the reason why not", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Phones get tier 2 before WebGPU is looked at (REQ-TIER-02)",
  );

  await page.goto("/");
  const { tier, reason } = await waitForField(page);
  const line = `tier-choice desktop: tier ${tier}, reason ${reason}`;
  console.log(line);
  testInfo.annotations.push({ type: "tier-choice", description: line });

  // Other browsers share the GPU during the gate, so the probe may honestly
  // find the field slow. Tier 1 itself is asserted headed, alone.
  const allowed: Record<number, readonly string[]> = {
    1: ["probe-pass"],
    2: ["probe-slow", "probe-failed", "webgpu-init-fallback"],
  };
  expect([1, 2]).toContain(tier);
  expect(allowed[tier]).toContain(reason);
  await expect(page.locator(CANVAS)).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    headlines.gpu,
  );
});

test("REQ-TIER-03 REQ-CNT-10 with Save-Data the page is tier 3: the still, no three.js, the built-for line and every section", async ({
  page,
}) => {
  const scripts = collectScripts(page);
  await recordField(page);
  await asTier3(page);
  await page.goto("/");

  expect(await waitForField(page)).toEqual({ tier: 3, reason: "save-data" });
  await expect(page.locator("canvas")).toHaveCount(0);

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("the project sets no viewport");
  await expect(page.locator(STILL)).toHaveCSS("opacity", "1");
  await expect(page.locator(FIELD)).toHaveCSS("opacity", "1");
  expect(await readStill(page)).toEqual({
    source:
      viewport.height > viewport.width
        ? "/still/field-tall.jpg"
        : "/still/field-wide.jpg",
    loaded: true,
    fit: "cover",
    covers: true,
  });

  // Late requests would land in this time.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(QUIET_MS);
  expect(scripts.length).toBeGreaterThan(0);
  expect(await scriptsHolding(scripts, "three.js")).toEqual([]);

  expect((await readFieldLog(page)).swaps).toEqual([]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Real-time worlds, built for your GPU.",
  );
  await expectHomeContent(page);
});

test("REQ-ENG-08 with no usable GPU the page falls to tier 3 and the hero is never empty", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await recordField(page);
  await withoutAnyGpu(page);
  await page.goto("/");

  expect(await waitForField(page)).toEqual({ tier: 3, reason: "no-backend" });
  await expect(page.locator("canvas")).toHaveCount(0);

  await expect(page.locator(STILL)).toHaveCSS("opacity", "1");
  await expect(page.locator(FIELD)).toHaveCSS("opacity", "1");
  const still = await readStill(page);
  expect(still?.loaded).toBe(true);
  expect(still?.covers).toBe(true);

  // Every frame while the renderer was failing, not only the settled page.
  const log = await readFieldLog(page);
  expect(log.samples.length).toBeGreaterThan(0);
  expect(
    log.samples.filter((sample) => sample.headline !== headlines.still),
  ).toEqual([]);
  expect(log.swaps).toEqual([]);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    headlines.still,
  );
  await expectHomeContent(page);

  testInfo.annotations.push({
    type: "console errors",
    description: consoleErrors.join(" | ") || "none",
  });
  expect(pageErrors).toEqual([]);
});

test("REQ-CNT-10 REQ-PERF-03 on tier 2 the headline changes once the field has drawn and nothing moves", async ({
  page,
  context,
}) => {
  await recordField(page);
  await asTier2(page);
  await page.goto("/");
  const after = await settledHero(page);
  expect(after.headline).toBe("Real-time worlds, rendered by your GPU.");

  const log = await readFieldLog(page);
  expect(log.samples[0]?.headline).toBe(headlines.still);
  expect(log.swaps).toHaveLength(1);
  expect(log.swaps[0]?.text).toBe(headlines.gpu);
  expect(log.swaps[0]?.tier).toBe("2");
  // The tier 1 and 2 line never shows before the tier is chosen and its
  // field has drawn (rule A14).
  expect(
    log.samples.filter(
      (sample) =>
        sample.headline === headlines.gpu &&
        (sample.tier !== "2" || sample.ready !== "true"),
    ),
  ).toEqual([]);

  // The frame before the swap against the frame that shows it.
  const swapIndex = log.samples.findIndex(
    (sample) => sample.headline === headlines.gpu,
  );
  expect(swapIndex).toBeGreaterThan(0);
  const beforeSwap = log.samples[swapIndex - 1];
  const atSwap = log.samples[swapIndex];
  expect(beforeSwap?.headline).toBe(headlines.still);
  expect(beforeSwap?.h1).not.toBeNull();
  expect(beforeSwap?.subLine).not.toBeNull();
  expect(atSwap?.h1).toEqual(beforeSwap?.h1);
  expect(atSwap?.subLine).toEqual(beforeSwap?.subLine);

  // The settled page against a tier 3 page that never swapped, so a late
  // font cannot hide a move.
  const stillPage = await context.newPage();
  await asTier3(stillPage);
  await stillPage.goto("/");
  const before = await settledHero(stillPage);
  expect(before.headline).toBe(headlines.still);
  expect(before.h1).not.toBeNull();
  expect(before.subLine).not.toBeNull();
  expect(after.h1).toEqual(before.h1);
  expect(after.subLine).toEqual(before.subLine);
});

test("REQ-PERF-07 the field stays transparent until it is ready, and three.js is asked for after first contentful paint", async ({
  page,
}, testInfo) => {
  const scripts = collectScripts(page);
  await recordField(page);
  await asTier2(page);
  await page.goto("/");
  await waitForField(page);
  await expect(page.locator(FIELD)).toHaveCSS("opacity", "1");

  const log = await readFieldLog(page);
  const readyIndex = log.samples.findIndex((sample) => sample.ready === "true");
  expect(readyIndex).toBeGreaterThan(0);
  const unseen = log.samples.slice(0, readyIndex);
  expect(unseen.filter((sample) => sample.opacity !== "0")).toEqual([]);
  // The canvas was already there, drawing unseen.
  expect(unseen.some((sample) => sample.hasCanvas)).toBe(true);

  const threeUrls = await scriptsHolding(scripts, "three.js");
  expect(threeUrls.length).toBeGreaterThan(0);
  const timing = await page.evaluate(
    () =>
      new Promise<{
        firstContentfulPaint: number | null;
        resources: { url: string; startTime: number }[];
      }>((resolve) => {
        new PerformanceObserver((list, observer) => {
          const paint = list
            .getEntries()
            .find((entry) => entry.name === "first-contentful-paint");
          if (paint === undefined) return;
          observer.disconnect();
          resolve({
            firstContentfulPaint: paint.startTime,
            resources: performance
              .getEntriesByType("resource")
              .map((entry) => ({
                url: entry.name,
                startTime: entry.startTime,
              })),
          });
        }).observe({ type: "paint", buffered: true });
      }),
  );
  const threeStarts = timing.resources
    .filter((resource) => threeUrls.includes(resource.url))
    .map((resource) => resource.startTime);
  expect(threeStarts.length).toBe(threeUrls.length);
  const firstThreeRequest = Math.min(...threeStarts);

  const line =
    `field-order ${testInfo.project.name}: first contentful paint ` +
    `${timing.firstContentfulPaint?.toFixed(0)} ms, three.js first requested ` +
    `${firstThreeRequest.toFixed(0)} ms, ready ` +
    `${log.samples[readyIndex]?.at.toFixed(0)} ms, ${readyIndex} frames before ready`;
  console.log(line);
  testInfo.annotations.push({ type: "field-order", description: line });

  expect(timing.firstContentfulPaint).not.toBeNull();
  expect(firstThreeRequest).toBeGreaterThan(timing.firstContentfulPaint ?? 0);
});

test("REQ-ENG-07 the field stops reporting frames while the document is hidden and resumes when it shows again", async ({
  page,
}) => {
  await asTier2(page);
  await page.goto("/");
  await waitForField(page);
  await nextFrameRateEvent(page);

  // A headless page cannot be sent to the background, so the two properties
  // the engine reads are replaced and the event is sent by hand.
  await setDocumentHidden(page, true);
  expect(await page.evaluate(() => document.hidden)).toBe(true);
  expect(await frameRateEvents(page, QUIET_MS)).toBe(0);

  await setDocumentHidden(page, false);
  expect(await page.evaluate(() => document.hidden)).toBe(false);
  await nextFrameRateEvent(page);
  await expect(page.locator(FIELD)).toHaveAttribute("data-tier", "2");
});

test("REQ-A11Y-03 with reduced motion the field draws one still frame and reports no frames", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await asTier2(page);
  await page.goto("/");

  const { tier } = await waitForField(page);
  expect(tier).toBe(2);
  await expect(page.locator(CANVAS)).toHaveCount(1);
  await expect(page.locator(FIELD)).toHaveCSS("opacity", "1");

  expect(await frameRateEvents(page, QUIET_MS)).toBe(0);
  expect(await page.locator(FIELD).getAttribute("data-fps")).toBeNull();
  await expectHomeContent(page);

  // The field alone, at full strength: the page text and the veil would
  // hide whether anything was drawn.
  await page.addStyleTag({
    content: "header, main, footer { visibility: hidden !important; }",
  });
  await page
    .locator(FIELD)
    .evaluate((wrapper) =>
      (wrapper as HTMLElement).style.setProperty("--field-veil", "0"),
    );
  await expect(page.locator(`${FIELD} [data-part="veil"]`)).toHaveCSS(
    "opacity",
    "0",
  );

  // A frozen field gives the same screenshot twice; a moving one never does.
  // Under load the first capture can still show the frame from before the
  // style change, so the pair is taken again until it matches.
  let frame = await page.screenshot();
  let pairs = 0;
  let identical = false;
  while (!identical && pairs < 5) {
    await page.waitForTimeout(600);
    const next = await page.screenshot();
    identical = frame.equals(next);
    frame = next;
    pairs += 1;
  }

  await writeFile(testInfo.outputPath("calm-still.png"), frame);
  const stats = await pixelStats(page, frame);
  const line =
    `calm-still ${testInfo.project.name}: lit share ${stats.litShare.toFixed(4)}, ` +
    `brightest ${stats.brightest}, two identical screenshots after ${pairs} pairs: ${identical}`;
  console.log(line);
  testInfo.annotations.push({ type: "calm-still", description: line });

  expect(identical, "nothing moves between two screenshots").toBe(true);
  expect(stats.litShare, "the still frame shows the field").toBeGreaterThan(
    0.2,
  );
});

for (const { name, force, tier } of [
  { name: "tier 2", force: asTier2, tier: 2 },
  { name: "tier 3", force: asTier3, tier: 3 },
  { name: "tier 3 after a failed renderer", force: withoutAnyGpu, tier: 3 },
]) {
  test(`REQ-A11Y-01 / has zero axe violations on forced ${name}`, async ({
    page,
  }) => {
    await force(page);
    await page.goto("/");
    expect((await waitForField(page)).tier).toBe(tier);
    await expect(page.locator(FIELD)).toHaveCSS("opacity", "1");
    await expectNoAxeViolations(page);
  });
}
