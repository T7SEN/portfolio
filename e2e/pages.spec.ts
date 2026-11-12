import { expect, test, type Locator } from "@playwright/test";

import { ENGINE_ENTRY, findDeferredLibraries } from "../scripts/budget-lib.mjs";
import { findPhysicalInCss } from "../scripts/class-scan-lib.mjs";
import { fullStudies, studies, studyHref } from "../src/content";
import { about } from "../src/content/about";
import { heroCopy, STATIC_TIER } from "../src/content/hero";
import { pages } from "../src/content/pages";
import { expectNoAxeViolations } from "./support/axe";
import { ROUTES, SHORT_STUDIES } from "./support/routes";
import { ENGINE_TIMEOUT_MS, waitForFieldShown } from "./support/tiers";

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
  const scripts: Promise<{ url: string; source: string }>[] = [];

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
    const libraries = findDeferredLibraries(source);
    expect(libraries, url).not.toContain("three.js");
    // Chunk names are hashes, so the engine is found by what its code holds.
    expect(libraries, url).not.toContain(ENGINE_ENTRY);
  }
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

// Phones take the smaller file of each screenshot, so the picture never
// holds back the page on a slow network; each file shows at the size the
// content states, so nothing moves when it arrives.
for (const study of fullStudies) {
  const shot = study.screenshot;
  if (typeof shot === "string") continue;
  test(`REQ-CNT-03 REQ-PERF-01 ${studyHref(study.slug)} shows its screenshot at its stored size, the smaller file on a phone`, async ({
    page,
  }) => {
    await page.goto(studyHref(study.slug));
    const image = page.locator("main figure img");
    await expect(image).toHaveAttribute("alt", shot.alt);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty("complete", true);
    const shown = await image.evaluate((element) => {
      const img = element as HTMLImageElement;
      return {
        file: new URL(img.currentSrc).pathname,
        size: [img.naturalWidth, img.naturalHeight],
      };
    });
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("the project sets no viewport");
    const file = viewport.width < 640 ? shot.phone : shot;
    expect(shown).toEqual({ file: file.src, size: [file.width, file.height] });
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
    // Above the wait for the field, so a slow field fails on that bound.
    if (route.hasField) test.setTimeout(ENGINE_TIMEOUT_MS + 30_000);
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

// The focus ring glows from the first frame it is drawn: nothing fades it in
// (REQ-A11Y-02). Tailwind's transition-colors lists outline-color, so a ring
// colour that arrived with focus would transition from the element's own
// colour; the lavender primary pill showed a dark ring for its first frames.
test("REQ-A11Y-02 the focus ring is glow from its first frame on every focusable element, with no colour transition", async ({
  page,
}) => {
  await page.goto("/");
  const glow = "rgb(167, 139, 250)";
  // Every element that takes focus on the home page, by Tab, and the
  // lavender primary pill among them.
  const primary = page
    .locator("main")
    .getByRole("link", { name: HERO.primaryAction, exact: true });
  await expect(primary).toBeVisible();
  const seen: string[] = [];
  let reachedPrimary = false;
  for (let stop = 0; stop < 40; stop += 1) {
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const element = document.activeElement;
      if (element === null || element === document.body) return null;
      const style = getComputedStyle(element);
      const fading = element
        .getAnimations()
        .filter(
          (animation) =>
            animation instanceof CSSTransition &&
            (animation.transitionProperty === "outline-color" ||
              animation.transitionProperty === "outline"),
        ).length;
      return {
        name: `${element.tagName.toLowerCase()} ${(element.textContent ?? "").trim().slice(0, 40)}`,
        colour: style.outlineColor,
        style: style.outlineStyle,
        width: style.outlineWidth,
        fading,
      };
    });
    if (ring === null) break;
    seen.push(ring.name);
    expect(ring, `${ring.name}: the ring as it is first drawn`).toMatchObject({
      colour: glow,
      style: "solid",
      width: "2px",
      fading: 0,
    });
    if (ring.name.includes(HERO.primaryAction)) reachedPrimary = true;
  }
  expect(seen.length).toBeGreaterThan(5);
  expect(reachedPrimary, "the primary pill took focus").toBe(true);
});

test("REQ-I18N-01 the shipped CSS has no physical left or right rules", async ({
  page,
}) => {
  await page.goto("/");
  // The stylesheet is inlined into the HTML (next.config.ts, inlineCss), so
  // its rules are read from the style elements; a linked stylesheet, should
  // one appear, is fetched and read too.
  const inline = await page
    .locator("style")
    .evaluateAll((styles) => styles.map((style) => style.textContent ?? ""));
  const hrefs = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  const sheets = [
    ...inline.map((css, index) => ({ name: `style ${index + 1}`, css })),
  ];
  for (const href of hrefs) {
    sheets.push({
      name: href,
      css: await (await page.request.get(href)).text(),
    });
  }
  // The site's own sheet is there: Tailwind's utilities and the tokens.
  expect(sheets.some(({ css }) => css.includes("--color-void"))).toBe(true);

  const hits: string[] = [];
  for (const { name, css } of sheets) {
    for (const hit of findPhysicalInCss(css))
      hits.push(`${name}: ${hit.match}`);
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

// The contact address with its Copy button (T7SEN, 11 Nov 2026; a departure
// from the brief's hidden address). "Address copied." clears after 4 s
// (COPIED_MS in src/components/pages/copy-address.tsx); "Could not copy."
// stays until the next press.
const CLEARED_WITHIN_MS = 10_000;
const FAILED_HELD_MS = 6_000;

test.describe("the /contact address", () => {
  const { address } = pages.contact;

  test("REQ-A11Y-01 REQ-A11Y-05 Copy puts the address on the clipboard, says so politely and clears the line again", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/contact");
    const main = page.locator("main");

    await expect(
      main.getByRole("link", { name: address.email, exact: true }),
    ).toHaveAttribute("href", address.href);
    const button = main.getByRole("button", {
      name: address.copy.name,
      exact: true,
    });
    await expect(button).toHaveText(address.copy.label);
    await expect(button).toHaveAttribute("data-state", "idle");
    const box = await boxOf(button);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const status = main.getByRole("status");
    await expect(status).toHaveText("");

    await button.click();
    await expect(status).toHaveText(address.copy.copied);
    await expect(button).toHaveAttribute("data-state", "copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      address.email,
    );

    // A second press says it again.
    await button.click();
    await expect(status).toHaveText(address.copy.copied);

    await expect(status).toHaveText("", { timeout: CLEARED_WITHIN_MS });
    await expect(button).toHaveAttribute("data-state", "idle");
  });

  test("REQ-A11Y-05 a clipboard that refuses gives the failed line with its way forward, and it stays", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () =>
            Promise.reject(new DOMException("Refused", "NotAllowedError")),
        },
      });
    });
    await page.goto("/contact");
    const main = page.locator("main");
    const button = main.getByRole("button", {
      name: address.copy.name,
      exact: true,
    });
    const status = main.getByRole("status");

    await button.click();
    await expect(status).toHaveText(address.copy.failed);
    await expect(button).toHaveAttribute("data-state", "failed");
    await page.waitForTimeout(FAILED_HELD_MS);
    await expect(status).toHaveText(address.copy.failed);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("REQ-CNT-01 the address is a mail link and no Copy button shows, since it could not work", async ({
      page,
    }) => {
      await page.goto("/contact");
      const main = page.locator("main");
      await expect(
        main.getByRole("link", { name: address.email, exact: true }),
      ).toHaveAttribute("href", address.href);
      await expect(main.getByRole("button")).toHaveCount(0);
    });
  });
});

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A /work study link's name, exactly: its column word, then the project
 * ("Full study, Coup Online"). The link carries it as its label, so no
 * space comes before the comma.
 */
