import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  middleCard,
  slideAt,
  STRETCH_SCREENS,
} from "../src/components/home/pass-slide";
import { fullStudies, shortStudies, studyNumber } from "../src/content";
import { heroCopy, STATIC_TIER } from "../src/content/hero";
import { isMarker } from "../src/content/markers";
import { pages } from "../src/content/pages";
import { site } from "../src/content/site";
import { story } from "../src/content/story";
import { BLOOM_ROOMS } from "../src/engine/runtime/story";
import { PASSES } from "../src/engine/story";
import { expectNoAxeViolations } from "./support/axe";
import { withoutLoader } from "./support/loader";
import {
  calmToggle,
  chapterInLayout,
  chapterOrder,
  chapterRooms,
  fixedElements,
  focusedView,
  goToChapter,
  hasLenis,
  heldScreenAt,
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
  SLIDE_SCREEN,
  SLIDE_STRETCH,
  slideScreenAt,
  STORY_TIMEOUT_MS,
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

// Every tab opens the home page with no loader cover: withoutLoader
// serves each page with its inline script emptied, as a blocked script
// leaves it. e2e/loader.spec.ts covers the cover (REQ-LOAD-01).
test.beforeEach(async ({ context }) => {
  await withoutLoader(context);
});

const HERO = heroCopy(STATIC_TIER);

// Longer than two frameRate intervals, so a running field always reports
// inside it.
const QUIET_MS = 2_500;
// Layout rounds to fractions of a pixel, and each measure is rounded again.
const ROOM_TOLERANCE_PX = 2;
// The least held stretch that still holds the field chapter's screen for a
// while, as a share of the screen's height.
const LEAST_HELD = 0.25;
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

test("REQ-SCR-01 the six chapters run in order, each but the field chapter as tall as its content, the field chapter and the making-of slide each with a held stretch whose screen keeps its words, no other screen's height without text, and the field's wrapper follows the scroll into each", async ({
  page,
}, testInfo) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 90_000);
  await page.goto("/");

  // Every section of the page is a chapter, in story order: the services
  // left the top of the page for the contact chapter (P3.5).
  const sections = await page
    .locator("main > section")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-chapter")),
    );
  expect(sections).toEqual([...chapterOrder]);
  // The first chapter reaches the wrapper from layout, before the story runs.
  await expect(page.locator(FIELD)).toHaveAttribute("data-chapter", "hero");

  const report = await waitForFieldShown(page);
  await waitForStory(page);
  await page.evaluate(() => document.fonts.ready);

  const view = await page.evaluate(() => window.innerHeight);
  const rooms = await chapterRooms(page);
  const line =
    `chapter-rooms ${testInfo.project.name} (field tier ${report.tier}, ${report.reason}), ${view} px screen: ` +
    rooms
      .map(
        ({ chapter, top, height, content, held, emptiest, emptiestAt }) =>
          `${chapter} at ${top} px, ${height} px tall for ${content} px of content` +
          (held > 0 ? `, held for ${held} px` : "") +
          `, ${emptiest} px without text from ${emptiestAt} px`,
      )
      .join("; ");
  console.log(line);
  testInfo.annotations.push({ type: "chapter-rooms", description: line });
  expect(rooms.map(({ chapter }) => chapter)).toEqual([...chapterOrder]);

  for (const room of rooms) {
    if (room.chapter === "bloom") continue;
    // As tall as its content and its own padding, with no room of its own.
    // The making-of's slide stretch is part of its content: the chapter has
    // no room beyond it.
    expect(
      room.height - room.content,
      `${room.chapter} is taller than its content. ${line}`,
    ).toBeLessThanOrEqual(ROOM_TOLERANCE_PX);
    // No stretch a screen high without a line of text. Measured at the top
    // of the page, the slide's screen sits at the start of its stretch, so
    // the rest of the stretch shows no text there; its screen's words are
    // checked through the stretch below.
    if (room.chapter === "making-of") continue;
    expect(
      room.emptiest,
      `${room.chapter} has a screen without text. ${line}`,
    ).toBeLessThan(view);
  }

  // The hero is its first screen and no more: the field chapter starts at
  // the screen's foot.
  const hero = rooms[0];
  expect((hero?.top ?? 0) + (hero?.height ?? 0), line).toBeLessThanOrEqual(
    view + ROOM_TOLERANCE_PX,
  );

  // The field chapter's room is the timeline the field forms the mark and
  // the wordmark in (runtime/story.ts), and its screen holds through part
  // of it.
  const field = rooms.find(({ chapter }) => chapter === "bloom");
  const width = await page.evaluate(() => window.innerWidth);
  // The lg breakpoint, 64rem.
  const room = width >= 1024 ? BLOOM_ROOMS.desktop : BLOOM_ROOMS.phone;
  expect(
    Math.abs((field?.height ?? 0) - room * view),
    `the field chapter is ${room} screens. ${line}`,
  ).toBeLessThanOrEqual(ROOM_TOLERANCE_PX);
  expect(field?.held ?? 0, line).toBeGreaterThan(LEAST_HELD * view);

  // Through its held stretch, the screen keeps the label, the tier readout
  // and the note in view, each with its words, so no screen there is
  // without text.
  for (const at of [0, 0.5, 1]) {
    await expect
      .poll(
        async () => {
          const { viewHeight, texts } = await heldScreenAt(page, at);
          return texts.map(
            ({ text, top, bottom }) =>
              text !== "" && top >= 0 && bottom <= viewHeight,
          );
        },
        {
          message: `the held screen's words at ${at} of its stretch`,
          timeout: 5_000,
        },
      )
      .toEqual([true, true, true]);
  }

  // The making-of's second held stretch: the slide (home/pass-viewer.tsx),
  // STRETCH_SCREENS screens, one of them its own screen, which holds while
  // the row of pass cards moves through the rest. The story leaves calm
  // off, so the row slides.
  await expect(page.locator(SLIDE_STRETCH)).toHaveCount(1);
  const making = rooms.find(({ chapter }) => chapter === "making-of");
  const slide = await page.locator(SLIDE_STRETCH).evaluate((stretch) => ({
    height: stretch.getBoundingClientRect().height,
    screens: stretch.querySelectorAll('[data-part="pass-screen"]').length,
  }));
  expect(slide.screens, line).toBe(1);
  expect(
    Math.abs(slide.height - STRETCH_SCREENS * view),
    `the slide's stretch is ${STRETCH_SCREENS} screens, ${slide.height} px. ${line}`,
  ).toBeLessThanOrEqual(ROOM_TOLERANCE_PX);
  expect(
    Math.abs((making?.held ?? 0) - (STRETCH_SCREENS - 1) * view),
    `the slide's screen holds for ${STRETCH_SCREENS - 1} screens. ${line}`,
  ).toBeLessThanOrEqual(ROOM_TOLERANCE_PX);
  await expect(page.locator(`${SLIDE_STRETCH} ${SLIDE_SCREEN}`)).toHaveCSS(
    "position",
    "sticky",
  );

  // Through its held stretch, the card in the middle of the screen keeps
  // its pass's words whole and in view: at the start, halfway and at the
  // end, each where a card rests (pass-slide.ts).
  for (const at of [0, 0.5, 1]) {
    const pass = PASSES[middleCard(slideAt(at))];
    await expect
      .poll(
        async () => {
          const { viewWidth, viewHeight, middle, texts } = await slideScreenAt(
            page,
            at,
          );
          return {
            middle,
            shown: texts.map(
              ({ text, top, bottom, left, right }) =>
                text !== "" &&
                top >= 0 &&
                bottom <= viewHeight &&
                left >= 0 &&
                right <= viewWidth,
            ),
          };
        },
        {
          message: `the slide's screen and its words at ${at} of its stretch`,
          timeout: 5_000,
        },
      )
      .toEqual({ middle: pass, shown: [true] });
  }

  for (const chapter of chapterOrder) {
    await goToChapter(page, chapter, showAt(chapter));
    await page.waitForTimeout(GLIDE_MS);
    await page.screenshot({
      path: testInfo.outputPath(`story-${chapter}.png`),
    });
    if (chapter === "hero") {
      // Near its end, with the field chapter's top just below the middle of
      // the screen, the hero is still the chapter. Reached from the field
      // chapter, so the story has to write the hero again.
      await goToChapter(page, "bloom");
      await goToChapter(page, "hero", 0.9);
    }
  }

  // Every title the story revealed on the way is whole (REQ-CNT-01).
  await expectTitlesShown(page);
});

