import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import type { ShapeId } from "../../src/engine/story";
import { WORK_SHAPES } from "../../src/engine/story";
import { packAtlas } from "../../src/engine/runtime/atlas";
import {
  SHEET_FIT,
  WAVE_AMPLITUDE,
  WAVE_THICKNESS,
  fitScale,
} from "../../src/engine/runtime/story";
import { median, percentile } from "../../src/engine/tier/probe";
import type { ChapterId } from "../../src/engine/types";
import { PASS_MEDIAN_MS, readSurface, watchErrors } from "./frame-times";
import { pixelStats, type Box } from "./pixels";

// The chapters' choreography on a real GPU, headed, on the development page:
// each chapter state drawn on forced tier 1 (1,000,000 particles, WebGPU)
// and forced tier 2 (250,000, WebGL2), its light where the chapter puts it,
// and its frame times over a short window. Then calm: one still per chapter
// and per study, drawn again only when that changes.

const VIEW = '[data-testid="engine-view"]';
const HOST = `${VIEW} [data-part="host"]`;
const CANVAS = `${HOST} > canvas`;
const WIDTH = 1280;
const HEIGHT = 800;
// The page sends the story before start(), so each formation is seated on
// its targets at the first frame. The wait lets the noise carry the
// particles into their flow around those targets, the three seconds a calm
// still is settled for (runtime/index.ts, SETTLE_STEPS).
const SETTLE_MS = 3_000;
const FRAMES_WARM_UP_MS = 500;
const FRAMES_WINDOW_MS = 3_000;
// Noise, jitter and the sprites' own size reach past a shape's sampled box.
const MARGIN_SHARE = 0.05;
const MARGIN_PX = 8;
// The glow token, the field's brightest colour, has a relative luminance of
// about 0.34, the violet token about 0.22 and the void about 0.002. A pixel
// past this has had violet light piled on it until it turns toward white.
const BURN_LUMINANCE = 0.5;

const TIERS = [
  { tier: 1, count: 1_000_000, backend: "webgpu" },
  { tier: 2, count: 250_000, backend: "webgl2" },
] as const;

const atlas = packAtlas();

interface Case {
  name: string;
  chapter: ChapterId;
  progress: number;
  /** Where nearly all the light must be. */
  inside: Box;
  /** Light inside the box, at least. */
  insideLit: number;
  /** Share of all lit pixels that sit inside the box, at least. */
  share: number;
  /** A formation that must stay clear of the frame's side edges. */
  inFrame: boolean;
}

/** Every chapter state and where its light belongs, for one frame size. */
function casesFor(width: number, height: number): Case[] {
  // Ratios only: half the frame is the aspect wide and 1 high.
  const frame = { halfWidth: width / height, halfHeight: 1 };
  const margin = MARGIN_SHARE * (Math.min(width, height) / 2) + MARGIN_PX;
  const centredBox = (halfWidthPx: number, halfHeightPx: number): Box => ({
    x: width / 2 - halfWidthPx,
    y: height / 2 - halfHeightPx,
    width: halfWidthPx * 2,
    height: halfHeightPx * 2,
  });
  // The box a fitted shape fills on screen, with room for its noise.
  const shapeBox = (id: ShapeId): Box => {
    const extent = atlas.extents[id];
    const scale = fitScale(extent, frame);
    return centredBox(
      ((extent.halfWidth * scale) / frame.halfWidth) * (width / 2) + margin,
      extent.halfHeight * scale * (height / 2) + margin,
    );
  };
  const band = (WAVE_AMPLITUDE + WAVE_THICKNESS) * (height / 2) + margin;

  return [
    {
      name: "hero: one small dot at the centre",
      chapter: "hero",
      progress: 0,
      // The dot is about 9 px across its radius at these sizes.
      inside: centredBox(16, 16),
      insideLit: 0.15,
      share: 0.97,
      inFrame: true,
    },
    {
      name: "bloom 0.6: the T7SEN mark",
      chapter: "bloom",
      progress: 0.6,
      inside: shapeBox("logo"),
      insideLit: 0.05,
      share: 0.9,
      inFrame: true,
    },
    ...WORK_SHAPES.map((id, index) => ({
      name: `work step ${index}: ${id}`,
      chapter: "work" as const,
      progress: (index + 0.5) / WORK_SHAPES.length,
      inside: shapeBox(id),
      insideLit: 0.05,
      share: 0.85,
      inFrame: true,
    })),
    {
      name: "making-of 0.5: the flat sheet",
      chapter: "making-of",
      progress: 0.5,
      inside: centredBox(
        SHEET_FIT * (width / 2) + margin,
        SHEET_FIT * (height / 2) + margin,
      ),
      insideLit: 0.05,
      share: 0.9,
      inFrame: true,
    },
    {
      name: "about 0.5: the wave's band",
      chapter: "about",
      progress: 0.5,
      inside: { x: 0, y: height / 2 - band, width, height: 2 * band },
      insideLit: 0.05,
      share: 0.9,
      // The band runs across the frame and past both sides by design.
      inFrame: false,
    },
  ];
}

