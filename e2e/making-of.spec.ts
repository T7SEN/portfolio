import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  glideCard,
  middleCard,
  restProgress,
  SLIDE_MOVE,
  SLIDE_REST,
  SLIDE_SCREENS,
  slideAt,
  STRETCH_SCREENS,
} from "../src/components/home/pass-slide";
import { PASS_STILLS } from "../src/components/home/pass-stills";
import { pages } from "../src/content/pages";
import { passPosition, passViewer } from "../src/content/passes";
import { LIVE_PASSES, PASSES, type PassId } from "../src/engine/story";
import { expectNoAxeViolations } from "./support/axe";
import { withoutLoader } from "./support/loader";
import {
  calmToggle,
  focusedView,
  LENIS_CLASS,
  scrollAtRest,
  scrollPositionsFor,
  scrollToSlide,
  SLIDE_SCREEN,
  SLIDE_STRETCH,
  slideTop,
  STORY_TIMEOUT_MS,
  touchPage,
  waitForStory,
} from "./support/story";
import {
  asTier2,
  asTier3,
  ENGINE_TIMEOUT_MS,
  FIELD,
  waitForField,
} from "./support/tiers";

// Every tab opens the home page with no loader cover: withoutLoader
// serves each page with its inline script emptied, as a blocked script
// leaves it. e2e/loader.spec.ts covers the cover (REQ-LOAD-01).
test.beforeEach(async ({ context }) => {
  await withoutLoader(context);
});

// The making-of chapter's pass viewer (REQ-ENG-09) at 1280 and 375. Once the
// page's script runs and calm is off, the five pass cards slide sideways
// through a held screen as the page scrolls (home/pass-viewer.tsx,
// pass-slide.ts); in calm mode, under reduced motion and with no script at
// all they lie still in a grid. The sliding row runs on each tier the gate can
// reach: a tier 1 field needs a GPU that passes the probe, so the desktop's
// own choice runs as it is and the test checks the tier it got (tier 1 when
// the probe passes, tier 2 with its reason when the gate's shared GPU is
// slow). Phones always get tier 2 (REQ-TIER-02), so their own choice is the
// forced tier 2 case. What the field draws in a live card is measured headed
// (e2e/gpu/passes.spec.ts); here the page's own marks are read.

const VIEWER = "[data-pass-viewer]";
const SCREEN = `${SLIDE_STRETCH} ${SLIDE_SCREEN}`;
const RAIL = `${VIEWER} [data-part="pass-rail"]`;
const STILL = 'img[data-part="pass-still"]';
// Layout rounds to fractions of a pixel, and each measure is rounded again.
const TOLERANCE_PX = 2;
// pass-card.tsx dims the face of every card of a sliding row but the middle
// one; every card's words keep their full colour (REQ-A11Y-06).
const DIMMED = "0.35";
// A face's opacity changes over 500 ms; a still loads once its face shows.
const SETTLE_MS = 5_000;
const STILL_LOAD_MS = 10_000;
// How far from a whole card the row's place may be, read from the page,
// against slideAt on the same scroll: about four pixels of scroll.
const AT_TOLERANCE = 0.02;
// Long enough for a snap or a pin to move the page.
const STILL_PAGE_MS = 1_000;

type Setup = {
  name: string;
  force: ((page: Page) => Promise<void>) | null;
  tiers: readonly number[];
  desktopOnly: boolean;
};

const SETUPS: readonly Setup[] = [
  { name: "the probe's tier", force: null, tiers: [1, 2], desktopOnly: true },
  { name: "forced tier 2", force: asTier2, tiers: [2], desktopOnly: false },
  { name: "forced tier 3", force: asTier3, tiers: [3], desktopOnly: false },
];

/**
 * The progress through the slide at which the row has glided a share of the
 * way from a card to the next (pass-slide.ts).
 */
function glideProgress(card: number, share: number): number {
  return (
    (card * (SLIDE_REST + SLIDE_MOVE) + SLIDE_REST + share * SLIDE_MOVE) /
    SLIDE_SCREENS
  );
}

function cardOf(page: Page, pass: PassId): Locator {
  return page.locator(`${VIEWER} li[data-pass="${pass}"]`);
}

function faceOf(page: Page, pass: PassId): Locator {
  return page.locator(`${VIEWER} [data-pass-face="${pass}"]`);
}

function passAt(index: number): PassId {
  const pass = PASSES[index];
  if (pass === undefined) throw new Error(`No pass at ${index}`);
  return pass;
}

/** What the viewer marks: by pass, in page order, and the rail's lit ticks. */
type SlideState = {
  /** Cards marked aria-current="step". */
  current: string[];
  /** Faces marked data-middle. */
  marked: string[];
  /** Faces the field draws live in (data-live). */
  live: string[];
  /** The rail's lit ticks, by index. */
  lit: number[];
  /** The row's place, --pass-at on the track; empty without a sliding row. */
  at: string;
};

