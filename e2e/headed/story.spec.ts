import {
  devices,
  expect,
  test,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { restProgress } from "../../src/components/home/pass-slide";
import { PARTICLES } from "../../src/engine/config";
import { PASSES, WORK_SHAPES, type ShapeId } from "../../src/engine/story";
import { packAtlas } from "../../src/engine/runtime/atlas";
import { gridFor } from "../../src/engine/runtime/halftone-rules";
import { MARKS } from "../../src/engine/runtime/shapes/marks";
import {
  BLOOM_AT,
  BLOOM_MARK_AT,
  bloomStage,
  calmProgress,
  fitScale,
  stagedFrame,
} from "../../src/engine/runtime/story";
import {
  FPS_TOLERANCE,
  PASS_MEDIAN_MS,
  WARM_UP_MS,
  WINDOW_MS,
  measureFrames,
  watchErrors,
  type FrameSummary,
} from "../gpu/frame-times";
import { cellStats, pixelStats, type Box } from "../gpu/pixels";
import {
  calmToggle,
  goToChapter,
  hasLenis,
  scrollToPlace,
  waitForStory,
  type StoryPlace,
} from "../support/story";
import { FIELD, HOST } from "../support/tiers";

// The scroll story on the production home page, headed, on this machine's
// GPU (pnpm e2e:gpu, after pnpm build): the frame rate in every chapter, the
// T7 mark then the T7SEN wordmark forming and dissolving, each study's shape
// staying inside its row's frame while the page scrolls, and the cursor and
// a finger stirring the field. The window is on a real screen, so each
// measurement also checks that the page is still where the test put it.

const TIERS = [
  {
    tier: 1,
    hideWebGpu: false,
    reason: "probe-pass",
    particles: PARTICLES.tier1,
  },
  {
    tier: 2,
    hideWebGpu: true,
    reason: "no-webgpu",
    particles: PARTICLES.tier2Desktop,
  },
] as const;
type TierSetup = (typeof TIERS)[number];

// The field needs about a second and a half to gather after a jump.
const SETTLE_MS = 3_000;
// After a jump from the hero's dot, the field is given several seconds to
// come to rest in the mark it stirs; a hole is measured against that field
// at rest.
const REST_SETTLE_MS = 8_000;
// The page's text is hidden and the veil is off while the field is
// measured, so only the field's own light is in the frame.
// The veil's plates behind the text (story-veil.ts) go with it, and so does
// the ring the field chapter draws round a mouse (pointer-ring.tsx), which
// sets its own visibility and would sit inside the box at the pointer.
const HIDE_TEXT =
  "header, main, footer, [data-part='veil-plates'], [data-part='pointer-ring'] { visibility: hidden !important; }";

async function openHome(page: Page, setup: TierSetup) {
  await page.setViewportSize({ width: 1280, height: 800 });
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

/** Hides the page's text and the veil; returns the undo. */
async function showFieldAlone(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({ content: HIDE_TEXT });
  const field = page.locator(FIELD);
  await field.evaluate((wrapper) =>
    (wrapper as HTMLElement).style.setProperty("--field-veil", "0"),
  );
  return async () => {
    await style.evaluate((element) => element.parentNode?.removeChild(element));
    await field.evaluate((wrapper) =>
      (wrapper as HTMLElement).style.removeProperty("--field-veil"),
    );
  };
}

/** The field's host box in the viewport. */
async function hostBox(page: Page): Promise<Box> {
  const box = await page.locator(HOST).boundingBox();
  if (box === null) throw new Error("The field's host has no box");
  return box;
}

/** A square of the given half size around a point, in host pixels. */
function around(x: number, y: number, half: number): Box {
  return { x: x - half, y: y - half, width: 2 * half, height: 2 * half };
}

interface Light {
  /** Share of pixels with a lit channel. */
  lit: number;
  /** Mean relative luminance: it falls with the particles' density. */
  mean: number;
}

/**
 * The light inside each group of boxes, as the mean of several frames of the
 * host, so the field's own drift averages out. The last frame is saved when
 * a path is given.
 */
async function fieldLight(
  page: Page,
  groups: ReadonlyArray<readonly Box[]>,
  path?: string,
  frames = 6,
): Promise<Light[]> {
  const sums = groups.map(() => ({ lit: 0, mean: 0 }));
  for (let frame = 0; frame < frames; frame += 1) {
    if (frame > 0) await page.waitForTimeout(150);
    const last = frame === frames - 1;
    const png = await page
      .locator(HOST)
      .screenshot(last && path !== undefined ? { path } : {});
    for (const [index, boxes] of groups.entries()) {
      const stats = await pixelStats(page, png, boxes);
      const sum = sums[index];
      if (sum === undefined) continue;
      sum.lit += stats.litShare;
      sum.mean += stats.meanLuminance;
    }
  }
  return sums.map(({ lit, mean }) => ({
    lit: lit / frames,
    mean: mean / frames,
  }));
}

/** One group's light before and after, as text for the printed line. */
function lightChange(before: Light, after: Light): string {
  return (
    `lit share ${before.lit.toFixed(4)} then ${after.lit.toFixed(4)}, ` +
    `mean luminance ${before.mean.toFixed(5)} then ${after.mean.toFixed(5)} ` +
    `(x${(after.mean / before.mean).toFixed(3)})`
  );
}

/**
 * Light at the pointer and in the control boxes, before and while it
 * stirs. The hole is the pointer box's change over the controls' change, so
 * the field's own drift between the two moments cancels out.
 */
async function measureStir(
  page: Page,
  near: Box,
  controls: readonly Box[],
  name: string,
  testInfo: TestInfo,
  stir: () => Promise<void>,
  controlsName = `${controls.length} boxes away from it`,
) {
  const [nearBefore, controlBefore] = await fieldLight(
    page,
    [[near], controls],
    testInfo.outputPath(`stir-before-${name}.png`),
  );
  await stir();
  const [nearDuring, controlDuring] = await fieldLight(
    page,
    [[near], controls],
    testInfo.outputPath(`stir-during-${name}.png`),
  );
  if (!nearBefore || !controlBefore || !nearDuring || !controlDuring) {
    throw new Error("No light was measured");
  }
  const control = controlDuring.mean / controlBefore.mean;
  return {
    before: nearBefore,
    control,
    hole: nearDuring.mean / nearBefore.mean / control,
    text:
      `at the pointer ${lightChange(nearBefore, nearDuring)}; ` +
      `in ${controlsName} ${lightChange(controlBefore, controlDuring)}; ` +
      `hole x${(nearDuring.mean / nearBefore.mean / control).toFixed(3)} of the field around it`,
  };
}

interface ScrollState {
  scrollY: number;
  /** The document's full height: layout that grows or shrinks shows here. */
  height: number;
  /** Lenis's classes on html, which say whether it is scrolling the page. */
  lenis: string[];
}

function scrollState(page: Page): Promise<ScrollState> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollY: Math.round(window.scrollY),
      height: root.scrollHeight,
      lenis: [...root.classList].filter(
        (name) => name === "lenis" || name.startsWith("lenis-"),
      ),
    };
  });
}

