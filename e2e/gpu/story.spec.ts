import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import type { ShapeId } from "../../src/engine/story";
import { WORK_SHAPES } from "../../src/engine/story";
import { packAtlas } from "../../src/engine/runtime/atlas";
import {
  HALO_REACH_PX,
  HERO_DOT_PX,
  gridFor,
} from "../../src/engine/runtime/halftone-rules";
import {
  BLOOM_MARK_AT,
  RINGS,
  bloomStage,
  calmProgress,
  fitScale,
  stagedFrame,
  strandsBand,
} from "../../src/engine/runtime/story";
import { median, percentile } from "../../src/engine/tier/probe";
import type { ChapterId, Stage } from "../../src/engine/types";
import { PASS_MEDIAN_MS, readSurface, watchErrors } from "./frame-times";
import {
  cellStats,
  pixelStats,
  ringShare,
  type Box,
  type CellStats,
  type Lattice,
} from "./pixels";

// The chapters' choreography on a real GPU, headed, on the development page:
// each chapter state drawn on forced tier 1 (1,000,000 particles, WebGPU)
// and forced tier 2 (250,000, WebGL2) in the halftone look, its light where
// the chapter puts it, the burn rule held cell by cell, and its frame times
// over a short window. Then calm: one still per chapter and per study. Then
// the soft fallback look, which ?look=soft forces (rule A11).

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
// Noise, jitter and the dots' own lattice reach past a shape's sampled box:
// a point lands in the cell it falls in, up to most of a cell from it.
const MARGIN_SHARE = 0.05;
const MARGIN_PX = 16;

// The burn rule for the halftone (the P3.5 plan, part A): white dots are
// part of the look, so a single pixel may be near white. What must not
// happen is light piling up. The brightest 8 px cell's mean relative
// luminance stays under 0.5 (the glow token is about 0.34, the near-white
// text token about 0.85), and white cells stay a small share of the lit
// cells and of the frame.
const BURN_CELL_MEAN = 0.5;
// The two shares, set from the runs of 12 Nov 2026 on this PC (RTX 4060 Ti,
// Chromium 158) across every state below on both tiers and the portrait
// frame: white cells reached 21.6% of the lit cells (the wordmark, whose
// rims are white) and 4.15% of all cells (Coup Online's front card, whose
// outline is white, now that each study shape is drawn as outlines over its
// front layer's fill; ArcheLab's lines were four-cell white bars at 5.2%
// before, 1.8% now). Each limit sits a little over the worst measured, no
// more. The brightest cell mean reached 0.336 (the hero dot's own disc on
// the portrait frame).
const WHITE_OF_LIT = 0.25;
const WHITE_OF_ALL = 0.045;

const TIERS = [
  { tier: 1, count: 1_000_000, backend: "webgpu" },
  { tier: 2, count: 250_000, backend: "webgl2" },
] as const;

// The bloom's states (runtime/story.ts, BLOOM_AT): the T7 mark in the
// middle of its hold, and the wordmark at the calm still, the middle of its
// own hold.
const MARK_AT = BLOOM_MARK_AT;
const WORDMARK_AT = calmProgress("bloom", 0);
// The share of the frame's light inside the wordmark's box, at least, one
// limit per frame shape: half the lines that may keep go on streaming round
// the wordmark, past both sides of the frame by design, and on a portrait
// frame they cross more of it. Measured on 12 Nov 2026 on this PC: 0.959 on
// the landscape frame on tiers 1 and 2, and 0.908 on the portrait phone
// frame with the wordmark across its whole width (0.85 in the middle 0.8 of
// it, when the line was 0.5). The limits sit a little under each.
const WORDMARK_SHARE = { landscape: 0.9, portrait: 0.85 } as const;

const atlas = packAtlas();

/** The halftone lattice of a canvas this many CSS px across, at ratio 1. */
function latticeOf(width: number, height: number): Lattice {
  const grid = gridFor(width, height);
  return { cell: grid.cell, padX: grid.padX, padY: grid.padY };
}

