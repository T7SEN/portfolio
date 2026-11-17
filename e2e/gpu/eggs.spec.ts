import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { median, percentile } from "../../src/engine/tier/probe";
import { EGG_SECONDS, GG_CRUMBLE } from "../../src/engine/runtime/eggs";
import { gridFor } from "../../src/engine/runtime/halftone-rules";
import { EGGS, type EggId } from "../../src/engine/story";
import { compareImages } from "./cards";
import { PASS_MEDIAN_MS, watchErrors } from "./frame-times";
import { LIT_CELL_LUMINANCE } from "./pixels";

// The easter eggs (REQ-NAV-05) and the about strands' answer to the sound
// (REQ-SND-03) on the development page, headed, on this machine's GPU: tier
// 1 at 1,000,000 particles and forced tier 2 at 250,000. Each egg must change
// the frame and then hand the field back to the story; gg's falling pieces
// must keep the letters' light, and the flip's rain must spread over the
// height with no band along the top; the levels must move the strands; calm
// must ignore both. EGG_FRAMES_DIR saves frames of each egg for the review.

const VIEW = '[data-testid="engine-view"]';
const HOST = `${VIEW} [data-part="host"]`;
const CANVAS = `${HOST} > canvas`;
const FRAMES_DIR = process.env.EGG_FRAMES_DIR;

const SETUPS = [
  { tier: 1, count: 1_000_000 },
  { tier: 2, count: 250_000 },
] as const;

// The middle of the screen, where gg and mark form (eggs.ts eggPlacement:
// the field chapter's stage), and the top quarter.
const CENTRE = { x0: 0.15, x1: 0.85, y0: 0.15, y1: 0.85 };
const TOP = 0.25;
// Below the letters GG, which reach about three quarters of the way down.
const BOTTOM = 0.75;

// gg's crumble (eggs.ts GG_CRUMBLE): its middle, where its light is weighed
// against the whole letters' (to a thousandth of a second, so its frame has
// a plain name), and late in it, the pieces low on the screen.
const MID_CRUMBLE = Math.round((GG_CRUMBLE.from + GG_CRUMBLE.to) * 500) / 1000;
const LATE_CRUMBLE = 3.8;
// When each egg is looked at, in seconds after it was sent: gg and mark
// whole (eggs.ts EGG_HOLD, 1.2 to 2.7 s), gg's crumble, mark let go, and the
// flip's rain rising (RISING), hanging, falling back and settling.
const MOMENTS: Readonly<Record<EggId, readonly number[]>> = {
  gg: [2, MID_CRUMBLE, LATE_CRUMBLE],
  mark: [2, 3.2],
  flip: [0.8, 1.6, 2.4, 3.2],
};
const RISING: readonly number[] = [0.8, 1.6];
// gg's pieces keep the letters' light: the lit share in the middle of the
// crumble is at least CRUMBLE_KEEPS of the whole letters'.
const CRUMBLE_KEEPS = 0.6;
// The rain has no lit band along the top: in every frame the top tenth holds
// at most TOP_TENTH_SHARE of the lit cells. While it rises its lit cells
// spread over the height, at least SPREAD_TENTHS of the ten tenths each
// holding TENTH_FLOOR of them, and it lights at least RAIN_LIT times the
// cells the flow lines lit before it.
const TOP_TENTH_SHARE = 0.2;
const SPREAD_TENTHS = 5;
const TENTH_FLOOR = 0.03;
const RAIN_LIT = 1.5;
// The field has had its own recall time after the egg ends.
const AFTER_SECONDS = 1.5;
// Ready to the flow lines formed, on the development page.
const SETTLE_MS = 9_000;

interface Light {
  /** The frame's summed luminance above the void, as a share of a frame lit white. */
  total: number;
  /** The share of the light inside CENTRE. */
  centre: number;
  /** The share of the light in the top quarter. */
  top: number;
  /** The share of the light in the bottom quarter. */
  bottom: number;
  /** The light's mean height and its spread, as shares of the frame's height, y down. */
  meanY: number;
  spreadY: number;
}

interface Look extends Light {
  /** The lit cells on the halftone lattice in each tenth of the height, from the top. */
  tenths: number[];
  litCells: number;
  /** The top tenth's share of the lit cells. */
  topTenth: number;
}

async function open(page: Page, query: string) {
  await page.goto(`/engine?${query}`);
  // The development server's badge, and the real cursor, which would stir
  // the field: these checks never stir.
  await page.addStyleTag({
    content: `nextjs-portal { display: none; } ${HOST} { pointer-events: none !important; }`,
  });
}