// A formation inside the frame leaves the outer columns dark.
const EDGE_PX = 6;
const EDGE_LIT = 0.002;

/** Captures the host and measures where its light is. */
async function frameOf(
  page: Page,
  entry: Case,
  width: number,
  height: number,
  path: string,
) {
  const host = page.locator(HOST);
  expect(await host.boundingBox()).toEqual({ x: 0, y: 0, width, height });
  const png = await host.screenshot();
  writeFileSync(path, png);
  const whole = await pixelStats(page, png);
  const inside = await pixelStats(page, png, [entry.inside]);
  const sides = await pixelStats(page, png, [
    { x: 0, y: 0, width: EDGE_PX, height },
    { x: width - EDGE_PX, y: 0, width: EDGE_PX, height },
  ]);
  const litWhole = whole.litShare * whole.pixels;
  const share =
    litWhole === 0 ? 0 : (inside.litShare * inside.pixels) / litWhole;
  return { whole, inside, sides, litWhole, share };
}

function expectFrame(
  entry: Case,
  {
    whole,
    inside,
    sides,
    litWhole,
    share,
  }: Awaited<ReturnType<typeof frameOf>>,
) {
  expect(litWhole, `${entry.name}: something is drawn`).toBeGreaterThan(50);
  expect(
    share,
    `${entry.name}: the light sits in its box`,
  ).toBeGreaterThanOrEqual(entry.share);
  expect(inside.litShare, `${entry.name}: the box is lit`).toBeGreaterThan(
    entry.insideLit,
  );
  if (entry.inFrame) {
    expect(
      sides.litShare,
      `${entry.name}: clear of the frame's side edges`,
    ).toBeLessThan(EDGE_LIT);
  }
  expect(
    whole.maxLuminance,
    `${entry.name}: no light piles up to white`,
  ).toBeLessThan(BURN_LUMINANCE);
}

async function open(page: Page, query: string) {
  await page.goto(`/engine?${query}`);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
}

function settled(page: Page, tier: 1 | 2) {
  return page.locator(`${VIEW}[data-tier="${tier}"][data-ready="true"]`);
}

/** requestAnimationFrame intervals over a short window, after a warm-up. */
async function shortFrames(page: Page) {
  const deltas = await page.evaluate(
    ({ warmUpMs, windowMs }) =>
      new Promise<number[]>((resolve) => {
        const found: number[] = [];
        let start: number | null = null;
        let last = 0;
        const tick = (now: number) => {
          if (start === null) start = now;
          else found.push(now - last);
          last = now;
          if (now - start >= windowMs) resolve(found);
          else requestAnimationFrame(tick);
        };
        window.setTimeout(() => requestAnimationFrame(tick), warmUpMs);
      }),
    { warmUpMs: FRAMES_WARM_UP_MS, windowMs: FRAMES_WINDOW_MS },
  );
  return {
    frames: deltas.length,
    medianMs: median(deltas),
    p95Ms: percentile(deltas, 0.95),
  };
}

