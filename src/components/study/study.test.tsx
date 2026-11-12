import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStudy, studies, studyHref, studyNumber } from "@/content";
import { isMarker } from "@/content/markers";
import { pages, studyPage } from "@/content/pages";
import type {
  FullStudy as FullContent,
  ShortStudy as ShortContent,
  Study,
} from "@/content/types";
import type { EngineEvent } from "@/engine/types";
import { tierStore } from "@/lib/tier-store";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { DotJoined } from "./dot-joined";
import { FrameStill } from "./frame-still";
import { FullStudy, PART_IDS } from "./full-study";
import { ShortCard } from "./short-card";
import { ShortStudy } from "./short-study";
import { StudyRow } from "./study-row";
import { STUDY_STILLS } from "./study-stills";

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

function classesOf(element: Element | null | undefined) {
  return (element?.getAttribute("class") ?? "").split(/\s+/);
}

function allClasses(host: Element) {
  return [host, ...host.querySelectorAll("[class]")]
    .map((node) => node.getAttribute("class") ?? "")
    .join(" ");
}

/** The words a link says, its aria-hidden arrows left out. */
function linkName(link: Element | null | undefined) {
  return [...(link?.childNodes ?? [])]
    .filter(
      (node) =>
        !(
          node instanceof Element && node.getAttribute("aria-hidden") === "true"
        ),
    )
    .map((node) => node.textContent)
    .join("")
    .trim();
}

const fullStudies = studies.filter(
  (study): study is FullContent => study.kind === "full",
);
const shortStudies = studies.filter(
  (study): study is ShortContent => study.kind === "short",
);

const { parts: PART_TITLES, shortParts: SHORT_PART_TITLES } = studyPage;

/** The levels of every heading, in page order. */
function headingLevels(host: Element) {
  return [...host.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) =>
    Number(heading.tagName.slice(1)),
  );
}

function expectHeadingsInOrder(host: Element) {
  const levels = headingLevels(host);
  expect(levels[0]).toBe(1);
  expect(levels.filter((level) => level === 1)).toHaveLength(1);
  for (const [index, level] of levels.entries()) {
    if (index > 0) {
      expect(level).toBeLessThanOrEqual((levels[index - 1] ?? 1) + 1);
    }
  }
}