function slideState(page: Page): Promise<SlideState> {
  return page.locator(VIEWER).evaluate((viewer) => {
    const read = (selector: string, name: string) =>
      [...viewer.querySelectorAll(selector)].map(
        (element) => element.getAttribute(name) ?? "",
      );
    const track = viewer.querySelector<HTMLElement>(
      '[data-part="pass-screen"] > ol',
    );
    const rail = viewer.querySelector('[data-part="pass-rail"]');
    return {
      current: read('li[aria-current="step"]', "data-pass"),
      marked: read("[data-pass-face][data-middle]", "data-pass-face"),
      live: read("[data-pass-face][data-live]", "data-pass-face"),
      lit: [...(rail?.children ?? [])].flatMap((tick, index) =>
        tick.classList.contains("bg-glow") ? [index] : [],
      ),
      at: track?.style.getPropertyValue("--pass-at") ?? "",
    };
  });
}

/** The state with a card resting in the middle of a sliding row. */
function restState(index: number, live: boolean): SlideState {
  const pass = passAt(index);
  return {
    current: [pass],
    marked: [pass],
    live: live ? [pass] : [],
    lit: [index],
    at: String(index),
  };
}

type CardPlace = {
  /** Its centre on the screen's centre. */
  centred: boolean;
  /** Its whole box in the viewport. */
  whole: boolean;
  /** Its face's opacity. */
  opacity: string;
  /** The card's own opacity, which its words take: always 1. */
  words: string;
  detail: string;
};

function cardPlace(page: Page, pass: PassId): Promise<CardPlace> {
  return cardOf(page, pass).evaluate((card, tolerance) => {
    const screen = card.closest('[data-part="pass-screen"]');
    if (screen === null) throw new Error("The card is not on a held screen");
    const box = card.getBoundingClientRect();
    const view = screen.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const offCentre = (box.left + box.right - view.left - view.right) / 2;
    return {
      centred: Math.abs(offCentre) <= tolerance,
      whole:
        box.left >= 0 &&
        box.right <= width &&
        box.top >= 0 &&
        box.bottom <= window.innerHeight,
      opacity: getComputedStyle(card.querySelector("[data-pass-face]") ?? card)
        .opacity,
      words: getComputedStyle(card).opacity,
      detail:
        `${Math.round(box.left)} to ${Math.round(box.right)} px across and ` +
        `${Math.round(box.top)} to ${Math.round(box.bottom)} px down a ` +
        `${width} by ${window.innerHeight} px viewport, ${offCentre.toFixed(1)} px off centre`,
    };
  }, TOLERANCE_PX);
}

/** Each card's face's computed opacity, by pass. */
function faceOpacities(page: Page): Promise<Record<string, string>> {
  return page
    .locator(`${VIEWER} [data-pass-face]`)
    .evaluateAll((faces) =>
      Object.fromEntries(
        faces.map((face) => [
          face.getAttribute("data-pass-face") ?? "",
          getComputedStyle(face).opacity,
        ]),
      ),
    );
}

/** Each card's own computed opacity, which its words take, by pass. */
function wordOpacities(page: Page): Promise<Record<string, string>> {
  return page
    .locator(`${VIEWER} li[data-pass]`)
    .evaluateAll((cards) =>
      Object.fromEntries(
        cards.map((card) => [
          card.getAttribute("data-pass") ?? "",
          getComputedStyle(card).opacity,
        ]),
      ),
    );
}

function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function expectStillLoaded(still: Locator, pass: PassId) {
  await expect
    .poll(
      () =>
        still.evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      { message: `the ${pass} still has loaded`, timeout: STILL_LOAD_MS },
    )
    .toBe(true);
}

/**
 * Waits until no chapter title or intro line is partway through its reveal,
 * so a scan never reads its text mid fade. Text not reached yet stays at
 * opacity 0, which the scan skips.
 */
async function expectRevealsSettled(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            [
              ...document.querySelectorAll(
                "main [data-story-title], main [data-story-title] *, main [data-story-intro], main [data-story-intro] *",
              ),
            ].filter((element) => {
              const opacity = Number(getComputedStyle(element).opacity);
              return opacity > 0 && opacity < 1;
            }).length,
        ),
      { message: "no title or intro mid reveal", timeout: SETTLE_MS },
    )
    .toBe(0);
}

/**
 * A card rests in the middle of the sliding row: marked current and middle
 * alone, its rail tick lit, centred, whole and undimmed with every other
 * card's face dimmed and every card's words at full colour, the held screen
 * filling the view, no sideways scroll; the middle face live, or its still
 * with its alt text where its pass is not drawn live, and every other face
 * an empty frame, since the particles are in the middle card alone.
 */
