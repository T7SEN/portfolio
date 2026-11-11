import { expect, test, type Locator, type Page } from "@playwright/test";

import { studies } from "../src/content";
import { heroCopy, STATIC_TIER } from "../src/content/hero";
import { pages } from "../src/content/pages";
import { story } from "../src/content/story";
import { expectNoAxeViolations } from "./support/axe";
import {
  calmToggle,
  chapterInLayout,
  chapterOrder,
  chapterStarts,
  fixedElements,
  focusedView,
  goToChapter,
  hasLenis,
  hiddenTitleParts,
  LENIS_CLASS,
  lenisWasMade,
  readChapterWrites,
  readLenisClasses,
  recordChapterWrites,
  recordLenisClasses,
  scrollAtRest,
  scrollPositionsFor,
  scrollToPlace,
  STORY_TIMEOUT_MS,
  STORYBOARD_SHARE,
  waitForStory,
  type StoryPlace,
} from "./support/story";
import {
  afterTwoFrames,
  asTier2,
  asTier3,
  ENGINE_TIMEOUT_MS,
  FIELD,
  frameRateEvents,
  nextFrameRateEvent,
  STILL,
  waitForField,
  waitForFieldShown,
} from "./support/tiers";

// The home page's scroll story in the gate, headless, at 1280 and 375 px.
// Frame rates, the shapes the field forms and stirring are measured headed
// (e2e/headed/story.spec.ts); here the page's own signals are read: the
// chapter the field's wrapper mirrors, Lenis's class on html, the titles and
// the frameRate events.
test.describe.configure({ timeout: 120_000 });

const HERO = heroCopy(STATIC_TIER);

// Longer than two frameRate intervals, so a running field always reports
// inside it.
const QUIET_MS = 2_500;
// How far a chapter may start from the storyboard's share of the scroll.
const SHARE_TOLERANCE = 0.05;
// Time for the field to glide to a chapter before its screenshot.
const GLIDE_MS = 1_500;

/** The progress at which a chapter is shown: the hero at the top. */
function showAt(chapter: string): number {
  return chapter === "hero" ? 0 : 0.5;
}

/** Waits until every revealed title and each of its words is whole. */
async function expectTitlesShown(page: Page) {
  await expect
    .poll(() => hiddenTitleParts(page), { timeout: 5_000 })
    .toEqual([]);
}

/** Scrolls to the middle of the services block, between hero and bloom. */
async function goToServices(page: Page) {
  await page.evaluate(() => {
    const services = document.getElementById("services");
    if (services === null) throw new Error("No #services section");
    const box = services.getBoundingClientRect();
    window.scrollTo({
      top: box.top + window.scrollY + box.height / 2 - window.innerHeight / 2,
      behavior: "instant",
    });
  });
}

test("REQ-SCR-01 the six chapters run in order, start near the storyboard's shares, and the field's wrapper follows the scroll into each", async ({
  page,
}, testInfo) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 90_000);
  await page.goto("/");

  // The services block sits between hero and bloom and is not a chapter.
  const sections = await page
    .locator("main > section")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-chapter")),
    );
  expect(sections).toEqual([
    "hero",
    null,
    ...chapterOrder.filter((chapter) => chapter !== "hero"),
  ]);
  // The first chapter reaches the wrapper from layout, before the story runs.
  await expect(page.locator(FIELD)).toHaveAttribute("data-chapter", "hero");

  const report = await waitForFieldShown(page);
  await waitForStory(page);
  await page.evaluate(() => document.fonts.ready);

  const starts = await chapterStarts(page);
  const line =
    `chapter-starts ${testInfo.project.name} (field tier ${report.tier}, ${report.reason}): ` +
    starts
      .map(({ chapter, share }) => `${chapter} ${(share * 100).toFixed(1)}%`)
      .join(", ") +
    " of the scroll range, each where its section's top reaches the middle of the viewport";
  console.log(line);
  testInfo.annotations.push({ type: "chapter-starts", description: line });
  expect(starts.map(({ chapter }) => chapter)).toEqual([...chapterOrder]);
  for (const { chapter, share } of starts) {
    expect(
      Math.abs(share - STORYBOARD_SHARE[chapter]),
      `${chapter} starts at ${(share * 100).toFixed(1)}%, storyboard ${STORYBOARD_SHARE[chapter] * 100}%`,
    ).toBeLessThanOrEqual(SHARE_TOLERANCE);
  }

  for (const chapter of chapterOrder) {
    await goToChapter(page, chapter, showAt(chapter));
    await page.waitForTimeout(GLIDE_MS);
    await page.screenshot({
      path: testInfo.outputPath(`story-${chapter}.png`),
    });
    if (chapter === "hero") {
      // The services block counts as the hero, at its end. Reached from the
      // bloom, so the story has to write the hero again.
      await goToChapter(page, "bloom");
      await goToServices(page);
      await expect(page.locator(FIELD), "services").toHaveAttribute(
        "data-chapter",
        "hero",
      );
    }
  }

  // Every title the story revealed on the way is whole (REQ-CNT-01).
  await expectTitlesShown(page);
});

