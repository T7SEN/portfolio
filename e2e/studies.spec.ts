import { expect, test, type Page } from "@playwright/test";

import { fullStudies, studies, studyHref, studyNumber } from "../src/content";
import { studyPage } from "../src/content/pages";
import { SHORT_STUDIES } from "./support/routes";

// The study pages in a real browser (REQ-CNT-03, REQ-CNT-04): the seven
// parts in order, the facts row, the list of parts with the one being read,
// the neighbours, the quotes with their permission, and the notices. The
// short studies' one-screen fit and SystemSeven's status are in pages.spec.

const PART_ORDER = [
  ["summary", studyPage.parts.summary],
  ["problem", studyPage.parts.problem],
  ["approach", studyPage.parts.approach],
  ["hard-part", studyPage.parts.hardPart],
  ["results", studyPage.parts.results],
  ["would-change", studyPage.parts.wouldChange],
  ["links", studyPage.parts.links],
] as const;

// The list of parts marks a part while it crosses the top third of the
// window (study-contents.tsx), so a part scrolled to the top is the one read.
async function scrollPartToTop(page: Page, id: string) {
  await page.locator(`section#${id}`).evaluate((section) => {
    section.scrollIntoView({ block: "start", behavior: "instant" });
  });
}

function currentParts(page: Page): Promise<string[]> {
  return page
    .getByRole("navigation", { name: studyPage.contents })
    .locator('a[aria-current="location"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
}

for (const study of fullStudies) {
  const index = studies.findIndex((entry) => entry.slug === study.slug);
  const previous = studies[index - 1];
  const next = studies[index + 1];

  test(`REQ-CNT-03 REQ-CNT-07 ${studyHref(study.slug)} runs its seven parts in order under its facts row, with the list of parts and the studies either side`, async ({
    page,
  }) => {
    await page.goto(studyHref(study.slug));
    const article = page.locator("main article");

    // The breadcrumb, the label and the title.
    const breadcrumb = page.getByRole("navigation", {
      name: studyPage.breadcrumb.name,
    });
    await expect(
      breadcrumb.getByRole("link", { name: studyPage.breadcrumb.work.label }),
    ).toHaveAttribute("href", studyPage.breadcrumb.work.href);
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(
      study.title,
    );
    await expect(
      article.getByRole("heading", { level: 1, name: study.title }),
    ).toBeVisible();
    await expect(
      article.getByText(
        `${studyPage.label.full} ${studyNumber(study.slug)} · ${study.tag}`,
      ),
    ).toBeVisible();

    // The seven parts, in order, each opened by its own heading.
    const parts = await article
      .locator("section[id]")
      .evaluateAll((sections) =>
        sections.map((section) => [
          section.id,
          section.querySelector("h2")?.textContent?.trim() ?? "",
        ]),
      );
    expect(parts).toEqual(PART_ORDER.map(([id, title]) => [id, title]));

    // The facts row: Role, Built with, Live and Code. Without a public
    // repository Code is on request and links nowhere.
    const facts = article.locator("dl").first();
    await expect(facts.locator("dt")).toHaveText([
      studyPage.facts.role,
      studyPage.facts.builtWith,
      studyPage.facts.live,
      studyPage.facts.code,
    ]);
    const values = facts.locator("dd");
    await expect(values.nth(0)).toHaveText(study.roleLine);
    await expect(values.nth(2).getByRole("link")).toHaveAttribute(
      "href",
      study.links.live.href,
    );
    const code = values.nth(3);
    if (study.links.repo === undefined) {
      await expect(code).toHaveText(studyPage.facts.codeOnRequest);
      await expect(code.getByRole("link")).toHaveCount(0);
    } else {
      await expect(code.getByRole("link")).toHaveAttribute(
        "href",
        study.links.repo.href,
      );
    }

    // The screenshot with its caption, and the approach diagram named for
    // what it shows.
    if (typeof study.screenshot !== "string") {
      await expect(article.locator("figure figcaption").first()).toHaveText(
        study.screenshot.caption,
      );
    }
    if (typeof study.diagram !== "string") {
      await expect(
        article
          .locator("section#approach")
          .getByRole("group", { name: study.diagram.name }),
      ).toBeVisible();
    }

    // The Links part: the live site, then the code where it is public.
    const links = article.locator("section#links").getByRole("link");
    const expected = [study.links.live, study.links.repo].filter(
      (link) => link !== undefined,
    );
    await expect(links).toHaveCount(expected.length);
    for (const [at, link] of expected.entries()) {
      await expect(links.nth(at)).toHaveAttribute("href", link.href);
      await expect(links.nth(at)).toContainText(link.label);
    }

    // The list of parts, in the same order, linking to each.
    const contents = page.getByRole("navigation", {
      name: studyPage.contents,
    });
    await expect(contents.getByRole("link")).toHaveCount(PART_ORDER.length);
    for (const [at, [id, title]] of PART_ORDER.entries()) {
      const link = contents.getByRole("link").nth(at);
      await expect(link).toHaveAttribute("href", `#${id}`);
      await expect(link).toHaveText(`${at + 1}. ${title}`);
    }

    // Previous and next, as the study order has them.
    const more = page.getByRole("navigation", { name: studyPage.more.name });
    const neighbours = more.getByRole("link");
    const around = [previous, next].filter((entry) => entry !== undefined);
    await expect(neighbours).toHaveCount(around.length);
    if (previous !== undefined) {
      const card = more.locator('a[rel="prev"]');
      await expect(card).toHaveAttribute("href", studyHref(previous.slug));
      await expect(card).toContainText(studyPage.more.previous);
      await expect(card).toContainText(previous.title);
    }
    if (next !== undefined) {
      const card = more.locator('a[rel="next"]');
      await expect(card).toHaveAttribute("href", studyHref(next.slug));
      await expect(card).toContainText(studyPage.more.next);
      await expect(card).toContainText(next.title);
    }
  });

  test(`REQ-CNT-03 REQ-A11Y-02 ${studyHref(study.slug)} marks the part being read in the list of parts, which stays in view on a desktop`, async ({
    page,
  }, testInfo) => {
    await page.goto(studyHref(study.slug));
    const contents = page.getByRole("navigation", {
      name: studyPage.contents,
    });

    // Above every part the first is the one to read.
    await expect.poll(() => currentParts(page)).toEqual(["#summary"]);

    // The glow token as the browser resolves it.
    const glow = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-glow)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });

    // Parts taller than the top third of the window on every study, so the
    // part at the top is the only one in the band.
    for (const id of ["problem", "approach", "results"]) {
      await scrollPartToTop(page, id);
      await expect
        .poll(() => currentParts(page), { message: `reading ${id}` })
        .toEqual([`#${id}`]);
      const current = contents.locator(`a[href="#${id}"]`);
      await expect(current).toHaveCSS("color", glow);
      await expect(
        contents.locator('a:not([aria-current="location"])').first(),
      ).not.toHaveCSS("color", glow);

      // From 1024 px the list is held in view while the parts scroll by.
      if (testInfo.project.name === "desktop") {
        const box = await contents.boundingBox();
        const viewport = page.viewportSize();
        expect(box, "the list of parts has a box").not.toBeNull();
        expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
          viewport?.height ?? 0,
        );
      }
    }
  });
}