function studyLinkName(label: string, title: string): RegExp {
  return new RegExp(`^${escaped(label)}, ${escaped(title)}$`);
}

/** Every row of the /work table: its key and its study link's name and href. */
const WORK_ROWS = [
  ...studies.map((study) => ({
    key: study.slug,
    title: study.title,
    link: studyLinkName(study.listing.studyLabel, study.title),
    href: studyHref(study.slug),
  })),
  {
    key: "v1",
    title: pages.work.table.v1.title,
    link: studyLinkName(
      pages.work.table.v1.link.label,
      pages.work.table.v1.title,
    ),
    href: pages.work.table.v1.link.href,
  },
];

test("REQ-CNT-02 REQ-CNT-07 REQ-A11Y-01 /work lists every study, then the archive, in one table named by its heading, each study link named with its project", async ({
  page,
}) => {
  await page.goto("/work");
  const table = page.getByRole("table", {
    name: pages.work.heading,
    exact: true,
  });
  await expect(table).toHaveCount(1);
  const { headers } = pages.work.table;
  expect(
    await table
      .getByRole("columnheader")
      .evaluateAll((cells) => cells.map((cell) => cell.textContent)),
  ).toEqual([
    headers.number,
    headers.project,
    headers.what,
    headers.builtWith,
    headers.study,
  ]);
  expect(
    await table
      .locator("tbody tr")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-study"))),
  ).toEqual(WORK_ROWS.map((row) => row.key));

  for (const row of WORK_ROWS) {
    const tableRow = table.locator(`tbody tr[data-study="${row.key}"]`);
    await expect(
      tableRow.getByRole("rowheader", { name: row.title, exact: true }),
    ).toHaveCount(1);
    const link = tableRow.getByRole("link", { name: row.link });
    await expect(link).toHaveAttribute("href", row.href);
    expect((await boxOf(link)).height, row.key).toBeGreaterThanOrEqual(44);
  }
});