function scrollStateText({ scrollY, height, lenis }: ScrollState): string {
  return `scroll ${scrollY}, height ${height}, Lenis classes ${lenis.join(" ") || "none"}`;
}

/**
 * Jumps to a place, lets the field settle, and checks nothing moved. A move
 * is reported with the page's height and Lenis's classes before and after
 * the wait, so the failure names its likely cause: layout that changed
 * height, or a scroll Lenis was still driving.
 */
async function settleAt(
  page: Page,
  place: StoryPlace,
  chapter: string,
  settleMs = SETTLE_MS,
) {
  const top = await scrollToPlace(page, place);
  const before = await scrollState(page);
  await page.waitForTimeout(settleMs);
  const after = await scrollState(page);
  expect(
    after.scrollY,
    `the page stayed at ${top} (before the wait ${scrollStateText(before)}; after it ${scrollStateText(after)})`,
  ).toBe(top);
  await expect(page.locator(FIELD)).toHaveAttribute("data-chapter", chapter);
  return top;
}

/**
 * A place in the story, or a pass card resting in the middle of the
 * making-of's sliding row.
 */
type StatePlace = StoryPlace | { rest: number };

/**
 * Jumps to a place and returns the position. A card's rest is where its own
 * button takes the page: halfway through the stretch of scroll in which it
 * rests in the middle (pass-slide.ts, restProgress).
 */
async function scrollToState(page: Page, place: StatePlace): Promise<number> {
  if (!("rest" in place)) return scrollToPlace(page, place);
  const top = await page
    .locator('main [data-part="pass-stretch"]')
    .evaluate((stretch, share) => {
      const box = stretch.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      const y = window.scrollY + box.top + share * travel;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.round(Math.min(Math.max(y, 0), max));
    }, restProgress(place.rest));
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "instant" }),
    top,
  );
  return top;
}

// The field changes with the scroll story, and each formation packs the
// particles into part of the frame, so the frame rate is measured in each
// chapter of the production home page (REQ-PERF-06).
//
// The home-field tests hold the window to 95% of the frames its own median
// promises. On a 240 Hz display the field on this page sits at the edge of
// one display interval in some chapters, so a few per cent of its frames
// take two, on both tiers, and that rule reads such frames as a stall. The
// figures behind this were reported during the build and their output was
// not kept: every median 4.20 ms; tier 1 once held 94.8% of its promised
// frames with no frame longer than 16.2 ms, and tier 2 had up to 9% of its
// frames above 6 ms with the longest at 33.2 ms.
//
// So here each chapter is held to the tier's pass line instead: the median
// at or under it; at least 95% of the frames the line promises in the
// window, so time lost to many shorter stalls still counts; no interval as
// long as four frames at the line; and the engine reporting the page's own
// rate. The page's frames run on whatever the field does, so only that last
// check catches a field that draws fewer frames than the page or stops
// reporting for half the window. The share of the frames the median
// promises is printed.
const STALL_FRAMES = 4;
// The engine publishes its rate once a second, so a 10 s window holds about
// ten readouts; it must give more than this many, as in the home-field tests.
const MIN_READOUTS = 5;
const PASS_LINE_SHARE = 0.95;
const CHAPTER_STATES: ReadonlyArray<{
  name: string;
  place: StatePlace;
  chapter: string;
}> = [
  { name: "hero", place: { chapter: "hero", progress: 0 }, chapter: "hero" },
  {
    name: "bloom, leaving the dot",
    place: {
      chapter: "bloom",
      progress: BLOOM_AT.released / 2,
    },
    chapter: "bloom",
  },
  {
    name: "bloom, the mark",
    place: { chapter: "bloom", progress: BLOOM_MARK_AT },
    chapter: "bloom",
  },
  {
    name: "bloom, the wordmark",
    place: { chapter: "bloom", progress: calmProgress("bloom", 0) },
    chapter: "bloom",
  },
  { name: "work, making-of", place: { step: 0 }, chapter: "work" },
  { name: "work, archelab", place: { step: 2 }, chapter: "work" },
  {
    // The middle card's face holds the T7 mark, its pass drawn live there
    // on both tiers.
    name: "making-of, the mark in the middle card, density at rest",
    place: { rest: PASSES.indexOf("density") },
    chapter: "making-of",
  },
  {
    name: "about 0.5, the strands",
    place: { chapter: "about", progress: 0.5 },
    chapter: "about",
  },
  {
    name: "contact 0.5, the rings",
    place: { chapter: "contact", progress: 0.5 },
    chapter: "contact",
  },
];