test("REQ-SCR-01 REQ-TIER-03 on forced tier 3 the field's wrapper follows the story through every chapter", async ({
  page,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);
  await asTier3(page);
  await page.goto("/");
  expect((await waitForField(page)).tier).toBe(3);
  await expect(page.locator(STILL)).toHaveCount(1);
  await waitForStory(page);

  for (const chapter of [...chapterOrder, ...[...chapterOrder].reverse()]) {
    await goToChapter(page, chapter, showAt(chapter));
  }
  await expect(page.locator(STILL)).toHaveCount(1);
});

test("REQ-SCR-02 REQ-SCR-03 a wheel moves the page exactly its own distance while Lenis smooths it", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Lenis and the mouse wheel are desktop only");
  test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);
  await page.goto("/");
  await waitForStory(page);
  await expect(page.locator("html")).toHaveClass(LENIS_CLASS, {
    timeout: STORY_TIMEOUT_MS,
  });
  // Wheel only once the tier is settled: while the tier 1 probe draws the
  // full field, many browsers sharing one GPU in the gate left the page
  // without frames for over 2 s, and a glide then counted too few positions.
  await waitForFieldShown(page);
  await page.mouse.move(640, 400);

  for (const delta of [400, -150, 600]) {
    const before = await page.evaluate(() => window.scrollY);
    // Every distinct position until the page has rested for 600 ms.
    const glide = page.evaluate(
      () =>
        new Promise<{ positions: number[]; ms: number }>((resolve) => {
          const positions = [window.scrollY];
          const start = performance.now();
          let changedAt: number | null = null;
          const tick = (now: number) => {
            if (window.scrollY !== positions.at(-1)) {
              positions.push(window.scrollY);
              changedAt = now;
            }
            const rested = changedAt !== null && now - changedAt > 600;
            if (rested || now - start > 8_000) {
              resolve({ positions, ms: (changedAt ?? now) - start });
            } else {
              requestAnimationFrame(tick);
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.mouse.wheel(0, delta);
    const { positions, ms } = await glide;
    const after = positions.at(-1) ?? before;

    const line =
      `wheel ${testInfo.project.name}: delta ${delta} px moved the page ` +
      `${after - before} px through ${positions.length - 1} positions in ${Math.round(ms)} ms`;
    console.log(line);
    testInfo.annotations.push({ type: "wheel", description: line });
    expect(Math.abs(after - before - delta), line).toBeLessThanOrEqual(1);
    // Lenis glides there over several frames rather than jumping.
    expect(positions.length, line).toBeGreaterThan(3);
  }
});

test("REQ-SCR-02 the story pins nothing, snaps nothing and never moves the page by itself", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The static page's own fixed elements: the skip link and the field.
  const before = await fixedElements(page);
  await waitForStory(page);

  const places: StoryPlace[] = [
    { chapter: "bloom", progress: 0.02 },
    { chapter: "bloom", progress: 0.97 },
    { step: 1, local: 0.03 },
    { step: 3, local: 0.95 },
    { chapter: "making-of", progress: 0.5 },
    { chapter: "about", progress: 0.98 },
  ];
  for (const place of places) {
    const top = await scrollToPlace(page, place);
    const positions = await scrollPositionsFor(page, 1_500);
    expect(positions, JSON.stringify(place)).toHaveLength(1);
    expect(Math.abs((positions[0] ?? 0) - top)).toBeLessThan(1);
  }

  expect(await page.locator(".pin-spacer").count()).toBe(0);
  const after = await fixedElements(page);
  testInfo.annotations.push({
    type: "fixed",
    description: `fixed or sticky before the story: ${before.join(", ")}; after: ${after.join(", ")}`,
  });
  expect(after).toEqual(before);
});

test("REQ-SCR-03 REQ-A11Y-04 Lenis starts after first content on desktop, leaves with calm mode and returns without it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Lenis is desktop only; the phone test is below");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(await lenisWasMade(page), "no Lenis before first content").toBe(false);

  const html = page.locator("html");
  await expect(html).toHaveClass(LENIS_CLASS, { timeout: STORY_TIMEOUT_MS });

  const toggle = calmToggle(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(html).not.toHaveClass(LENIS_CLASS);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(html).toHaveClass(LENIS_CLASS);
});

test("REQ-SCR-03 a touch screen never gets Lenis, calm mode or not", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "The desktop test is above");
  await page.goto("/");
  await waitForStory(page);
  // Past first content and the story's own load, with room for a late start.
  await page.waitForTimeout(1_000);
  expect(await hasLenis(page)).toBe(false);

  const toggle = calmToggle(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(1_000);

  expect(await hasLenis(page)).toBe(false);
  expect(await lenisWasMade(page), "no Lenis was ever made").toBe(false);
});