async function expectAtRest(
  page: Page,
  index: number,
  live: boolean,
  where: string,
): Promise<string> {
  const pass = passAt(index);
  await expect
    .poll(() => slideState(page), {
      message: `${where}: the ${pass} card rests in the middle`,
    })
    .toEqual(restState(index, live));
  await expect
    .poll(() => cardPlace(page, pass), {
      message: `${where}: the ${pass} card is centred, whole and undimmed`,
      timeout: SETTLE_MS,
    })
    .toMatchObject({ centred: true, whole: true, opacity: "1", words: "1" });
  await expect
    .poll(() => faceOpacities(page), {
      message: `${where}: every other card's face is dimmed`,
      timeout: SETTLE_MS,
    })
    .toEqual(
      Object.fromEntries(
        PASSES.map((other) => [other, other === pass ? "1" : DIMMED]),
      ),
    );
  expect(
    await wordOpacities(page),
    `${where}: every card's words keep their full colour`,
  ).toEqual(Object.fromEntries(PASSES.map((other) => [other, "1"])));
  await expect(page.locator(FIELD)).toHaveAttribute(
    "data-chapter",
    "making-of",
  );

  // The screen holds at the top of the view, one screen high.
  const screen = await page.locator(SCREEN).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, height: box.height, view: window.innerHeight };
  });
  expect(Math.abs(screen.top), `${where}: the screen holds`).toBeLessThan(1);
  expect(
    Math.abs(screen.height - screen.view),
    `${where}: the screen fills the view`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(await pageOverflow(page), `${where}: no sideways scroll`).toBe(0);

  for (const other of PASSES) {
    const still = faceOf(page, other).locator(STILL);
    if (other !== pass) {
      await expect(still, `${where}: the ${other} face is empty`).toHaveCount(
        0,
      );
      continue;
    }
    if (live) {
      await expect(still, `${where}: the ${other} face is live`).toHaveCount(0);
      continue;
    }
    await expect(still).toHaveAttribute("alt", passViewer.passes[other].shows);
    await expect(still).toHaveAttribute("src", PASS_STILLS[other]);
  }
  if (!live) await expectStillLoaded(faceOf(page, pass).locator(STILL), pass);

  const place = await cardPlace(page, pass);
  return `${where}: ${pass} in the middle${live ? ", live" : ", its still"}, ${place.detail}`;
}

/**
 * Where a fine pointer scrolls: partway through a glide, while a finger
 * holds the page, the page stays where it was put and the row stands
 * between two cards exactly where slideAt puts it for this scroll; the
 * nearer card is the middle, and the mark streams between it and the card
 * beside it, so both are live where the tier draws their passes (D-127).
 * Once the finger lifts the page settles, gliding over several frames, on
 * the next card in the scroll's direction (D-131); scrolled back up from
 * that card, on the card before it. Returns the lines for the log.
 */
async function expectGlideAndSettle(
  page: Page,
  isLive: (index: number) => boolean,
): Promise<string[]> {
  const lines: string[] = [];
  // The row has read the rest before the glide, so the scroll's direction
  // is down from it; two jumps in one frame reach the page as one scroll.
  await scrollToSlide(page, restProgress(2));
  await expect
    .poll(() => slideState(page))
    .toMatchObject({ current: [passAt(2)] });
  await touchPage(page, true);
  const glideTop = await scrollToSlide(page, glideProgress(2, 0.4));
  const positions = await scrollPositionsFor(page, STILL_PAGE_MS);
  expect(positions, "nothing moves the page by itself").toHaveLength(1);
  expect(Math.abs((positions[0] ?? 0) - glideTop)).toBeLessThan(1);
  const [start, end] = [await slideTop(page, 0), await slideTop(page, 1)];
  const expectedAt = slideAt((glideTop - start) / (end - start));
  await expect
    .poll(async () => {
      const { at, ...marks } = await slideState(page);
      return {
        glide: Math.abs(Number(at) - expectedAt) < AT_TOLERANCE,
        marks,
      };
    })
    .toEqual({
      glide: true,
      marks: {
        current: [passAt(middleCard(expectedAt))],
        marked: [passAt(middleCard(expectedAt))],
        live: [middleCard(expectedAt), glideCard(expectedAt)]
          .filter((index): index is number => index !== null)
          .sort((a, b) => a - b)
          .filter(isLive)
          .map(passAt),
        lit: [middleCard(expectedAt)],
      },
    });
  expect(expectedAt).toBeGreaterThan(2);
  expect(expectedAt).toBeLessThan(3);
  expect(await pageOverflow(page), "no sideways scroll mid glide").toBe(0);
  lines.push(
    `mid glide at scroll ${glideTop} px: the row at ${expectedAt.toFixed(3)}`,
  );

  for (const [from, share, to] of [
    [2, 0.4, 3],
    [3, 0.7, 2],
  ] as const) {
    if (from !== 2) {
      // The page is still on the card before the jump, the last settle's
      // glide over, so the jump alone gives the scroll's direction; on a
      // busy machine a glide can run on after its positions look quiet.
      await scrollToSlide(page, restProgress(from));
      await expect
        .poll(() => slideState(page))
        .toMatchObject({ current: [passAt(from)] });
      await expect
        .poll(async () => (await scrollPositionsFor(page, 300)).length, {
          message: `the page rests on ${passAt(from)}`,
        })
        .toBe(1);
      await touchPage(page, true);
      await scrollToSlide(page, glideProgress(2, share));
    }
    const held = await page.evaluate(() => window.scrollY);
    const heldAt = (await slideState(page)).at;
    const settling = scrollAtRest(page, {
      from: held,
      quietMs: 500,
      timeoutMs: 10_000,
    });
    await touchPage(page, false);
    const settled = await settling;
    const landedAt = settled.at(-1) ?? held;
    const restAt = await slideTop(page, restProgress(to));
    const settleLine =
      `settle from ${passAt(from)} to ${share} of the glide, held at ${Math.round(held)} px with the row at ${heldAt}: ` +
      `${settled.length - 1} positions to ${Math.round(landedAt)} px, ` +
      `${passAt(to)} rests at ${restAt} px`;
    lines.push(settleLine);
    expect(Math.abs(landedAt - restAt), settleLine).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
    expect(settled.length, `${settleLine}: a glide`).toBeGreaterThan(2);
    lines.push(await expectAtRest(page, to, isLive(to), "after the settle"));
  }
  return lines;
}

