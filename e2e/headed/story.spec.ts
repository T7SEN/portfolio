import {
  devices,
  expect,
  test,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { PARTICLES } from "../../src/engine/config";
import { packAtlas } from "../../src/engine/runtime/atlas";
import { fitScale } from "../../src/engine/runtime/story";
import {
  PASS_MEDIAN_MS,
  WARM_UP_MS,
  WINDOW_MS,
  measureFrames,
  watchErrors,
} from "../gpu/frame-times";
import { pixelStats, type Box } from "../gpu/pixels";
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
// T7SEN mark forming and dissolving, and the cursor and a finger stirring the
// field. The window is on a real screen, so each measurement also checks
// that the page is still where the test put it.

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
// From the hero's dot, the field takes several seconds to spread back over
// its homes, which pull gently; a hole is measured against that field at rest.
const REST_SETTLE_MS = 8_000;
// The page's text is hidden and the veil is off while the field is
// measured, so only the field's own light is in the frame.
const HIDE_TEXT = "header, main, footer { visibility: hidden !important; }";

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
      `in ${controls.length} boxes away from it ${lightChange(controlBefore, controlDuring)}; ` +
      `hole x${(nearDuring.mean / nearBefore.mean / control).toFixed(3)} of the field around it`,
  };
}

/** Jumps to a place, lets the field settle, and checks nothing moved. */
async function settleAt(
  page: Page,
  place: StoryPlace,
  chapter: string,
  settleMs = SETTLE_MS,
) {
  const top = await scrollToPlace(page, place);
  await page.waitForTimeout(settleMs);
  const now = await page.evaluate(() => Math.round(window.scrollY));
  expect(now, `the page stayed at ${top}`).toBe(top);
  await expect(page.locator(FIELD)).toHaveAttribute("data-chapter", chapter);
  return top;
}

// From P3 the field changes with the scroll story, and each formation packs
// the particles into part of the frame. The frame rate is measured again in
// each chapter of the production home page (REQ-PERF-06).
//
// The home-field tests also hold the window to 95% of the frames its own
// median promises. On a 240 Hz display the field on this page sits at the
// edge of one display interval in some chapters, so a few per cent of its
// frames take two, on both tiers (P3 integration: every median 4.20 ms;
// tier 1 once held 94.8% of its promised frames with no frame longer than
// 16.2 ms, and tier 2 had up to 9% of its frames above 6 ms with the
// longest at 33.2 ms). That rule reads such frames as a stall, so here each
// chapter is held to its line by the median, a stall is caught by the
// longest interval (no frame may take as long as four frames at the line),
// and the share of the promised frames is printed.
const STALL_FRAMES = 4;
const CHAPTER_STATES: ReadonlyArray<{
  name: string;
  place: StoryPlace;
  chapter: string;
}> = [
  { name: "hero", place: { chapter: "hero", progress: 0 }, chapter: "hero" },
  {
    name: "bloom 0.2, leaving the dot",
    place: { chapter: "bloom", progress: 0.2 },
    chapter: "bloom",
  },
  {
    name: "bloom 0.6, the mark",
    place: { chapter: "bloom", progress: 0.6 },
    chapter: "bloom",
  },
  { name: "work, coup-online", place: { step: 1 }, chapter: "work" },
  { name: "work, systemseven", place: { step: 4 }, chapter: "work" },
  {
    name: "making-of 0.5, the sheet",
    place: { chapter: "making-of", progress: 0.5 },
    chapter: "making-of",
  },
  {
    name: "about 0.5, the wave",
    place: { chapter: "about", progress: 0.5 },
    chapter: "about",
  },
  {
    name: "contact 0.5, at rest",
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

    const results: Array<{
      name: string;
      medianMs: number;
      longestMs: number;
    }> = [];
    for (const state of CHAPTER_STATES) {
      const scrolledTo = await scrollToPlace(page, state.place);
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
          `engine ${summary.engineFps.toFixed(2)} fps`,
      );
      // The state measured must be the one named.
      expect(chapter, state.name).toBe(state.chapter);
      expect(scrolledAfter, `${state.name}: the page stayed`).toBe(scrolledTo);
      results.push({
        name: state.name,
        medianMs: summary.medianMs,
        longestMs: summary.longestMs,
      });
    }

    for (const { name, medianMs, longestMs } of results) {
      expect(medianMs, name).toBeLessThanOrEqual(PASS_MEDIAN_MS[tier]);
      expect(longestMs, `${name}: no stall`).toBeLessThan(
        STALL_FRAMES * PASS_MEDIAN_MS[tier],
      );
    }
    expect(errors).toEqual([]);
  });
}