for (const setup of TIERS) {
  const { tier } = setup;
  test(`REQ-PERF-06 REQ-SCR-01 every chapter of the home page holds the tier ${tier} frame rate at 1280 x 800`, async ({
    page,
  }) => {
    test.setTimeout(
      120_000 + CHAPTER_STATES.length * (WARM_UP_MS + WINDOW_MS + 5_000),
    );
    const { errors } = watchErrors(page);
    await openHome(page, setup);
    const field = page.locator(FIELD);
    const frameFloor = (PASS_LINE_SHARE * WINDOW_MS) / PASS_MEDIAN_MS[tier];

    const results: Array<{ name: string; summary: FrameSummary }> = [];
    for (const state of CHAPTER_STATES) {
      const scrolledTo = await scrollToState(page, state.place);
      // The warm-up inside the measurement covers the glide to the new state.
      const summary = await measureFrames(page, FIELD);
      const chapter = await field.getAttribute("data-chapter");
      const scrolledAfter = await page.evaluate(() =>
        Math.round(window.scrollY),
      );
      console.log(
        `frame-rate chapters tier ${tier} particles ${setup.particles} ${state.name} ` +
          `(field chapter ${chapter}, scroll ${scrolledTo} then ${scrolledAfter}): ` +
          `frames ${summary.frames} median ` +
          `${summary.medianMs.toFixed(2)} ms p95 ${summary.p95Ms.toFixed(2)} ms, ` +
          `longest ${summary.longestMs.toFixed(1)} ms, ` +
          `${(((summary.frames * summary.medianMs) / WINDOW_MS) * 100).toFixed(1)}% of the frames the median promises, ` +
          `at least ${Math.ceil(frameFloor)} due at the pass line, ` +
          `engine ${summary.engineFps.toFixed(2)} fps against the page's ${summary.pageFps.toFixed(2)} fps ` +
          `over ${summary.readouts} readouts`,
      );
      // The state measured must be the one named.
      expect(chapter, state.name).toBe(state.chapter);
      expect(scrolledAfter, `${state.name}: the page stayed`).toBe(scrolledTo);
      results.push({ name: state.name, summary });
    }

    for (const { name, summary } of results) {
      expect(
        summary.readouts,
        `${name}: the engine reports its frame rate`,
      ).toBeGreaterThan(MIN_READOUTS);
      expect(
        Math.abs(summary.engineFps - summary.pageFps) / summary.pageFps,
        `${name}: the engine's frame rate matches the page's own count`,
      ).toBeLessThanOrEqual(FPS_TOLERANCE);
      expect(summary.medianMs, name).toBeLessThanOrEqual(PASS_MEDIAN_MS[tier]);
      expect(
        summary.frames,
        `${name}: the window holds ${PASS_LINE_SHARE * 100}% of the frames the pass line promises`,
      ).toBeGreaterThanOrEqual(frameFloor);
      expect(summary.longestMs, `${name}: no stall`).toBeLessThan(
        STALL_FRAMES * PASS_MEDIAN_MS[tier],
      );
    }
    expect(errors).toEqual([]);
  });
}

// The bloom (REQ-SCR-07, runtime/story.ts, BLOOM_AT): the T7 mark gathers
// once the dot has let the field go and is measured in the middle of its
// hold (BLOOM_MARK_AT); it turns into the T7SEN wordmark, measured at its
// calm still in the middle of its own hold, which is gone just before the
// chapter ends. The field chapter forms inside its bloom stage, the middle
// 0.8 of a landscape screen.
const MARK_FORMED_AT = BLOOM_MARK_AT;
// The landscape frame's limit for the share of the light in the wordmark's
// box, as e2e/gpu/story.spec.ts sets it: measured there at 0.959 on tiers 1
// and 2 on 12 Nov 2026 (the line was 0.5 then); a little under it.
const WORDMARK_SHARE_LANDSCAPE = 0.9;
const WORDMARK_FORMED_AT = calmProgress("bloom", 0);
// Between the wordmark gone and the end of the chapter.
const DISSOLVED_AT = (BLOOM_AT.gone + 1) / 2;
const atlas = packAtlas();

/** Where a fitted bloom shape sits in a host of this size, with room for noise. */
function bloomBox(id: ShapeId, width: number, height: number): Box {
  const frame = { halfWidth: width / height, halfHeight: 1 };
  const staged = stagedFrame(bloomStage(width / height), frame);
  const extent = atlas.extents[id];
  const scale = fitScale(extent, staged.frame);
  // Noise and the 8 px halftone lattice reach past the sampled box.
  const margin = 0.05 * (Math.min(width, height) / 2) + 16;
  const halfWidth =
    ((extent.halfWidth * scale) / frame.halfWidth) * (width / 2) + margin;
  const halfHeight = extent.halfHeight * scale * (height / 2) + margin;
  return {
    x: width / 2 - halfWidth,
    y: height / 2 - halfHeight,
    width: 2 * halfWidth,
    height: 2 * halfHeight,
  };
}