test.describe("on a 320 px phone", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("REQ-A11Y-01 REQ-I18N-01 /work stacks each row's cells beside its number, with no sideways scroll and every study link 44 px tall", async ({
    page,
  }, testInfo) => {
    await page.goto("/work");
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    await page.screenshot({
      path: testInfo.outputPath("work-320.png"),
      fullPage: true,
    });
    expect(overflow).toBe(0);

    // The header row is hidden from sight below 1024 px; its cells keep
    // their names for assistive technology.
    const table = page.getByRole("table", {
      name: pages.work.heading,
      exact: true,
    });
    expect((await boxOf(table.locator("thead"))).height).toBeLessThanOrEqual(1);
    await expect(table.getByRole("columnheader")).toHaveCount(5);

    for (const row of WORK_ROWS) {
      const tableRow = table.locator(`tbody tr[data-study="${row.key}"]`);
      const number = await boxOf(tableRow.locator("td").first());
      const title = await boxOf(tableRow.getByRole("rowheader"));
      const what = await boxOf(tableRow.locator("td").nth(1));
      const link = await boxOf(tableRow.getByRole("link", { name: row.link }));
      const line = `${row.key}: number at ${Math.round(number.x)}, title ${Math.round(title.x)} to ${Math.round(title.x + title.width)} from ${Math.round(title.y)}, what ${Math.round(what.x)} from ${Math.round(what.y)}, link ${Math.round(link.height)} px tall`;
      testInfo.annotations.push({ type: "stacked", description: line });
      // The number at the start, the cells in one column after it, each
      // under the one before.
      expect(number.x + number.width, line).toBeLessThanOrEqual(title.x + 1);
      expect(Math.abs(what.x - title.x), line).toBeLessThanOrEqual(1);
      expect(what.y, line).toBeGreaterThanOrEqual(title.y + title.height - 1);
      expect(title.x + title.width, line).toBeLessThanOrEqual(320);
      expect(link.height, line).toBeGreaterThanOrEqual(44);
    }
  });
});
