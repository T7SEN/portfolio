import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { restProgress } from "../../src/components/home/pass-slide";
import { PARTICLES } from "../../src/engine/config";
import { calmProgress } from "../../src/engine/runtime/story";
import { LIVE_PASSES, PASSES, type PassId } from "../../src/engine/story";
import {
  PASS_MEDIAN_MS,
  WARM_UP_MS,
  WINDOW_MS,
  measureFrames,
  watchErrors,
  type FrameSummary,
} from "../gpu/frame-times";
import { pixelStats, type Box } from "../gpu/pixels";
import { withoutLoader } from "../support/loader";
import { scrollToPlace, waitForStory } from "../support/story";
import { FIELD, HOST, setFieldVeil } from "../support/tiers";

// Every tab opens the home page with no loader cover: withoutLoader
// serves each page with its inline script emptied, as a blocked script
// leaves it. e2e/headed/loader.spec.ts covers the cover (REQ-LOAD-01).
test.beforeEach(async ({ context }) => {
  await withoutLoader(context);
});

// The making-of chapter on the production home page, headed, on this
// machine's GPU (REQ-PERF-06, REQ-TIER-05, REQ-ENG-09). Once the page's
// script runs, the pass cards slide sideways through a held screen as the
// page scrolls; each rests in the middle for a stretch of scroll
// (pass-slide.ts), and only the card in the middle has the T7 mark formed in
// its face, its pass drawn live there when the tier draws that pass. The
// frame times are taken with a card at rest and while the row slides, and
// the lines they print are the raw record behind the study's figures
// (docs/results/2026-11-12-making-of.md). Frame times are read from
// requestAnimationFrame, which never runs faster than the display, so a
// median on the display's refresh interval is that interval, not the GPU's
// cost. Then each card in turn rests in the middle: the mark and its pass
// stay inside that card's face.
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

const SLIDING = "main [data-pass-viewer][data-sliding]";
const STRETCH = 'main [data-part="pass-stretch"]';
const MIDDLE_CARD = 'main li[data-pass][aria-current="step"]';
const MIDDLE_FACE = "main [data-pass-face][data-middle]";
const LIVE_FACE = "main [data-pass-face][data-live]";
// The card the frame times rest on: density, which both GPU tiers draw live.
const REST_CARD = PASSES.indexOf("density");
// The field needs about a second and a half to gather after a jump.
const SETTLE_MS = 3_000;
// As the headed story spec holds each chapter: at least this share of the
// frames the tier's pass line promises in the window.
const PASS_LINE_SHARE = 0.95;
// While the frames are timed, the page scrolls from the first card's rest to
// the last card's and back, one way in this time: about 520 px a second at
// 1280 x 800, a quick reader's pace.
const SWEEP_MS = 4_000;
// The page's text is hidden and the veil is off while the field is
// measured, so only the field's own light is in the frame; the veil's plates
// go with it. The faces' borders, glow and stills are page elements, so they
// go too.
const HIDE_TEXT =
  "header, main, footer, [data-part='veil-plates'] { visibility: hidden !important; }";
// Inside the middle card's face, at least this share of pixels is lit: the
// mark, or its pass when the face is live. Unmeasured on this page: on the
// development page's 320 by 400 face, the size of the home page's at
// 1280 x 800, the mark lit 0.162 to 0.202 of the face and every live pass
// 0.186 to 0.326 on 12 Nov 2026 (e2e/gpu/passes.spec.ts, MARK_LIT 0.08).
const FACE_LIT = 0.08;
// At least this share of all the frame's lit pixels is inside the middle
// card's face: every particle joins the mark, and no other card is drawn.
// As e2e/gpu/passes.spec.ts sets MARK_SHARE, where every lit pixel of the
// frame was inside the face; unmeasured on this page.
const FACE_SHARE = 0.9;
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
  // The passes are the halftone's own steps; the soft look draws none live.
  await expect(field).toHaveAttribute("data-look", "halftone");
  await waitForStory(page);
  // The still grid of the static HTML has turned into the sliding row.
  await expect(page.locator(SLIDING)).toHaveCount(1);
}

/**
 * The scroll position at which a card rests in the middle of the sliding
 * row, halfway through its rest: where the card's own button takes the page
 * (pass-viewer.tsx, restProgress).
 */
function restTop(page: Page, index: number): Promise<number> {
  return page.locator(STRETCH).evaluate((stretch, share) => {
    const box = stretch.getBoundingClientRect();
    const travel = box.height - window.innerHeight;
    const top = window.scrollY + box.top + share * travel;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return Math.round(Math.min(Math.max(top, 0), max));
  }, restProgress(index));
}