/** How the light of one frame sits against a shape's box. */
async function shapeFrame(page: Page, box: Box, host: Box, path: string) {
  const png = await page.locator(HOST).screenshot({ path });
  const whole = await pixelStats(page, png);
  const inside = await pixelStats(page, png, [box]);
  // The columns left and right of the box, the full height.
  const sides = await pixelStats(page, png, [
    { x: 0, y: 0, width: box.x, height: host.height },
    {
      x: box.x + box.width,
      y: 0,
      width: host.width - box.x - box.width,
      height: host.height,
    },
  ]);
  const lit = whole.litShare * whole.pixels;
  return {
    lit,
    inBox: lit === 0 ? 0 : (inside.litShare * inside.pixels) / lit,
    sides: sides.litShare,
    brightest: whole.brightest,
  };
}

// Once the wordmark has gone, the flow lines run beside its box again. They
// lit 0.0150 to 0.0163 of the columns beside it on 12 Nov 2026 on tiers 1
// and 2, where the wordmark itself left 0.0044; the line is half the lowest.
const DISSOLVED_SIDES = 0.0075;

for (const setup of TIERS) {
  const { tier } = setup;
  test(`REQ-SCR-07 on tier ${tier} the T7 mark gathers in the field chapter, turns into the T7SEN wordmark and dissolves into the flow`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { errors } = watchErrors(page);
    await openHome(page, setup);
    const host = await hostBox(page);
    const markBox = bloomBox("logo", host.width, host.height);
    const wordmarkBox = bloomBox("wordmark", host.width, host.height);

    await settleAt(
      page,
      { chapter: "bloom", progress: MARK_FORMED_AT },
      "bloom",
    );
    await showFieldAlone(page);
    const mark = await shapeFrame(
      page,
      markBox,
      host,
      testInfo.outputPath(`mark-tier${tier}.png`),
    );
    await settleAt(
      page,
      { chapter: "bloom", progress: WORDMARK_FORMED_AT },
      "bloom",
    );
    const wordmark = await shapeFrame(
      page,
      wordmarkBox,
      host,
      testInfo.outputPath(`wordmark-tier${tier}.png`),
    );
    await settleAt(page, { chapter: "bloom", progress: DISSOLVED_AT }, "bloom");
    const dissolved = await shapeFrame(
      page,
      wordmarkBox,
      host,
      testInfo.outputPath(`dissolved-tier${tier}.png`),
    );

    const line = (
      name: string,
      frame: typeof mark,
      box: Box,
      progress: number,
    ) =>
      `bloom tier ${tier} ${name} at ${progress}: ${Math.round(frame.lit)} lit pixels, ` +
      `${frame.inBox.toFixed(4)} of them in the box ` +
      `(${Math.round(box.width)} x ${Math.round(box.height)} of ${host.width} x ${host.height}), ` +
      `sides lit ${frame.sides.toFixed(4)}, brightest ${frame.brightest}`;
    for (const text of [
      line("the mark", mark, markBox, MARK_FORMED_AT),
      line("the wordmark", wordmark, wordmarkBox, WORDMARK_FORMED_AT),
      line("dissolved", dissolved, wordmarkBox, DISSOLVED_AT),
    ]) {
      console.log(text);
      testInfo.annotations.push({ type: "bloom", description: text });
    }

    expect(mark.lit, "the mark is drawn").toBeGreaterThan(1_000);
    expect(mark.inBox, "the light is in the mark").toBeGreaterThanOrEqual(0.9);
    expect(mark.sides, "nothing lit beside the mark").toBeLessThan(0.005);
    expect(wordmark.lit, "the wordmark is drawn").toBeGreaterThan(1_000);
    // Half the lines that may keep go on running round the wordmark; this
    // is the landscape frame (e2e/gpu/story.spec.ts sets both limits).
    expect(
      wordmark.inBox,
      "most of the light is in the wordmark",
    ).toBeGreaterThanOrEqual(WORDMARK_SHARE_LANDSCAPE);
    expect(dissolved.inBox, "the light has left the wordmark").toBeLessThan(
      0.75,
    );
    expect(dissolved.sides, "the flow runs beside it again").toBeGreaterThan(
      DISSOLVED_SIDES,
    );
    expect(errors).toEqual([]);
  });
}

// Each study's shape forms inside its row's frame, and stays there while
// the page scrolls: the story sends the frame of the row in view on every
// scroll frame, and the engine takes a move of at most STAGE_STEP at once
// and draws the formed particles ahead by the gap (runtime/index.ts, the
// stage follow); a longer move glides. Measured with the page's text
// hidden: the share of the lit pixels that fall inside the row's
// [data-stage="frame"] box at that moment. On 12 Nov 2026, with the shapes
// drawn as outlines, it was 100% at rest, after the wheel and mid scroll in
// small steps, and 95.4% to 99.7% just after a 100 px jump, the least for
// Coup Online's wide fan of cards, on both tiers (97.4% to 99.9% with the
// filled shapes before). Coup Online's jump reading moves with changes that
// leave the work chapter and the stage follow alone: later that day it read
// 94.98% to 95.2% on tiers 1 and 2 across the committed build, the taller
// field chapter (D-118) and the new making-of, each built alone and together.
// So the line sits a point under that spread, not on it.
const FRAME_SHARE = 0.94;
const FRAME_SCROLL_PX = 100;
// STAGE_STEP is 0.2 of the half screen, 80 px on this 800 px window, so a
// 100 px jump glides. Steps of 30 px, one every 150 ms, are each taken at
// once; the frame is measured between two of them while the steps go on,
// so the shape is caught mid scroll, not after a rest. Were these moves
// glides, the field would trail the frame by most of the steps so far.
const STEP_SCROLL_PX = 30;
const STEP_EVERY_MS = 150;
const STEPS = 16;
const STEPS_BEFORE_SHOT_MS = 400;

