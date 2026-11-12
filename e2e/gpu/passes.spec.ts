import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { LIVE_PASSES, PASSES, type PassId } from "../../src/engine/story";
import type { PassCard } from "../../src/engine/types";
import { compareCards, compareImages, quadsOf } from "./cards";
import {
  PASS_MEDIAN_MS,
  WARM_UP_MS,
  WINDOW_MS,
  measureFrames,
  readSurface,
  watchErrors,
  type FrameSummary,
} from "./frame-times";

// The making-of pass viewer on a real GPU, headed, on the development page
// (REQ-ENG-09): ?passes=1 lays five cards over the field, some flat and some
// turned in depth, and sends their corners and sizes; ?pass=<id> lays one
// pass over the making-of sheet's box, the part of the frame every card
// takes its picture from. On forced tier 1 (1,000,000 particles, WebGPU) and
// forced tier 2 (250,000, WebGL2), in the making-of chapter: each live pass
// draws inside its card and nowhere else, tier 2 draws no velocity, a final
// pass over the sheet is the frame itself, and the frame time with all five
// cards against none.

const VIEW = '[data-testid="engine-view"]';
const HOST = `${VIEW} [data-part="host"]`;
const CANVAS = `${HOST} > canvas`;
const WIDTH = 1280;
const HEIGHT = 800;
const STATE = "chapter=making-of&progress=0.5";

const TIERS = [
  { tier: 1, count: 1_000_000, backend: "webgpu" },
  { tier: 2, count: 250_000, backend: "webgl2" },
] as const;

// Pixels this close to a face's edge are cut by it, so they count as
// neither inside nor outside.
const EDGE_BAND_PX = 2;
// Inside a live card, at least this share of pixels is lit, and differs
// from the frame without cards. Measured on 12 Nov 2026 on this PC in the
// making-of chapter's still, each card cropped inside the sheet: lit 0.96
// to 1.00 and changed 0.89 to 1.00 in every live card on both tiers. The
// lines sit well under them, since a card shows whatever formation the
// chapter holds.
const CARD_LIT = 0.2;
const CARD_CHANGED = 0.5;
// A final pass over the sheet's box redraws the screen pass at the same
// points through the inverse map, so float rounding may move a channel by
// one.
const WHOLE_FINAL_CHANGED = 0.001;

async function open(page: Page, query: string) {
  await page.goto(`/engine?bare=1&${query}`);
  // The development server's badge, and the real cursor: these checks
  // never stir the field.
  await page.addStyleTag({
    content: `nextjs-portal { display: none; } ${HOST} { pointer-events: none !important; }`,
  });
}

function settled(page: Page, tier: 1 | 2) {
  return page.locator(`${VIEW}[data-tier="${tier}"][data-ready="true"]`);
}

/** Two animation frames: a redraw the last command asked for is on screen. */
async function nextFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Turns the Passes control, hidden in bare mode, and waits for the redraw. */
async function togglePasses(page: Page, on: boolean) {
  await page
    .locator(VIEW)
    .getByRole("button", { name: "Passes", includeHidden: true })
    .dispatchEvent("click");
  if (on) {
    await expect(page.locator(VIEW)).not.toHaveAttribute("data-cards", "");
  } else {
    await expect(page.locator(VIEW)).toHaveAttribute("data-cards", "");
  }
  await nextFrames(page);
}

async function sentCards(page: Page): Promise<PassCard[]> {
  const text = await page.locator(VIEW).getAttribute("data-cards");
  return text === null || text === "" ? [] : (JSON.parse(text) as PassCard[]);
}

async function capture(page: Page, path: string) {
  const host = page.locator(HOST);
  expect(await host.boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: WIDTH,
    height: HEIGHT,
  });
  const png = await host.screenshot();
  writeFileSync(path, png);
  return png;
}

function framesText(summary: FrameSummary) {
  return (
    `frames ${summary.frames}, median ${summary.medianMs.toFixed(2)} ms, ` +
    `p95 ${summary.p95Ms.toFixed(2)} ms, longest ${summary.longestMs.toFixed(1)} ms, ` +
    `engine ${summary.engineFps.toFixed(2)} fps`
  );
}