test("REQ-A11Y-03 with reduced motion the field reports no frames, Lenis never starts and every chapter title fades in whole", async ({
  page,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await asTier2(page);
  await page.goto("/");

  // The toggle shows the OS setting and says why it stays on.
  const toggle = calmToggle(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAccessibleDescription(/reduced motion/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  expect((await waitForField(page)).tier).toBe(2);
  expect(await waitForStory(page), "titles fade, never split").toBe("fade");
  expect(await frameRateEvents(page, QUIET_MS)).toBe(0);
  expect(await page.locator(FIELD).getAttribute("data-fps")).toBeNull();

  // The titles the story reveals: the work, about and contact chapters'.
  const chapters = ["work", "about", "contact"] as const;
  expect(
    await page
      .locator("main [data-story-title]")
      .evaluateAll((elements) => elements.map((element) => element.id)),
  ).toEqual(chapters.map((chapter) => `${chapter}-heading`));
  for (const chapter of chapters) {
    await goToChapter(page, chapter);
    const title = page.locator(`#${chapter}-heading`);
    await expect(title).toHaveCSS("opacity", "1");
    // Shown whole: no word split, no label standing in for its text.
    expect(await title.evaluate((element) => element.children.length)).toBe(0);
    expect(await title.getAttribute("aria-label")).toBeNull();
  }
  await expectTitlesShown(page);

  // Changing chapter in calm draws one still, never a running field.
  expect(await frameRateEvents(page, QUIET_MS)).toBe(0);
  expect(await hasLenis(page)).toBe(false);
  expect(await lenisWasMade(page), "no Lenis was ever made").toBe(false);
});

test("REQ-A11Y-04 the calm toggle sits in the bar with a 44 px target, stops the field and is remembered after a reload", async ({
  page,
}) => {
  test.setTimeout(2 * ENGINE_TIMEOUT_MS + 60_000);
  await asTier2(page);
  await page.goto("/");

  const toggle = calmToggle(page);
  await expect(toggle).toBeInViewport({ ratio: 1 });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const box = await toggle.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  expect((await waitForField(page)).tier).toBe(2);
  await nextFrameRateEvent(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await afterTwoFrames(page);
  expect(await frameRateEvents(page, QUIET_MS), "calm stops the field").toBe(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("portfolio:calm")),
  ).toBe("on");

  // Remembered for the visit: the same tab, reloaded.
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect((await waitForField(page)).tier).toBe(2);
  expect(
    await frameRateEvents(page, QUIET_MS),
    "the field starts calm after the reload",
  ).toBe(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await nextFrameRateEvent(page);
});

test("REQ-A11Y-05 every chapter carries a scene description the accessibility tree reaches, and the field stays hidden from it", async ({
  page,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 30_000);
  // Tier 3, so the field's wrapper holds a picture as well as the host.
  await asTier3(page);
  await page.goto("/");
  expect((await waitForField(page)).tier).toBe(3);

  const tree = await page.locator("main").ariaSnapshot();
  for (const chapter of chapterOrder) {
    const section = page.locator(`main > section[data-chapter="${chapter}"]`);
    const scene = section.locator("[data-scene]");
    await expect(scene).toHaveCount(1);
    await expect(scene).toHaveText(story.scenes[chapter]);
    expect(await section.ariaSnapshot(), chapter).toContain(
      story.scenes[chapter],
    );
    expect(tree, chapter).toContain(story.scenes[chapter]);
  }

  const field = page.locator(FIELD);
  await expect(field).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(STILL)).toHaveCount(1);
  expect(await field.ariaSnapshot()).toBe("");
  expect(
    await field.evaluate(
      (element) =>
        element.querySelectorAll(
          "a, button, input, select, textarea, [tabindex]",
        ).length,
    ),
  ).toBe(0);
});

test("REQ-NAV-01 with the story running, Skip intro reaches the work chapter and See the work reaches /work in one click", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await waitForStory(page);
  if (!isMobile) {
    await expect(page.locator("html")).toHaveClass(LENIS_CLASS, {
      timeout: STORY_TIMEOUT_MS,
    });
  }

  const seeTheWork = page.getByRole("link", {
    name: HERO.primaryAction,
    exact: true,
  });
  const skipIntro = page.getByRole("link", {
    name: HERO.cornerControl,
    exact: true,
  });
  await expect(seeTheWork).toBeInViewport({ ratio: 1 });
  await expect(skipIntro).toBeInViewport({ ratio: 1 });

  await skipIntro.click();
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator("#work")).toBeInViewport();
  await expect(page.locator(FIELD)).toHaveAttribute("data-chapter", "work");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.locator(FIELD)).toHaveAttribute("data-chapter", "hero");
  await expect(seeTheWork).toBeInViewport({ ratio: 1 });
  await seeTheWork.click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    pages.work.title,
  );
});