/** Viewport boxes of the middle card's face and of every live face. */
function faceBoxes(page: Page): Promise<{
  middle: Box & { pass: string };
  live: Array<Box & { pass: string }>;
}> {
  return page.evaluate(
    ({ middleSelector, liveSelector }) => {
      const boxOf = (element: HTMLElement) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height, pass: element.dataset.passFace ?? "" };
      };
      const middle = document.querySelector<HTMLElement>(middleSelector);
      if (middle === null) throw new Error("No face is in the middle");
      return {
        middle: boxOf(middle),
        live: [...document.querySelectorAll<HTMLElement>(liveSelector)].map(
          boxOf,
        ),
      };
    },
    { middleSelector: MIDDLE_FACE, liveSelector: LIVE_FACE },
  );
}

/**
 * Jumps to a card's rest, lets the field settle, and checks the row there:
 * the page stayed, the card is the one marked in the middle, its face is in
 * the window, and the only live face is its own, when the tier draws its
 * pass. Returns the faces' boxes.
 */
async function restAt(page: Page, setup: TierSetup, index: number) {
  const pass = PASSES[index];
  if (pass === undefined) throw new Error(`No card ${index}`);
  const top = await restTop(page, index);
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "instant" }),
    top,
  );
  await page.waitForTimeout(SETTLE_MS);
  expect(
    await page.evaluate(() => Math.round(window.scrollY)),
    `the page stayed at ${top}, where ${pass} rests`,
  ).toBe(top);
  await expect(page.locator(FIELD)).toHaveAttribute(
    "data-chapter",
    "making-of",
  );
  await expect(page.locator(MIDDLE_CARD)).toHaveAttribute("data-pass", pass);

  const faces = await faceBoxes(page);
  const size = page.viewportSize();
  if (size === null) throw new Error("The page has no viewport");
  const { middle } = faces;
  expect(middle.pass, "the middle face is the middle card's").toBe(pass);
  expect(
    middle.x >= 0 &&
      middle.y >= 0 &&
      middle.x + middle.width <= size.width &&
      middle.y + middle.height <= size.height,
    `the middle face at (${Math.round(middle.x)}, ${Math.round(middle.y)}) ${Math.round(middle.width)} x ${Math.round(middle.height)} is in the window`,
  ).toBe(true);
  const isLive = LIVE_PASSES[setup.tier].includes(pass);
  expect(
    faces.live.map((face) => face.pass),
    isLive
      ? "only the middle card draws its pass live"
      : `${pass} is not live on tier ${setup.tier}, so no card is`,
  ).toEqual(isLive ? [pass] : []);
  if (!isLive) {
    await expect(
      page.locator(`${MIDDLE_FACE} img[data-part="pass-still"]`),
      `${pass} shows its still`,
    ).toHaveCount(1);
  }
  return { top, faces, isLive };
}

type SlideRecord = {
  /** Every pass whose card was marked in the middle while the row slid. */
  seen: string[];
  /** The lowest and highest scroll positions reached. */
  low: number;
  high: number;
};

/**
 * Starts scrolling the page on every frame from the first card's rest to the
 * last card's and back, so the row slides through every card, at rest and
 * gliding, while the frames are timed. Returns the stop, which gives what
 * the slide went through.
 */