for (const { tier, count, backend } of TIERS) {
  test(`REQ-ENG-09 REQ-ENG-05 REQ-A11Y-03 forced tier ${tier}, ${count} particles: each live pass draws inside its card and nothing outside it, in the calm still`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { errors } = watchErrors(page);
    const live: readonly PassId[] = LIVE_PASSES[tier];

    await open(page, `tier=${tier}&count=${count}&calm=1&passes=1&${STATE}`);
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    await nextFrames(page);
    const cards = await sentCards(page);
    expect(cards.map((card) => card.pass)).toEqual([...PASSES]);

    const withCards = await capture(
      page,
      testInfo.outputPath(`tier-${tier}-still-cards.png`),
    );
    await togglePasses(page, false);
    const without = await capture(
      page,
      testInfo.outputPath(`tier-${tier}-still-plain.png`),
    );
    // On again: the still is the same each time it is drawn.
    await togglePasses(page, true);
    const again = await capture(
      page,
      testInfo.outputPath(`tier-${tier}-still-cards-again.png`),
    );

    const quads = quadsOf(cards, WIDTH, HEIGHT);
    const compared = await compareCards(
      page,
      without,
      withCards,
      quads,
      EDGE_BAND_PX,
    );
    const repeat = await compareImages(page, withCards, again);
    const lines = compared.cards.map(
      (card) =>
        `passes tier ${tier} ${card.pass}: ${card.pixels} px inside, lit ${card.litShare.toFixed(4)}, ` +
        `changed ${card.changedShare.toFixed(4)}${live.includes(card.pass) ? "" : " (not live on this tier)"}`,
    );
    const surface = await readSurface(page, CANVAS);
    const summary =
      `passes tier ${tier} outside the cards: ${compared.outsideChanged} of ${compared.outside} px changed, ` +
      `largest difference ${compared.outsideMaxDifference}; the still drawn again: ${repeat.changed} px changed; ` +
      `${surface.backend} on ${surface.gpu}, browser ${browser.version()}`;
    for (const line of [...lines, summary]) console.log(line);
    testInfo.annotations.push(
      ...[...lines, summary].map((description) => ({
        type: "passes",
        description,
      })),
    );

    expect(surface.backend).toBe(backend);
    expect(surface.isSoftware).toBe(false);
    for (const card of compared.cards) {
      expect(
        card.pixels,
        `${card.pass}: the card has an inside`,
      ).toBeGreaterThan(5_000);
      if (live.includes(card.pass)) {
        expect(
          card.litShare,
          `${card.pass}: drawn inside its card`,
        ).toBeGreaterThan(CARD_LIT);
        expect(
          card.changedShare,
          `${card.pass}: the card holds its pass, not the field behind it`,
        ).toBeGreaterThan(CARD_CHANGED);
      } else {
        expect(
          card.changedShare,
          `${card.pass}: not live on tier ${tier}, so nothing is drawn there`,
        ).toBe(0);
      }
    }
    expect(compared.outside).toBeGreaterThan(WIDTH * HEIGHT * 0.5);
    expect(compared.outsideChanged, "nothing drawn outside the cards").toBe(0);
    expect(repeat.changed, "the same still with the same cards").toBe(0);
    expect(errors).toEqual([]);
  });

  test(`REQ-ENG-09 REQ-TIER-03 forced tier ${tier}: ?pass= lays one pass over the sheet; the final pass is the frame itself${tier === 2 ? ", and velocity draws nothing" : ""}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { errors } = watchErrors(page);
    const live: readonly PassId[] = LIVE_PASSES[tier];

    await open(page, `tier=${tier}&count=${count}&calm=1&${STATE}`);
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    await nextFrames(page);
    const plain = await capture(
      page,
      testInfo.outputPath(`tier-${tier}-plain.png`),
    );

    for (const pass of PASSES) {
      await open(
        page,
        `tier=${tier}&count=${count}&calm=1&pass=${pass}&${STATE}`,
      );
      await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
      await expect(page.locator(VIEW)).toHaveAttribute("data-pass", pass);
      await nextFrames(page);
      const whole = await capture(
        page,
        testInfo.outputPath(`tier-${tier}-pass-${pass}.png`),
      );
      const compared = await compareImages(page, plain, whole);
      const share = compared.changed / compared.pixels;
      const line = `passes tier ${tier} over the sheet ${pass}: ${compared.changed} of ${compared.pixels} px differ from the frame (${share.toFixed(4)}), largest ${compared.maxDifference}`;
      console.log(line);
      testInfo.annotations.push({ type: "passes", description: line });

      if (!live.includes(pass)) {
        expect(compared.changed, `${pass} is not live on tier ${tier}`).toBe(0);
      } else if (pass === "final") {
        expect(share, "the final pass is the frame itself").toBeLessThan(
          WHOLE_FINAL_CHANGED,
        );
      } else {
        expect(share, `${pass} is not the frame`).toBeGreaterThan(0.05);
      }
    }
    expect(errors).toEqual([]);
  });

  test(`REQ-ENG-09 REQ-PERF-06 forced tier ${tier}, ${count} particles: the frame time with all five cards live and with none`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { errors } = watchErrors(page);

    await open(page, `tier=${tier}&count=${count}&passes=1&${STATE}`);
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);

    const withCards = await measureFrames(page, VIEW);
    await capture(page, testInfo.outputPath(`tier-${tier}-running-cards.png`));
    await togglePasses(page, false);
    const without = await measureFrames(page, VIEW);

    const lines = [
      `passes tier ${tier} frame time, five cards live (${LIVE_PASSES[tier].length} drawn): ${framesText(withCards)}`,
      `passes tier ${tier} frame time, no cards: ${framesText(without)}`,
      `passes tier ${tier} window: warm-up ${WARM_UP_MS} ms, then ${WINDOW_MS} ms, 1280 x 800 at a pixel ratio of 1`,
    ];
    for (const line of lines) console.log(line);
    testInfo.annotations.push(
      ...lines.map((description) => ({ type: "passes", description })),
    );

    for (const summary of [withCards, without]) {
      expect(summary.medianMs).toBeLessThanOrEqual(PASS_MEDIAN_MS[tier]);
      expect(summary.frames).toBeGreaterThanOrEqual(
        (0.95 * WINDOW_MS) / summary.medianMs,
      );
    }
    expect(errors).toEqual([]);
  });
}
