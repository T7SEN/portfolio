import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  EXIT_LIMIT_MS,
  LOADER_ATTRIBUTE,
  LOADER_OFF_ATTRIBUTE,
} from "../src/components/loader/loader-config";
import { RIPPLE_MS } from "../src/components/loader/scene/ripple";
import { fullStudies, studyHref } from "../src/content";
import { heroCopy, STATIC_TIER } from "../src/content/hero";
import { loaderCopy } from "../src/content/loader";
import {
  LIFT_LIMIT_MS,
  MIN_COVER_MS,
  READY_HOLD_MS,
} from "../src/lib/loader-store";
import { expectNoAxeViolations } from "./support/axe";
import {
  COVER,
  COVER_CANVAS,
  COVER_STATUS,
  expectPageFree,
  firstMark,
  holdEngine,
  liftTimes,
  LIFT_TIMEOUT_MS,
  reachOf,
  readLoaderLog,
  recordLoader,
  waitForLift,
  withCalmKey,
  withoutLoader,
  type LiftTimes,
} from "./support/loader";
import {
  asTier2,
  asTier3,
  CANVAS,
  ENGINE_TIMEOUT_MS,
  FIELD,
  STILL,
  withoutAnyGpu,
} from "./support/tiers";

// The home page's loader cover in the production build, headless, at 1280
// and 375 (phase P4.5, REQ-LOAD-01). The cover shows on every full load of
// "/" and after a move there from inside the site while the field has not
// drawn, unless the test says otherwise (D-144). Many workers share the
// CPU and one GPU here; the tier the GPU test chooses with the cover
// drawing is compared headed, alone (e2e/headed/loader.spec.ts).
test.describe.configure({ timeout: LIFT_TIMEOUT_MS + 60_000 });

const HERO = heroCopy(STATIC_TIER);

// The store hands its wait to setTimeout, which counts whole milliseconds,
// so a lift can land a fraction of one before its due time as the paint
// entry counts it.
const TIMER_ROUNDING_MS = 2;
// A mark is taken when the observer runs, at the end of the task that
// changed the attribute, so it can trail the time the store saw by that
// task's length.
const MARK_LAG_MS = 50;
// How late a lift may begin after it is due while the gate's workers share
// the CPU: the store's timer, then React's render of the leaving cover.
const LIFT_SLACK_MS = 1_000;
// How much shorter than RIPPLE_MS the ripple may measure. The scene times it
// from the first frame after the call, and Chrome stamps a frame with the
// time it began: while a long task holds the main thread at the lift (a tier
// 3 lift lands as the page renders the still), that time comes before the
// cover's leaving mark, by up to that task's length (91 ms seen on the phone
// project with 14 workers).
const RIPPLE_SLACK_MS = 250;
// How long a test watches for a cover that must never show: the cover's
// minimum, so one that showed would still be up.
const WATCH_MS = MIN_COVER_MS + 500;

const html = (page: Page) => page.locator("html");

/**
 * The lift began when it was due, and never before the minimum: due is the
 * mark it waits for (the field's ready plus the hold, or the tier 3
 * choice), in ms from the first paint, or null for the time limit.
 */
function expectLiftDue(times: LiftTimes, due: number | null) {
  const { leaving, line } = times;
  expect(
    leaving,
    `never before ${MIN_COVER_MS} ms: ${line}`,
  ).toBeGreaterThanOrEqual(MIN_COVER_MS - TIMER_ROUNDING_MS);
  if (due === null) {
    expect(
      leaving,
      `not before the time limit: ${line}`,
    ).toBeGreaterThanOrEqual(LIFT_LIMIT_MS - TIMER_ROUNDING_MS);
    expect(leaving, `at the time limit: ${line}`).toBeLessThanOrEqual(
      LIFT_LIMIT_MS + LIFT_SLACK_MS,
    );
    return;
  }
  expect(leaving, `not before it was due: ${line}`).toBeGreaterThanOrEqual(
    due - MARK_LAG_MS,
  );
  expect(leaving, `as soon as it was due: ${line}`).toBeLessThanOrEqual(
    Math.max(MIN_COVER_MS, due) + LIFT_SLACK_MS,
  );
}