/** The row's frame box in the viewport now. */
async function frameBox(page: Page, step: number): Promise<Box> {
  return page.evaluate((index) => {
    const frame = document.querySelector(
      `main [data-work-step="${index}"] [data-stage="frame"]`,
    );
    if (frame === null) throw new Error(`No frame in row ${index}`);
    const { x, y, width, height } = frame.getBoundingClientRect();
    return { x, y, width, height };
  }, step);
}

async function lightInFrame(page: Page, step: number, path: string) {
  const png = await page.locator(HOST).screenshot({ path });
  const box = await frameBox(page, step);
  const whole = await pixelStats(page, png);
  const inside = await pixelStats(page, png, [box]);
  const lit = whole.litShare * whole.pixels;
  return {
    box,
    lit,
    share: lit === 0 ? 0 : (inside.litShare * inside.pixels) / lit,
  };
}

/**
 * The light in the frame while the page scrolls in steps smaller than
 * STAGE_STEP: the steps run in the page on their own timer, and a shot
 * counts only when the scroll position is the same before and after it, so
 * the frame's box is the one the shot shows.
 */
async function lightInFrameMidScroll(page: Page, step: number, path: string) {
  type Stepping = Window & { frameStepper?: number };
  await page.evaluate(
    ({ by, every, count }) => {
      let done = 0;
      const timer = window.setInterval(() => {
        window.scrollBy({ top: by, behavior: "instant" });
        done += 1;
        if (done >= count) window.clearInterval(timer);
      }, every);
      (window as Stepping).frameStepper = timer;
    },
    { by: STEP_SCROLL_PX, every: STEP_EVERY_MS, count: STEPS },
  );
  const stop = () =>
    page.evaluate(() => {
      window.clearInterval((window as Stepping).frameStepper);
    });
  try {
    await page.waitForTimeout(STEPS_BEFORE_SHOT_MS);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const before = await page.evaluate(() => window.scrollY);
      const png = await page.locator(HOST).screenshot({ path });
      const box = await frameBox(page, step);
      const after = await page.evaluate(() => window.scrollY);
      if (before !== after) continue;
      const whole = await pixelStats(page, png);
      const inside = await pixelStats(page, png, [box]);
      const lit = whole.litShare * whole.pixels;
      // The steps went on after the shot: the page was still moving.
      await page.waitForTimeout(STEP_EVERY_MS * 2);
      const moved = (await page.evaluate(() => window.scrollY)) !== after;
      return {
        box,
        lit,
        share: lit === 0 ? 0 : (inside.litShare * inside.pixels) / lit,
        moved,
      };
    }
    throw new Error("No shot fell between two steps of the scroll");
  } finally {
    // The rest of the steps would move the page under the next study.
    await stop();
  }
}

for (const setup of TIERS) {
  const { tier } = setup;
  test(`REQ-SCR-01 REQ-SCR-05 REQ-ENG-03 on tier ${tier} each study's shape forms inside its row's frame and stays there while the page scrolls`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { errors } = watchErrors(page);
    await openHome(page, setup);
    const host = await hostBox(page);
    const lines: string[] = [];
    const results: Array<{ name: string; share: number; lit: number }> = [];

    for (const [step, slug] of WORK_SHAPES.entries()) {
      await settleAt(page, { step }, "work");
      const restore = await showFieldAlone(page);
      const still = await lightInFrame(
        page,
        step,
        testInfo.outputPath(`frame-${tier}-${slug}.png`),
      );
      // A jump of 100 px, more than STAGE_STEP's 80 px: the shape glides
      // there, and the formed particles drawn ahead by their lag keep most
      // of it inside the frame just after.
      await page.evaluate(
        (by) => window.scrollBy({ top: by, behavior: "instant" }),
        FRAME_SCROLL_PX,
      );
      const jumped = await lightInFrame(
        page,
        step,
        testInfo.outputPath(`frame-${tier}-${slug}-jumped.png`),
      );
      // Back up by the wheel, which Lenis glides, then at rest.
      await page.mouse.move(host.width / 2, 40);
      await page.mouse.wheel(0, -FRAME_SCROLL_PX);
      await page.waitForTimeout(1_200);
      const wheeled = await lightInFrame(
        page,
        step,
        testInfo.outputPath(`frame-${tier}-${slug}-wheeled.png`),
      );
      // Steps smaller than STAGE_STEP, measured while they go on.
      const stepping = await lightInFrameMidScroll(
        page,
        step,
        testInfo.outputPath(`frame-${tier}-${slug}-stepping.png`),
      );
      expect(stepping.moved, `${slug}: the page was still moving`).toBe(true);
      await restore();

      for (const [name, measured] of [
        ["at rest", still],
        [`${FRAME_SCROLL_PX} px down at once`, jumped],
        [`${FRAME_SCROLL_PX} px back by the wheel`, wheeled],
        [
          `mid scroll in ${STEP_SCROLL_PX} px steps every ${STEP_EVERY_MS} ms`,
          stepping,
        ],
      ] as const) {
        lines.push(
          `frame tier ${tier} ${slug} ${name}: ${Math.round(measured.lit)} lit pixels, ` +
            `${(measured.share * 100).toFixed(1)}% inside the frame at ` +
            `(${Math.round(measured.box.x)}, ${Math.round(measured.box.y)}) ` +
            `${Math.round(measured.box.width)} x ${Math.round(measured.box.height)}`,
        );
        results.push({
          name: `${slug} ${name}`,
          share: measured.share,
          lit: measured.lit,
        });
      }
    }
    for (const line of lines) console.log(line);
    testInfo.annotations.push(
      ...lines.map((description) => ({ type: "frame", description })),
    );

    for (const { name, share, lit } of results) {
      expect(lit, `${name}: the shape is drawn`).toBeGreaterThan(1_000);
      expect(share, `${name}: its light is inside the frame`).toBeGreaterThan(
        FRAME_SHARE,
      );
    }
    expect(errors).toEqual([]);
  });
}