test("REQ-NAV-01 at 320 by 568, where the bar wraps to two rows, See the work and Skip intro show whole on the first screen", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(!isMobile, "A 320 px wide screen is a phone's");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  // The bar's rows depend on the width of its text, final once the fonts are in.
  await page.evaluate(() => document.fonts.ready);

  const seeTheWork = page.getByRole("link", {
    name: HERO.primaryAction,
    exact: true,
  });
  const skipIntro = page.getByRole("link", {
    name: HERO.cornerControl,
    exact: true,
  });
  const span = async (name: string, locator: Locator) => {
    const box = await locator.boundingBox();
    return box === null
      ? `${name} not drawn`
      : `${name} ${Math.round(box.y)} to ${Math.round(box.y + box.height)} px`;
  };
  const line =
    `320 x 568 ${testInfo.project.name}: ` +
    [
      await span("bar", page.getByRole("banner")),
      await span("See the work", seeTheWork),
      await span("Skip intro", skipIntro),
    ].join(", ");
  console.log(line);
  testInfo.annotations.push({ type: "first-screen", description: line });

  expect(await page.evaluate(() => window.scrollY), line).toBe(0);
  // The case this test exists for: two rows of 44 px inside py-3 (D-063).
  const bar = await page.getByRole("banner").boundingBox();
  expect(bar?.height ?? 0, `${line}: the bar wraps`).toBeGreaterThan(100);
  await expect(seeTheWork, line).toBeInViewport({ ratio: 1 });
  await expect(skipIntro, line).toBeInViewport({ ratio: 1 });
});

// One notch of a mouse wheel.
const NOTCH_PX = 100;
// Longer than the glide three notches start: Lenis closes the gap at a rate
// of 6 a second (lerp 0.1) and stops within half a pixel, so 300 px take
// about 1.1 s (lenis 1.3.27, dist/lenis.mjs lines 37 to 39 and 85 to 89).
const AFTER_GLIDE_MS = 1_500;

