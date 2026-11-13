import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { LIVE_PASSES, PASSES, type PassId } from "../../src/engine/story";
import type { PassCard, Stage } from "../../src/engine/types";
import {
  boxOfCard,
  boxOfStage,
  compareCards,
  compareImages,
  quadsOf,
} from "./cards";
import {
  PASS_MEDIAN_MS,
  WARM_UP_MS,
  WINDOW_MS,
  measureFrames,
  readSurface,
  watchErrors,
  type FrameSummary,
} from "./frame-times";
import { pixelStats } from "./pixels";

// The making-of pass viewer on a real GPU, headed, on the development page
// (REQ-ENG-09): the field forms the T7 mark inside the middle card's face,
// the making-of stage, and each card shows its pass of the part of the
// frame right behind its face, one to one. ?passes=1 lays five flat 4:5
// cards in a row, the middle one the stage; ?pass=<id> lays one flat 4:5
// card in the middle of the canvas, the stage and that pass's card at once.
// On forced tier 1 (1,000,000 particles, WebGPU) and forced tier 2 (250,000,
// WebGL2), in the making-of chapter: the mark forms inside the middle card,
// each live pass draws inside its card and nowhere else, tier 2 draws no
// velocity, the final pass is the frame behind it, and the frame time with
// all five cards against none. The Passes control takes the cards off and
// keeps the stage, so each capture without cards holds the same field.

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
// The mark: in the frame without cards, at least this share of the middle
// card's pixels is lit, and at least this share of every lit pixel of the
// frame is inside it. Measured on 12 Nov 2026 on this PC in the calm still:
// lit 0.162 to 0.202 of the card on both tiers, at 216 by 270 and 320 by
// 400, and every lit pixel of the frame inside it, since every particle
// joins the mark. The lines are about half the lowest.
const MARK_LIT = 0.08;
const MARK_SHARE = 0.9;
// Inside a live card over the mark, at least this share of pixels is lit
// and differs from the frame without cards. Measured the same day: lit
// 0.186 to 0.326 and changed 0.358 to 0.404 in every live card on both
// tiers.
const CARD_LIT = 0.09;
const CARD_CHANGED = 0.18;

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