/** The words a screen reader reads, everything aria-hidden left out. */
function spokenText(element: Element | null | undefined) {
  const copy = element?.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The dashed box that holds exactly this marker. */
function dashedBoxOf(host: Element, marker: string) {
  return [...host.querySelectorAll(".border-dashed")].find(
    (box) => box.textContent === marker,
  );
}

/** Coup Online with every part a marker can hide supplied, as samples. */
function drawnStudy(): FullContent {
  return {
    ...fullOf("coup-online"),
    screenshot: {
      src: "/work/sample.webp",
      alt: "A sample picture",
      caption: "A sample caption.",
      width: 1600,
      height: 900,
      phone: { src: "/work/sample-phone.webp", width: 800, height: 450 },
    },
    diagram: {
      name: "How the sample works",
      boxes: [
        { title: "First box", line: "Its line." },
        { title: "Second box", line: "Its line.", via: "Sends", isKey: true },
        { title: "Third box", line: "Its line.", via: "Keeps" },
      ],
    },
    excerpt: {
      caption: "A sample excerpt.",
      path: "src/sample.ts",
      language: "TypeScript",
      code: "export const sample = 1;",
    },
    quotes: [
      {
        text: "Words a player wrote",
        who: "A player",
        permission: { grantedBy: "The player", date: "11 Nov 2026" },
      },
    ],
  };
}

function renderStudy(study: Study) {
  return render(
    study.kind === "full" ? (
      <FullStudy study={study} />
    ) : (
      <ShortStudy study={study} />
    ),
  );
}

describe("FullStudy", () => {
  it.each(fullStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-03 %s shows the seven parts in order under their headings",
    (_slug, study) => {
      const host = render(<FullStudy study={study} />);
      expect(host.querySelector("h1")?.textContent).toBe(study.title);
      const headings = [...host.querySelectorAll("h2")];
      expect(headings.map((heading) => heading.textContent)).toEqual(
        Object.values(PART_TITLES),
      );
      expect(headings.map((heading) => heading.closest("section")?.id)).toEqual(
        Object.values(PART_IDS),
      );
    },
  );

  it.each(fullStudies.map((study) => [study.slug, study] as const))(
    "REQ-A11Y-01 %s has one h1 and no heading level skipped",
    (_slug, study) => {
      expectHeadingsInOrder(render(<FullStudy study={study} />));
    },
  );

  it("REQ-A11Y-01 a study with every part supplied keeps its headings in order", () => {
    expectHeadingsInOrder(render(<FullStudy study={drawnStudy()} />));
  });

  it("REQ-CNT-03 the summary is the three lines under the title, the first in the text colour, under a heading for screen readers", () => {
    const study = fullOf("coup-online");
    const summary = render(<FullStudy study={study} />).querySelector(
      `#${PART_IDS.summary}`,
    );
    expect(summary?.querySelector("h2")?.className).toBe("sr-only");
    const lines = [...(summary?.querySelectorAll("p") ?? [])];
    expect(lines.map((line) => line.textContent)).toEqual([...study.summary]);
    expect(lines.map((line) => classesOf(line).includes("text-text"))).toEqual([
      true,
      false,
      false,
    ]);
    expect(lines.map((line) => classesOf(line).includes("text-muted"))).toEqual(
      [false, true, true],
    );
  });

  it.each(fullStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-07 %s: the breadcrumb leads to Work, and the label carries the study's number and tag",
    (_slug, study) => {
      const host = render(<FullStudy study={study} />);
      const crumb = host.querySelector(
        `nav[aria-label="${studyPage.breadcrumb.name}"]`,
      );
      const work = crumb?.querySelector("a");
      expect(work?.getAttribute("href")).toBe("/work");
      expect(work?.textContent).toBe(studyPage.breadcrumb.work.label);
      const current = crumb?.querySelector('[aria-current="page"]');
      expect(current?.textContent).toBe(study.title);
      expect(current?.closest("a")).toBeNull();
      expect(host.querySelector("article p")?.textContent).toBe(
        `${studyPage.label.full} ${studyNumber(study.slug)} · ${study.tag}`,
      );
    },
  );

  it("REQ-CNT-03 REQ-CNT-05 the facts row shows Role, Built with, Live and Code, an address still to come as text", () => {
    // Built from parts, so this file holds no marker text for the release
    // check to count.
    const waiting = `[${"FILL"}: the live link]` as const;
    const study: FullContent = {
      ...fullOf("making-of"),
      links: {
        live: { label: "Live site", href: waiting },
        repo: { label: "Read the code", href: waiting },
      },
    };
    const facts = render(<FullStudy study={study} />).querySelector("dl");
    expect(
      [...(facts?.children ?? [])].map((fact) => [
        fact.querySelector("dt")?.textContent,
        fact.querySelector("dd")?.textContent,
        fact.querySelector("a"),
      ]),
    ).toEqual([
      [studyPage.facts.role, study.roleLine, null],
      [studyPage.facts.builtWith, study.listing.builtWith, null],
      [studyPage.facts.live, waiting, null],
      [studyPage.facts.code, waiting, null],
    ]);
  });

  it("REQ-CNT-03 a supplied address in the facts row is a link that reads as the address", () => {
    const study: FullContent = {
      ...fullOf("coup-online"),
      links: {
        live: { label: "Live site", href: "https://example.com/" },
        repo: { label: "Repository", href: "https://example.org/sample-code" },
      },
    };
    const links = [
      ...(render(<FullStudy study={study} />)
        .querySelector("dl")
        ?.querySelectorAll("a") ?? []),
    ];
    expect(
      links.map((link) => [link.getAttribute("href"), linkName(link)]),
    ).toEqual([
      ["https://example.com/", "example.com"],
      ["https://example.org/sample-code", "example.org/sample-code"],
    ]);
    for (const link of links) {
      expect(link.textContent?.endsWith("↗")).toBe(true);
      expect(classesOf(link)).toContain("min-h-11");
    }
  });

  it("REQ-CNT-03 a study with no public repository says its code is on request, with no link", () => {
    for (const study of [fullOf("coup-online"), fullOf("archelab")]) {
      expect(study.links.repo).toBeUndefined();
      const facts = [
        ...(render(<FullStudy study={study} />).querySelector("dl")?.children ??
          []),
      ];
      const code = facts.at(-1);
      expect(
        facts.map((fact) => fact.querySelector("dt")?.textContent),
      ).toEqual([
        studyPage.facts.role,
        studyPage.facts.builtWith,
        studyPage.facts.live,
        studyPage.facts.code,
      ]);
      expect(code?.querySelector("dd")?.textContent).toBe(
        studyPage.facts.codeOnRequest,
      );
      expect(code?.querySelector("a")).toBeNull();
    }
  });

  it.each(fullStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-05 %s: a screenshot, diagram or excerpt still to come is a dashed box holding its marker",
    (_slug, study) => {
      const host = render(<FullStudy study={study} />);
      for (const part of [study.screenshot, study.diagram, study.excerpt]) {
        if (typeof part !== "string") continue;
        const box = dashedBoxOf(host, part);
        expect(box, part).toBeDefined();
        expect(box?.querySelector("img, figure, pre")).toBeNull();
      }
      if (typeof study.screenshot === "string") {
        expect(host.querySelector("img")).toBeNull();
      }
    },
  );

  it("REQ-CNT-03 a supplied screenshot is a framed picture with its alt text, its size and its caption", () => {
    const study = drawnStudy();
    const shot = study.screenshot;
    if (typeof shot === "string") throw new Error("the sample has a picture");
    const figure = render(<FullStudy study={study} />).querySelector("figure");
    const image = figure?.querySelector("img");
    expect(image?.getAttribute("src")).toBe(shot.src);
    expect(image?.getAttribute("alt")).toBe(shot.alt);
    expect(image?.getAttribute("width")).toBe(String(shot.width));
    expect(image?.getAttribute("height")).toBe(String(shot.height));
    // Lazy and at low priority, so it never holds back the text above it.
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("fetchpriority")).toBe("low");
    const phone = image?.closest("picture")?.querySelector("source");
    expect(phone?.getAttribute("media")).toBe("(max-width: 639.98px)");
    expect(phone?.getAttribute("srcset")).toBe(shot.phone.src);
    expect(phone?.getAttribute("width")).toBe(String(shot.phone.width));
    expect(phone?.getAttribute("height")).toBe(String(shot.phone.height));
    expect(classesOf(image?.closest("picture")?.parentElement)).toEqual(
      expect.arrayContaining(["rounded-2xl", "border", "bg-surface"]),
    );
    const caption = figure?.querySelector("figcaption");
    expect(caption?.textContent).toBe(shot.caption);
    expect(classesOf(caption)).toEqual(
      expect.arrayContaining(["text-sm", "text-muted"]),
    );
  });

  it("REQ-CNT-03 the approach diagram is a group named for what it shows, its boxes joined in order by labelled arrows, the key box with a lavender border", () => {
    const study = drawnStudy();
    const diagram = study.diagram;
    if (typeof diagram === "string")
      throw new Error("the sample has a diagram");
    const group = render(<FullStudy study={study} />).querySelector(
      '[role="group"]',
    );
    expect(group?.getAttribute("aria-label")).toBe(diagram.name);
    expect(group?.closest(`#${PART_IDS.approach}`)).not.toBeNull();
    expect(
      [...(group?.querySelectorAll("ol > li") ?? [])].map(
        (box) => box.textContent,
      ),
    ).toEqual(
      diagram.boxes.map(
        (box) => `${"via" in box ? box.via : ""}${box.title}${box.line}`,
      ),
    );
    const arrows = [...(group?.querySelectorAll(".text-violet") ?? [])];
    expect(arrows.map((arrow) => arrow.textContent)).toEqual([
      "Sends",
      "Keeps",
    ]);
    for (const arrow of arrows) {
      expect(classesOf(arrow)).toEqual(
        expect.arrayContaining(["font-mono", "uppercase"]),
      );
      expect(arrow.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
    const keyBoxes = [...(group?.querySelectorAll("[data-key]") ?? [])];
    expect(keyBoxes.map((box) => box.textContent)).toEqual([
      "Second boxIts line.",
    ]);
    expect(classesOf(keyBoxes[0])).toEqual(
      expect.arrayContaining(["border-2", "border-glow"]),
    );
  });

  it("REQ-CNT-03 a code excerpt names its language and file, keeps its code as written and can be scrolled by keyboard", () => {
    const study = drawnStudy();
    const excerpt = study.excerpt;
    if (typeof excerpt === "string") throw new Error("the sample has code");
    const pre = render(<FullStudy study={study} />).querySelector("pre");
    expect(pre?.querySelector("code")?.textContent).toBe(excerpt.code);
    expect(pre?.getAttribute("tabindex")).toBe("0");
    expect(classesOf(pre)).toContain("overflow-x-auto");
    const figure = pre?.closest("figure");
    expect(figure?.textContent).toContain(
      `${excerpt.language} · ${excerpt.path}`,
    );
    expect(figure?.querySelector("figcaption")?.textContent).toBe(
      excerpt.caption,
    );
  });

  it("REQ-CNT-03 REQ-CNT-05 results show each figure in Unbounded glow over its label and its source", () => {
    const study = fullOf("making-of");
    const host = render(<FullStudy study={study} />);
    const text = host.textContent ?? "";
    for (const row of study.results) {
      expect(text).toContain(row.label);
      expect(text).toContain(row.value);
      expect(text).toContain(`${studyPage.source}: ${row.source}`);
    }
    const cards = [
      ...(host.querySelector(`#${PART_IDS.results} dl`)?.children ?? []),
    ];
    expect(cards).toHaveLength(study.results.length);
    for (const card of cards) {
      const figure = card.querySelector("dd");
      expect(classesOf(figure)).toEqual(
        expect.arrayContaining(["order-1", "font-display", "text-glow"]),
      );
      expect(classesOf(card.querySelector("dt"))).toContain("order-2");
    }
  });

  it("REQ-CNT-06 a quote still to come shows as its marker, muted, with no quotation marks", () => {
    const quotes = `[${"FILL"}: a player quote with permission]` as const;
    const study: FullContent = { ...fullOf("coup-online"), quotes };
    const results = render(<FullStudy study={study} />).querySelector(
      `#${PART_IDS.results}`,
    );
    const marker = [...(results?.querySelectorAll("p") ?? [])].find(
      (node) => node.textContent === quotes,
    );
    expect(classesOf(marker)).toContain("text-muted");
    expect(results?.querySelector("blockquote, figure")).toBeNull();
    expect(results?.textContent).not.toMatch(/[“”]/);
  });

  it("REQ-CNT-06 a recorded quote shows in quotation marks with who said it, who allowed it and when", () => {
    const quote = render(<FullStudy study={drawnStudy()} />).querySelector(
      `#${PART_IDS.results} figure`,
    );
    expect(quote?.querySelector("blockquote")?.textContent).toBe(
      "“Words a player wrote”",
    );
    expect(
      [...(quote?.querySelectorAll("figcaption > span") ?? [])].map(
        (line) => line.textContent,
      ),
    ).toEqual(["A player", `${studyPage.permission} The player, 11 Nov 2026.`]);
  });

  it("REQ-CNT-12 ArcheLab says it is unofficial fan work before the first part, and shows no picture until its own interface is supplied", () => {
    const study = fullOf("archelab");
    if (!study.notice) throw new Error("ArcheLab has no notice");
    const host = render(<FullStudy study={study} />);
    const notice = [...host.querySelectorAll("p")].find(
      (node) => node.textContent === study.notice,
    );
    const firstPart = host.querySelector("h2");
    if (!notice || !firstPart) throw new Error("notice or parts missing");
    expect(
      notice.compareDocumentPosition(firstPart) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    if (typeof study.screenshot === "string") {
      expect(host.querySelector("img")).toBeNull();
    }
  });
});

describe("StudyContents", () => {
  it.each(fullStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-03 %s: In this study lists the seven parts as plain links in the static HTML, each to its part",
    (_slug, study) => {
      const host = render(<FullStudy study={study} />);
      const nav = host.querySelector("nav[aria-labelledby]");
      const label = host.querySelector(
        `#${nav?.getAttribute("aria-labelledby")}`,
      );
      expect(label?.textContent).toBe(studyPage.contents);
      const links = [...(nav?.querySelectorAll("ol > li > a") ?? [])];
      expect(links.map((link) => link.textContent)).toEqual(
        Object.values(PART_TITLES).map(
          (title, index) => `${index + 1}. ${title}`,
        ),
      );
      for (const link of links) {
        const target = host.querySelector(link.getAttribute("href") ?? "");
        expect(target?.tagName).toBe("SECTION");
        expect(link.hasAttribute("aria-current")).toBe(false);
        expect(classesOf(link)).toContain("min-h-11");
      }
      expect(classesOf(nav)).toEqual(
        expect.arrayContaining(["lg:sticky", "lg:self-start"]),
      );
    },
  );

  describe("in a browser", () => {
    type Entry = { target: Element | undefined; isIntersecting: boolean };
    let container: HTMLDivElement;
    let root: Root;
    let callback: ((entries: Entry[]) => void) | null;
    let observed: Element[];
    let disconnected: boolean;

    class FakeObserver {
      constructor(next: (entries: Entry[]) => void) {
        callback = next;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {
        disconnected = true;
      }
    }

    const study = fullOf("coup-online");

    function linkTo(id: string) {
      return container.querySelector(`nav a[href="#${id}"]`);
    }

    async function report(entries: readonly (readonly [string, boolean])[]) {
      await act(async () => {
        callback?.(
          entries.map(([id, isIntersecting]) => ({
            target: container.querySelector(`#${id}`) ?? undefined,
            isIntersecting,
          })),
        );
      });
    }

    beforeEach(async () => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      vi.stubGlobal("IntersectionObserver", FakeObserver);
      callback = null;
      observed = [];
      disconnected = false;
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      await act(async () => {
        root.render(<FullStudy study={study} />);
      });
    });

    afterEach(async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    });

    it("REQ-CNT-03 watches the seven parts and marks the one being read in glow", async () => {
      expect(observed.map((section) => section.id)).toEqual(
        Object.values(PART_IDS),
      );
      await report([
        [PART_IDS.problem, true],
        [PART_IDS.approach, true],
      ]);
      const current = linkTo(PART_IDS.approach);
      expect(current?.getAttribute("aria-current")).toBe("location");
      expect(classesOf(current)).toContain("text-glow");
      expect(linkTo(PART_IDS.problem)?.hasAttribute("aria-current")).toBe(
        false,
      );
      expect(
        container.querySelectorAll('nav a[aria-current="location"]'),
      ).toHaveLength(1);

      await report([[PART_IDS.approach, false]]);
      expect(linkTo(PART_IDS.problem)?.getAttribute("aria-current")).toBe(
        "location",
      );
      // Between two parts, the last one read stays marked.
      await report([[PART_IDS.problem, false]]);
      expect(linkTo(PART_IDS.problem)?.getAttribute("aria-current")).toBe(
        "location",
      );
    });

    it("REQ-CNT-03 above every part, the summary is marked as next", async () => {
      const summary = container.querySelector(`#${PART_IDS.summary}`);
      if (!summary) throw new Error("no summary");
      summary.getBoundingClientRect = () => ({ top: 500 }) as DOMRect;
      await report([[PART_IDS.problem, false]]);
      expect(linkTo(PART_IDS.summary)?.getAttribute("aria-current")).toBe(
        "location",
      );
    });

    it("REQ-SCR-04 stops watching when the page goes", async () => {
      expect(disconnected).toBe(false);
      await act(async () => {
        root.unmount();
      });
      expect(disconnected).toBe(true);
      root = createRoot(container);
    });
  });
});

describe("ShortStudy", () => {
  it.each(shortStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-04 %s shows what, why, stack and links under their headings, Links only when there is one",
    (_slug, study) => {
      const host = render(<ShortStudy study={study} />);
      expect(host.querySelector("h1")?.textContent).toBe(study.title);
      const { links, ...withoutLinks } = SHORT_PART_TITLES;
      expect(
        [...host.querySelectorAll("h2")].map((heading) => heading.textContent),
      ).toEqual(
        Object.values(
          study.links.length > 0 ? SHORT_PART_TITLES : withoutLinks,
        ),
      );
      expect(host.querySelector("#links") !== null).toBe(
        study.links.length > 0,
      );
      expect(links).toBe(studyPage.shortParts.links);
      expect(host.textContent).toContain(study.what);
      expect(host.textContent).toContain(study.why);
      expect(host.textContent).toContain(study.stack.join(" · "));
      expectHeadingsInOrder(host);
    },
  );

  it.each(shortStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-07 %s: the breadcrumb leads to Work, and the label carries the study's number and tag",
    (_slug, study) => {
      const host = render(<ShortStudy study={study} />);
      expect(
        host
          .querySelector(`nav[aria-label="${studyPage.breadcrumb.name}"] a`)
          ?.getAttribute("href"),
      ).toBe("/work");
      expect(host.querySelector("article p")?.textContent).toBe(
        `${studyPage.label.short} ${studyNumber(study.slug)} · ${study.tag}`,
      );
    },
  );

  it("REQ-CNT-04 SystemSeven, in progress with a private repository and nothing live, shows no links; t7sen-url shows its two", () => {
    const systemseven = render(<ShortStudy study={shortOf("systemseven")} />);
    expect(systemseven.querySelector("article a")).toBeNull();
    const t7senUrl = shortOf("t7sen-url");
    expect(
      [
        ...render(<ShortStudy study={t7senUrl} />).querySelectorAll("#links a"),
      ].map((link) => link.getAttribute("href")),
    ).toEqual(t7senUrl.links.map((link) => link.href));
  });

  it("REQ-CNT-04 SystemSeven is marked in progress, in violet with an open circle, with its status; t7sen-url is not", () => {
    const systemseven = shortOf("systemseven");
    const host = render(<ShortStudy study={systemseven} />);
    const badge = [...host.querySelectorAll("article span")].find(
      (node) => node.textContent === studyPage.inProgress,
    );
    expect(classesOf(badge)).toContain("text-violet");
    expect(badge?.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    if (!systemseven.inProgress) throw new Error("SystemSeven is in progress");
    expect(host.textContent).toContain(systemseven.status);
    expect(
      render(<ShortStudy study={shortOf("t7sen-url")} />).textContent,
    ).not.toContain(studyPage.inProgress);
  });

  it("REQ-CNT-04 the previous and next cards sit after the article, outside the one screen it must fit", () => {
    const more = render(
      <ShortStudy study={shortOf("t7sen-url")} />,
    ).querySelector(`nav[aria-label="${studyPage.more.name}"]`);
    expect(more).not.toBeNull();
    expect(more?.closest("article")).toBeNull();
  });
});

describe("previous and next studies", () => {
  it("REQ-CNT-07 every study page leads to the studies before and after it in the study order", () => {
    for (const [index, study] of studies.entries()) {
      const nav = renderStudy(study).querySelector(
        `nav[aria-label="${studyPage.more.name}"]`,
      );
      const previous = studies[index - 1];
      const next = studies[index + 1];
      expect(
        [...(nav?.querySelectorAll("a") ?? [])].map((card) => [
          card.getAttribute("rel"),
          card.getAttribute("href"),
        ]),
      ).toEqual([
        ...(previous ? [["prev", studyHref(previous.slug)]] : []),
        ...(next ? [["next", studyHref(next.slug)]] : []),
      ]);
    }
  });

  it("REQ-CNT-07 a card says Previous or Next in mono over the title, its arrow pointing out and hidden from screen readers", () => {
    const nav = render(
      <FullStudy study={fullOf("coup-online")} />,
    ).querySelector(`nav[aria-label="${studyPage.more.name}"]`);
    const [previous, next] = [...(nav?.querySelectorAll("a") ?? [])];
    expect(spokenText(previous)).toBe(
      `${studyPage.more.previous} ${fullOf("making-of").title}`,
    );
    expect(spokenText(next)).toBe(
      `${studyPage.more.next} ${fullOf("archelab").title}`,
    );
    for (const [card, arrow] of [
      [previous, "←"],
      [next, "→"],
    ] as const) {
      const mark = [
        ...(card?.querySelectorAll('[aria-hidden="true"]') ?? []),
      ].filter((node) => node.textContent === arrow);
      expect(mark).toHaveLength(1);
      expect(classesOf(mark[0])).toEqual(
        expect.arrayContaining(["text-glow", "rtl:-scale-x-100"]),
      );
    }
    expect(classesOf(next)).toContain("text-end");
  });

  it("REQ-CNT-07 the first study's lone next card keeps to the end column", () => {
    const cards = [
      ...(render(<FullStudy study={fullOf("making-of")} />)
        .querySelector(`nav[aria-label="${studyPage.more.name}"]`)
        ?.querySelectorAll("a") ?? []),
    ];
    expect(cards).toHaveLength(1);
    expect(classesOf(cards[0])).toContain("sm:col-start-2");
  });
});

describe("study page links", () => {
  it("REQ-CNT-05 an address not supplied yet stays visible text, never a link", () => {
    for (const study of studies) {
      const host = renderStudy(study);
      for (const anchor of host.querySelectorAll("a")) {
        expect(isMarker(anchor.getAttribute("href") ?? "")).toBe(false);
      }
      const links =
        study.kind === "full"
          ? [study.links.live, study.links.repo].filter((link) => !!link)
          : study.links;
      for (const link of links) {
        expect(host.textContent).toContain(link.label);
        if (isMarker(link.href)) expect(host.textContent).toContain(link.href);
      }
    }
  });

  it("REQ-CNT-04 links to other sites carry the up-right arrow", () => {
    const study = shortOf("t7sen-url");
    const anchors = [
      ...render(<ShortStudy study={study} />).querySelectorAll(
        'a[href^="https://"]',
      ),
    ];
    expect(anchors.length).toBe(study.links.length);
    for (const anchor of anchors) {
      expect(anchor.textContent?.endsWith("↗")).toBe(true);
    }
  });

  it("REQ-I18N-01 study pages use logical classes only", () => {
    const host = render(
      <>
        {studies.map((study) =>
          study.kind === "full" ? (
            <FullStudy key={study.slug} study={study} />
          ) : (
            <ShortStudy key={study.slug} study={study} />
          ),
        )}
        <FullStudy study={drawnStudy()} />
      </>,
    );
    expect(findPhysicalClasses(allClasses(host))).toEqual([]);
  });
});

const { readFull, readShort } = pages.home.work;

function fullOf(slug: string): FullContent {
  const study = getStudy(slug);
  if (study?.kind !== "full") throw new Error(`${slug} is not a full study`);
  return study;
}

function shortOf(slug: string): ShortContent {
  const study = getStudy(slug);
  if (study?.kind !== "short") throw new Error(`${slug} is not a short study`);
  return study;
}

describe("DotJoined", () => {
  it("REQ-A11Y-05 joins words with a middle dot for the eye only, keeping the spaces", () => {
    const host = render(
      <p>
        <DotJoined parts={["Next.js 16", "React 19", "Tailwind 4"]} />
      </p>,
    );
    expect(host.textContent).toBe("Next.js 16 · React 19 · Tailwind 4");
    const dots = [...host.querySelectorAll("span")];
    expect(dots).toHaveLength(2);
    for (const dot of dots) {
      expect(dot.getAttribute("aria-hidden")).toBe("true");
      expect(dot.textContent).toBe("·");
    }
  });
});

describe("StudyRow", () => {
  it.each(fullStudies.map((study) => [study.slug, study] as const))(
    "REQ-SCR-01 REQ-CNT-07 %s: its frame first, then the number and kind, the title, the line, the stack, the figures and the study link",
    (_slug, study) => {
      const article = render(
        <StudyRow study={study} readLabel={readFull} />,
      ).querySelector("article");
      const [frame, details] = [...(article?.children ?? [])];
      expect(frame?.getAttribute("data-stage")).toBe("frame");
      expect(frame?.getAttribute("aria-hidden")).toBe("true");
      expect(details?.querySelector("p")?.textContent).toBe(
        `${studyNumber(study.slug)} · ${study.listing.kind}`,
      );
      const title = details?.querySelector("h3");
      expect(title?.textContent).toBe(study.title);
      expect(article?.getAttribute("aria-labelledby")).toBe(title?.id);
      expect(details?.textContent).toContain(study.listing.line);
      expect(
        [...(details?.querySelectorAll("ul > li") ?? [])].map(
          (chip) => chip.textContent,
        ),
      ).toEqual([...study.listing.stack]);
      expect(
        [...(details?.querySelectorAll("dl > div") ?? [])].map((metric) => [
          metric.querySelector("dt")?.textContent,
          metric.querySelector("dd")?.textContent,
        ]),
      ).toEqual(study.listing.metrics.map((row) => [row.label, row.value]));
      const read = details?.querySelector(`a[href="${studyHref(study.slug)}"]`);
      expect(linkName(read)).toBe(readFull);
      expect(classesOf(read)).toContain("min-h-11");
    },
  );

  it("REQ-SCR-01 A14 the frame is open, with no picture, in the static HTML, so the field shows inside it", () => {
    const frame = render(
      <StudyRow study={fullOf("making-of")} readLabel={readFull} />,
    ).querySelector('[data-stage="frame"]');
    expect(frame?.querySelector("img")).toBeNull();
    expect(classesOf(frame).filter((name) => name.startsWith("bg-"))).toEqual(
      [],
    );
    expect(frame?.textContent).toBe("");
  });

  it("REQ-CNT-05 a second link not supplied yet stays text after its label, never a link", () => {
    for (const study of fullStudies) {
      const host = render(<StudyRow study={study} readLabel={readFull} />);
      const secondary = study.listing.secondary;
      for (const anchor of host.querySelectorAll("a")) {
        expect(isMarker(anchor.getAttribute("href") ?? "")).toBe(false);
      }
      if (secondary !== undefined && isMarker(secondary.href)) {
        expect(host.textContent).toContain(
          `${secondary.label} ${secondary.href}`,
        );
      }
    }
  });

  it("REQ-CNT-06 a quote that is still a marker shows as the marker, muted, with no quotation marks", () => {
    const quote = `[${"FILL"}: a player quote with permission]` as const;
    const base = fullOf("archelab");
    const study: FullContent = {
      ...base,
      listing: { ...base.listing, quote },
    };
    const host = render(<StudyRow study={study} readLabel={readFull} />);
    const panel = [...host.querySelectorAll("p")].find(
      (node) => node.textContent === quote,
    );
    expect(panel).toBeDefined();
    expect(classesOf(panel)).toContain("text-muted");
    expect(host.querySelector("blockquote, figure")).toBeNull();
    expect(host.textContent).not.toMatch(/[“”]/);
  });

  it("REQ-CNT-06 a recorded quote shows in quotation marks with who said it", () => {
    const base = fullOf("archelab");
    const study: FullContent = {
      ...base,
      listing: {
        ...base.listing,
        quote: {
          text: "Words a player wrote",
          who: "A player",
          permission: { grantedBy: "A player", date: "11 Nov 2026" },
        },
      },
    };
    const host = render(<StudyRow study={study} readLabel={readFull} />);
    expect(host.querySelector("blockquote")?.textContent).toBe(
      "“Words a player wrote”",
    );
    expect(host.querySelector("figcaption")?.textContent).toBe("A player");
  });
});

describe("ShortCard", () => {
  it.each(shortStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-04 %s: a framed card with its title, kind badge, line, stack and study link",
    (_slug, study) => {
      const card = render(
        <ShortCard study={study} readLabel={readShort} />,
      ).querySelector("article");
      const title = card?.querySelector("h3");
      expect(title?.textContent).toBe(study.title);
      expect(card?.getAttribute("aria-labelledby")).toBe(title?.id);
      expect(card?.textContent).toContain(study.listing.kind);
      expect(card?.textContent).toContain(study.listing.line);
      expect(card?.textContent).toContain(study.listing.stack.join(" · "));
      const read = card?.querySelector(`a[href="${studyHref(study.slug)}"]`);
      const [wide, phone] = [...(read?.querySelectorAll("span") ?? [])];
      expect(wide?.textContent).toBe(readShort);
      expect(classesOf(wide)).toContain("max-sm:hidden");
      expect(phone?.textContent).toBe(study.listing.studyLabel);
      expect(classesOf(phone)).toContain("sm:hidden");
      expect(card?.querySelector('[data-stage="frame"]')).toBeNull();
    },
  );

  it("REQ-CNT-04 SystemSeven's badge and phone label say In progress in violet with an open circle; t7sen-url's are plain", () => {
    const inProgress = render(
      <ShortCard study={shortOf("systemseven")} readLabel={readShort} />,
    );
    const badge = [...inProgress.querySelectorAll("span")].find(
      (node) =>
        node.textContent === "In progress" && node.querySelector("span"),
    );
    expect(classesOf(badge)).toContain("text-violet");
    const plain = render(
      <ShortCard study={shortOf("t7sen-url")} readLabel={readShort} />,
    );
    expect(plain.textContent).not.toContain("In progress");
    expect(
      [...plain.querySelectorAll(".text-violet")].map(
        (node) => node.textContent,
      ),
    ).toEqual([]);
  });

  it("REQ-CNT-04 t7sen-url shows Repo beside its study link, an address on record, hidden on the phone's compact row", () => {
    const study = shortOf("t7sen-url");
    const repo = study.listing.secondary;
    if (repo === undefined) throw new Error("t7sen-url has no repo link");
    const link = render(
      <ShortCard study={study} readLabel={readShort} />,
    ).querySelector(`a[href="${repo.href}"]`);
    expect(linkName(link)).toBe(repo.label);
    expect(link?.textContent?.endsWith("↗")).toBe(true);
    expect(classesOf(link)).toEqual(
      expect.arrayContaining(["max-sm:hidden", "min-h-11"]),
    );
  });

  it("REQ-A11Y-01 the study link's name carries the title and the words shown at each width (WCAG 2.5.3)", () => {
    for (const study of shortStudies) {
      const read = render(
        <ShortCard study={study} readLabel={readShort} />,
      ).querySelector(`a[href="${studyHref(study.slug)}"]`);
      const name = read?.getAttribute("aria-label") ?? "";
      expect(name.startsWith(`${readShort}, ${study.title}`)).toBe(true);
      expect(name.toLowerCase()).toContain(readShort.toLowerCase());
      expect(name.toLowerCase()).toContain(
        study.listing.studyLabel.toLowerCase(),
      );
    }
    expect(
      render(<ShortCard study={shortOf("systemseven")} readLabel={readShort} />)
        .querySelector('a[href^="/work/"]')
        ?.getAttribute("aria-label"),
    ).toBe(`${readShort}, SystemSeven, in progress`);
    expect(
      render(<ShortCard study={shortOf("t7sen-url")} readLabel={readShort} />)
        .querySelector('a[href^="/work/"]')
        ?.getAttribute("aria-label"),
    ).toBe(`${readShort}, t7sen-url`);
  });

  it("REQ-NAV-01 on a phone the whole row is the study link, at least 44 px tall", () => {
    const host = render(
      <ShortCard study={shortOf("t7sen-url")} readLabel={readShort} />,
    );
    const card = host.querySelector("article");
    const read = card?.querySelector('a[href^="/work/"]');
    expect(classesOf(card)).toEqual(
      expect.arrayContaining(["relative", "max-sm:min-h-14"]),
    );
    expect(classesOf(read)).toEqual(
      expect.arrayContaining([
        "min-h-11",
        "max-sm:after:absolute",
        "max-sm:after:inset-0",
      ]),
    );
  });
});

describe("study rows and cards", () => {
  it("REQ-I18N-01 use logical classes only", () => {
    const host = render(
      <>
        {fullStudies.map((study) => (
          <StudyRow key={study.slug} study={study} readLabel={readFull} />
        ))}
        {shortStudies.map((study) => (
          <ShortCard key={study.slug} study={study} readLabel={readShort} />
        ))}
      </>,
    );
    expect(findPhysicalClasses(allClasses(host))).toEqual([]);
  });
});

describe("FrameStill", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function report(event: EngineEvent) {
    await act(async () => {
      tierStore.apply(event);
    });
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<FrameStill slug="coup-online" />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    tierStore.reset();
    vi.unstubAllGlobals();
  });

  it("REQ-A11Y-03 every full study has a tier 3 still, named after its slug", () => {
    expect(Object.keys(STUDY_STILLS).sort()).toEqual(
      fullStudies.map((study) => study.slug).sort(),
    );
    for (const [slug, src] of Object.entries(STUDY_STILLS)) {
      expect(src).toBe(`/still/work-${slug}.webp`);
    }
  });

  it("REQ-A11Y-03 A14 nothing before a tier is chosen, and nothing on tiers 1 and 2", async () => {
    expect(container.querySelector("img")).toBeNull();
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({ type: "ready", tier: 1, particles: 1_000_000 });
    expect(container.querySelector("img")).toBeNull();
    await report({ type: "tierChosen", tier: 2, reason: "device-lost" });
    expect(container.querySelector("img")).toBeNull();
  });

  it("REQ-A11Y-03 REQ-A11Y-05 tier 3 shows the study's still as decoration, and a failed load removes it", async () => {
    await report({ type: "tierChosen", tier: 3, reason: "save-data" });
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(STUDY_STILLS["coup-online"]);
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(classesOf(image)).toContain("opacity-0");

    await act(async () => {
      image?.dispatchEvent(new Event("load"));
    });
    expect(classesOf(container.querySelector("img"))).toContain("opacity-100");

    await act(async () => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("img")).toBeNull();
  });
});