/** Whether Lenis animates a scroll now (lenis-smooth on html), and where. */
function glideState(page: Page) {
  return page.evaluate(() => ({
    gliding: document.documentElement.classList.contains("lenis-smooth"),
    scrollY: Math.round(window.scrollY),
  }));
}

test("REQ-NAV-01 REQ-SCR-02 Skip intro clicked and End pressed while a wheel glide runs both take the page where they lead", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Lenis and the mouse wheel are desktop only");
  test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);
  await page.goto("/");
  await waitForStory(page);
  await expect(page.locator("html")).toHaveClass(LENIS_CLASS, {
    timeout: STORY_TIMEOUT_MS,
  });
  // As for the wheel test above: a glide needs frames, which the tier 1
  // probe can hold back.
  await waitForFieldShown(page);
  await page.mouse.move(640, 400);
  const lines: string[] = [];

  // Skip intro, clicked while three quick notches still glide. A click event,
  // not Playwright's click, which waits until the link has kept one box for
  // two frames, that is until the glide has ended.
  const started = Date.now();
  for (let notch = 0; notch < 3; notch += 1) {
    await page.mouse.wheel(0, NOTCH_PX);
  }
  const atClick = await page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>(
      'main section[data-chapter="hero"] a[href="#work"]',
    );
    if (link === null) throw new Error("No Skip intro link");
    const state = {
      gliding: document.documentElement.classList.contains("lenis-smooth"),
      scrollY: Math.round(window.scrollY),
    };
    link.click();
    return state;
  });
  const clickMs = Date.now() - started;
  await page.waitForTimeout(AFTER_GLIDE_MS);
  const work = page.locator('main section[data-chapter="work"]');
  const landed = await work.evaluate((section) => ({
    scrollY: Math.round(window.scrollY),
    top: Math.round(section.getBoundingClientRect().top + window.scrollY),
  }));
  const skipLine =
    `Skip intro clicked ${clickMs} ms after the first notch at ${atClick.scrollY} px, ` +
    `${atClick.gliding ? "mid glide" : "with no glide running"}; ${AFTER_GLIDE_MS} ms later ` +
    `scrollY ${landed.scrollY} px, the work chapter's top at ${landed.top} px`;
  lines.push(skipLine);
  expect(atClick.gliding, skipLine).toBe(true);
  await expect(page).toHaveURL(/#work$/);
  expect(Math.abs(landed.scrollY - landed.top), skipLine).toBeLessThanOrEqual(
    2,
  );
  await expect(work, skipLine).toBeInViewport();

  // End, pressed at once after three notches from the top.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await scrollAtRest(page);
  for (let notch = 0; notch < 3; notch += 1) {
    await page.mouse.wheel(0, NOTCH_PX);
  }
  const atKey = await glideState(page);
  await page.keyboard.press("End");
  await page.waitForTimeout(AFTER_GLIDE_MS);
  const rest = await page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    foot: document.documentElement.scrollHeight - window.innerHeight,
  }));
  const endLine =
    `End pressed at ${atKey.scrollY} px, ` +
    `${atKey.gliding ? "mid glide" : "with no glide running"}; ${AFTER_GLIDE_MS} ms later ` +
    `scrollY ${rest.scrollY} px, the foot of the page at ${rest.foot} px`;
  lines.push(endLine);
  expect(atKey.gliding, endLine).toBe(true);
  expect(Math.abs(rest.scrollY - rest.foot), endLine).toBeLessThanOrEqual(1);

  console.log(`glide ${testInfo.project.name}:\n${lines.join("\n")}`);
  testInfo.annotations.push({ type: "glide", description: lines.join("; ") });
});

// A Page Down moves the page by most of a viewport: the browser keeps a
// little of the screen before it in view.
const PAGE_STEP = { least: 0.8, most: 1 } as const;