async function startSlide(page: Page): Promise<() => Promise<SlideRecord>> {
  const from = await restTop(page, 0);
  const to = await restTop(page, PASSES.length - 1);
  type Sliding = Window & { passSlide?: { stop: () => SlideRecord } };
  await page.evaluate(
    ({ start, end, sweepMs, middleSelector }) => {
      const seen = new Set<string>();
      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      let first: number | null = null;
      let frame = 0;
      const step = (now: number) => {
        first ??= now;
        const phase = ((now - first) / sweepMs) % 2;
        const along = phase <= 1 ? phase : 2 - phase;
        window.scrollTo({
          top: Math.round(start + (end - start) * along),
          behavior: "instant",
        });
        low = Math.min(low, window.scrollY);
        high = Math.max(high, window.scrollY);
        const middle = document.querySelector<HTMLElement>(middleSelector);
        if (middle?.dataset.pass !== undefined) seen.add(middle.dataset.pass);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      (window as Sliding).passSlide = {
        stop: () => {
          cancelAnimationFrame(frame);
          return { seen: [...seen], low, high };
        },
      };
    },
    { start: from, end: to, sweepMs: SWEEP_MS, middleSelector: MIDDLE_CARD },
  );
  return () =>
    page.evaluate(() => {
      const slide = (window as Sliding).passSlide;
      if (slide === undefined) throw new Error("No slide was started");
      return slide.stop();
    });
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
  test(`REQ-PERF-06 REQ-TIER-05 REQ-ENG-09 tier ${setup.tier} (${setup.backend}, ${setup.reason}) holds its frame rate at 1280 x 800 with one card live in the middle of the making-of row, at rest and while the row slides`, async ({
    page,
    browserName,
    browser,
  }) => {
    test.setTimeout(180_000 + 2 * (WARM_UP_MS + WINDOW_MS));
    const { errors } = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHome(page, setup);
    const pass = PASSES[REST_CARD] ?? "density";
    const facts =
      `making-of tier ${setup.tier} ${setup.backend} reason ${setup.reason} ` +
      `particles ${setup.particles}`;
    const stamp = () =>
      `browser ${browserName} ${browser.version()} on ${new Date().toISOString()}`;

    const { faces } = await restAt(page, setup, REST_CARD);
    const resting = await measureFrames(page, FIELD);
    console.log(
      `${facts} live cards ${faces.live.length} (${pass} at rest in the middle) ` +
        `at 1280 x 800: ${framesText(resting)} ${stamp()}`,
    );

    const stop = await startSlide(page);
    const sliding = await measureFrames(page, FIELD).catch(
      async (error: unknown) => {
        await stop();
        throw error;
      },
    );
    const slide = await stop();
    console.log(
      `${facts} while the row slides (scroll ${slide.low} to ${slide.high} px, ` +
        `one way in ${SWEEP_MS} ms; cards in the middle: ${slide.seen.join(", ")}) ` +
        `at 1280 x 800: ${framesText(sliding)} ${stamp()}`,
    );

    expect([...slide.seen].sort(), "the row slid through every card").toEqual(
      [...PASSES].sort(),
    );
    await expect(page.locator(FIELD)).toHaveAttribute(
      "data-chapter",
      "making-of",
    );
    for (const [name, summary] of [
      ["at rest", resting],
      ["while the row slides", sliding],
    ] as const) {
      expect(summary.medianMs, name).toBeLessThanOrEqual(
        PASS_MEDIAN_MS[setup.tier],
      );
      expect(summary.frames, name).toBeGreaterThanOrEqual(
        Math.floor((PASS_LINE_SHARE * WINDOW_MS) / PASS_MEDIAN_MS[setup.tier]),
      );
    }
    expect(errors).toEqual([]);
  });
}

for (const setup of TIERS) {
  test(`REQ-ENG-09 REQ-TIER-05 on tier ${setup.tier} (${setup.backend}) each card resting in the middle of the making-of row frames the T7 mark in its face, where only it draws its pass live`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000 + PASSES.length * (SETTLE_MS + 5_000));
    const { errors } = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHome(page, setup);
    await page.addStyleTag({ content: HIDE_TEXT });
    await setFieldVeil(page, 0);

    const results: Array<{
      pass: PassId;
      isLive: boolean;
      lit: number;
      share: number;
    }> = [];
    for (const [index, pass] of PASSES.entries()) {
      const { faces, isLive } = await restAt(page, setup, index);
      const png = await page.locator(HOST).screenshot({
        path: testInfo.outputPath(`rest-${setup.tier}-${pass}.png`),
      });
      const whole = await pixelStats(page, png);
      const inside = await pixelStats(page, png, [faces.middle]);
      const litWhole = whole.litShare * whole.pixels;
      const share =
        litWhole === 0 ? 0 : (inside.litShare * inside.pixels) / litWhole;
      const line =
        `making-of rest tier ${setup.tier} ${pass} ${isLive ? "live" : "still"}: ` +
        `face at (${Math.round(faces.middle.x)}, ${Math.round(faces.middle.y)}) ` +
        `${Math.round(faces.middle.width)} x ${Math.round(faces.middle.height)}, ` +
        `lit ${inside.litShare.toFixed(4)} of it, ${(share * 100).toFixed(1)}% of the ` +
        `frame's ${Math.round(litWhole)} lit pixels inside it, brightest ${whole.brightest}`;
      console.log(line);
      testInfo.annotations.push({ type: "making-of", description: line });
      results.push({ pass, isLive, lit: inside.litShare, share });
    }

    for (const { pass, isLive, lit, share } of results) {
      expect(
        lit,
        isLive
          ? `${pass}: its live pass of the mark is lit inside the face`
          : `${pass}: the mark is formed inside the face`,
      ).toBeGreaterThan(FACE_LIT);
      expect(
        share,
        `${pass}: the light is inside the middle face`,
      ).toBeGreaterThanOrEqual(FACE_SHARE);
    }
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