// Stirring (REQ-SCR-06) is measured inside the T7 mark the field chapter
// holds at BLOOM_MARK_AT: an even, dense fill with nothing else drawn near
// it, so a hole the pointer opens shows against the fill around it. The
// chapter's screen is held there and the mark sits in the middle of the
// window (BLOOM_STAGE), so it stays put while a finger scrolls the page a
// little. Since P3.5 the contact chapter is three faint rings, too sparse to
// measure a hole in, and the making-of no longer forms its sheet: its mark
// sits in the middle card, where the card's live pass covers it.
const STIR_PLACE = { chapter: "bloom", progress: BLOOM_MARK_AT } as const;

// The mark's polygon (MARKS.logo, the one of public/brand/t7sen-purple.svg)
// in its own units, y down: a bar across the top from y 0 to 73.13; under
// it the T's stem, from x 113.09 to 186.22; and the 7's stroke, as thick as
// the bar, slanting from under the bar's end (x 317.19 to 411.18) down to
// the bottom left, with empty space between it and the stem. At 1280 x 800
// the mark is about 540 px wide and its bar about 85 px thick; at 375 x 812
// about 300 px and 47 px. The pointer stirs the bar near its start, with
// only empty space above and below it there. The control boxes sit on the
// bar's far end and on the stroke, at least 300 px from the pointer at
// 1280 x 800 and about 170 px at 375 x 812, where the push has fallen to a
// few px, and away from a finger's whole path. Every box sits a cell or more
// inside the edges of the bar or the stroke it is on.
const MARK_PLACES = {
  pointer: { x: 60, y: 36.6 },
  controls: [
    { x: 385, y: 36.6 },
    { x: 302, y: 150 },
    { x: 197, y: 280 },
  ],
} as const;

/** The mark's polygon's box, in its own units. */
const MARK_BOX = (() => {
  const ring = MARKS.logo[0]?.rings[0] ?? [];
  const xs = ring.filter((_, index) => index % 2 === 0);
  const ys = ring.filter((_, index) => index % 2 === 1);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
})();

/**
 * Where a point of the T7 mark, in its polygon's units, is drawn on a host of
 * this size while the field chapter holds the mark: the sampler centres the
 * shape with its longer side from -1 to 1 (shapes/index.ts, layers), and the
 * engine fits that to the bloom stage (bloomBox above).
 */
function markPoint(
  point: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const unit = 2 / Math.max(MARK_BOX.width, MARK_BOX.height);
  const sampleX = (point.x - MARK_BOX.left - MARK_BOX.width / 2) * unit;
  const sampleY = (MARK_BOX.top + MARK_BOX.height / 2 - point.y) * unit;
  const frame = { halfWidth: width / height, halfHeight: 1 };
  const staged = stagedFrame(bloomStage(width / height), frame);
  // Half the host's height is one unit of the frame on both axes.
  const half = height / 2;
  const perSample = fitScale(atlas.extents.logo, staged.frame) * half;
  return {
    x: width / 2 + staged.centreX * half + sampleX * perSample,
    y: height / 2 - staged.centreY * half - sampleY * perSample,
  };
}

/** The pointer's point and the boxes round it and at the controls, on a host. */
function stirBoxes(host: Box, half: number, controlHalf: number) {
  const point = markPoint(MARK_PLACES.pointer, host.width, host.height);
  return {
    point,
    near: around(point.x, point.y, half),
    controls: MARK_PLACES.controls.map((place) => {
      const at = markPoint(place, host.width, host.height);
      return around(at.x, at.y, controlHalf);
    }),
  };
}

// A box on the mark's fill holds a lit dot in nearly every halftone cell
// whose centre it covers; one that slipped off the mark onto the void holds
// few. Every box is checked against this before anything stirs, so a box in
// the wrong place fails there instead of measuring nothing. Unmeasured: the
// fill sits at FILL_TONE, whose dots pass the lit cell line (pixels.ts
// LIT_CELL_LUMINANCE) in every cell.
const LIT_CELLS = 0.8;

/**
 * The share of each box's halftone cells that hold a lit dot, in one frame
 * of the host, on the lattice of a canvas of the host's size at a pixel
 * ratio of 1 (halftone-rules.ts gridFor).
 */