// Every quote with who said it and who allowed it, and when (REQ-CNT-06).
for (const study of fullStudies) {
  const quotes = study.quotes;
  if (quotes === undefined || typeof quotes === "string") continue;
  test(`REQ-CNT-03 REQ-CNT-06 ${studyHref(study.slug)} shows each quote with its speaker and permission`, async ({
    page,
  }) => {
    await page.goto(studyHref(study.slug));
    const results = page.locator("main article section#results");
    const figures = results.locator("figure");
    await expect(figures).toHaveCount(quotes.length);
    for (const [at, quote] of quotes.entries()) {
      const figure = figures.nth(at);
      await expect(figure.locator("blockquote")).toHaveText(`“${quote.text}”`);
      await expect(figure.locator("figcaption")).toContainText(quote.who);
      await expect(figure.locator("figcaption")).toContainText(
        `${studyPage.permission} ${quote.permission.grantedBy}, ${quote.permission.date}.`,
      );
    }
  });
}

// ArcheLab's fan work notice and Coup Online's credit line, under the title.
for (const study of fullStudies) {
  const notice = study.notice;
  if (notice === undefined) continue;
  test(`REQ-CNT-03 ${studyHref(study.slug)} shows its notice under the title`, async ({
    page,
  }) => {
    await page.goto(studyHref(study.slug));
    const article = page.locator("main article");
    const line = article.getByText(notice, { exact: true });
    await expect(line).toBeVisible();
    const title = await article
      .getByRole("heading", { level: 1 })
      .boundingBox();
    const box = await line.boundingBox();
    expect(
      (box?.y ?? 0) > (title?.y ?? 0),
      "the notice sits under the title",
    ).toBe(true);
  });
}

test("REQ-CNT-03 the studies without a public repository are Coup Online and ArcheLab, and neither links to code", async ({
  page,
}) => {
  const closed = fullStudies
    .filter((study) => study.links.repo === undefined)
    .map((study) => study.slug);
  expect(closed).toEqual(["coup-online", "archelab"]);
  for (const slug of closed) {
    await page.goto(studyHref(slug));
    const hrefs = await page
      .locator("main article a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(
      hrefs.filter((href) => href?.includes("github.com")),
      `${slug} links to no repository`,
    ).toEqual([]);
  }
});

for (const study of SHORT_STUDIES) {
  test(`REQ-CNT-04 ${studyHref(study.slug)} shows its short parts, its label and ${study.links.length === 0 ? "no Links part, since it has none" : "its links"}`, async ({
    page,
  }) => {
    await page.goto(studyHref(study.slug));
    const article = page.locator("main article");
    await expect(
      article.getByRole("heading", { level: 1, name: study.title }),
    ).toBeVisible();
    await expect(
      article.getByText(
        `${studyPage.label.short} ${studyNumber(study.slug)} · ${study.tag}`,
      ),
    ).toBeVisible();
    const headings = await article
      .locator("section h2")
      .evaluateAll((all) => all.map((heading) => heading.textContent?.trim()));
    const { shortParts } = studyPage;
    expect(headings).toEqual(
      study.links.length === 0
        ? [shortParts.what, shortParts.why, shortParts.stack]
        : [shortParts.what, shortParts.why, shortParts.stack, shortParts.links],
    );
    const links = article.locator("section#links").getByRole("link");
    await expect(links).toHaveCount(study.links.length);
    for (const [at, link] of study.links.entries()) {
      await expect(links.nth(at)).toHaveAttribute("href", link.href);
    }
    if (study.inProgress) {
      await expect(
        article.getByText(studyPage.inProgress, { exact: true }),
      ).toBeVisible();
    }
  });
}