// ?stage=split sends the stages a wide home page sends (engine-view.tsx,
// SPLIT_STAGES): the dot at y -0.6, the work stage at x 0.45 with halves
// 0.45 and 0.9, in normalised device coordinates (D-065).
function splitCases(width: number, height: number): Case[] {
  const px = (x: number, y: number) => ({
    x: ((x + 1) / 2) * width,
    y: ((1 - y) / 2) * height,
  });
  const dot = px(0, -0.6);
  const stage = px(0.45, 0);
  const margin = MARGIN_SHARE * (Math.min(width, height) / 2) + MARGIN_PX;
  const halfWidth = 0.45 * (width / 2) + margin;
  const halfHeight = 0.9 * (height / 2) + margin;
  return [
    {
      name: "hero, staged: the dot low in the frame",
      chapter: "hero",
      progress: 0,
      inside: { x: dot.x - 16, y: dot.y - 16, width: 32, height: 32 },
      insideLit: 0.15,
      share: 0.97,
      inFrame: true,
    },
    {
      name: "work step 1, staged: coup-online in the inline-end half",
      chapter: "work",
      progress: 1.5 / WORK_SHAPES.length,
      inside: {
        x: stage.x - halfWidth,
        y: stage.y - halfHeight,
        width: halfWidth * 2,
        height: halfHeight * 2,
      },
      insideLit: 0.05,
      share: 0.85,
      inFrame: true,
    },
  ];
}

for (const { tier, count } of TIERS) {
  test(`REQ-SCR-01 REQ-SCR-07 REQ-ENG-05 a staged dot and a staged study shape draw inside their stages on forced tier ${tier}, ${count} particles`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { errors } = watchErrors(page);
    for (const [index, entry] of splitCases(WIDTH, HEIGHT).entries()) {
      await open(
        page,
        `tier=${tier}&count=${count}&bare=1&stage=split&chapter=${entry.chapter}&progress=${entry.progress}`,
      );
      await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
      await expect(page.locator(VIEW)).toHaveAttribute("data-stage", "split");
      await page.waitForTimeout(SETTLE_MS);
      const measured = await frameOf(
        page,
        entry,
        WIDTH,
        HEIGHT,
        testInfo.outputPath(`staged-tier-${tier}-${index}.png`),
      );
      console.log(
        `story staged tier ${tier} ${entry.name}: lit pixels ${measured.litWhole}, ` +
          `${(measured.share * 100).toFixed(1)}% inside the box, lit share inside ` +
          `${measured.inside.litShare.toFixed(4)}, brightest ${measured.whole.brightest}`,
      );
      expectFrame(entry, measured);
    }
    expect(errors).toEqual([]);
  });
}

for (const { tier, count, backend } of TIERS) {
  test(`REQ-SCR-01 REQ-SCR-05 REQ-SCR-07 REQ-ENG-05 every chapter state draws where it should on forced tier ${tier}, ${count} particles`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(300_000);
    const { errors } = watchErrors(page);
    const lines: string[] = [];

    for (const [index, entry] of casesFor(WIDTH, HEIGHT).entries()) {
      await open(
        page,
        `tier=${tier}&count=${count}&bare=1&chapter=${entry.chapter}&progress=${entry.progress}`,
      );
      await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
      await expect(page.locator(VIEW)).toHaveAttribute(
        "data-chapter",
        entry.chapter,
      );
      await page.waitForTimeout(SETTLE_MS);

      const measured = await frameOf(
        page,
        entry,
        WIDTH,
        HEIGHT,
        testInfo.outputPath(`tier-${tier}-${index}.png`),
      );
      const { whole, inside, sides, litWhole, share } = measured;
      const frames = await shortFrames(page);

      const line =
        `story tier ${tier} ${entry.name}: lit pixels ${litWhole}, ` +
        `${(share * 100).toFixed(1)}% inside the box ` +
        `${Math.round(entry.inside.width)} x ${Math.round(entry.inside.height)}, ` +
        `lit share inside ${inside.litShare.toFixed(4)}, at the side edges ${sides.litShare.toFixed(4)}, brightest ${whole.brightest}; ` +
        `frames ${frames.frames}, median ${frames.medianMs.toFixed(2)} ms, ` +
        `p95 ${frames.p95Ms.toFixed(2)} ms`;
      console.log(line);
      lines.push(line);

      expectFrame(entry, measured);
      expect(frames.medianMs, `${entry.name}: frame time`).toBeLessThanOrEqual(
        PASS_MEDIAN_MS[tier],
      );
    }

    // Contact is the field at rest again: every quarter lit.
    await open(
      page,
      `tier=${tier}&count=${count}&bare=1&chapter=contact&progress=0.5`,
    );
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(SETTLE_MS);
    const rest = await page.locator(HOST).screenshot();
    writeFileSync(testInfo.outputPath(`tier-${tier}-contact.png`), rest);
    const half = { width: WIDTH / 2, height: HEIGHT / 2 };
    const quarters: number[] = [];
    for (const [x, y] of [
      [0, 0],
      [half.width, 0],
      [0, half.height],
      [half.width, half.height],
    ] as const) {
      quarters.push(
        (await pixelStats(page, rest, [{ x, y, ...half }])).litShare,
      );
    }
    const restFrames = await shortFrames(page);
    const restLine = `story tier ${tier} contact 0.5: lit share per quarter ${quarters
      .map((value) => value.toFixed(4))
      .join(
        ", ",
      )}; frames ${restFrames.frames}, median ${restFrames.medianMs.toFixed(2)} ms, p95 ${restFrames.p95Ms.toFixed(2)} ms`;
    console.log(restLine);
    lines.push(restLine);
    for (const value of quarters) expect(value).toBeGreaterThan(0.05);
    expect(restFrames.medianMs).toBeLessThanOrEqual(PASS_MEDIAN_MS[tier]);

    const surface = await readSurface(page, CANVAS);
    const facts = `story tier ${tier}: ${surface.backend} on ${surface.gpu}, canvas ${surface.width} x ${surface.height}, browser ${browser.version()}`;
    console.log(facts);
    testInfo.annotations.push(
      { type: "story", description: facts },
      ...lines.map((description) => ({ type: "story", description })),
    );
    expect(surface.backend).toBe(backend);
    expect(surface.isSoftware).toBe(false);
    expect(errors).toEqual([]);
  });
}