/**
 * The cover lifted once the field had drawn and "Field ready" had held; or,
 * where the gate's shared GPU kept the field from drawing before the time
 * limit, at the limit, which is the rule then. The phone reaches ready well
 * inside the limit; the desktop has come within 2 s of it in the gate, so
 * which rule held is recorded with the test.
 */
function expectReadyOrLimit(times: LiftTimes, testInfo: TestInfo) {
  const { line } = times;
  if (times.outcome === "field") {
    if (times.ready === null) throw new Error(`No ready: ${line}`);
    expectLiftDue(times, times.ready + READY_HOLD_MS);
    expect(times.atLeaving.field?.ready, line).toBe("true");
    expect(times.atLeaving.cover?.label, line).toContain(loaderCopy.ready);
    testInfo.annotations.push({ type: "rule", description: "lifted on ready" });
    return;
  }
  expect(times.outcome, line).toBe("limit");
  if (times.ready !== null) {
    expect(times.ready, line).toBeGreaterThanOrEqual(
      LIFT_LIMIT_MS - MARK_LAG_MS,
    );
  }
  expectLiftDue(times, null);
  testInfo.annotations.push({
    type: "rule",
    description:
      "lifted at the time limit: the field had not drawn by then on the gate's shared GPU",
  });
}

/**
 * The ripple played whole, as it does on every outcome: it began as the
 * cover began to leave and freed the page when it ended, not at the cut-off.
 */
function expectRipple(times: LiftTimes) {
  expect(times.atLeaving.cover?.exit, times.line).toBe("ripple");
  const length = times.done - times.leaving;
  expect(length, `the ripple's length: ${times.line}`).toBeGreaterThanOrEqual(
    RIPPLE_MS - RIPPLE_SLACK_MS,
  );
  expect(length, `the ripple's length: ${times.line}`).toBeLessThan(
    EXIT_LIMIT_MS,
  );
}

/**
 * The hero as a visitor meets it once the cover has gone, its field drawn:
 * at once after a lift on ready, or once it arrives after a lift at the
 * time limit.
 */
async function expectUncoveredHero(page: Page) {
  await expectPageFree(page);
  const field = page.locator(FIELD);
  await expect(field).toHaveAttribute("data-ready", "true", {
    timeout: ENGINE_TIMEOUT_MS,
  });
  await expect(field).toHaveAttribute("data-tier", /^[12]$/);
  await expect(field).toHaveCSS("opacity", "1");
  await expect(page.locator(CANVAS)).toHaveCount(1);
  await expect(page.locator(COVER_CANVAS)).toHaveCount(0);
  await expectHeroReachable(page);
}

/** See the work and Skip intro are on the screen, and a pointer reaches each. */
async function expectHeroReachable(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  for (const name of [HERO.primaryAction, HERO.cornerControl]) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toBeInViewport({ ratio: 1 });
    expect(await reachOf(link), name).toEqual({
      inert: false,
      underCover: false,
      hit: true,
    });
  }
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("REQ-LOAD-01 REQ-CNT-01 the home page shows no cover and every heading is readable", async ({
    page,
  }) => {
    await page.goto("/");
    // The cover's markup is in the static HTML, and stays hidden.
    await expect(page.locator(COVER)).toHaveCount(1);
    await expect(page.locator(COVER)).toHaveCSS("display", "none");
    await expect(html(page)).not.toHaveAttribute(LOADER_ATTRIBUTE);
    await expect(html(page)).not.toHaveAttribute(LOADER_OFF_ATTRIBUTE);
    await expect(
      page.getByText(loaderCopy.steps[1], { exact: true }),
    ).toBeHidden();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      HERO.headline,
    );
    const headings = page.locator("main").getByRole("heading");
    const count = await headings.count();
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index += 1) {
      await expect(headings.nth(index)).toBeVisible();
    }
  });
});