interface Case {
  name: string;
  chapter: ChapterId;
  progress: number;
  /** More of the development page's query, such as ?pass. */
  query?: string;
  /**
   * A shape the field forms inside the making-of stage the page sends
   * (data-making-of): its box is worked out once the stage is read, and is
   * where nearly all the light must be.
   */
  stagedShape?: ShapeId;
  /** Where nearly all the light must be. */
  inside?: Box;
  /** Light inside the box, at least. */
  insideLit?: number;
  /** Share of all lit pixels that sit inside the box, at least. */
  share?: number;
  /** A box the solid hero dot fills. */
  core?: Box;
  /** The contact rings, round the frame's centre. */
  rings?: boolean;
  /** A formation that must stay clear of the frame's side edges. */
  inFrame: boolean;
}

function around(x: number, y: number, half: number): Box {
  return { x: x - half, y: y - half, width: 2 * half, height: 2 * half };
}

function marginFor(width: number, height: number): number {
  return MARGIN_SHARE * (Math.min(width, height) / 2) + MARGIN_PX;
}

/** The box a shape fitted to a stage fills on screen, with room for its noise. */
function shapeBoxIn(
  id: ShapeId,
  stage: Stage | undefined,
  width: number,
  height: number,
): Box {
  // Ratios only: half the frame is the aspect wide and 1 high.
  const frame = { halfWidth: width / height, halfHeight: 1 };
  const staged = stagedFrame(stage, frame);
  const extent = atlas.extents[id];
  const scale = fitScale(extent, staged.frame);
  const margin = marginFor(width, height);
  const halfWidth =
    ((extent.halfWidth * scale) / frame.halfWidth) * (width / 2) + margin;
  const halfHeight = extent.halfHeight * scale * (height / 2) + margin;
  const centreX = ((staged.centreX / frame.halfWidth + 1) / 2) * width;
  const centreY = ((1 - staged.centreY / frame.halfHeight) / 2) * height;
  return {
    x: centreX - halfWidth,
    y: centreY - halfHeight,
    width: 2 * halfWidth,
    height: 2 * halfHeight,
  };
}

/** Every chapter state and where its light belongs, for one frame size. */
function casesFor(width: number, height: number): Case[] {
  const frame = { halfWidth: width / height, halfHeight: 1 };
  const bloom = bloomStage(width / height);
  const margin = marginFor(width, height);
  const strands = strandsBand(frame);
  const band = strands.halfHeight * (height / 2) + margin;
  const bandMiddle = height / 2 - strands.centreY * (height / 2);

  return [
    {
      // The development page sends no hero stage, so the halo reaches its
      // own default (halftone-rules.ts HALO_REACH_PX) round the centre.
      name: "hero: the dot, its rings and its halo at the centre",
      chapter: "hero",
      progress: 0,
      inside: around(width / 2, height / 2, HALO_REACH_PX + MARGIN_PX),
      share: 0.97,
      core: around(width / 2, height / 2, HERO_DOT_PX - 3),
      inFrame: true,
    },
    {
      name: `bloom ${MARK_AT}: the T7 mark`,
      chapter: "bloom",
      progress: MARK_AT,
      inside: shapeBoxIn("logo", bloom, width, height),
      insideLit: 0.05,
      share: 0.9,
      inFrame: true,
    },
    {
      name: `bloom ${WORDMARK_AT}: the T7SEN wordmark with the lines round it`,
      chapter: "bloom",
      progress: WORDMARK_AT,
      inside: shapeBoxIn("wordmark", bloom, width, height),
      insideLit: 0.05,
      share:
        width >= height ? WORDMARK_SHARE.landscape : WORDMARK_SHARE.portrait,
      inFrame: false,
    },
    ...WORK_SHAPES.map((id, index) => ({
      name: `work step ${index}: ${id}`,
      chapter: "work" as const,
      progress: (index + 0.5) / WORK_SHAPES.length,
      inside: shapeBoxIn(id, undefined, width, height),
      insideLit: 0.05,
      share: 0.85,
      inFrame: true,
    })),
    {
      // The making-of forms the T7 mark only inside a stage the page sends,
      // the middle pass card's face (runtime/story.ts, stagedTargets).
      // ?pass= lays one flat 4:5 face in the middle, 320 by 400 or 208 by
      // 260 under md, sends its box as that stage and draws one card there;
      // the final pass is the frame behind the face to 2 of 255
      // (e2e/gpu/passes.spec.ts), so the capture is the field's own frame,
      // with the one live card the home page draws in its middle card.
      name: "making-of 0.5: the T7 mark in the middle card's face",
      chapter: "making-of",
      progress: 0.5,
      query: "pass=final",
      stagedShape: "logo",
      insideLit: 0.05,
      share: 0.9,
      inFrame: true,
    },
    {
      name: "about 0.5: the three strands",
      chapter: "about",
      progress: 0.5,
      inside: { x: 0, y: bandMiddle - band, width, height: 2 * band },
      insideLit: 0.02,
      share: 0.9,
      // The strands run across the frame and past both sides by design.
      inFrame: false,
    },
    {
      name: "contact 0.5: the rings round the centre",
      chapter: "contact",
      progress: 0.5,
      rings: true,
      // The outer ring passes the top and bottom of a landscape frame.
      inFrame: false,
    },
  ];
}