/** The page's scroll position on every frame for a while: [ms, px] pairs. */
function framePositions(
  page: Page,
  ms: number,
): Promise<Array<[number, number]>> {
  return page.evaluate(
    (duration) =>
      new Promise<Array<[number, number]>>((resolve) => {
        const start = performance.now();
        const out: Array<[number, number]> = [];
        const tick = (now: number) => {
          out.push([now - start, window.scrollY]);
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/**
 * How a move to a target ran, frame by frame: whether it arrived, whether
 * it ever turned back, and its longest stop while still more than two
 * pixels away, after it set off.
 */
function oneGlide(frames: Array<[number, number]>, target: number) {
  const first = frames[0]?.[1] ?? 0;
  const way = Math.sign(target - first);
  let setOff: number | null = null;
  let stillSince: number | null = null;
  let longestStop = 0;
  let turnedBack = false;
  frames.forEach(([ms, y], index) => {
    const before = frames[index - 1]?.[1] ?? first;
    if (Math.sign(y - before) === -way) turnedBack = true;
    if (setOff === null) {
      if (y !== first) setOff = ms;
      return;
    }
    if (Math.abs(target - y) <= TOLERANCE_PX) {
      stillSince = null;
      return;
    }
    if (y === before) {
      stillSince ??= frames[index - 1]?.[0] ?? ms;
      longestStop = Math.max(longestStop, ms - stillSince);
    } else {
      stillSince = null;
    }
  });
  const last = frames.at(-1)?.[1] ?? first;
  return {
    arrived: Math.abs(last - target) <= TOLERANCE_PX,
    turnedBack,
    longestStop: Math.round(longestStop),
    setOff: setOff === null ? null : Math.round(setOff),
  };
}

/**
 * Where Lenis smooths the wheel (a fine pointer): a wheel notch from a
 * card's rest is one glide straight to the next card's rest (D-132), with
 * no stop and no turning back on the way. Returns the line for the log.
 */
async function expectNotchGlide(page: Page): Promise<string> {
  await expect(page.locator("html")).toHaveClass(LENIS_CLASS);
  await scrollToSlide(page, restProgress(1));
  await expect
    .poll(() => slideState(page))
    .toMatchObject({ current: [passAt(1)] });
  await page.waitForTimeout(STILL_PAGE_MS);
  const target = await slideTop(page, restProgress(2));
  const view = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.mouse.move(view.width / 2, view.height / 2);
  const frames = framePositions(page, 2_500);
  await page.mouse.wheel(0, 100);
  const glide = oneGlide(await frames, target);
  const line =
    `one notch from ${passAt(1)}: set off at ${glide.setOff} ms, ` +
    `longest stop on the way ${glide.longestStop} ms, ` +
    `arrived ${glide.arrived} at ${passAt(2)}'s rest, ${target} px`;
  expect(glide, line).toEqual({
    arrived: true,
    turnedBack: false,
    longestStop: expect.any(Number),
    setOff: expect.any(Number),
  });
  // The settle's wait alone was 160 ms; a single glide never stops.
  expect(glide.longestStop, line).toBeLessThan(120);
  await expect
    .poll(() => slideState(page))
    .toMatchObject({ current: [passAt(2)] });
  return line;
}

/**
 * A scroll key in the slide is one glide to the next card (D-133): Arrow
 * Down from a card's rest, then Page Up back, each with no stop and no
 * turning back on the way. Returns the lines for the log.
 */
async function expectKeySteps(page: Page): Promise<string[]> {
  await scrollToSlide(page, restProgress(1));
  await expect
    .poll(() => slideState(page))
    .toMatchObject({ current: [passAt(1)] });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.waitForTimeout(STILL_PAGE_MS);
  const lines: string[] = [];
  for (const [key, to] of [
    ["ArrowDown", 2],
    ["PageUp", 1],
  ] as const) {
    const target = await slideTop(page, restProgress(to));
    const frames = framePositions(page, 2_000);
    await page.keyboard.press(key);
    const glide = oneGlide(await frames, target);
    const line =
      `${key} in the slide: longest stop on the way ${glide.longestStop} ms, ` +
      `arrived ${glide.arrived} at ${passAt(to)}'s rest, ${target} px`;
    lines.push(line);
    expect(glide.arrived, line).toBe(true);
    expect(glide.turnedBack, line).toBe(false);
    expect(glide.longestStop, line).toBeLessThan(120);
    await expect
      .poll(() => slideState(page))
      .toMatchObject({ current: [passAt(to)] });
  }
  return lines;
}

/**
 * On a touch screen a swipe that starts in the slide is the row's (D-133):
 * the page follows the finger and, when it lifts, glides to the next card
 * its way after a short swipe, slow as it is here, or back to its card
 * after a touch. A jump that ends between two cards settles on one
 * (D-131). No scroll snap is left on the page. Returns the lines for the
 * log.
 */
async function expectTouchSteps(page: Page): Promise<string[]> {
  const rests = await Promise.all(
    PASSES.map((_, index) => slideTop(page, restProgress(index))),
  );
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollSnapType,
    ),
  ).toBe("none");
  const between = await scrollToSlide(page, glideProgress(1, 0.5));
  const jumped = (
    await scrollAtRest(page, { quietMs: 500, timeoutMs: 5_000 })
  ).at(-1);
  const jumpLine = `a jump to ${between} px, between two cards, settled at ${jumped} px`;
  expect(
    [rests[1], rests[2]].some(
      (rest) => Math.abs((jumped ?? 0) - (rest ?? 0)) <= TOLERANCE_PX,
    ),
    jumpLine,
  ).toBe(true);

  const cdp = await page.context().newCDPSession(page);
  const view = page.viewportSize() ?? { width: 375, height: 812 };
  const x = Math.round(view.width / 2);
  const middleY = Math.round(view.height * 0.55);
  // A slow swipe: the finger moves in small steps, then stops before it
  // lifts, so nothing about it is quick.
  const swipe = async (up: number) => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: middleY }],
    });
    for (let step = 1; step <= 6; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: middleY - (step * up) / 6 }],
      });
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(200);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };

  const lines = [jumpLine];
  for (const [up, from, to, what] of [
    [24, 2, 3, "a slow 24 px swipe up the screen"],
    [-24, 3, 2, "a slow 24 px swipe down the screen"],
    [8, 2, 2, "an 8 px touch"],
  ] as const) {
    await scrollToSlide(page, restProgress(from));
    await expect
      .poll(() => slideState(page))
      .toMatchObject({ current: [passAt(from)] });
    await page.waitForTimeout(STILL_PAGE_MS);
    const target = rests[to] ?? 0;
    const frames = framePositions(page, 2_500);
    await swipe(up);
    const glide = oneGlide(await frames, target);
    const landed = await page.evaluate(() => window.scrollY);
    const line =
      `${what} from ${passAt(from)}: landed at ${Math.round(landed)} px, ` +
      `${passAt(to)} rests at ${target} px`;
    lines.push(line);
    expect(Math.abs(landed - target), line).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(glide.arrived, line).toBe(true);
    await expect
      .poll(() => slideState(page))
      .toMatchObject({ current: [passAt(to)] });
  }
  await cdp.detach();
  return lines;
}