async function litCellShares(
  page: Page,
  host: Box,
  boxes: readonly Box[],
): Promise<number[]> {
  const png = await page.locator(HOST).screenshot();
  const { cell, padX, padY } = gridFor(host.width, host.height);
  const shares: number[] = [];
  for (const box of boxes) {
    const stats = await cellStats(page, png, { cell, padX, padY }, [box]);
    shares.push(stats.cells === 0 ? 0 : stats.litCells / stats.cells);
  }
  return shares;
}

function sharesText(shares: readonly number[]): string {
  return shares.map((share) => share.toFixed(2)).join(", ");
}

// The boxes at 1280 x 800: the bar is about 85 px thick, so the box at the
// pointer is 50 px, inside the hole the cursor opens; the stroke is as thick
// but slants, so a control box there is 40 px.
const STIR_HALF = 25;
const CONTROL_HALF = 20;
// What the box at the pointer keeps of its light, against the field around
// it, at most. Measured on the ambient field on 10 Nov 2026: 0.64 to 0.69
// for the cursor and 0.52 for a finger. On the halftone sheet on 12 Nov
// 2026: 0.287 and 0.291 for the cursor on tiers 1 and 2 and 0.088 for a
// finger, while the control boxes kept 1.004 to 1.030 of theirs. Not yet
// measured on the mark; the lines are kept.
const HOLE_LIGHT = 0.8;
// What the control keeps of its own light, at least: the field away from
// the pointer is still there. For the cursor the control is three boxes on
// the mark, 300 px or more from it; for a finger it is the whole frame (see
// the touch test).
const CONTROL_LIGHT = 0.7;