// A formation inside the frame leaves the outer columns dark.
const EDGE_PX = 6;
const EDGE_LIT = 0.002;
// A ring is 1 per cent of the shorter half thick each side; its dots snap
// to the lattice and sit at slightly different depths.
const RING_BAND_PX = 16;
const RINGS_SHARE = 0.9;

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
  const inside =
    entry.inside === undefined
      ? null
      : await pixelStats(page, png, [entry.inside]);
  const core =
    entry.core === undefined ? null : await pixelStats(page, png, [entry.core]);
  const sides = await pixelStats(page, png, [
    { x: 0, y: 0, width: EDGE_PX, height },
    { x: width - EDGE_PX, y: 0, width: EDGE_PX, height },
  ]);
  const rings =
    entry.rings === true
      ? await ringShare(page, png, {
          x: width / 2,
          y: height / 2,
          radii: RINGS.map(
            (ring) => (ring.radius * Math.min(width, height)) / 2,
          ),
          band: RING_BAND_PX,
        })
      : null;
  const cells = await cellStats(page, png, latticeOf(width, height));
  const litWhole = whole.litShare * whole.pixels;
  const share =
    inside === null || litWhole === 0
      ? 0
      : (inside.litShare * inside.pixels) / litWhole;
  return { whole, inside, core, sides, rings, cells, litWhole, share };
}

type Measured = Awaited<ReturnType<typeof frameOf>>;

/** The cell figures of a frame as text for a printed line. */
function cellText(cells: CellStats): string {
  return (
    `brightest cell mean ${cells.brightestCellMean.toFixed(4)} at ` +
    `(${Math.round(cells.brightestCellAt.x)}, ${Math.round(cells.brightestCellAt.y)}), ` +
    `white cells ${cells.whiteCells} of ${cells.litCells} lit ` +
    `(${((cells.whiteCells / Math.max(cells.litCells, 1)) * 100).toFixed(2)}%) and of ${cells.cells} ` +
    `(${((cells.whiteCells / Math.max(cells.cells, 1)) * 100).toFixed(2)}%), ` +
    `corner to centre ${cells.cornerToCentre.toFixed(3)}`
  );
}

function measuredText(entry: Case, measured: Measured): string {
  const { whole, inside, core, sides, rings, cells, litWhole, share } =
    measured;
  return (
    `${entry.name}: lit pixels ${Math.round(litWhole)}` +
    (inside === null || entry.inside === undefined
      ? ""
      : `, ${(share * 100).toFixed(1)}% inside the box ` +
        `${Math.round(entry.inside.width)} x ${Math.round(entry.inside.height)}, ` +
        `lit share inside ${inside.litShare.toFixed(4)}`) +
    (core === null ? "" : `, core lit share ${core.litShare.toFixed(4)}`) +
    (rings === null
      ? ""
      : `, ${(rings.share * 100).toFixed(1)}% of the light on the rings`) +
    `, at the side edges ${sides.litShare.toFixed(4)}, brightest pixel ${whole.brightest} ` +
    `(${whole.maxLuminance.toFixed(4)}); ${cellText(cells)}`
  );
}

