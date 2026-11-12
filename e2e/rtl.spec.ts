import { expect, test, type Locator, type Page } from "@playwright/test";

import { heroCopy, STATIC_TIER } from "../src/content/hero";
import { pages } from "../src/content/pages";
import { ROUTES } from "./support/routes";
import { ENGINE_TIMEOUT_MS, waitForFieldShown } from "./support/tiers";

const HERO = heroCopy(STATIC_TIER);

// The two-column layouts sit side by side from this width (Tailwind's lg).
const TWO_COLUMNS_FROM_PX = 1024;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no layout box`);
  return box;
}

/**
 * Two parts of one row: `start` sits at the inline start, `end` after it.
 * `wide` marks a pair that is side by side only from TWO_COLUMNS_FROM_PX;
 * below that its parts stack, which has no side to mirror.
 */
type Pair = {
  name: string;
  start: (page: Page) => Locator;
  end: (page: Page) => Locator;
  wide: boolean;
};

const PAIRS: Record<string, readonly Pair[]> = {
  "/": [
    {
      name: "the hero's headline and the dot's place",
      start: (page) => page.locator("#hero-headline"),
      end: (page) => page.locator('[data-stage="dot"]'),
      wide: true,
    },
    {
      name: "a study row's frame and its details",
      start: (page) =>
        page.locator('main [data-work-step="0"] [data-stage="frame"]'),
      end: (page) => page.locator('main [data-work-step="0"] h3'),
      wide: true,
    },
    {
      name: "the about chapter's words and its skills",
      start: (page) => page.locator("#about-heading"),
      end: (page) => page.locator('main section[data-chapter="about"] dl'),
      wide: true,
    },
    {
      name: "the contact chapter's services and its panel",
      start: (page) =>
        page.locator('main section[data-chapter="contact"] ul').first(),
      end: (page) => page.locator('[data-stage="contact"]'),
      wide: true,
    },
  ],
  "/work": [
    {
      name: "a table row's number and its project",
      start: (page) =>
        page.locator('main tr[data-study="making-of"] > td').first(),
      end: (page) => page.locator('main tr[data-study="making-of"] > th'),
      wide: false,
    },
  ],
  "/about": [
    {
      name: "the mark panel and the words",
      start: (page) => page.locator('[data-testid="mark-panel"]'),
      end: (page) => page.locator("#page-heading"),
      wide: true,
    },
    {
      name: "Tools I use and Elsewhere",
      start: (page) => page.locator("#skills-heading"),
      end: (page) => page.locator("#elsewhere-heading"),
      wide: true,
    },
  ],
  "/contact": [
    {
      name: "the words and the form's place",
      start: (page) => page.locator("#page-heading"),
      end: (page) =>
        page.locator("main").getByText(pages.contact.form, { exact: true }),
      wide: true,
    },
  ],
};

type Side = { start: number; startEnd: number; end: number; endEnd: number };

/** Where each pair's two parts sit across the page, in CSS px from the left. */
async function sidesOf(page: Page, pairs: readonly Pair[]) {
  const sides: Side[] = [];
  for (const pair of pairs) {
    const start = await boxOf(pair.start(page));
    const end = await boxOf(pair.end(page));
    sides.push({
      start: start.x,
      startEnd: start.x + start.width,
      end: end.x,
      endEnd: end.x + end.width,
    });
  }
  return sides;
}

// R1 ships English only; forcing dir="rtl" shows whether the logical
// utilities hold before Arabic arrives in R2.
for (const route of ROUTES) {
  test(`REQ-I18N-02 ${route.path} holds its layout with dir=rtl forced, both columns mirrored`, async ({
    page,
  }, testInfo) => {
    // Above the wait for the field, so a slow field fails on that bound.
    if (route.hasField) test.setTimeout(ENGINE_TIMEOUT_MS + 30_000);
    await page.goto(route.path);
    await page.evaluate(() => document.fonts.ready);

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("the project sets no viewport");
    const pairs = (PAIRS[route.path] ?? []).filter(
      (pair) => !pair.wide || viewport.width >= TWO_COLUMNS_FROM_PX,
    );
    const ltr = await sidesOf(page, pairs);

    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // The screenshot is of the page with its field in place.
    if (route.hasField) await waitForFieldShown(page);

    const { overflow, width } = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      width: document.documentElement.clientWidth,
    }));
    await page.screenshot({
      path: testInfo.outputPath(`rtl-${route.name}.png`),
      fullPage: true,
    });
    expect(overflow).toBe(0);

    // Inline start is the right side in a right-to-left page.
    const logo = await boxOf(
      page.getByRole("link", { name: "T7SEN, home", exact: true }),
    );
    expect(logo.x + logo.width / 2).toBeGreaterThan(width / 2);

    // Each pair's start part sits left of its end part from left to right,
    // and right of it from right to left (REQ-I18N-01).
    const rtl = await sidesOf(page, pairs);
    for (const [index, pair] of pairs.entries()) {
      const before = ltr[index];
      const after = rtl[index];
      if (before === undefined || after === undefined) continue;
      const line =
        `${route.path} ${pair.name}: left to right start ${Math.round(before.start)} to ${Math.round(before.startEnd)}, ` +
        `end ${Math.round(before.end)} to ${Math.round(before.endEnd)}; right to left start ` +
        `${Math.round(after.start)} to ${Math.round(after.startEnd)}, end ${Math.round(after.end)} to ${Math.round(after.endEnd)}`;
      testInfo.annotations.push({ type: "mirror", description: line });
      expect(before.startEnd, line).toBeLessThanOrEqual(before.end + 1);
      expect(after.endEnd, line).toBeLessThanOrEqual(after.start + 1);
    }

    if (route.path === "/") {
      // Found by its chapter: the headline's text depends on the tier.
      const hero = page.locator('section[data-chapter="hero"]');
      for (const name of [HERO.primaryAction, HERO.secondaryAction]) {
        const action = await boxOf(
          hero.getByRole("link", { name, exact: true }),
        );
        expect(action.x, name).toBeGreaterThanOrEqual(0);
        expect(action.x + action.width, name).toBeLessThanOrEqual(width);
      }
    }
  });
}