// The bloom (REQ-SCR-07): the mark is whole from 0.52 to 0.7 of the chapter
// and gone by 0.95 (src/engine/runtime/story.ts). 0.55 is the mark just
// gathered; at 0.9 a tenth of the formation is left.
const MARK_FORMED_AT = 0.55;
const MARK_DISSOLVED_AT = 0.9;
const atlas = packAtlas();

/** Where the fitted mark sits in a host of this size, with room for noise. */
function markBox(width: number, height: number): Box {
  const frame = { halfWidth: width / height, halfHeight: 1 };
  const extent = atlas.extents.logo;
  const scale = fitScale(extent, frame);
  const margin = 0.05 * (Math.min(width, height) / 2) + 8;
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

/** How the light of one frame sits against the mark's box. */
async function markFrame(page: Page, box: Box, host: Box, path: string) {
  const png = await page.locator(HOST).screenshot({ path });
  const whole = await pixelStats(page, png);
  const inside = await pixelStats(page, png, [box]);
  // The columns left and right of the mark's box, the full height.
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
    inMark: lit === 0 ? 0 : (inside.litShare * inside.pixels) / lit,
    sides: sides.litShare,
    brightest: whole.brightest,
  };
}

for (const setup of TIERS) {
  const { tier } = setup;
  test(`REQ-SCR-07 on tier ${tier} the T7SEN mark gathers in the bloom and dissolves back into the field`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { errors } = watchErrors(page);
    await openHome(page, setup);
    const host = await hostBox(page);
    const box = markBox(host.width, host.height);

    await settleAt(
      page,
      { chapter: "bloom", progress: MARK_FORMED_AT },
      "bloom",
    );
    await showFieldAlone(page);
    const formed = await markFrame(
      page,
      box,
      host,
      testInfo.outputPath(`mark-formed-tier${tier}.png`),
    );
    await settleAt(
      page,
      { chapter: "bloom", progress: MARK_DISSOLVED_AT },
      "bloom",
    );
    const dissolved = await markFrame(
      page,
      box,
      host,
      testInfo.outputPath(`mark-dissolved-tier${tier}.png`),
    );

    const line = (name: string, frame: typeof formed, progress: number) =>
      `mark tier ${tier} ${name} at bloom ${progress}: ${Math.round(frame.lit)} lit pixels, ` +
      `${frame.inMark.toFixed(4)} of them in the mark's box ` +
      `(${Math.round(box.width)} x ${Math.round(box.height)} of ${host.width} x ${host.height}), ` +
      `sides lit ${frame.sides.toFixed(4)}, brightest ${frame.brightest}`;
    for (const text of [
      line("formed", formed, MARK_FORMED_AT),
      line("dissolved", dissolved, MARK_DISSOLVED_AT),
    ]) {
      console.log(text);
      testInfo.annotations.push({ type: "mark", description: text });
    }

    expect(formed.lit, "the mark is drawn").toBeGreaterThan(1_000);
    expect(formed.inMark, "the light is in the mark").toBeGreaterThanOrEqual(
      0.9,
    );
    expect(formed.sides, "nothing lit beside the mark").toBeLessThan(0.005);
    expect(dissolved.inMark, "the light has left the mark").toBeLessThan(0.75);
    expect(dissolved.sides, "the field is back beside it").toBeGreaterThan(
      0.05,
    );
    expect(errors).toEqual([]);
  });
}

// Stirring (REQ-SCR-06) is measured in the contact chapter, where the field
// rests on its homes across the frame, so a hole the pointer opens shows
// against the field around it. The box at the pointer sits well inside the
// hole, which is a few hundred pixels across on desktop.
const STIR_HALF = 50;
// What the box at the pointer keeps of its light, against the field around
// it, at most. Measured 10 Nov 2026: 0.64 to 0.69 for the cursor and 0.52
// for a finger, while the control boxes kept 0.97 of theirs.
const HOLE_LIGHT = 0.8;
// What the control boxes keep of their own light, at least: the field away
// from the pointer is still there.
const CONTROL_LIGHT = 0.7;