test("REQ-SCR-01 REQ-NAV-01 REQ-A11Y-05 the chapters carry their labels 01 to 05 in story order, each region and heading named by its words", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // The label as written, before CSS sets it in capitals: the number and its
  // slash, hidden from assistive technology, then the chapter's name.
  const labels = await page
    .locator("main > section[data-chapter]")
    .evaluateAll((sections) =>
      sections.map((section) => {
        const number = [
          ...section.querySelectorAll('span[aria-hidden="true"]'),
        ].find((span) => /^\d\d \/ $/.test(span.textContent ?? ""));
        return {
          chapter: section.getAttribute("data-chapter"),
          label: number?.parentElement?.textContent ?? null,
        };
      }),
    );
  expect(labels).toEqual(
    chapterOrder.map((chapter) => ({
      chapter,
      label:
        chapter === "hero"
          ? null
          : `${story.labels[chapter].number} / ${story.labels[chapter].name}`,
    })),
  );
  expect(
    chapterOrder
      .filter((chapter) => chapter !== "hero")
      .map((chapter) => story.labels[chapter].number),
  ).toEqual(["01", "02", "03", "04", "05"]);

  // Each region by the name the preview gives it; the field chapter's heading
  // is its label, read as the name alone.
  const { home } = pages;
  const regions: Array<{ chapter: string; region: string; heading: string }> = [
    { chapter: "hero", region: site.names.intro, heading: "" },
    {
      chapter: "bloom",
      region: site.names.field,
      heading: story.labels.bloom.name,
    },
    { chapter: "work", region: home.work.title, heading: home.work.title },
    {
      chapter: "making-of",
      region: home.makingOf.title,
      heading: home.makingOf.title,
    },
    {
      chapter: "about",
      region: pages.about.heading,
      heading: pages.about.heading,
    },
    {
      chapter: "contact",
      region: home.contact.title,
      heading: home.contact.title,
    },
  ];
  for (const { chapter, region, heading } of regions) {
    const section = page.getByRole("region", { name: region, exact: true });
    await expect(section, chapter).toHaveAttribute("data-chapter", chapter);
    if (heading !== "") {
      await expect(
        section.getByRole("heading", { level: 2, name: heading, exact: true }),
        chapter,
      ).toHaveCount(1);
    }
  }

  // The work chapter: one framed row per full study, the steps of the
  // chapter in study order, then the short studies, which are not steps.
  const work = page.locator('main > section[data-chapter="work"]');
  const steps = work.locator("[data-work-step]");
  expect(
    await steps.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-work-step")),
    ),
  ).toEqual(fullStudies.map((_study, index) => String(index)));
  for (const [index, study] of fullStudies.entries()) {
    const row = steps.nth(index);
    await expect(row.locator('[data-stage="frame"]')).toHaveCount(1);
    await expect(row.locator('[data-stage="frame"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await expect(
      row.getByRole("heading", { level: 3, name: study.title, exact: true }),
    ).toHaveCount(1);
    // The row's mono label: its number, a hidden dot, its kind.
    expect(
      await row
        .locator("p")
        .first()
        .evaluate((label) => label.textContent),
    ).toBe(`${studyNumber(study.slug)} · ${study.listing.kind}`);
  }
  for (const study of shortStudies) {
    const card = work.getByRole("article", { name: study.title, exact: true });
    await expect(card).toHaveCount(1);
    await expect(card.locator("[data-stage]")).toHaveCount(0);
    expect(
      await card.evaluate(
        (element) => element.closest("[data-work-step]") === null,
      ),
      `${study.title} is not a step`,
    ).toBe(true);
  }
  await expect(
    work.getByRole("link", {
      name: home.work.archive.link.label,
      exact: true,
    }),
  ).toHaveAttribute("href", home.work.archive.link.href);
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

test("REQ-SCR-02 the story pins nothing and never moves the page by itself, the making-of slide's settle apart (making-of.spec.ts)", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The static page's own fixed and sticky elements, such as the field and
  // the field chapter's held screen. The making-of slide's screen is sticky
  // by its own CSS once the page's script turns the pass grid into the
  // sliding row, which may happen before this reads the page or after, so
  // it is counted apart.
  const isSlideScreen = (element: string) =>
    element.includes(`[data-part="pass-screen"]`);
  const before = (await fixedElements(page)).filter(
    (element) => !isSlideScreen(element),
  );
  await waitForStory(page);

  const places: StoryPlace[] = [
    { chapter: "bloom", progress: 0.02 },
    { chapter: "bloom", progress: 0.97 },
    { step: 1, local: 0.03 },
    { step: 2, local: 0.95 },
    // The making-of's title and intro, above its slide: the slide settles
    // its row on a card once the scroll stops (D-131).
    { chapter: "making-of", progress: 0.02 },
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
  expect(after.filter((element) => !isSlideScreen(element))).toEqual(before);
  // The slide's one screen, held by CSS position sticky inside its stretch,
  // never by script: the page scrolls it at its own speed (REQ-SCR-02).
  expect(after.filter(isSlideScreen)).toEqual([
    'div[data-part="pass-screen"] sticky',
  ]);
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
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(html).not.toHaveClass(LENIS_CLASS);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
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
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
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
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(toggle).toHaveAccessibleDescription(/reduced motion/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  expect((await waitForField(page)).tier).toBe(2);
  expect(await waitForStory(page), "titles fade, never split").toBe("fade");
  expect(await frameRateEvents(page, QUIET_MS)).toBe(0);
  expect(await page.locator(FIELD).getAttribute("data-fps")).toBeNull();

  // The titles the story reveals: the work, making-of, about and contact
  // chapters'. The field chapter's heading is its label, never revealed.
  const chapters = ["work", "making-of", "about", "contact"] as const;
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
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const box = await toggle.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  expect((await waitForField(page)).tier).toBe(2);
  await nextFrameRateEvent(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await afterTwoFrames(page);
  expect(await frameRateEvents(page, QUIET_MS), "calm stops the field").toBe(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("portfolio:calm")),
  ).toBe("on");

  // Remembered for the visit: the same tab, reloaded.
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect((await waitForField(page)).tier).toBe(2);
  expect(
    await frameRateEvents(page, QUIET_MS),
    "the field starts calm after the reload",
  ).toBe(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
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
// At most this many Tab presses from the last full study to the first pass
// card: more than the links between, each short study's link and the
// archive link.
const MOST_TABS_TO_PASSES = 12;

test("REQ-SCR-02 REQ-A11Y-02 REQ-A11Y-04 REQ-NAV-01 REQ-ENG-09 with Lenis running, keys work the Calm toggle, page natively through the chapters and Tab to every study and every pass card, each in view and whole", async ({
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

  // The bar in Tab order, from the skip link to the Calm switch, the last
  // stop in the nav named Site controls (accessibility.md section 3).
  const banner = page.getByRole("banner");
  const primary = banner.getByRole("navigation", {
    name: site.names.siteControls,
  });
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
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(html).not.toHaveClass(LENIS_CLASS);
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
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

  // From the switch, Tab goes on into the page: the hero's links and its
  // own Calm switch, the work chapter's boxed index link, then each full
  // study's row in order: its case study link, then its second link where
  // the row has a live one. Each stop is scrolled into view as it takes focus
  // and shows whole, and the field's wrapper follows the scroll.
  const hero = page.locator('main section[data-chapter="hero"]');
  const work = page.locator('main section[data-chapter="work"]');
  const heroStop = (name: string) => ({
    name,
    link: hero.getByRole("link", { name, exact: true }),
  });
  const stops = [
    heroStop(HERO.primaryAction),
    heroStop(HERO.secondaryAction),
    heroStop(HERO.cornerControl),
    {
      name: "the hero's Calm switch",
      link: hero.getByRole("switch", { name: "Calm mode", exact: true }),
    },
    {
      name: pages.home.work.index.label,
      link: work.getByRole("link", {
        name: new RegExp(`^${pages.home.work.index.label}`),
      }),
    },
    ...fullStudies.flatMap((study, step) => {
      const row = page.locator(`main [data-work-step="${step}"]`);
      const second = study.listing.secondary;
      return [
        {
          name: `${study.title}: ${pages.home.work.readFull}`,
          link: row.getByRole("link", {
            name: pages.home.work.readFull,
            exact: true,
          }),
        },
        ...(second === undefined || isMarker(second.href)
          ? []
          : [
              {
                name: `${study.title}: ${second.label}`,
                link: row.getByRole("link", {
                  name: second.label,
                  exact: true,
                }),
              },
            ]),
      ];
    }),
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

  // On past the short studies and the archive link, Tab reaches the
  // making-of's pass cards in order. Each card's face is a button, and Tab
  // takes the page at once to where its card rests in the middle of the
  // slide: the card marked current, whole, in view and no longer dimmed, and
  // the field's wrapper in the making-of (REQ-ENG-09).
  const making = page.locator('main section[data-chapter="making-of"]');
  const passButton = (index: number) =>
    making.locator(`li[data-pass="${PASSES[index]}"]`).getByRole("button");
  const isOnFirstCard = () =>
    passButton(0).evaluate((button) => button === document.activeElement);
  const between: string[] = [];
  for (
    let press = 0;
    press < MOST_TABS_TO_PASSES && !(await isOnFirstCard());
    press += 1
  ) {
    await page.keyboard.press("Tab");
    between.push(
      await page.evaluate(() =>
        (document.activeElement?.textContent ?? "").trim().slice(0, 40),
      ),
    );
  }
  lines.push(`Tab on from the studies through: ${between.join(" | ")}`);
  for (const [index, pass] of PASSES.entries()) {
    if (index > 0) await page.keyboard.press("Tab");
    const card = making.locator(`li[data-pass="${pass}"]`);
    await expect(passButton(index), `Tab to the ${pass} card`).toBeFocused();
    await expect(card).toHaveAttribute("aria-current", "step");
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
        { message: `the ${pass} card in view and whole`, timeout: 5_000 },
      )
      .toEqual({ whole: true, hidden: [] });
    const focus = await focusedView(page);
    const chapter = await chapterInLayout(page);
    const line =
      `Tab to the ${pass} card: box ${Math.round(focus.left)} to ${Math.round(focus.right)} px across, ` +
      `${Math.round(focus.top)} to ${Math.round(focus.bottom)} px down the ${focus.viewWidth} by ${focus.viewHeight} px viewport ` +
      `at scroll ${focus.scrollY}, chapter ${chapter}`;
    lines.push(line);
    expect(chapter, line).toBe("making-of");
    await expect(field, line).toHaveAttribute("data-chapter", "making-of");
  }

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
    .getByRole("navigation", { name: site.names.siteControls })
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