test("REQ-SCR-01 REQ-TIER-02 on a portrait phone frame, 375 x 812, forced tier 2 with 100,000 particles keeps every formation inside the frame", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const { errors } = watchErrors(page);
  const width = 375;
  const height = 812;
  await page.setViewportSize({ width, height });

  for (const [index, entry] of casesFor(width, height).entries()) {
    await open(
      page,
      `tier=2&count=100000&bare=1&chapter=${entry.chapter}&progress=${entry.progress}`,
    );
    await expect(settled(page, 2)).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(SETTLE_MS);
    const measured = await frameOf(
      page,
      entry,
      width,
      height,
      testInfo.outputPath(`portrait-${index}.png`),
    );
    console.log(
      `story portrait ${entry.name}: lit pixels ${measured.litWhole}, ` +
        `${(measured.share * 100).toFixed(1)}% inside the box ` +
        `${Math.round(entry.inside.width)} x ${Math.round(entry.inside.height)}, ` +
        `at the side edges ${measured.sides.litShare.toFixed(4)}, brightest ${measured.whole.brightest}`,
    );
    expectFrame(entry, measured);
  }
  expect(errors).toEqual([]);
});

test("REQ-ENG-05 the transform feedback limit on forced tier 2, printed", async ({
  page,
}, testInfo) => {
  const { errors } = watchErrors(page);
  await open(page, "tier=2&count=250000&bare=1&chapter=bloom&progress=0.6");
  await expect(settled(page, 2)).toHaveCount(1, { timeout: 90_000 });
  const limits = await page.locator(CANVAS).evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    // The canvas already holds the field's WebGL2 context, so this is that
    // same context, not a new one.
    const gl = canvas.getContext("webgl2");
    if (gl === null) return null;
    return {
      separateAttributes: Number(
        gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS),
      ),
      separateComponents: Number(
        gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS),
      ),
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    };
  });
  const line = `tier 2 limits: MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS ${limits?.separateAttributes}, MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS ${limits?.separateComponents}, MAX_TEXTURE_SIZE ${limits?.maxTextureSize}`;
  console.log(line);
  testInfo.annotations.push({ type: "limits", description: line });
  // The compute node keeps three storage buffers; WebGL2 promises at least 4.
  expect(limits?.separateAttributes ?? 0).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