// The tests that wait for the field force tier 2 on the desktop, as a phone
// has it by itself, so the 2 s GPU test on the gate's shared GPU does not
// push the field past the cover's time limit. The tier the GPU test chooses
// with the cover drawing is checked headed and alone
// (e2e/headed/loader.spec.ts).
test("REQ-LOAD-01 REQ-NAV-01 on a load of the home page the cover lifts once the field has drawn, and the ripple ends on the uncovered hero with the field drawn and the cover and its canvas gone", async ({
  page,
}, testInfo) => {
  test.setTimeout(LIFT_TIMEOUT_MS + ENGINE_TIMEOUT_MS + 30_000);
  await asTier2(page);
  await recordLoader(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("dialog", { name: loaderCopy.name, exact: true }),
  ).toBeVisible();

  await waitForLift(page);
  const log = await readLoaderLog(page);
  expect(firstMark(log, "html", LOADER_ATTRIBUTE, "up")).not.toBeNull();
  const times = liftTimes(log);
  testInfo.annotations.push({ type: "lift", description: times.line });

  expectReadyOrLimit(times, testInfo);
  expectRipple(times);
  await expectUncoveredHero(page);
});

test("REQ-LOAD-01 REQ-TIER-03 with Save-Data the cover lifts at the 2 s minimum onto the tier 3 still", async ({
  page,
}, testInfo) => {
  await asTier3(page);
  await recordLoader(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForLift(page);
  const times = liftTimes(await readLoaderLog(page));
  testInfo.annotations.push({ type: "lift", description: times.line });

  expect(times.outcome, times.line).toBe("still");
  expect(times.atLeaving.cover?.label, times.line).toBe(loaderCopy.still);
  if (times.tier === null) throw new Error(`No tier: ${times.line}`);
  expectLiftDue(times, times.tier);
  expectRipple(times);

  await expectPageFree(page);
  const field = page.locator(FIELD);
  await expect(field).toHaveAttribute("data-tier", "3");
  await expect(field).toHaveAttribute("data-tier-reason", "save-data");
  await expect(page.locator(STILL)).toHaveCSS("opacity", "1");
  await expect(field).toHaveCSS("opacity", "1");
  await expectHeroReachable(page);
});

test("REQ-LOAD-01 REQ-NAV-01 a full load of a link into the home page, /#work, lands on its part once the cover lifts", async ({
  page,
}, testInfo) => {
  await asTier3(page);
  await recordLoader(page);
  await page.goto("/#work", { waitUntil: "domcontentloaded" });
  await waitForLift(page);
  const times = liftTimes(await readLoaderLog(page));
  testInfo.annotations.push({ type: "lift", description: times.line });

  await expect(page.locator(COVER)).toHaveCount(0);
  expect(
    await page.evaluate(() => document.querySelectorAll("[inert]").length),
  ).toBe(0);
  await expect
    .poll(() =>
      page
        .locator("#work")
        .evaluate((element) =>
          Math.abs(Math.round(element.getBoundingClientRect().top)),
        ),
    )
    .toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("REQ-LOAD-01 REQ-ENG-08 with no usable GPU the cover lifts onto the tier 3 page at the 2 s minimum, or once tier 3 is chosen", async ({
  page,
}, testInfo) => {
  await withoutAnyGpu(page);
  await recordLoader(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForLift(page);
  const times = liftTimes(await readLoaderLog(page));
  testInfo.annotations.push({ type: "lift", description: times.line });

  expect(times.outcome, times.line).toBe("still");
  if (times.tier === null) throw new Error(`No tier: ${times.line}`);
  expectLiftDue(times, times.tier);
  expectRipple(times);

  await expectPageFree(page);
  const field = page.locator(FIELD);
  await expect(field).toHaveAttribute("data-tier", "3");
  await expect(field).toHaveAttribute("data-tier-reason", "no-backend");
  await expectHeroReachable(page);
});

test("REQ-LOAD-01 REQ-ENG-08 an engine chunk that fails to load lifts the cover onto the page as it is, at the 2 s minimum or once tier 3 is chosen", async ({
  page,
}, testInfo) => {
  const engine = await holdEngine(page, "abort");
  await recordLoader(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await engine.requested;
  await waitForLift(page);
  const times = liftTimes(await readLoaderLog(page));
  testInfo.annotations.push({ type: "lift", description: times.line });

  expect(times.outcome, times.line).toBe("still");
  if (times.tier === null) throw new Error(`No tier: ${times.line}`);
  expectLiftDue(times, times.tier);
  expectRipple(times);

  await expectPageFree(page);
  const field = page.locator(FIELD);
  await expect(field).toHaveAttribute("data-tier", "3");
  await expect(field).toHaveAttribute("data-tier-reason", "no-backend");
  await expectHeroReachable(page);
});

test("REQ-LOAD-01 an engine chunk that never answers lifts the cover at the time limit onto the page as it is", async ({
  page,
}, testInfo) => {
  const engine = await holdEngine(page, "hold");
  try {
    await recordLoader(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await engine.requested;
    await waitForLift(page);
    const times = liftTimes(await readLoaderLog(page));
    testInfo.annotations.push({ type: "lift", description: times.line });

    expect(times.outcome, times.line).toBe("limit");
    expect(times.atLeaving.cover?.label, times.line).toBe(loaderCopy.open);
    expectLiftDue(times, null);
    expectRipple(times);
    expect(times.ready, times.line).toBeNull();

    await expectPageFree(page);
    await expect(page.locator(FIELD)).not.toHaveAttribute("data-ready", "true");
    await expectHeroReachable(page);
  } finally {
    engine.release();
  }
});

/**
 * Everything a visitor might try on the cover: the keys, a click at the
 * middle, each corner and where the hero's links and the logo lie under
 * it, the wheel and, on a touch screen, a swipe. None of it may lift the
 * cover, move the page or follow a link.
 */
async function tryToLift(page: Page, hasTouch: boolean) {
  for (const key of ["Tab", "Enter", "Space", "Escape", "Shift+Tab", "Enter"]) {
    await page.keyboard.press(key);
  }
  const view = page.viewportSize();
  if (view === null) throw new Error("the project sets no viewport");
  const points = [
    { x: view.width / 2, y: view.height / 2 },
    { x: 8, y: 8 },
    { x: view.width - 8, y: 8 },
    { x: 8, y: view.height - 8 },
    { x: view.width - 8, y: view.height - 8 },
  ];
  for (const locator of [
    page.getByRole("link", { name: HERO.primaryAction, exact: true }),
    page.getByRole("link", { name: HERO.cornerControl, exact: true }),
    page.getByRole("link", { name: "T7SEN, home", exact: true }),
  ]) {
    // The box is there under the cover, though nothing can reach it.
    const box = await locator.boundingBox();
    if (box !== null) {
      points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
  }
  for (const { x, y } of points) await page.mouse.click(x, y);
  await page.mouse.wheel(0, 800);

  if (hasTouch) {
    const cdp = await page.context().newCDPSession(page);
    const x = Math.round(view.width / 2);
    const from = Math.round(view.height * 0.7);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: from }],
    });
    for (let step = 1; step <= 6; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: from - step * 60 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  }

  // Long enough for a lift, a scroll or a navigation to have begun.
  await page.waitForTimeout(500);
  const state = await page.evaluate((cover) => {
    const element = document.querySelector(cover);
    return {
      loader: document.documentElement.getAttribute("data-loader"),
      state: element?.getAttribute("data-loader-state") ?? null,
      scrollY: window.scrollY,
      at: `${location.pathname}${location.hash}`,
      now: performance.now(),
    };
  }, COVER);
  expect(state.loader).toBe("up");
  expect(state.state).not.toBe("leaving");
  expect(state.state).not.toBeNull();
  expect(state.scrollY).toBe(0);
  expect(state.at).toBe("/");
  return state.now;
}

test("REQ-LOAD-01 REQ-NAV-01 nothing on the cover lifts it: keys, clicks anywhere, the wheel and a swipe, before and after the 2 s minimum", async ({
  page,
}, testInfo) => {
  const hasTouch = testInfo.project.use.hasTouch === true;
  const engine = await holdEngine(page, "hold");
  try {
    await recordLoader(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(COVER)).toHaveAttribute("data-loader-owned", "");
    const early = await tryToLift(page, hasTouch);

    // Again once the minimum has passed, while the held engine keeps the
    // field from drawing.
    const paint = (await readLoaderLog(page)).firstPaint ?? 0;
    await page.waitForFunction(
      (after) => performance.now() > after,
      paint + MIN_COVER_MS + 500,
    );
    const late = await tryToLift(page, hasTouch);
    testInfo.annotations.push({
      type: "inputs",
      description: `tried at ${Math.round(early - paint)} and ${Math.round(late - paint)} ms from the first paint${hasTouch ? ", with a swipe" : ""}`,
    });

    const releasedAt = await page.evaluate(() => performance.now());
    engine.release();
    await waitForLift(page);
    const times = liftTimes(await readLoaderLog(page));
    testInfo.annotations.push({ type: "lift", description: times.line });
    // The cover went only after the release: once the field had drawn, or
    // at the time limit where the shared GPU kept it from drawing in time.
    expect(["field", "limit"], times.line).toContain(times.outcome);
    expect(times.leaving + times.origin, times.line).toBeGreaterThan(
      releasedAt,
    );
    if (times.outcome === "field") await expectUncoveredHero(page);
    else {
      await expectPageFree(page);
      await expectHeroReachable(page);
    }
  } finally {
    engine.release();
  }
});

test("REQ-LOAD-01 REQ-A11Y-01 REQ-A11Y-02 while the cover is up it names what it waits for, the page under it is inert and takes no focus, and axe finds nothing; once it lifts, focus is at the top and axe still finds nothing", async ({
  page,
}) => {
  const engine = await holdEngine(page, "hold");
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const cover = page.locator(COVER);
    await expect(cover).toHaveAttribute("data-loader-owned", "");
    await expect(
      page.getByRole("dialog", { name: loaderCopy.name, exact: true }),
    ).toBeVisible();
    // The engine is held, so the label names the first step.
    await expect(page.locator(COVER_STATUS)).toContainText(loaderCopy.steps[1]);

    const held = () =>
      page.evaluate(
        ({ coverSelector, field }) => {
          const coverElement = document.querySelector(coverSelector);
          const name = (element: Element | null) =>
            element === null || element === document.body
              ? "body"
              : element === coverElement
                ? "cover"
                : `${element.tagName.toLowerCase()} ${(element.textContent ?? "").trim().slice(0, 30)}`;
          const parts = [
            "a[href='#main']",
            "header",
            "main",
            "footer",
            field,
          ].map((selector) => {
            const element = document.querySelector(selector);
            return `${selector} ${element === null ? "missing" : element.closest("[inert]") === null ? "free" : "inert"}`;
          });
          const focusable = [
            ...document.querySelectorAll(
              "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable='true']",
            ),
          ]
            .filter(
              (element) =>
                coverElement?.contains(element) !== true &&
                element.closest("[inert]") === null,
            )
            .map(name);
          return { parts, focusable, active: name(document.activeElement) };
        },
        { coverSelector: COVER, field: FIELD },
      );

    const up = await held();
    expect(up.parts).toEqual([
      "a[href='#main'] inert",
      "header inert",
      "main inert",
      "footer inert",
      `${FIELD} inert`,
    ]);
    expect(up.focusable).toEqual([]);
    expect(up.active).toBe("cover");
    // Tab finds nothing under the cover to stop on.
    for (const key of ["Tab", "Tab", "Shift+Tab", "Tab"]) {
      await page.keyboard.press(key);
      expect(["cover", "body"], key).toContain((await held()).active);
    }
    await expectNoAxeViolations(page);
    await expect(html(page)).toHaveAttribute(LOADER_ATTRIBUTE, "up");

    engine.release();
    await waitForLift(page);
    await expectPageFree(page);
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content", exact: true }),
    ).toBeFocused();
    await expectNoAxeViolations(page);
  } finally {
    engine.release();
  }
});

// /work and the first full study stand for every route but the home page.
const FIRST_STUDY = fullStudies[0];
if (FIRST_STUDY === undefined) throw new Error("No full study to open");

for (const path of ["/work", studyHref(FIRST_STUDY.slug)]) {
  test(`REQ-LOAD-01 a load of ${path} shows no cover`, async ({ page }) => {
    await recordLoader(page);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator(COVER)).toHaveCount(0);
    await expect(html(page)).toHaveAttribute(LOADER_OFF_ATTRIBUTE, "route");
    await expect(html(page)).not.toHaveAttribute(LOADER_ATTRIBUTE);
    await page.waitForTimeout(WATCH_MS);
    const log = await readLoaderLog(page);
    expect(log.frames).toBeGreaterThan(0);
    expect(log.shownFrames).toBe(0);
    await expectPageFree(page);
  });
}

test("REQ-LOAD-01 a reload and a later home load in the same tab show the cover again, each timed from its own first paint", async ({
  page,
}, testInfo) => {
  test.setTimeout(3 * LIFT_TIMEOUT_MS);
  // Tier 3 lifts each cover at its minimum, so three loads stay short.
  await asTier3(page);
  await recordLoader(page);
  for (const load of [
    "a first load",
    "a reload",
    "a later home load",
  ] as const) {
    if (load === "a reload") {
      await page.reload({ waitUntil: "domcontentloaded" });
    } else {
      await page.goto("/", { waitUntil: "domcontentloaded" });
    }
    await expect(
      page.getByRole("dialog", { name: loaderCopy.name, exact: true }),
      load,
    ).toBeVisible();
    await waitForLift(page);
    const log = await readLoaderLog(page);
    expect(firstMark(log, "html", LOADER_ATTRIBUTE, "up"), load).not.toBeNull();
    expect(log.shownFrames, load).toBeGreaterThan(0);
    const times = liftTimes(log);
    testInfo.annotations.push({ type: load, description: times.line });
    expect(times.outcome, `${load}: ${times.line}`).toBe("still");
    if (times.tier === null) throw new Error(`No tier: ${times.line}`);
    expectLiftDue(times, times.tier);
    await expectPageFree(page);
  }
});

/** A click on the bar's home link: a move to "/" inside the site. */
async function clickHome(page: Page) {
  await page.getByRole("link", { name: "T7SEN, home", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test("REQ-LOAD-01 REQ-NAV-01 a move from /work to the home page while the field has not drawn shows the cover over the held page, and it lifts with the ripple once the field has drawn, timed from its own first frame", async ({
  page,
}, testInfo) => {
  test.setTimeout(LIFT_TIMEOUT_MS + ENGINE_TIMEOUT_MS + 30_000);
  await asTier2(page);
  // /work never loads the engine; held, it cannot draw the field before
  // the cover has been looked at.
  const engine = await holdEngine(page, "hold");
  try {
    await recordLoader(page);
    await page.goto("/work");
    await expect(html(page)).toHaveAttribute(LOADER_OFF_ATTRIBUTE, "route");
    await clickHome(page);

    await expect(
      page.getByRole("dialog", { name: loaderCopy.name, exact: true }),
    ).toBeVisible();
    await expect(page.locator(COVER)).toHaveAttribute("data-loader-owned", "");
    await expect(html(page)).toHaveAttribute(LOADER_ATTRIBUTE, "up");
    await expect(page.locator(COVER_STATUS)).toContainText(loaderCopy.steps[1]);
    const seeTheWork = page.getByRole("link", {
      name: HERO.primaryAction,
      exact: true,
    });
    expect(await reachOf(seeTheWork)).toEqual({
      inert: true,
      underCover: true,
      hit: false,
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator(COVER)).toBeFocused();

    // The engine loads on arrival at "/", as it does on a full load.
    await engine.requested;
    const releasedAt = await page.evaluate(() => performance.now());
    engine.release();
    await waitForLift(page);
    const times = liftTimes(await readLoaderLog(page), { from: "move" });
    testInfo.annotations.push({ type: "lift", description: times.line });

    expectReadyOrLimit(times, testInfo);
    expectRipple(times);
    expect(times.leaving + times.origin, times.line).toBeGreaterThan(
      releasedAt,
    );
    if (times.outcome === "field") await expectUncoveredHero(page);
    else {
      await expectPageFree(page);
      await expectHeroReachable(page);
    }
  } finally {
    engine.release();
  }
});

test("REQ-LOAD-01 REQ-NAV-01 once the field has drawn, a move back to the home page shows no cover, and the hero's links are reachable at once", async ({
  page,
}) => {
  test.setTimeout(LIFT_TIMEOUT_MS + ENGINE_TIMEOUT_MS + 30_000);
  await asTier2(page);
  await recordLoader(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForLift(page);
  await expect(page.locator(FIELD)).toHaveAttribute("data-ready", "true", {
    timeout: ENGINE_TIMEOUT_MS,
  });

  await page
    .getByRole("navigation", { name: "Site controls" })
    .getByRole("link", { name: "Work", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname === "/work");
  const before = await readLoaderLog(page);
  await clickHome(page);
  await expect(
    page.getByRole("link", { name: HERO.primaryAction, exact: true }),
  ).toBeInViewport({ ratio: 1, timeout: 1_000 });
  await expectHeroReachable(page);
  await page.waitForTimeout(WATCH_MS);
  const after = await readLoaderLog(page);
  expect(after.shownFrames).toBe(before.shownFrames);
  // Nothing marked a cover up after the move.
  expect(
    after.marks
      .slice(before.marks.length)
      .filter((mark) => mark.on === "html" && mark.name === LOADER_ATTRIBUTE),
  ).toEqual([]);
  await expectPageFree(page, { focusAtTop: false });
});

test("REQ-LOAD-01 REQ-ENG-07 going back while a cover after a move is up takes it away and frees the page", async ({
  page,
}) => {
  const engine = await holdEngine(page, "hold");
  try {
    await page.goto("/work");
    await clickHome(page);
    await expect(page.locator(COVER)).toHaveAttribute("data-loader-owned", "");
    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/work");
    await expect(page.locator(COVER)).toHaveCount(0);
    await expect(html(page)).toHaveAttribute(LOADER_ATTRIBUTE, "done");
    await expectPageFree(page, { focusAtTop: false });
    const work = page
      .getByRole("navigation", { name: "Site controls" })
      .getByRole("link", { name: "Work", exact: true });
    expect(await reachOf(work)).toEqual({
      inert: false,
      underCover: false,
      hit: true,
    });
  } finally {
    engine.release();
  }
});

test("REQ-LOAD-01 REQ-NAV-01 a move from inside the site to /#work lands on its part once the cover lifts", async ({
  page,
}, testInfo) => {
  await asTier3(page);
  await recordLoader(page);
  await page.goto("/work");
  // No link inside the site points at a part of the home page yet, so the
  // router takes the move as a link would.
  await page.evaluate(() => {
    const router = (
      window as unknown as { next: { router: { push(href: string): void } } }
    ).next.router;
    router.push("/#work");
  });
  await page.waitForURL((url) => url.pathname === "/" && url.hash === "#work");
  await expect(page.locator(COVER)).toHaveAttribute("data-loader-owned", "");
  await waitForLift(page);
  const times = liftTimes(await readLoaderLog(page), { from: "move" });
  testInfo.annotations.push({ type: "lift", description: times.line });
  expect(times.outcome, times.line).toBe("still");
  expectRipple(times);

  expect(
    await page.evaluate(() => document.querySelectorAll("[inert]").length),
  ).toBe(0);
  await expect
    .poll(() =>
      page
        .locator("#work")
        .evaluate((element) =>
          Math.abs(Math.round(element.getBoundingClientRect().top)),
        ),
    )
    .toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("REQ-LOAD-01 REQ-CNT-01 when the inline script never ran, as a policy that blocks it leaves the page, no cover shows on a load of the home page or after a move to it", async ({
  page,
}) => {
  await withoutLoader(page);
  await recordLoader(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("link", { name: HERO.primaryAction, exact: true }),
  ).toBeInViewport({ ratio: 1, timeout: 1_000 });
  await expect(html(page)).not.toHaveAttribute(LOADER_ATTRIBUTE);
  await expect(html(page)).not.toHaveAttribute(LOADER_OFF_ATTRIBUTE);

  await page
    .getByRole("navigation", { name: "Site controls" })
    .getByRole("link", { name: "Work", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname === "/work");
  await clickHome(page);
  await expectHeroReachable(page);
  await page.waitForTimeout(WATCH_MS);
  const log = await readLoaderLog(page);
  expect(log.frames).toBeGreaterThan(0);
  expect(log.shownFrames).toBe(0);
  expect(firstMark(log, "html", LOADER_ATTRIBUTE)).toBeNull();
  await expectPageFree(page, { focusAtTop: false });
});

for (const setup of [
  { name: "calm mode on in the tab", off: "calm", apply: withCalmKey },
  {
    name: "reduced motion",
    off: "reduced",
    apply: (page: Page) => page.emulateMedia({ reducedMotion: "reduce" }),
  },
] as const) {
  test(`REQ-LOAD-01 REQ-A11Y-03 REQ-A11Y-04 with ${setup.name}, a load of the home page shows no cover from the first frame`, async ({
    page,
  }) => {
    await setup.apply(page);
    await recordLoader(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute(LOADER_OFF_ATTRIBUTE, setup.off);
    await expect(html(page)).not.toHaveAttribute(LOADER_ATTRIBUTE);
    await expect(
      page.getByRole("link", { name: HERO.primaryAction, exact: true }),
    ).toBeInViewport({ ratio: 1, timeout: 1_000 });
    await page.waitForTimeout(WATCH_MS);
    const log = await readLoaderLog(page);
    expect(log.frames).toBeGreaterThan(0);
    expect(log.shownFrames).toBe(0);
    await expectPageFree(page);
    await expectHeroReachable(page);
  });

  test(`REQ-LOAD-01 REQ-A11Y-03 REQ-A11Y-04 with ${setup.name}, a move from /work to the home page shows no cover`, async ({
    page,
  }) => {
    await setup.apply(page);
    await recordLoader(page);
    await page.goto("/work");
    await clickHome(page);
    await expect(
      page.getByRole("link", { name: HERO.primaryAction, exact: true }),
    ).toBeInViewport({ ratio: 1, timeout: 1_000 });
    await page.waitForTimeout(WATCH_MS);
    const log = await readLoaderLog(page);
    expect(log.shownFrames).toBe(0);
    expect(firstMark(log, "html", LOADER_ATTRIBUTE)).toBeNull();
    await expectPageFree(page, { focusAtTop: false });
    await expectHeroReachable(page);
  });
}