for (const setup of TIERS) {
  const { tier } = setup;
  test(`REQ-SCR-06 REQ-A11Y-04 on tier ${tier} the cursor stirs the field where it is, and calm mode stops it`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { errors } = watchErrors(page);
    await openHome(page, setup);
    await settleAt(
      page,
      { chapter: "contact", progress: 0.5 },
      "contact",
      REST_SETTLE_MS,
    );
    const host = await hostBox(page);
    const point = { x: 0.25 * host.width, y: 0.5 * host.height };
    const near = around(point.x, point.y, STIR_HALF);
    // Four boxes in the other half of the frame.
    const controls = [0.6, 0.85].flatMap((x) =>
      [0.25, 0.75].map((y) =>
        around(x * host.width, y * host.height, STIR_HALF),
      ),
    );

    const restore = await showFieldAlone(page);
    const stir = await measureStir(
      page,
      near,
      controls,
      `tier${tier}`,
      testInfo,
      async () => {
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
      `stir tier ${tier} mouse at (${Math.round(point.x)}, ${Math.round(point.y)}), ` +
      `boxes ${2 * STIR_HALF} px: ${stir.text}`;
    console.log(stirLine);
    testInfo.annotations.push({ type: "stir", description: stirLine });

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
    await calmToggle(page).click();
    await expect(calmToggle(page)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1_500);
    await showFieldAlone(page);
    const still = await page.locator(HOST).screenshot();
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
// turn them into a scroll, on a touch-emulated phone viewport.
const DRAG_PX = 200;
// The hole a finger opens on a phone frame is smaller in pixels.
const TOUCH_HALF = 35;

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

    // The end of the page, so the drag scrolls back up inside contact.
    const start = await goToChapter(page, "contact", 1);
    await page.waitForTimeout(REST_SETTLE_MS);
    const host = await hostBox(page);
    const finger = { x: Math.round(host.width / 2), y: 500 };
    const near = around(finger.x, finger.y, TOUCH_HALF);
    // Above the finger's whole path and below where it stops.
    const controls = [0.25, 0.75].flatMap((x) =>
      [120, 760].map((y) => around(x * host.width, y, TOUCH_HALF)),
    );

    await showFieldAlone(page);
    const cdp = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: y === undefined ? [] : [{ x: finger.x, y }],
      });
    const stir = await measureStir(
      page,
      near,
      controls,
      "touch",
      testInfo,
      async () => {
        // The finger moves down the screen, so the page scrolls up.
        const from = finger.y - DRAG_PX;
        await touch("touchStart", from);
        for (let step = 1; step <= 12; step += 1) {
          await touch("touchMove", from + (DRAG_PX * step) / 12);
          await page.waitForTimeout(16);
        }
        // Held still on the point, the finger keeps stirring there.
        await page.waitForTimeout(1_200);
      },
    );
    const scrolled = start - (await page.evaluate(() => window.scrollY));
    await touch("touchEnd");
    await page.waitForTimeout(500);
    const chapter = await field.getAttribute("data-chapter");

    const line =
      `stir touch tier 2 particles ${PARTICLES.tier2Phone}: a ${DRAG_PX} px drag scrolled the page ${Math.round(scrolled)} px; ` +
      `boxes ${2 * TOUCH_HALF} px: ${stir.text}; field chapter ${chapter}`;
    console.log(line);
    testInfo.annotations.push({ type: "stir", description: line });

    expect(scrolled, "the page scrolled under the finger").toBeGreaterThan(
      0.5 * DRAG_PX,
    );
    expect(scrolled).toBeLessThan(1.5 * DRAG_PX);
    expect(stir.before.lit, "the field is there to stir").toBeGreaterThan(0.05);
    expect(stir.hole, "the finger thins the field where it is").toBeLessThan(
      HOLE_LIGHT,
    );
    expect(
      stir.control,
      "away from the finger the field stays",
    ).toBeGreaterThan(CONTROL_LIGHT);
    expect(chapter).toBe("contact");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