for (const { tier, count } of TIERS) {
  test(`REQ-A11Y-03 REQ-A11Y-04 calm on tier ${tier} draws one still per chapter and per study, and nothing for a scroll inside one`, async ({
    page,
  }) => {
    const { errors } = watchErrors(page);
    await open(
      page,
      `tier=${tier}&count=${count}&calm=1&chapter=work&progress=0.1`,
    );
    await expect(settled(page, tier)).toBeVisible({ timeout: 90_000 });
    const canvas = page.locator(CANVAS);
    await canvas.scrollIntoViewIfNeeded();
    const progress = page.getByRole("slider", { name: "Progress" });
    const chapter = page.getByRole("combobox", { name: "Chapter" });
    const view = page.locator(VIEW);
    const events = async () => Number(await view.getAttribute("data-events"));

    await page.waitForTimeout(1_000);
    const first = await canvas.screenshot();
    const eventsAtFirst = await events();

    // The same study: nothing is drawn again.
    await progress.fill("0.15");
    await expect(view).toHaveAttribute("data-progress", "0.15");
    await page.waitForTimeout(600);
    const sameStudy = await canvas.screenshot();
    expect(
      sameStudy.equals(first),
      "a scroll inside one study redraws nothing",
    ).toBe(true);

    // The next study: one new still.
    await progress.fill("0.3");
    await page.waitForTimeout(600);
    const nextStudy = await canvas.screenshot();
    expect(nextStudy.equals(first), "the next study is a new still").toBe(
      false,
    );
    await page.waitForTimeout(600);
    expect(
      (await canvas.screenshot()).equals(nextStudy),
      "and it stays still",
    ).toBe(true);

    // Another chapter: one new still.
    await chapter.selectOption("about");
    await page.waitForTimeout(600);
    const about = await canvas.screenshot();
    expect(about.equals(nextStudy), "a new chapter is a new still").toBe(false);
    await progress.fill("0.9");
    await page.waitForTimeout(600);
    expect(
      (await canvas.screenshot()).equals(about),
      "a scroll inside the chapter redraws nothing",
    ).toBe(true);

    const stats = await pixelStats(page, about);
    console.log(
      `story calm tier ${tier}: about still lit share ${stats.litShare.toFixed(4)}, brightest ${stats.brightest}`,
    );
    expect(stats.litShare).toBeGreaterThan(0.005);
    expect(await events(), "calm sends no frameRate event").toBe(eventsAtFirst);
    expect(errors).toEqual([]);
  });
}

for (const { tier, count } of TIERS) {
  test(`REQ-SCR-07 REQ-SCR-05 on tier ${tier} the field leaves the dot in a bloom without piling its light to white`, async ({
    page,
  }, testInfo) => {
    const { errors } = watchErrors(page);
    await open(page, `tier=${tier}&count=${count}&chapter=hero&progress=0`);
    await expect(settled(page, tier)).toBeVisible({ timeout: 90_000 });
    const canvas = page.locator(CANVAS);
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_000);

    // Scrolled down through the bloom's first third, about a second for
    // each tenth, the way a reader moves.
    const progress = page.getByRole("slider", { name: "Progress" });
    await page.getByRole("combobox", { name: "Chapter" }).selectOption("bloom");
    let brightest = 0;
    let brightestAt = "";
    let shot = 0;
    for (const value of ["0.05", "0.1", "0.15", "0.2", "0.25", "0.3", "0.35"]) {
      await progress.fill(value);
      for (const wait of [150, 350, 500]) {
        await page.waitForTimeout(wait);
        const png = await canvas.screenshot();
        const stats = await pixelStats(page, png);
        if (stats.maxLuminance > brightest) {
          brightest = stats.maxLuminance;
          brightestAt = `progress ${value}, ${wait} ms after, ${stats.brightest}`;
          writeFileSync(
            testInfo.outputPath(`bloom-${tier}-brightest.png`),
            png,
          );
        }
        if (wait === 500) {
          writeFileSync(testInfo.outputPath(`bloom-${tier}-${shot}.png`), png);
          shot += 1;
        }
      }
    }
    await page.waitForTimeout(2_000);
    const open_ = await pixelStats(page, await canvas.screenshot());
    console.log(
      `story bloom tier ${tier}: brightest luminance while the field left the dot ${brightest.toFixed(4)} (${brightestAt}); lit share once released ${open_.litShare.toFixed(4)}`,
    );
    expect(brightest).toBeLessThan(BURN_LUMINANCE);
    expect(
      open_.litShare,
      "the field fills the frame once released",
    ).toBeGreaterThan(0.1);
    expect(errors).toEqual([]);
  });
}