function settled(page: Page, tier: 1 | 2) {
  return page.locator(`${VIEW}[data-tier="${tier}"][data-ready="true"]`);
}

/**
 * Waits for the drawing buffer's full pixel ratio, then for a few frames
 * drawn at it, since the screen keeps the last frame drawn small until the
 * field draws again (story.spec.ts, atFullRatio).
 */
async function atFullRatio(page: Page) {
  await expect
    .poll(
      () =>
        page
          .locator(CANVAS)
          .evaluate((element) =>
            element instanceof HTMLCanvasElement
              ? element.width / element.clientWidth
              : 0,
          ),
      {
        message: "the field is drawn at its full pixel ratio",
        timeout: 15_000,
      },
    )
    .toBe(1);
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const tick = () => {
          left -= 1;
          if (left <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    FRAMES_AFTER_RATIO,
  );
}

/** Frames drawn after the full ratio returns, before a capture. */
const FRAMES_AFTER_RATIO = 4;

/** Presses a control of the page, which bare mode hides, as a click. */
async function press(page: Page, name: string) {
  await page
    .locator(VIEW)
    .getByRole("button", { name, exact: true, includeHidden: true })
    .dispatchEvent("click");
}

async function play(page: Page, egg: EggId): Promise<number> {
  await press(page, `Play ${egg}`);
  return Date.now();
}

async function waitUntil(page: Page, start: number, seconds: number) {
  const left = start + seconds * 1000 - Date.now();
  if (left > 0) await page.waitForTimeout(left);
}

/** Where the light of a PNG capture sits: decoded in the page, as pixels.ts does. */
async function lightOf(page: Page, png: Buffer): Promise<Light> {
  return page.evaluate(
    async ({ data, centre, top, bottom }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("No 2D context to decode with");
      context.drawImage(bitmap, 0, 0);
      const { width, height } = bitmap;
      const pixels = context.getImageData(0, 0, width, height).data;
      const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (at: number) =>
        0.2126 * linear(pixels[at] ?? 0) +
        0.7152 * linear(pixels[at + 1] ?? 0) +
        0.0722 * linear(pixels[at + 2] ?? 0);
      // The void the field is drawn on is not black: light is counted above
      // the darkest pixel, or the empty screen would outweigh the field.
      let floor = Infinity;
      for (let at = 0; at < pixels.length; at += 4) {
        floor = Math.min(floor, luminance(at));
      }
      let total = 0;
      let inCentre = 0;
      let inTop = 0;
      let inBottom = 0;
      let sumY = 0;
      let sumYY = 0;
      for (let y = 0; y < height; y += 1) {
        const v = (y + 0.5) / height;
        let row = 0;
        let rowCentre = 0;
        for (let x = 0; x < width; x += 1) {
          const light = Math.max(luminance((y * width + x) * 4) - floor, 0);
          row += light;
          const u = (x + 0.5) / width;
          if (u >= centre.x0 && u <= centre.x1) rowCentre += light;
        }
        total += row;
        if (v >= centre.y0 && v <= centre.y1) inCentre += rowCentre;
        if (v < top) inTop += row;
        if (v > bottom) inBottom += row;
        sumY += row * v;
        sumYY += row * v * v;
      }
      const meanY = total > 0 ? sumY / total : 0.5;
      return {
        total: total / (width * height),
        centre: total > 0 ? inCentre / total : 0,
        top: total > 0 ? inTop / total : 0,
        bottom: total > 0 ? inBottom / total : 0,
        meanY,
        spreadY:
          total > 0 ? Math.sqrt(Math.max(sumYY / total - meanY ** 2, 0)) : 0,
      };
    },
    {
      data: png.toString("base64"),
      centre: CENTRE,
      top: TOP,
      bottom: BOTTOM,
    },
  );
}

/**
 * The lit cells of a PNG capture on the halftone lattice (pixels.ts
 * cellStats' rule: a cell whose brightest pixel passes LIT_CELL_LUMINANCE),
 * counted in each tenth of the height from the top, in one decode. The
 * capture is at a pixel ratio of 1 (atFullRatio), so the lattice is
 * halftone-rules gridFor's for the PNG's own size, read from its header.
 */
async function tenthsOf(page: Page, png: Buffer): Promise<number[]> {
  const grid = gridFor(png.readUInt32BE(16), png.readUInt32BE(20));
  return page.evaluate(
    async ({ data, lattice, litAt }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("No 2D context to decode with");
      context.drawImage(bitmap, 0, 0);
      const { width, height } = bitmap;
      const pixels = context.getImageData(0, 0, width, height).data;
      const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      };
      const { cell, padX, padY } = lattice;
      const columns = Math.ceil((width + 2 * padX) / cell);
      const rows = Math.ceil((height + 2 * padY) / cell);
      const brightest = new Float64Array(columns * rows);
      for (let y = 0; y < height; y += 1) {
        const row = Math.floor((y + 0.5 + padY) / cell);
        for (let x = 0; x < width; x += 1) {
          const column = Math.floor((x + 0.5 + padX) / cell);
          const at = (y * width + x) * 4;
          const value =
            0.2126 * linear(pixels[at] ?? 0) +
            0.7152 * linear(pixels[at + 1] ?? 0) +
            0.0722 * linear(pixels[at + 2] ?? 0);
          const index = row * columns + column;
          if (value > (brightest[index] ?? 0)) brightest[index] = value;
        }
      }
      const tenths = Array.from({ length: 10 }, () => 0);
      for (let row = 0; row < rows; row += 1) {
        const centreY = (row + 0.5) * cell - padY;
        const tenth = Math.min(
          Math.max(Math.floor((centreY / height) * 10), 0),
          9,
        );
        for (let column = 0; column < columns; column += 1) {
          if ((brightest[row * columns + column] ?? 0) > litAt) {
            tenths[tenth] = (tenths[tenth] ?? 0) + 1;
          }
        }
      }
      return tenths;
    },
    {
      data: png.toString("base64"),
      lattice: { cell: grid.cell, padX: grid.padX, padY: grid.padY },
      litAt: LIT_CELL_LUMINANCE,
    },
  );
}