/**
 * The still grid of calm mode and reduced motion: the five cards in a grid
 * of one, two or three columns by width, nothing marked, dimmed or live, no
 * stretch and no rail, and every face with its still, loaded.
 */
async function expectStillGrid(page: Page) {
  const viewer = page.locator(VIEWER);
  await expect(viewer).not.toHaveAttribute("data-sliding");
  await expect(page.locator(SLIDE_STRETCH)).toHaveCount(0);
  await expect(page.locator(RAIL)).toHaveCount(0);
  await expect(viewer.getByRole("button")).toHaveCount(0);

  const cards = viewer
    .getByRole("list", { name: passViewer.group, exact: true })
    .locator(":scope > li");
  expect(
    await cards.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-pass")),
    ),
  ).toEqual([...PASSES]);
  expect(await slideState(page)).toEqual({
    current: [],
    marked: [],
    live: [],
    lit: [],
    at: "",
  });

  for (const pass of PASSES) {
    const copy = passViewer.passes[pass];
    const card = cardOf(page, pass);
    await expect(card).toHaveCSS("opacity", "1");
    await expect(faceOf(page, pass)).toHaveCSS("opacity", "1");
    await expect(
      card.getByRole("heading", { level: 3, name: copy.title, exact: true }),
    ).toHaveCount(1);
    await expect(
      card.getByText(passPosition(pass), { exact: true }),
    ).toHaveCount(1);
    const still = faceOf(page, pass).locator(STILL);
    await expect(still).toHaveAttribute("alt", copy.shows);
    await expect(still).toHaveAttribute("src", PASS_STILLS[pass]);
    await still.scrollIntoViewIfNeeded();
    await expectStillLoaded(still, pass);
  }

  // sm:grid-cols-2 from 640 px, lg:grid-cols-3 from 1024 px.
  const { width, columns } = await cards.evaluateAll((items) => {
    const top = items[0]?.getBoundingClientRect().top ?? 0;
    return {
      width: window.innerWidth,
      columns: items.filter(
        (item) => Math.abs(item.getBoundingClientRect().top - top) < 1,
      ).length,
    };
  });
  expect(columns, `${width} px wide`).toBe(
    width >= 1024 ? 3 : width >= 640 ? 2 : 1,
  );

  // Each card is its face above its words, inside its own column: no face
  // wider than the column and no words squeezed beside the face or spilling
  // into the next card.
  const layout = await cards.evaluateAll((items) =>
    items.map((item) => {
      const card = item.getBoundingClientRect();
      const face = item
        .querySelector("[data-pass-face]")
        ?.getBoundingClientRect();
      const words = item
        .querySelector('[data-plate="own"]')
        ?.parentElement?.getBoundingClientRect();
      if (face === undefined || words === undefined) {
        throw new Error(
          `${item.getAttribute("data-pass")} lacks its face or words`,
        );
      }
      const inside = (box: DOMRect) =>
        box.left >= card.left - 1 && box.right <= card.right + 1;
      return {
        pass: item.getAttribute("data-pass"),
        faceInside: inside(face),
        wordsInside: inside(words),
        stacked: face.bottom <= words.top + 1,
        wordsFill: words.width >= card.width - 1,
      };
    }),
  );
  for (const card of layout) {
    expect(card, `${card.pass} at ${width} px wide`).toEqual({
      pass: card.pass,
      faceInside: true,
      wordsInside: true,
      stacked: true,
      wordsFill: true,
    });
  }
}