async function sentStage(page: Page): Promise<Stage | null> {
  const text = await page.locator(VIEW).getAttribute("data-making-of");
  return text === null || text === "" ? null : (JSON.parse(text) as Stage);
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

/** The mark in a frame without cards: how much of its stage it lights. */
async function markIn(page: Page, png: Buffer, stage: Stage) {
  const box = boxOfStage(stage, WIDTH, HEIGHT);
  const whole = await pixelStats(page, png);
  const inside = await pixelStats(page, png, [box]);
  const lit = whole.litShare * whole.pixels;
  return {
    litShare: inside.litShare,
    share: lit === 0 ? 0 : (inside.litShare * inside.pixels) / lit,
  };
}

function framesText(summary: FrameSummary) {
  return (
    `frames ${summary.frames}, median ${summary.medianMs.toFixed(2)} ms, ` +
    `p95 ${summary.p95Ms.toFixed(2)} ms, longest ${summary.longestMs.toFixed(1)} ms, ` +
    `engine ${summary.engineFps.toFixed(2)} fps`
  );
}

for (const { tier, count, backend } of TIERS) {
  test(`REQ-ENG-09 REQ-ENG-05 REQ-A11Y-03 forced tier ${tier}, ${count} particles: five flat cards, the mark in the middle one; each live pass draws inside its card and nothing outside it, in the calm still`, async ({
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
    // The middle card is the making-of stage.
    const stage = await sentStage(page);
    const middle = cards[Math.floor(cards.length / 2)];
    expect(stage).not.toBeNull();
    if (stage === null || middle === undefined) return;
    const middleBox = boxOfCard(middle, WIDTH, HEIGHT);
    const stageBox = boxOfStage(stage, WIDTH, HEIGHT);
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(stageBox[key]).toBeCloseTo(middleBox[key], 3);
    }
    // Flat 4:5 faces.
    for (const card of cards) {
      const box = boxOfCard(card, WIDTH, HEIGHT);
      expect(box.width / box.height).toBeCloseTo(4 / 5, 2);
    }

    const withCards = await capture(
      page,
      testInfo.outputPath(`tier-${tier}-still-cards.png`),
    );
    await togglePasses(page, false);
    // The stage stays: the same mark, without the cards.
    expect(await sentStage(page)).toEqual(stage);
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

    const mark = await markIn(page, without, stage);
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
        `passes tier ${tier} ${card.pass}${card.pass === middle.pass ? " (middle, over the mark)" : ""}: ` +
        `${card.pixels} px inside, lit ${card.litShare.toFixed(4)}, changed ${card.changedShare.toFixed(4)}` +
        `${live.includes(card.pass) ? "" : " (not live on this tier)"}`,
    );
    const surface = await readSurface(page, CANVAS);
    const summary =
      `passes tier ${tier} the mark in the middle card: lit ${mark.litShare.toFixed(4)}, ` +
      `${(mark.share * 100).toFixed(1)}% of the frame's lit pixels; outside the cards: ` +
      `${compared.outsideChanged} of ${compared.outside} px changed, largest difference ` +
      `${compared.outsideMaxDifference}; the still drawn again: ${repeat.changed} px changed; ` +
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
    expect(mark.litShare, "the mark forms in the middle card").toBeGreaterThan(
      MARK_LIT,
    );
    expect(mark.share, "most of the light is the mark").toBeGreaterThan(
      MARK_SHARE,
    );
    for (const card of compared.cards) {
      expect(
        card.pixels,
        `${card.pass}: the card has an inside`,
      ).toBeGreaterThan(5_000);
      if (card.pass === middle.pass && live.includes(card.pass)) {
        expect(
          card.litShare,
          `${card.pass}: its pass of the mark, inside its card`,
        ).toBeGreaterThan(CARD_LIT);
        expect(
          card.changedShare,
          `${card.pass}: the card holds its pass, not the mark behind it`,
        ).toBeGreaterThan(CARD_CHANGED);
      } else {
        // Every particle is in the mark, so the other cards sit over the
        // void, and each pass of the void is the void: a card that read the
        // frame anywhere but right behind it would show part of the mark.
        // Velocity is not drawn on tier 2 at all.
        expect(
          card.changedShare,
          live.includes(card.pass)
            ? `${card.pass}: its pass of the void behind it`
            : `${card.pass}: not live on tier ${tier}, so nothing is drawn there`,
        ).toBe(0);
      }
    }
    expect(compared.outside).toBeGreaterThan(WIDTH * HEIGHT * 0.5);
    expect(compared.outsideChanged, "nothing drawn outside the cards").toBe(0);
    expect(repeat.changed, "the same still with the same cards").toBe(0);
    expect(errors).toEqual([]);
  });

  test(`REQ-ENG-09 REQ-TIER-03 forced tier ${tier}: ?pass= forms the mark inside one middle card, which shows that pass of it; the final pass differs from the frame in no pixel${tier === 2 ? ", and velocity draws nothing" : ""}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const { errors } = watchErrors(page);
    const live: readonly PassId[] = LIVE_PASSES[tier];

    for (const pass of PASSES) {
      await open(
        page,
        `tier=${tier}&count=${count}&calm=1&pass=${pass}&${STATE}`,
      );
      await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
      await expect(page.locator(VIEW)).toHaveAttribute("data-pass", pass);
      await nextFrames(page);
      const cards = await sentCards(page);
      const stage = await sentStage(page);
      const [card] = cards;
      expect(cards).toHaveLength(1);
      expect(stage).not.toBeNull();
      if (card === undefined || stage === null) return;
      // One flat 4:5 face, 320 by 400, in the middle; its box the stage.
      const box = boxOfCard(card, WIDTH, HEIGHT);
      const stageBox = boxOfStage(stage, WIDTH, HEIGHT);
      expect(box.width).toBeCloseTo(320, 3);
      expect(box.height).toBeCloseTo(400, 3);
      expect(box.x + box.width / 2).toBeCloseTo(WIDTH / 2, 3);
      expect(box.y + box.height / 2).toBeCloseTo(HEIGHT / 2, 3);
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(stageBox[key]).toBeCloseTo(box[key], 3);
      }

      const withCard = await capture(
        page,
        testInfo.outputPath(`tier-${tier}-pass-${pass}.png`),
      );
      await togglePasses(page, false);
      expect(await sentStage(page)).toEqual(stage);
      const plain = await capture(
        page,
        testInfo.outputPath(`tier-${tier}-pass-${pass}-plain.png`),
      );

      const mark = await markIn(page, plain, stage);
      const compared = await compareCards(
        page,
        plain,
        withCard,
        quadsOf(cards, WIDTH, HEIGHT),
        EDGE_BAND_PX,
      );
      const whole = await compareImages(page, plain, withCard);
      const [inside] = compared.cards;
      const line =
        `passes tier ${tier} ?pass=${pass}: the mark lit ${mark.litShare.toFixed(4)} of its card, ` +
        `${(mark.share * 100).toFixed(1)}% of the frame's lit pixels; in the card lit ` +
        `${inside?.litShare.toFixed(4)}, changed ${inside?.changedShare.toFixed(4)}; ` +
        `${whole.changed} of ${whole.pixels} px differ from the frame, largest ${whole.maxDifference}; ` +
        `outside ${compared.outsideChanged} changed`;
      console.log(line);
      testInfo.annotations.push({ type: "passes", description: line });

      expect(mark.litShare, "the mark forms in the card").toBeGreaterThan(
        MARK_LIT,
      );
      expect(mark.share, "most of the light is the mark").toBeGreaterThan(
        MARK_SHARE,
      );
      expect(compared.outsideChanged, "nothing outside the card").toBe(0);
      if (!live.includes(pass)) {
        expect(whole.changed, `${pass} is not live on tier ${tier}`).toBe(0);
      } else if (pass === "final") {
        expect(
          whole.changed,
          "the final pass is the frame itself, to 2 of 255",
        ).toBe(0);
      } else {
        expect(inside?.litShare ?? 0, `${pass} draws the mark`).toBeGreaterThan(
          CARD_LIT,
        );
        expect(
          inside?.changedShare ?? 0,
          `${pass} is not the frame`,
        ).toBeGreaterThan(CARD_CHANGED);
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