/** A capture's light and its lit cells by tenth of the height. */
async function lookOf(page: Page, png: Buffer): Promise<Look> {
  const light = await lightOf(page, png);
  const tenths = await tenthsOf(page, png);
  const litCells = tenths.reduce((sum, cells) => sum + cells, 0);
  return {
    ...light,
    tenths,
    litCells,
    topTenth: litCells > 0 ? (tenths[0] ?? 0) / litCells : 0,
  };
}

async function capture(page: Page, name: string): Promise<Buffer> {
  const png = await page.locator(CANVAS).screenshot();
  if (FRAMES_DIR !== undefined) {
    mkdirSync(FRAMES_DIR, { recursive: true });
    writeFileSync(path.join(FRAMES_DIR, `${name}.png`), png);
  }
  return png;
}

/** requestAnimationFrame intervals over a window, in ms. */
async function frameWindow(page: Page, windowMs: number) {
  const deltas = await page.evaluate(
    (length) =>
      new Promise<number[]>((resolve) => {
        const found: number[] = [];
        let start: number | null = null;
        let last = 0;
        const tick = (now: number) => {
          if (start === null) start = now;
          else found.push(now - last);
          last = now;
          if (now - start >= length) resolve(found);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    windowMs,
  );
  return {
    frames: deltas.length,
    medianMs: median(deltas),
    // A fraction: probe.ts clamps it to 0 to 1, so 95 would give the longest.
    p95Ms: percentile(deltas, 0.95),
    longestMs: Math.max(...deltas),
  };
}

const round = (value: number) => Math.round(value * 10000) / 10000;
const rounded = (value: unknown) =>
  JSON.stringify(value, (_, entry: unknown) =>
    typeof entry === "number" ? round(entry) : entry,
  );

for (const { tier, count } of SETUPS) {
  test(`REQ-NAV-05 REQ-ENG-05 each egg changes the frame and hands the field back to the story on tier ${tier}`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const { errors } = watchErrors(page);
    await open(page, `tier=${tier}&count=${count}&bare=1`);
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    await atFullRatio(page);
    // The field starts on its noise homes and its particles take several
    // seconds to stream onto the flow lines: the frame to hand back is the
    // flow's.
    await page.waitForTimeout(SETTLE_MS);
    const view = page.locator(VIEW);

    const before = await lookOf(
      page,
      await capture(page, `tier${tier}-before`),
    );
    for (const egg of EGGS) {
      const start = await play(page, egg);
      await expect(view).toHaveAttribute("data-egg", egg);
      // Every capture first and every measure after, so measuring never
      // delays the next moment.
      const shots: Buffer[] = [];
      for (const moment of MOMENTS[egg]) {
        await waitUntil(page, start, moment);
        shots.push(await capture(page, `tier${tier}-${egg}-${moment}s`));
      }
      await waitUntil(page, start, EGG_SECONDS[egg] + AFTER_SECONDS);
      await expect(view).toHaveAttribute("data-egg", "");
      const after = await lookOf(
        page,
        await capture(page, `tier${tier}-${egg}-after`),
      );
      const looks: Look[] = [];
      for (const shot of shots) looks.push(await lookOf(page, shot));
      console.log(
        `eggs tier ${tier} ${egg}: before ${rounded(before)}, during ${rounded(
          MOMENTS[egg].map((moment, index) => ({ moment, ...looks[index] })),
        )}, after ${rounded(after)}`,
      );

      const [first, second, third] = looks;
      if (first === undefined || second === undefined)
        throw new Error("no looks");
      if (egg === "flip") {
        // The rain spreads over the height while it rises, and lights more
        // of the screen than the lines did.
        for (const moment of RISING) {
          const look = looks[MOMENTS.flip.indexOf(moment)];
          if (look === undefined) throw new Error(`no look at ${moment}`);
          const spread = look.tenths.filter(
            (cells) => cells >= TENTH_FLOOR * look.litCells,
          ).length;
          expect
            .soft(spread, `flip at ${moment} s: lit over the height`)
            .toBeGreaterThanOrEqual(SPREAD_TENTHS);
          expect
            .soft(look.litCells, `flip at ${moment} s: the rain lights`)
            .toBeGreaterThan(before.litCells * RAIN_LIT);
        }
        // And no frame has a lit band along the top.
        for (const [index, look] of [...looks, after].entries()) {
          expect
            .soft(
              look.topTenth,
              `flip ${MOMENTS.flip[index] ?? "after"}: the top tenth`,
            )
            .toBeLessThanOrEqual(TOP_TENTH_SHARE);
        }
      } else {
        expect
          .soft(first.centre, `${egg}: the formation holds the field`)
          .toBeGreaterThan(0.85);
        expect.soft(first.centre).toBeGreaterThan(before.centre + 0.2);
      }
      if (egg === "gg") {
        if (third === undefined) throw new Error("no late crumble");
        // The pieces keep the letters' light in the middle of the crumble,
        // and by late in it they have fallen: light below the letters'
        // foot, spread down the screen.
        expect
          .soft(second.total, "gg: the crumble keeps the letters' light")
          .toBeGreaterThanOrEqual(CRUMBLE_KEEPS * first.total);
        expect
          .soft(third.bottom, "gg: the pieces fall")
          .toBeGreaterThan(first.bottom + 0.05);
        expect.soft(third.spreadY).toBeGreaterThan(first.spreadY + 0.01);
      }
      // Handed back: the light sits where it sat before the egg.
      expect
        .soft(Math.abs(after.centre - before.centre), `${egg}: centre`)
        .toBeLessThan(0.12);
      expect
        .soft(Math.abs(after.top - before.top), `${egg}: top`)
        .toBeLessThan(0.1);
      expect
        .soft(Math.abs(after.meanY - before.meanY), `${egg}: height`)
        .toBeLessThan(0.05);
      expect
        .soft(after.total / before.total, `${egg}: light`)
        .toBeGreaterThan(0.7);
      expect
        .soft(after.total / before.total, `${egg}: light`)
        .toBeLessThan(1.4);
    }
    expect(errors).toEqual([]);
  });

  test(`REQ-NAV-05 REQ-PERF-06 an egg keeps the frame rate on tier ${tier}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, `tier=${tier}&count=${count}&bare=1`);
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    await atFullRatio(page);
    await page.waitForTimeout(1_500);

    const plain = await frameWindow(page, 4_500);
    const results: Record<string, unknown> = { plain };
    for (const egg of EGGS) {
      await play(page, egg);
      // Played, not refused: a refused egg would leave the plain field here.
      await expect(page.locator(VIEW)).toHaveAttribute("data-egg", egg);
      const during = await frameWindow(page, EGG_SECONDS[egg] * 1000);
      results[egg] = during;
      expect(during.medianMs, `${egg} median`).toBeLessThanOrEqual(
        PASS_MEDIAN_MS[tier],
      );
      // Frames drawn through the whole egg, at least half the pass line's.
      expect(during.frames, `${egg} frames`).toBeGreaterThanOrEqual(
        Math.floor((EGG_SECONDS[egg] * 1000) / (2 * PASS_MEDIAN_MS[tier])),
      );
      await page.waitForTimeout(AFTER_SECONDS * 1000);
    }
    console.log(`eggs frame times tier ${tier}: ${JSON.stringify(results)}`);
    expect(plain.medianMs).toBeLessThanOrEqual(PASS_MEDIAN_MS[tier]);
  });

  test(`REQ-SND-03 the about strands follow the sound's levels on tier ${tier}`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const about = `tier=${tier}&count=${count}&bare=1&chapter=about&progress=0.5`;
    const spreadWith = async (audio: string, name: string) => {
      await open(page, `${about}${audio}`);
      await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
      await atFullRatio(page);
      await page.waitForTimeout(1_000);
      return lightOf(page, await capture(page, name));
    };

    const quiet = await spreadWith("", `tier${tier}-about-quiet`);
    const loud = await spreadWith("&audio=1,1,1", `tier${tier}-about-loud`);
    const low = await spreadWith("&audio=1,0,0", `tier${tier}-about-low`);
    console.log(
      `eggs strands tier ${tier}: quiet ${round(quiet.spreadY)}, loud ${round(loud.spreadY)}, low only ${round(low.spreadY)}`,
    );
    expect(loud.spreadY).toBeGreaterThan(quiet.spreadY * 1.3);
    expect(low.spreadY).toBeGreaterThan(quiet.spreadY * 1.1);
    expect(loud.spreadY).toBeGreaterThan(low.spreadY);
    // The strands keep their middle.
    expect(Math.abs(loud.meanY - quiet.meanY)).toBeLessThan(0.04);
  });

  test(`REQ-A11Y-03 REQ-NAV-05 REQ-SND-03 calm ignores the eggs and the sound on tier ${tier}`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const about = `tier=${tier}&count=${count}&bare=1&chapter=about&progress=0.5&calm=1`;
    await open(page, `${about}&audio=1,1,1&egg=gg`);
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(1_000);
    const view = page.locator(VIEW);
    await expect(view).toHaveAttribute("data-egg", "");
    const still = await page.locator(CANVAS).screenshot();

    await play(page, "flip");
    await expect(view).toHaveAttribute("data-egg", "");
    await page.waitForTimeout(2_500);
    const later = await page.locator(CANVAS).screenshot();
    const compared = await compareImages(page, still, later);
    expect(compared.changed, "nothing redraws the still").toBe(0);

    await open(page, about);
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(1_000);
    const quiet = await lightOf(page, await page.locator(CANVAS).screenshot());
    const loud = await lightOf(page, still);
    console.log(
      `eggs calm tier ${tier}: spread with levels ${round(loud.spreadY)}, without ${round(quiet.spreadY)}`,
    );
    expect(Math.abs(loud.spreadY / quiet.spreadY - 1)).toBeLessThan(0.05);
  });
}