for (const setup of SETUPS) {
  test(`REQ-ENG-09 REQ-SCR-02 REQ-A11Y-02 REQ-A11Y-01 on ${setup.name} the passes slide through a held screen: each card rests in the middle current and whole, live only there and only for its tier's passes, its still in the middle where its pass is not live and an empty frame everywhere else, reached by a click or by Tab`, async ({
    page,
  }, testInfo) => {
    test.skip(
      setup.desktopOnly && testInfo.project.name !== "desktop",
      "Phones get tier 2 before WebGPU is looked at (REQ-TIER-02)",
    );
    test.setTimeout(ENGINE_TIMEOUT_MS + 120_000);

    if (setup.force !== null) await setup.force(page);
    await page.goto("/");
    const { tier, reason } = await waitForField(page);
    expect(setup.tiers, `tier ${tier}, reason ${reason}`).toContain(tier);
    await waitForStory(page);

    // Live cards only on the halftone, whose own steps the passes are, and
    // only for the passes the tier draws.
    const look = await page.locator(FIELD).getAttribute("data-look");
    expect(look, "a live tier says how it draws; tier 3 says nothing").toEqual(
      tier === 3 ? null : expect.stringMatching(/^(?:halftone|soft)$/),
    );
    const tierLive: readonly PassId[] =
      (tier === 1 || tier === 2) && look === "halftone"
        ? LIVE_PASSES[tier]
        : [];
    const isLive = (index: number) => tierLive.includes(passAt(index));
    const lines: string[] = [
      `tier ${tier}, reason ${reason}, look ${look ?? "none"}, live ${tierLive.join(", ") || "none"}`,
    ];

    // The page's script turned the still grid into the sliding row.
    const viewer = page.locator(VIEWER);
    await expect(viewer).toHaveAttribute("data-sliding", "");

    // Five cards in the frame's order. Each face is a button named by its
    // number and pass and described by what its picture shows; each card
    // keeps its whole breakdown.
    const list = viewer.getByRole("list", {
      name: passViewer.group,
      exact: true,
    });
    await expect(list).toHaveCount(1);
    expect(
      await list
        .locator(":scope > li")
        .evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-pass")),
        ),
    ).toEqual([...PASSES]);
    for (const pass of PASSES) {
      const copy = passViewer.passes[pass];
      const card = cardOf(page, pass);
      const button = card.getByRole("button");
      await expect(button).toHaveAccessibleName(
        `${passPosition(pass)}: ${copy.title}`,
      );
      await expect(button).toHaveAccessibleDescription(copy.shows);
      await expect(
        card.getByRole("heading", { level: 3, name: copy.title, exact: true }),
      ).toHaveCount(1);
      await expect(
        card.getByText(passPosition(pass), { exact: true }),
      ).toHaveCount(1);
      for (const paragraph of copy.body) {
        await expect(card.getByText(paragraph, { exact: true })).toHaveCount(1);
      }
    }

    // The stretch is STRETCH_SCREENS screens, its screen sticky at the top
    // and clipped across, so the row never scrolls the page sideways; the
    // rail of ticks is for the eye only.
    const view = await page.evaluate(() => window.innerHeight);
    const stretch = await page
      .locator(SLIDE_STRETCH)
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(
      Math.abs(stretch - STRETCH_SCREENS * view),
      `the stretch is ${STRETCH_SCREENS} screens: ${stretch} px of a ${view} px screen`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
    const screen = page.locator(SCREEN);
    await expect(screen).toHaveCSS("position", "sticky");
    await expect(screen).toHaveCSS("top", "0px");
    await expect(screen).toHaveCSS("overflow-x", "clip");
    await expect(page.locator(RAIL)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(`${RAIL} > span`)).toHaveCount(PASSES.length);

    // Above the stretch the row waits at its first card.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect
      .poll(() => slideState(page), { message: "the first card waits" })
      .toEqual(restState(0, isLive(0)));

    // At the stretch's start the first card rests in the middle; at each
    // card's rest, that card does.
    await scrollToSlide(page, 0);
    lines.push(await expectAtRest(page, 0, isLive(0), "the stretch's start"));
    for (const index of PASSES.keys()) {
      await scrollToSlide(page, restProgress(index));
      lines.push(
        await expectAtRest(
          page,
          index,
          isLive(index),
          `the ${passAt(index)} card's rest`,
        ),
      );
    }

    // On a touch screen a swipe in the slide is the row's (D-133), and the
    // checks of the row mid glide, the wheel and the keys run where a fine
    // pointer scrolls.
    const isTouch = await page.evaluate(
      () => window.matchMedia("(pointer: coarse)").matches,
    );
    if (isTouch) {
      lines.push(...(await expectTouchSteps(page)));
    } else {
      lines.push(...(await expectGlideAndSettle(page, isLive)));
      lines.push(await expectNotchGlide(page));
      lines.push(...(await expectKeySteps(page)));
    }

    // A click on the next card's face glides the page over several frames
    // to where that card rests. On a wide screen the face shows beside the
    // card at rest; on a phone it is off the screen there, so its click is
    // sent to the button itself.
    await scrollToSlide(page, restProgress(0));
    await expect
      .poll(() => slideState(page))
      .toMatchObject({ current: [passAt(0)] });
    const target = await slideTop(page, restProgress(1));
    const from = await page.evaluate(() => window.scrollY);
    const glide = scrollAtRest(page, {
      from,
      quietMs: 500,
      timeoutMs: 10_000,
    });
    const next = cardOf(page, passAt(1)).getByRole("button");
    if (isTouch) await next.dispatchEvent("click");
    else await next.click();
    const glided = await glide;
    const landed = glided.at(-1) ?? from;
    const clickLine =
      `click on the ${passAt(1)} card at scroll ${Math.round(from)} px: ` +
      `${glided.length - 1} positions to ${Math.round(landed)} px, its rest at ${target} px`;
    lines.push(clickLine);
    expect(Math.abs(landed - target), clickLine).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
    expect(glided.length, `${clickLine}: a glide, not a jump`).toBeGreaterThan(
      2,
    );
    lines.push(await expectAtRest(page, 1, isLive(1), "after the click"));

    // Tab and Shift+Tab move from card to card, and each takes the page at
    // once to where its card rests: in the middle, whole and in view.
    await cardOf(page, passAt(1)).getByRole("button").focus();
    const keys = [
      ["Tab", 2],
      ["Tab", 3],
      ["Tab", 4],
      ["Shift+Tab", 3],
      ["Shift+Tab", 2],
      ["Shift+Tab", 1],
      ["Shift+Tab", 0],
    ] as const;
    for (const [key, index] of keys) {
      const pass = passAt(index);
      await page.keyboard.press(key);
      const where = `${key} to the ${pass} card`;
      await expect(cardOf(page, pass).getByRole("button"), where).toBeFocused();
      const placed = await expectAtRest(page, index, isLive(index), where);
      await expect
        .poll(
          async () => {
            const focus = await focusedView(page);
            return {
              whole:
                focus.top >= 0 &&
                focus.bottom <= focus.viewHeight &&
                focus.left >= 0 &&
                focus.right <= focus.viewWidth,
              hidden: focus.hiddenParts,
            };
          },
          { message: `${where}: in view and whole`, timeout: SETTLE_MS },
        )
        .toEqual({ whole: true, hidden: [] });
      const scrollY = await page.evaluate(() => window.scrollY);
      const rest = await slideTop(page, restProgress(index));
      lines.push(
        `${placed}, scroll ${Math.round(scrollY)} px, rest ${rest} px`,
      );
    }

    // After the viewer, a panel with the link to the full making-of and what
    // a frame costs on each tier.
    const section = page.locator('main section[data-chapter="making-of"]');
    const link = section.getByRole("link", {
      name: pages.home.makingOf.link.label,
      exact: true,
    });
    await expect(link).toHaveAttribute("href", pages.home.makingOf.link.href);
    const rows = section.locator("dl > div");
    await expect(rows).toHaveCount(passViewer.tiers.length);
    for (const [index, row] of passViewer.tiers.entries()) {
      for (const part of row.tier) {
        await expect(rows.nth(index).locator("dt")).toContainText(part);
      }
      await expect(rows.nth(index).locator("dd")).toHaveText(row.value);
    }
    const order = await page.evaluate((href) => {
      const viewerElement = document.querySelector("[data-pass-viewer]");
      const making = document.querySelector(
        'main section[data-chapter="making-of"]',
      );
      const linkElement = making?.querySelector(`a[href="${href}"]`) ?? null;
      const table = making?.querySelector("dl") ?? null;
      if (!viewerElement || !linkElement || !table) {
        throw new Error("The making-of lacks its viewer, link or table");
      }
      const follows = (element: Element) =>
        Boolean(
          viewerElement.compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      const bottom = viewerElement.getBoundingClientRect().bottom;
      return {
        linkFollows: follows(linkElement),
        tableFollows: follows(table),
        linkBelow: linkElement.getBoundingClientRect().top >= bottom,
        tableBelow: table.getBoundingClientRect().top >= bottom,
      };
    }, pages.home.makingOf.link.href);
    expect(order).toEqual({
      linkFollows: true,
      tableFollows: true,
      linkBelow: true,
      tableBelow: true,
    });

    const line = `making-of ${testInfo.project.name} ${setup.name}:\n${lines.join("\n")}`;
    console.log(line);
    testInfo.annotations.push({
      type: "pass-viewer",
      description: lines.join("; "),
    });

    await expectRevealsSettled(page);
    await expectNoAxeViolations(page);
  });
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  // Read with locators alone, as the other pages' no script tests are.
  test("REQ-CNT-01 REQ-ENG-09 the static HTML holds the five passes as a still grid, each card with its breakdown and its still, nothing marked", async ({
    page,
  }) => {
    await page.goto("/");
    const viewer = page.locator(VIEWER);
    await expect(viewer).not.toHaveAttribute("data-sliding");
    await expect(page.locator(SLIDE_STRETCH)).toHaveCount(0);
    await expect(page.locator(RAIL)).toHaveCount(0);
    await expect(viewer.getByRole("button")).toHaveCount(0);
    await expect(
      viewer.locator("[aria-current], [data-middle], [data-live]"),
    ).toHaveCount(0);

    const cards = viewer
      .getByRole("list", { name: passViewer.group, exact: true })
      .locator(":scope > li");
    await expect(cards).toHaveCount(PASSES.length);
    for (const [index, pass] of PASSES.entries()) {
      const copy = passViewer.passes[pass];
      const card = cards.nth(index);
      await expect(card).toHaveAttribute("data-pass", pass);
      await expect(
        card.getByText(passPosition(pass), { exact: true }),
      ).toBeVisible();
      await expect(
        card.getByRole("heading", { level: 3, name: copy.title, exact: true }),
      ).toBeVisible();
      for (const paragraph of copy.body) {
        await expect(card.getByText(paragraph, { exact: true })).toBeVisible();
      }
      const still = card.locator(STILL);
      await expect(still).toHaveAttribute("alt", copy.shows);
      await expect(still).toHaveAttribute("src", PASS_STILLS[pass]);
    }
  });
});