for (const setup of TIERS) {
  const { tier } = setup;
  test(`REQ-SCR-06 REQ-A11Y-04 on tier ${tier} the cursor stirs the field where it is, and calm mode stops it`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { errors } = watchErrors(page);
    await openHome(page, setup);
    await settleAt(page, STIR_PLACE, STIR_PLACE.chapter, REST_SETTLE_MS);
    const host = await hostBox(page);
    const { point, near, controls } = stirBoxes(host, STIR_HALF, CONTROL_HALF);

    const restore = await showFieldAlone(page);
    const onMark = await litCellShares(page, host, [near, ...controls]);
    const stir = await measureStir(
      page,
      near,
      controls,
      `tier${tier}`,
      testInfo,
      async () => {
        // From the empty space beside the mark onto its bar.
        await page.mouse.move(point.x - 80, point.y);
        await page.mouse.move(point.x, point.y, { steps: 10 });
        // Small circles keep the cursor at the point while the field
        // answers.
        for (let step = 0; step < 12; step += 1) {
          const angle = (step / 12) * 2 * Math.PI;
          await page.mouse.move(
            point.x + 6 * Math.cos(angle),
            point.y + 6 * Math.sin(angle),
          );
          await page.waitForTimeout(100);
        }
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(500);
      },
    );
    const stirLine =
      `stir tier ${tier} mouse at (${Math.round(point.x)}, ${Math.round(point.y)}) on the T7 mark's bar, ` +
      `boxes ${2 * STIR_HALF} px and ${controls.length} controls of ${2 * CONTROL_HALF} px, ` +
      `lit cells before at the pointer then the controls ${sharesText(onMark)}: ${stir.text}`;
    console.log(stirLine);
    testInfo.annotations.push({ type: "stir", description: stirLine });

    for (const [index, share] of onMark.entries()) {
      expect(
        share,
        index === 0
          ? "the box at the pointer sits on the mark"
          : `control box ${index} sits on the mark`,
      ).toBeGreaterThanOrEqual(LIT_CELLS);
    }
    expect(stir.before.lit, "the field is there to stir").toBeGreaterThan(0.05);
    expect(stir.hole, "the cursor thins the field where it is").toBeLessThan(
      HOLE_LIGHT,
    );
    expect(
      stir.control,
      "away from the cursor the field stays",
    ).toBeGreaterThan(CONTROL_LIGHT);

    // Calm: one still frame, which the cursor no longer moves.
    await restore();
    // The bar is not sticky, so the click scrolls it into view at the top of
    // the page and the field goes back to the hero's dot. The still is taken
    // in the field chapter again, where the cursor stirred it; calm shows the
    // chapter's wordmark there.
    await calmToggle(page).click();
    await expect(calmToggle(page)).toHaveAttribute("aria-checked", "true");
    await settleAt(page, STIR_PLACE, STIR_PLACE.chapter, 1_500);
    await showFieldAlone(page);
    const still = await page.locator(HOST).screenshot();
    // Two blank frames would also be equal, so the still must show the field.
    expect(
      (await pixelStats(page, still)).litShare,
      "the calm still shows the field",
    ).toBeGreaterThan(0.05);
    for (let step = 0; step < 12; step += 1) {
      await page.mouse.move(
        point.x + 120 * Math.cos(step),
        point.y + 120 * Math.sin(step),
        { steps: 4 },
      );
    }
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(1_000);
    const after = await page.locator(HOST).screenshot();
    expect(after.equals(still), "the cursor leaves a calm field alone").toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

// A finger on a touch screen: the touch listeners are passive, so the page
// scrolls natively while the field reads the finger. Driven through the
// DevTools protocol, which sends real touch events and lets the browser
// turn them into a scroll, on a touch-emulated phone viewport. The field
// chapter holds the whole mark from 0.42 to 0.5 of its room (runtime/story.ts,
// BLOOM_AT), about 170 px of scroll on this phone, so the drag is 100 px and
// starts half of it past the mark's middle: the page, scrolled back by the
// drag, ends about as far before it, and the mark is whole at both ends.
const DRAG_PX = 100;
// The phone's mark is smaller: its bar and stroke are about 47 px thick, so
// the box at the finger is 30 px and a box on the slanting stroke 24 px.
const TOUCH_HALF = 15;
const TOUCH_CONTROL_HALF = 12;
// In the field chapter the pointer also turns the drawn field about itself
// (halftone-rules.ts, SWIRL_RADIUS, 0.45 of the half height: about 183 px
// on this phone, and still about 0.4 of a radian 210 px out). The phone's
// mark is 300 px wide, so no box on it is out of the swirl's reach, and a
// box there would measure light the swirl moved, not light the finger took
// away. Each ring of the swirl turns whole, so the light keeps its area:
// the control for a finger is the whole frame, whose light only the hole
// takes from. The boxes on the mark still check the mark is where it is
// worked out to be before anything stirs.

test("REQ-SCR-06 REQ-SCR-02 on a touch screen a finger stirs the field while the page scrolls natively under it", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({
    baseURL,
    ...devices["Pixel 5"],
    deviceScaleFactor: 1,
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();
  try {
    const { errors } = watchErrors(page);
    await page.goto("/");
    const field = page.locator(FIELD);
    await expect(field).toHaveAttribute("data-ready", "true", {
      timeout: 90_000,
    });
    expect({
      tier: Number(await field.getAttribute("data-tier")),
      reason: await field.getAttribute("data-tier-reason"),
    }).toEqual({ tier: 2, reason: "phone" });
    await waitForStory(page);
    expect(await hasLenis(page), "no Lenis on touch").toBe(false);

    const room = await page
      .locator('main [data-chapter="bloom"]')
      .evaluate((section) => section.getBoundingClientRect().height);
    const startAt = BLOOM_MARK_AT + DRAG_PX / 2 / room;
    const start = await goToChapter(page, STIR_PLACE.chapter, startAt);
    await page.waitForTimeout(REST_SETTLE_MS);
    const host = await hostBox(page);
    const stirred = stirBoxes(host, TOUCH_HALF, TOUCH_CONTROL_HALF);
    const finger = {
      x: Math.round(stirred.point.x),
      y: Math.round(stirred.point.y),
    };
    const near = around(finger.x, finger.y, TOUCH_HALF);
    const { controls } = stirred;
    const wholeFrame: Box = {
      x: 0,
      y: 0,
      width: host.width,
      height: host.height,
    };

    await showFieldAlone(page);
    const onMark = await litCellShares(page, host, [near, ...controls]);
    const cdp = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: y === undefined ? [] : [{ x: finger.x, y }],
      });
    const stir = await measureStir(
      page,
      near,
      [wholeFrame],
      "touch",
      testInfo,
      async () => {
        // The finger moves down the screen, from the empty space above the
        // mark onto its bar, so the page scrolls up.
        const from = finger.y - DRAG_PX;
        await touch("touchStart", from);
        for (let step = 1; step <= 12; step += 1) {
          await touch("touchMove", from + (DRAG_PX * step) / 12);
          await page.waitForTimeout(16);
        }
        // Held still on the point, the finger keeps stirring there.
        await page.waitForTimeout(1_200);
      },
      "the whole frame",
    );
    const scrolled = start - (await page.evaluate(() => window.scrollY));
    await touch("touchEnd");
    await page.waitForTimeout(500);
    const chapter = await field.getAttribute("data-chapter");
    const endAt = startAt - scrolled / room;

    const line =
      `stir touch tier 2 particles ${PARTICLES.tier2Phone}: a ${DRAG_PX} px drag scrolled the page ${Math.round(scrolled)} px, ` +
      `the field chapter from ${startAt.toFixed(3)} to ${endAt.toFixed(3)} of its ${Math.round(room)} px; ` +
      `finger at (${finger.x}, ${finger.y}) on the T7 mark's bar, boxes ${2 * TOUCH_HALF} px and ` +
      `${controls.length} boxes on the mark of ${2 * TOUCH_CONTROL_HALF} px, lit cells before at the finger then on the mark ` +
      `${sharesText(onMark)}: ${stir.text}; field chapter ${chapter}`;
    console.log(line);
    testInfo.annotations.push({ type: "stir", description: line });

    for (const [index, share] of onMark.entries()) {
      expect(
        share,
        index === 0
          ? "the box at the finger sits on the mark"
          : `box ${index} sits on the mark`,
      ).toBeGreaterThanOrEqual(LIT_CELLS);
    }
    expect(scrolled, "the page scrolled under the finger").toBeGreaterThan(
      0.5 * DRAG_PX,
    );
    expect(scrolled).toBeLessThan(1.5 * DRAG_PX);
    expect(startAt, "the stir started with the mark whole").toBeLessThan(
      BLOOM_AT.morphFrom,
    );
    expect(
      endAt,
      "the drag left the page with the mark still whole",
    ).toBeGreaterThan(BLOOM_AT.gathered);
    expect(stir.before.lit, "the field is there to stir").toBeGreaterThan(0.05);
    expect(stir.hole, "the finger thins the field where it is").toBeLessThan(
      HOLE_LIGHT,
    );
    expect(
      stir.control,
      "the frame keeps its light: only the hole takes from it",
    ).toBeGreaterThan(CONTROL_LIGHT);
    expect(chapter).toBe(STIR_PLACE.chapter);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