/** The burn rule, cell by cell. */
function expectNoBurn(name: string, cells: CellStats) {
  expect(
    cells.brightestCellMean,
    `${name}: no cell's light piles up toward white`,
  ).toBeLessThan(BURN_CELL_MEAN);
  expect(
    cells.whiteCells / Math.max(cells.litCells, 1),
    `${name}: white cells as a share of the lit cells`,
  ).toBeLessThan(WHITE_OF_LIT);
  expect(
    cells.whiteCells / Math.max(cells.cells, 1),
    `${name}: white cells as a share of the frame`,
  ).toBeLessThan(WHITE_OF_ALL);
}

function expectFrame(entry: Case, measured: Measured) {
  const { inside, core, sides, rings, cells, litWhole, share } = measured;
  expect(litWhole, `${entry.name}: something is drawn`).toBeGreaterThan(50);
  if (inside !== null && entry.share !== undefined) {
    expect(
      share,
      `${entry.name}: the light sits in its box`,
    ).toBeGreaterThanOrEqual(entry.share);
  }
  if (inside !== null && entry.insideLit !== undefined) {
    expect(inside.litShare, `${entry.name}: the box is lit`).toBeGreaterThan(
      entry.insideLit,
    );
  }
  if (core !== null) {
    expect(
      core.litShare,
      `${entry.name}: the solid dot is at the centre`,
    ).toBeGreaterThan(0.9);
  }
  if (rings !== null) {
    expect(
      rings.share,
      `${entry.name}: the light lies on the three rings`,
    ).toBeGreaterThan(RINGS_SHARE);
  }
  if (entry.inFrame) {
    expect(
      sides.litShare,
      `${entry.name}: clear of the frame's side edges`,
    ).toBeLessThan(EDGE_LIT);
  }
  expectNoBurn(entry.name, cells);
}

async function open(page: Page, query: string) {
  await page.goto(`/engine?${query}`);
  // The development server's own badge, and the real cursor: on a real
  // screen the mouse may rest over the window, and the host would read it
  // as a pointer that stirs the field. These checks never stir.
  await page.addStyleTag({
    content: `nextjs-portal { display: none; } ${HOST} { pointer-events: none !important; }`,
  });
}

function settled(page: Page, tier: 1 | 2) {
  return page.locator(`${VIEW}[data-tier="${tier}"][data-ready="true"]`);
}

/** A case's own part of the query, after the chapter and progress. */
function queryOf(entry: Case): string {
  return entry.query === undefined ? "" : `&${entry.query}`;
}

/**
 * The case as it is measured: a shape formed in the making-of stage gets its
 * box from the stage the page sent, in normalised device coordinates of the
 * host the canvas fills.
 */
async function resolved(
  page: Page,
  entry: Case,
  width: number,
  height: number,
): Promise<Case> {
  if (entry.stagedShape === undefined) return entry;
  const text = await page.locator(VIEW).getAttribute("data-making-of");
  if (text === null || text === "") {
    throw new Error(`${entry.name}: the page sent no making-of stage`);
  }
  const stage = JSON.parse(text) as Stage;
  return {
    ...entry,
    inside: shapeBoxIn(entry.stagedShape, stage, width, height),
  };
}

/** The drawing buffer's pixel ratio: its width over the canvas's CSS width. */
function ratioOf(page: Page) {
  return page
    .locator(CANVAS)
    .evaluate((element) =>
      element instanceof HTMLCanvasElement
        ? element.width / element.clientWidth
        : 0,
    );
}

/**
 * Waits for the field to be drawn at its full pixel ratio and returns the
 * ratio it had before. A slow start (a cold page on the development server)
 * lowers the ratio to 0.75, and it rises again only after four seconds of
 * fast frames (adaptive.ts, RAISE_AFTER_MS), so a state measured three
 * seconds in may still be drawn small. At 0.75 the faint dots of the lines
 * fall under the lit line while the white ones stay: on 12 Nov 2026 the
 * wordmark measured 444 white of 1732 lit cells (25.6%) at 0.75 and 446 to
 * 457 of 2069 to 2114 (21.1 to 21.9%) at 1. The burn limits are for the
 * full ratio, so each state is measured there.
 */