test("REQ-ENG-09 REQ-A11Y-04 REQ-A11Y-01 with calm mode on, the passes lie still in a grid with every still and nothing marked or live, and slide again once calm is off", async ({
  page,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);
  // A live tier, so calm is seen to keep every card on its still.
  await asTier2(page);
  await page.goto("/");
  expect((await waitForField(page)).tier).toBe(2);
  await waitForStory(page);
  const look = await page.locator(FIELD).getAttribute("data-look");
  const viewer = page.locator(VIEWER);
  await expect(viewer).toHaveAttribute("data-sliding", "");

  const toggle = calmToggle(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expectStillGrid(page);
  await expectRevealsSettled(page);
  await expectNoAxeViolations(page);

  // Calm off again: the row slides, its first card in the middle above the
  // stretch.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(viewer).toHaveAttribute("data-sliding", "");
  await expect(page.locator(SLIDE_STRETCH)).toHaveCount(1);
  await expect
    .poll(() => slideState(page))
    .toEqual(
      restState(0, look === "halftone" && LIVE_PASSES[2].includes(passAt(0))),
    );
});

test("REQ-ENG-09 REQ-A11Y-03 under reduced motion the passes never slide: the still grid stays, with every still", async ({
  page,
}) => {
  test.setTimeout(STORY_TIMEOUT_MS + 60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  // The story starts after the page's script has taken the page over.
  expect(await waitForStory(page), "the story runs calm").toBe("fade");
  await expect(calmToggle(page)).toHaveAttribute("aria-checked", "true");
  await expectStillGrid(page);
});