test("REQ-NAV-05 in the hero an egg shows the particles the dot holds, then gives them back to it, on tier 1", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page, "tier=1&bare=1&chapter=hero&progress=0");
  await expect(settled(page, 1)).toHaveCount(1, { timeout: 90_000 });
  await atFullRatio(page);
  await page.waitForTimeout(1_000);
  const before = await lightOf(page, await capture(page, "tier1-hero-before"));

  const start = await play(page, "gg");
  await waitUntil(page, start, 2);
  const whole = await lightOf(page, await capture(page, "tier1-hero-gg-2s"));
  await waitUntil(page, start, EGG_SECONDS.gg + AFTER_SECONDS);
  const after = await lightOf(page, await capture(page, "tier1-hero-gg-after"));
  console.log(
    `eggs hero: before ${round(before.total)}, whole ${round(whole.total)}, after ${round(after.total)}`,
  );
  expect(whole.total).toBeGreaterThan(before.total * 3);
  expect(after.total).toBeLessThan(before.total * 1.5);
});

test("REQ-TIER-04 Auto on the development page hands the tier back to the decision table and the probe", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page, "tier=2&bare=1");
  await expect(settled(page, 2)).toHaveCount(1, { timeout: 90_000 });
  const view = page.locator(VIEW);
  await expect(view).toHaveAttribute("data-tier-reason", "forced");
  await expect(view).toHaveAttribute("data-probes", "0");

  await press(page, "Auto");
  await expect(view).toHaveAttribute("data-probes", "1", { timeout: 30_000 });
  await expect(view).toHaveAttribute(
    "data-tier-reason",
    /^probe-(pass|slow|failed)$/,
    { timeout: 30_000 },
  );
  await expect(view).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  const reason = await view.getAttribute("data-tier-reason");
  console.log(
    `eggs auto: tier ${await view.getAttribute("data-tier")}, reason ${reason}`,
  );
  expect(reason).toMatch(/^probe-(pass|slow|failed)$/);
});