async function atFullRatio(page: Page): Promise<number> {
  const before = await ratioOf(page);
  await expect
    .poll(() => ratioOf(page), {
      message: "the field is drawn at its full pixel ratio",
      timeout: 15_000,
    })
    .toBe(1);
  return before;
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

// ?stage=split sends fixed stages (engine-view.tsx, SPLIT_STAGES): the dot
// at y -0.6 with no size, so the halo takes its default reach, and the work
// stage at x 0.45 with halves 0.45 and 0.9, in normalised device
// coordinates. The home page sends the frame of the row in view instead,
// moving with the scroll; e2e/headed/story.spec.ts checks that one on the
// production build, since this page has no frame that scrolls.
function splitCases(width: number, height: number): Case[] {
  const px = (x: number, y: number) => ({
    x: ((x + 1) / 2) * width,
    y: ((1 - y) / 2) * height,
  });
  const dot = px(0, -0.6);
  const stage = px(0.45, 0);
  const margin = marginFor(width, height);
  const halfWidth = 0.45 * (width / 2) + margin;
  const halfHeight = 0.9 * (height / 2) + margin;
  return [
    {
      name: "hero, staged: the dot low in the frame",
      chapter: "hero",
      progress: 0,
      inside: around(dot.x, dot.y, HALO_REACH_PX + MARGIN_PX),
      share: 0.97,
      core: around(dot.x, dot.y, HERO_DOT_PX - 3),
      inFrame: true,
    },
    {
      // The shape and the faint lattice across the stage, which the
      // halftone draws as a work stage's frame.
      name: "work step 1, staged: coup-online in the inline-end half",
      chapter: "work",
      progress: 1.5 / WORK_SHAPES.length,
      inside: {
        x: stage.x - halfWidth,
        y: stage.y - halfHeight,
        width: 2 * halfWidth,
        height: 2 * halfHeight,
      },
      insideLit: 0.05,
      share: 0.97,
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
      console.log(`story staged tier ${tier} ${measuredText(entry, measured)}`);
      expectFrame(entry, measured);
    }
    expect(errors).toEqual([]);
  });
}