test("REQ-SCR-02 REQ-A11Y-02 REQ-A11Y-04 REQ-NAV-01 with Lenis running, keys work the Calm toggle, page natively through the chapters and Tab to every study, each in view and whole", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Lenis and a hardware keyboard are desktop only");
  test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);
  await page.goto("/");
  await waitForStory(page);
  const html = page.locator("html");
  await expect(html).toHaveClass(LENIS_CLASS, { timeout: STORY_TIMEOUT_MS });
  // The keys wait until the field is shown and its tier is settled. Pressed
  // before that in a run of 14 parallel browsers, one Page Down's smooth
  // scroll never ended (no scrollend) and the next Page Down did nothing,
  // although no script prevented the key or wrote the scroll position.
  const report = await waitForFieldShown(page);
  const field = page.locator(FIELD);
  const lines: string[] = [`field tier ${report.tier}, ${report.reason}`];

  // The bar in Tab order, from the skip link to the Calm toggle, its last
  // stop (accessibility.md section 3).
  const banner = page.getByRole("banner");
  const primary = banner.getByRole("navigation", { name: "Primary" });
  const toggle = calmToggle(page);
  for (const stop of [
    page.getByRole("link", { name: "Skip to content", exact: true }),
    banner.getByRole("link", { name: "T7SEN, home", exact: true }),
    primary.getByRole("link", { name: "Work", exact: true }),
    primary.getByRole("link", { name: "About", exact: true }),
    primary.getByRole("link", { name: "Contact", exact: true }),
    toggle,
  ]) {
    await page.keyboard.press("Tab");
    await expect(stop).toBeFocused();
  }

  // Enter turns calm on and Space turns it off again; neither moves the page.
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(html).not.toHaveClass(LENIS_CLASS);
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toBeFocused();
  await expect(html).toHaveClass(LENIS_CLASS);
  expect(
    await page.evaluate(() => window.scrollY),
    "the toggle's keys scroll nothing",
  ).toBe(0);

  // Page Down, with focus still on the toggle, moves the page by most of a
  // viewport each time, and the field's wrapper follows the chapter at the
  // middle of the viewport, on to the work chapter.
  await recordLenisClasses(page);
  const view = await page.evaluate(() => window.innerHeight);
  const visited: string[] = [await chapterInLayout(page)];
  for (let press = 1; press <= 10 && visited.at(-1) !== "work"; press += 1) {
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("PageDown");
    const after = (await scrollAtRest(page, { from: before })).at(-1) ?? before;
    const chapter = await chapterInLayout(page);
    const line =
      `Page Down ${press}: ${before} to ${after} px, ${after - before} px or ` +
      `${(((after - before) / view) * 100).toFixed(1)}% of the ${view} px viewport, chapter ${chapter}`;
    lines.push(line);
    expect(after - before, line).toBeGreaterThanOrEqual(PAGE_STEP.least * view);
    expect(after - before, line).toBeLessThanOrEqual(PAGE_STEP.most * view);
    await expect(field, line).toHaveAttribute("data-chapter", chapter);
    if (chapter !== visited.at(-1)) visited.push(chapter);
  }
  expect(visited).toEqual(
    chapterOrder.slice(0, chapterOrder.indexOf("work") + 1),
  );

  // End reaches the foot of the page and the contact chapter.
  const beforeEnd = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("End");
  const end =
    (await scrollAtRest(page, { from: beforeEnd })).at(-1) ?? beforeEnd;
  const foot = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  const endLine = `End: ${beforeEnd} to ${end} px, the foot of the page at ${foot} px`;
  lines.push(endLine);
  expect(Math.abs(end - foot), endLine).toBeLessThanOrEqual(1);
  await expect(field).toHaveAttribute("data-chapter", "contact");

  // Lenis lived through every key and took each key's scroll as a native one
  // (lenis-scrolling); it never animated one itself (lenis-smooth).
  expect(await hasLenis(page)).toBe(true);
  const classes = await readLenisClasses(page);
  lines.push(
    `Lenis classes on html while the keys scrolled: ${classes.join(", ")}`,
  );
  expect(classes).toContain("lenis-scrolling");
  expect(classes).not.toContain("lenis-smooth");

  // From the toggle, Tab goes on into the page: the hero's links, then each
  // study in the work chapter in order. Each stop is scrolled into view as it
  // takes focus and shows whole, and the field's wrapper follows the scroll.
  const hero = page.locator('main section[data-chapter="hero"]');
  const heroStop = (name: string) => ({
    name,
    link: hero.getByRole("link", { name, exact: true }),
  });
  const stops = [
    heroStop(HERO.primaryAction),
    heroStop(HERO.secondaryAction),
    heroStop(HERO.cornerControl),
    ...studies.map((study, step) => ({
      name: study.title,
      link: page
        .locator(`main [data-work-step="${step}"]`)
        .getByRole("link", { name: study.title, exact: true }),
    })),
  ];
  for (const { name, link } of stops) {
    await page.keyboard.press("Tab");
    await expect(link, name).toBeFocused();
    await scrollAtRest(page, { quietMs: 300 });
    const focus = await focusedView(page);
    const chapter = await chapterInLayout(page);
    const line =
      `Tab to ${name}: box ${Math.round(focus.top)} to ${Math.round(focus.bottom)} px ` +
      `of the ${focus.viewHeight} px viewport at scroll ${focus.scrollY}, chapter ${chapter}`;
    lines.push(line);
    expect(focus.top, line).toBeGreaterThanOrEqual(0);
    expect(focus.bottom, line).toBeLessThanOrEqual(focus.viewHeight);
    expect(focus.left, line).toBeGreaterThanOrEqual(0);
    expect(focus.right, line).toBeLessThanOrEqual(focus.viewWidth);
    expect(focus.hiddenParts, line).toEqual([]);
    await expect(field, line).toHaveAttribute("data-chapter", chapter);
  }

  // The work title the keys passed on the way is whole too.
  await expect
    .poll(
      async () =>
        (await hiddenTitleParts(page)).filter((part) =>
          part.startsWith("work-heading:"),
        ),
      { timeout: 5_000 },
    )
    .toEqual([]);

  console.log(`keyboard ${testInfo.project.name}:\n${lines.join("\n")}`);
  testInfo.annotations.push({
    type: "keyboard",
    description: lines.join("; "),
  });
});

