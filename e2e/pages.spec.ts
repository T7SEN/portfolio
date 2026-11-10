import { expect, test, type Locator } from "@playwright/test";

import { findDeferredLibraries } from "../scripts/budget-lib.mjs";
import { findPhysicalInCss } from "../scripts/class-scan-lib.mjs";
import { studyHref } from "../src/content";
import { about } from "../src/content/about";
import { heroCopy, STATIC_TIER } from "../src/content/hero";
import { pages } from "../src/content/pages";
import { expectNoAxeViolations } from "./support/axe";
import { ROUTES, SHORT_STUDIES } from "./support/routes";
import { waitForFieldShown } from "./support/tiers";

const HERO = heroCopy(STATIC_TIER);

// How long "from the first frame" may take once the HTML is parsed.
const FIRST_FRAME_MS = 1_000;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no layout box`);
  return box;
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const route of ROUTES) {
    test(`REQ-CNT-01 ${route.path} shows its h1 and main text in the static HTML`, async ({
      page,
    }) => {
      await page.goto(route.path);

      if (route.path === "/") {
        expect(route.h1).toBe("Real-time worlds, built for your GPU.");
      }
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        route.h1,
      );
      await expect(
        page.locator("main").getByText(route.body, { exact: true }).first(),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    });
  }
});

test("REQ-CNT-02 /work loads no three.js and no engine code", async ({
  page,
}) => {
  const requested: string[] = [];
  const scripts: Promise<{ url: string; source: string }>[] = [];

  page.on("request", (request) => requested.push(request.url()));
  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (
      response.request().resourceType() === "script" ||
      type.includes("javascript")
    ) {
      scripts.push(
        response.text().then((source) => ({ url: response.url(), source })),
      );
    }
  });

  // Idle, so chunks loaded after first content are caught too.
  await page.goto("/work", { waitUntil: "networkidle" });
  const loaded = await Promise.all(scripts);

  expect(loaded.length).toBeGreaterThan(0);
  for (const { url, source } of loaded) {
    expect(findDeferredLibraries(source), url).not.toContain("three.js");
  }
  expect(requested.filter((url) => /engine/i.test(url))).toEqual([]);
});

test("REQ-NAV-01 See the work is in view from the first frame and reaches /work in one click", async ({
  page,
}) => {
  // As soon as the HTML is parsed, before load or idle; the short timeout
  // means an intro that holds the link back fails the test.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const seeTheWork = page.getByRole("link", {
    name: HERO.primaryAction,
    exact: true,
  });

  await expect(seeTheWork).toBeInViewport({
    ratio: 1,
    timeout: FIRST_FRAME_MS,
  });
  await seeTheWork.click();

  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    pages.work.title,
  );
});

test.describe("on a short phone screen", () => {
  // A 375 by 667 phone with its browser bars showing leaves about 548 px.
  test.use({ viewport: { width: 375, height: 548 } });

  test("REQ-NAV-01 See the work and Skip intro are both in view from the first frame", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const name of [HERO.primaryAction, HERO.cornerControl]) {
      await expect(
        page.getByRole("link", { name, exact: true }),
      ).toBeInViewport({ ratio: 1, timeout: FIRST_FRAME_MS });
    }
  });
});

test("REQ-NAV-01 Skip intro is in view from the first frame and moves to the work section in one click", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const skipIntro = page.getByRole("link", {
    name: HERO.cornerControl,
    exact: true,
  });

  await expect(skipIntro).toBeInViewport({ ratio: 1, timeout: FIRST_FRAME_MS });
  await skipIntro.click();

  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator("#work")).toBeInViewport();
});

for (const study of SHORT_STUDIES) {
  test(`REQ-CNT-04 ${studyHref(study.slug)} fits one screen`, async ({
    page,
  }, testInfo) => {
    await page.goto(studyHref(study.slug));
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("the project sets no viewport");
    const article = await boxOf(page.locator("main article"));

    testInfo.annotations.push({
      type: "article",
      description: `height ${Math.round(article.height)} px, bottom ${Math.round(article.y + article.height)} px, viewport ${viewport.width} by ${viewport.height}`,
    });
    expect(article.y + article.height).toBeLessThanOrEqual(viewport.height);
  });
}

test("REQ-CNT-04 SystemSeven is marked in progress with its status", async ({
  page,
}) => {
  const systemseven = SHORT_STUDIES.find(
    (study) => study.slug === "systemseven",
  );
  if (!systemseven?.inProgress) {
    throw new Error("SystemSeven must stay in progress until it ships");
  }

  await page.goto(studyHref(systemseven.slug));
  const article = page.locator("main article");
  await expect(article.getByText("In progress", { exact: true })).toBeVisible();
  await expect(
    article.getByText(systemseven.status, { exact: true }),
  ).toBeVisible();
});

test("REQ-CNT-08 /about offers the CV on request, and no page links to a CV file", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(page.getByText(about.cv.text, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: about.cv.link.label, exact: true }),
  ).toHaveAttribute("href", about.cv.link.href);

  const cvLinks: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route.path);
    const anchors = await page.locator("a").evaluateAll((elements) =>
      elements.map((element) => ({
        href: element.getAttribute("href") ?? "",
        download: element.hasAttribute("download"),
      })),
    );
    expect(anchors.length).toBeGreaterThan(0);
    for (const { href, download } of anchors) {
      if (download || /\.(?:pdf|docx?)(?:[?#]|$)/i.test(href)) {
        cvLinks.push(`${route.path}: ${href || "(download)"}`);
      }
    }
  }
  expect(cvLinks).toEqual([]);
});

for (const route of ROUTES) {
  test(`REQ-A11Y-01 ${route.path} has zero axe violations and no horizontal scroll`, async ({
    page,
  }, testInfo) => {
    await page.goto(route.path);
    // The scan and the screenshot are of the page with its field in place.
    if (route.hasField) await waitForFieldShown(page);
    await expectNoAxeViolations(page);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    await page.screenshot({
      path: testInfo.outputPath(`${route.name}.png`),
      fullPage: true,
    });
    expect(overflow).toBe(0);
  });

  test(`REQ-A11Y-02 ${route.path} has the skip link as its first Tab stop, moving focus to main`, async ({
    page,
  }) => {
    await page.goto(route.path);
    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", {
      name: "Skip to content",
      exact: true,
    });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport({ ratio: 1 });

    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });
}

test("REQ-I18N-01 the shipped CSS has no physical left or right rules", async ({
  page,
}) => {
  await page.goto("/");
  const hrefs = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  expect(hrefs.length).toBeGreaterThan(0);

  const hits: string[] = [];
  for (const href of hrefs) {
    const css = await (await page.request.get(href)).text();
    for (const hit of findPhysicalInCss(css))
      hits.push(`${href}: ${hit.match}`);
  }
  expect(hits).toEqual([]);
});

test("REQ-A11Y-01 REQ-A11Y-02 an unknown page returns 404 with one h1, the skip link and zero axe violations", async ({
  page,
}) => {
  const response = await page.goto("/work/no-such-study");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Page not found",
  );
  await expectNoAxeViolations(page);

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toBeFocused();
});