for (const { tier, count, backend } of TIERS) {
  test(`REQ-SCR-01 REQ-SCR-05 REQ-SCR-07 REQ-ENG-05 every chapter state draws where it should, without burning, on forced tier ${tier}, ${count} particles`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(300_000);
    const { errors } = watchErrors(page);
    const lines: string[] = [];

    for (const [index, listed] of casesFor(WIDTH, HEIGHT).entries()) {
      await open(
        page,
        `tier=${tier}&count=${count}&bare=1&chapter=${listed.chapter}&progress=${listed.progress}${queryOf(listed)}`,
      );
      await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
      await expect(page.locator(VIEW)).toHaveAttribute(
        "data-chapter",
        listed.chapter,
      );
      // No look asked for, so the engine draws the halftone where it can;
      // the ready event reports the count asked for.
      await expect(page.locator(VIEW)).toHaveAttribute("data-look", "");
      await expect(page.locator(VIEW)).toHaveAttribute(
        "data-particles",
        String(count),
      );
      await page.waitForTimeout(SETTLE_MS);
      const ratioBefore = await atFullRatio(page);
      const entry = await resolved(page, listed, WIDTH, HEIGHT);

      const measured = await frameOf(
        page,
        entry,
        WIDTH,
        HEIGHT,
        testInfo.outputPath(`tier-${tier}-${index}.png`),
      );
      const frames = await shortFrames(page);

      const line =
        `story tier ${tier} ${measuredText(entry, measured)}; ` +
        `pixel ratio ${ratioBefore} after the settle, measured at 1; ` +
        `frames ${frames.frames}, median ${frames.medianMs.toFixed(2)} ms, ` +
        `p95 ${frames.p95Ms.toFixed(2)} ms`;
      console.log(line);
      lines.push(line);

      expectFrame(entry, measured);
      expect(frames.medianMs, `${entry.name}: frame time`).toBeLessThanOrEqual(
        PASS_MEDIAN_MS[tier],
      );
    }

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

test("REQ-SCR-01 REQ-TIER-02 on a portrait phone frame, 375 x 812, forced tier 2 with 100,000 particles keeps every formation inside the frame without burning", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const { errors } = watchErrors(page);
  const width = 375;
  const height = 812;
  await page.setViewportSize({ width, height });

  for (const [index, listed] of casesFor(width, height).entries()) {
    await open(
      page,
      `tier=2&count=100000&bare=1&chapter=${listed.chapter}&progress=${listed.progress}${queryOf(listed)}`,
    );
    await expect(settled(page, 2)).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(SETTLE_MS);
    const ratioBefore = await atFullRatio(page);
    const entry = await resolved(page, listed, width, height);
    const measured = await frameOf(
      page,
      entry,
      width,
      height,
      testInfo.outputPath(`portrait-${index}.png`),
    );
    console.log(
      `story portrait ${measuredText(entry, measured)}; pixel ratio ${ratioBefore} after the settle, measured at 1`,
    );
    expectFrame(entry, measured);
  }
  expect(errors).toEqual([]);
});

test("REQ-ENG-05 the transform feedback limit on forced tier 2, printed", async ({
  page,
}, testInfo) => {
  const { errors } = watchErrors(page);
  await open(
    page,
    `tier=2&count=250000&bare=1&chapter=bloom&progress=${WORDMARK_AT}`,
  );
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

    // The same study (the first of three runs to a third of the chapter):
    // nothing is drawn again.
    await progress.fill("0.2");
    await expect(view).toHaveAttribute("data-progress", "0.2");
    await page.waitForTimeout(600);
    const sameStudy = await canvas.screenshot();
    expect(
      sameStudy.equals(first),
      "a scroll inside one study redraws nothing",
    ).toBe(true);

    // The next study: one new still.
    await progress.fill("0.5");
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

// The dot lets the field go over the chapter's first 0.3, and the field
// then gathers into the T7 mark by 0.42 (runtime/story.ts, BLOOM_AT), so
// the sweep runs from the dot through the release into the gathering. Once
// released, the field has left the dot: far more cells are lit than the dot
// and its halo light.
const BLOOM_SWEEP = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
const RELEASED_CELLS = 4;

for (const { tier, count } of TIERS) {
  test(`REQ-SCR-07 REQ-SCR-05 on tier ${tier} the field leaves the dot in a bloom without burning`, async ({
    page,
  }, testInfo) => {
    const { errors } = watchErrors(page);
    await open(page, `tier=${tier}&count=${count}&chapter=hero&progress=0`);
    await expect(settled(page, tier)).toBeVisible({ timeout: 90_000 });
    const canvas = page.locator(CANVAS);
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("The canvas has no box");
    // The canvas sits in the page here, not over the whole window, so its
    // lattice is its own.
    const lattice = latticeOf(box.width, box.height);
    await page.waitForTimeout(1_000);

    const atDot = await cellStats(page, await canvas.screenshot(), lattice);

    // Scrolled down through the release into the gathering, about a
    // second for each step, the way a reader moves.
    const progress = page.getByRole("slider", { name: "Progress" });
    await page.getByRole("combobox", { name: "Chapter" }).selectOption("bloom");
    let worst: CellStats | null = null;
    let worstAt = "";
    let mostWhite = 0;
    let mostWhiteAt = "";
    let shot = 0;
    for (const value of BLOOM_SWEEP.map(String)) {
      await progress.fill(value);
      for (const wait of [150, 350, 500]) {
        await page.waitForTimeout(wait);
        const png = await canvas.screenshot();
        const cells = await cellStats(page, png, lattice);
        const at = `progress ${value}, ${wait} ms after`;
        if (
          worst === null ||
          cells.brightestCellMean > worst.brightestCellMean
        ) {
          worst = cells;
          worstAt = at;
          writeFileSync(
            testInfo.outputPath(`bloom-${tier}-brightest.png`),
            png,
          );
        }
        const white = cells.whiteCells / Math.max(cells.litCells, 1);
        if (white > mostWhite) {
          mostWhite = white;
          mostWhiteAt = at;
        }
        if (wait === 500) {
          writeFileSync(testInfo.outputPath(`bloom-${tier}-${shot}.png`), png);
          shot += 1;
        }
        expectNoBurn(at, cells);
      }
    }
    await page.waitForTimeout(2_000);
    const released = await canvas.screenshot();
    writeFileSync(testInfo.outputPath(`bloom-${tier}-released.png`), released);
    const left = await cellStats(page, released, lattice);
    console.log(
      `story bloom tier ${tier}: while the field left the dot, the brightest cell at ${worstAt}: ` +
        `${worst === null ? "none" : cellText(worst)}; most white cells ${(mostWhite * 100).toFixed(2)}% of the lit${mostWhiteAt === "" ? "" : ` at ${mostWhiteAt}`}; ` +
        `lit cells at the dot ${atDot.litCells} of ${atDot.cells}, once released ${left.litCells}`,
    );
    expect(
      left.litCells,
      "the field has left the dot once released",
    ).toBeGreaterThan(RELEASED_CELLS * Math.max(atDot.litCells, 1));
    expect(errors).toEqual([]);
  });
}

// The soft look stays tested (rule A11): the engine draws it when a
// half-float target cannot be rendered, and the development page forces it
// with ?look=soft. The live look is not an event (REQ-ENG-03), so the two
// are told apart by what they draw: the halftone puts one disc at each
// cell's centre and leaves the cell's corners nearly dark, while the soft
// sprites have no lattice. Measured on 12 Nov 2026 at the wordmark: the
// halftone's corners held 0.025 of its centres' light on both tiers, the
// soft field's 0.99 to 1.01. The lines sit well apart from both.
const LATTICE_CORNERS = 0.1;
const SOFT_CORNERS = 0.5;
// The soft look is the field before P3.5, held to that look's burn rule:
// no pixel past this relative luminance.
const SOFT_BURN_LUMINANCE = 0.5;

for (const { tier, count } of TIERS) {
  test(`REQ-ENG-05 REQ-PERF-06 rule A11: on forced tier ${tier} the default draws the halftone and ?look=soft the soft field, both forming the wordmark on the pass line`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { errors } = watchErrors(page);
    const entry: Case = {
      name: `bloom ${WORDMARK_AT}: the wordmark`,
      chapter: "bloom",
      progress: WORDMARK_AT,
      inside: shapeBoxIn("wordmark", bloomStage(WIDTH / HEIGHT), WIDTH, HEIGHT),
      inFrame: false,
    };
    const results = new Map<string, Measured>();
    for (const look of ["halftone", "soft"] as const) {
      await open(
        page,
        `tier=${tier}&count=${count}&bare=1${look === "soft" ? "&look=soft" : ""}` +
          `&chapter=${entry.chapter}&progress=${entry.progress}`,
      );
      await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
      await expect(page.locator(VIEW)).toHaveAttribute(
        "data-look",
        look === "soft" ? "soft" : "",
      );
      await page.waitForTimeout(SETTLE_MS);
      const measured = await frameOf(
        page,
        entry,
        WIDTH,
        HEIGHT,
        testInfo.outputPath(`look-${look}-tier-${tier}.png`),
      );
      const frames = await shortFrames(page);
      const line =
        `story look ${look} tier ${tier} ${measuredText(entry, measured)}; ` +
        `frames ${frames.frames}, median ${frames.medianMs.toFixed(2)} ms, p95 ${frames.p95Ms.toFixed(2)} ms`;
      console.log(line);
      testInfo.annotations.push({ type: "look", description: line });
      results.set(look, measured);

      expect(measured.litWhole, `${look}: something is drawn`).toBeGreaterThan(
        50,
      );
      expect(
        measured.inside?.litShare ?? 0,
        `${look}: the wordmark's box is lit`,
      ).toBeGreaterThan(0.05);
      expect(frames.medianMs, `${look}: frame time`).toBeLessThanOrEqual(
        PASS_MEDIAN_MS[tier],
      );
    }

    const halftone = results.get("halftone");
    const soft = results.get("soft");
    if (halftone === undefined || soft === undefined) {
      throw new Error("A look was not measured");
    }
    expect(
      halftone.cells.cornerToCentre,
      "the default look draws its dots on the lattice",
    ).toBeLessThan(LATTICE_CORNERS);
    expect(
      soft.cells.cornerToCentre,
      "?look=soft draws soft sprites, off any lattice",
    ).toBeGreaterThan(SOFT_CORNERS);
    expectNoBurn("halftone", halftone.cells);
    expect(
      soft.whole.maxLuminance,
      "the soft look piles no light to white",
    ).toBeLessThan(SOFT_BURN_LUMINANCE);
    expect(errors).toEqual([]);
  });
}