/** Visits every chapter after the hero in order and returns the writes. */
async function runThroughChapters(page: Page): Promise<string[]> {
  await recordChapterWrites(page);
  for (const chapter of chapterOrder.slice(1)) {
    await goToChapter(page, chapter);
  }
  // Room for a second driver's late, conflicting write.
  await page.waitForTimeout(500);
  return readChapterWrites(page);
}

test("REQ-SCR-04 after / to /work and back, one story drives the field and nothing of it is left on /work", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  expect(await waitForStory(page), "the title is split").toBe("split");
  const workTitle = page.locator("#work-heading");
  const splitParts = () =>
    workTitle.evaluate((element) => element.querySelectorAll("*").length);
  const firstParts = await splitParts();
  expect(firstParts).toBeGreaterThan(0);

  // One write per chapter change, in story order.
  const later = chapterOrder.slice(1);
  expect(await runThroughChapters(page)).toEqual(later);
  await goToChapter(page, "hero", 0);

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Work", exact: true })
    .click();
  await page.waitForURL("**/work");
  await expect(page.locator(FIELD)).toBeHidden();

  // Nothing on /work moves the field's chapter or carries a story's marks.
  await recordChapterWrites(page);
  await page.evaluate(() =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    }),
  );
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(800);
  expect(await readChapterWrites(page), "chapter writes on /work").toEqual([]);
  expect(
    await page.locator("main [data-story-title], main [data-chapter]").count(),
  ).toBe(0);
  expect(await page.locator("main [style]").count(), "inline styles").toBe(0);
  // The site-wide smooth scroll stays on desktop, and only there.
  expect(await hasLenis(page)).toBe(!isMobile);

  await page.getByRole("link", { name: "T7SEN, home" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  expect(await waitForStory(page), "the title is split").toBe("split");
  expect(await splitParts(), "the title is split once, not twice").toBe(
    firstParts,
  );
  expect(await runThroughChapters(page)).toEqual(later);
});

test("REQ-A11Y-01 / has zero axe violations with the story running, at the top and after every chapter has been visited", async ({
  page,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);
  await asTier2(page);
  await page.goto("/");
  await waitForFieldShown(page);
  await waitForStory(page);
  await expectNoAxeViolations(page);

  for (const chapter of chapterOrder) {
    await goToChapter(page, chapter, showAt(chapter));
  }
  await expectTitlesShown(page);
  await expectNoAxeViolations(page);
});
