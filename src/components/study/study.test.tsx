import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStudy, studies, studyHref, studyNumber } from "@/content";
import { isMarker } from "@/content/markers";
import { pages } from "@/content/pages";
import type {
  FullStudy as FullContent,
  ShortStudy as ShortContent,
} from "@/content/types";
import type { EngineEvent } from "@/engine/types";
import { tierStore } from "@/lib/tier-store";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { DotJoined } from "./dot-joined";
import { FrameStill } from "./frame-still";
import { FullStudy } from "./full-study";
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

describe("FullStudy", () => {
  it.each(fullStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-03 %s shows the seven parts in order under their headings",
    (_slug, study) => {
      const host = render(<FullStudy study={study} />);
      expect(host.querySelector("h1")?.textContent).toBe(study.title);
      expect(
        [...host.querySelectorAll("h2")].map((heading) => heading.textContent),
      ).toEqual([
        "Summary",
        "The problem",
        "Approach and architecture",
        "The hard part",
        "Results",
        "What I would change",
        "Links",
      ]);
    },
  );

  it("REQ-CNT-03 results show each label, value and source", () => {
    const study = fullStudies[0];
    if (!study) throw new Error("no full study");
    const text = render(<FullStudy study={study} />).textContent ?? "";
    for (const row of study.results) {
      expect(text).toContain(row.label);
      expect(text).toContain(row.value);
      expect(text).toContain(`Source: ${row.source}`);
    }
  });

  it("REQ-CNT-12 ArcheLab says it is unofficial fan work before the first part", () => {
    const study = getStudy("archelab");
    if (study?.kind !== "full" || !study.notice) {
      throw new Error("ArcheLab has no notice");
    }
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
  });
});

describe("ShortStudy", () => {
  it.each(shortStudies.map((study) => [study.slug, study] as const))(
    "REQ-CNT-04 %s shows what, why, stack and links",
    (_slug, study) => {
      const host = render(<ShortStudy study={study} />);
      expect(host.querySelector("h1")?.textContent).toBe(study.title);
      expect(
        [...host.querySelectorAll("h2")].map((heading) => heading.textContent),
      ).toEqual(["What it is", "Why it exists", "Stack", "Links"]);
      for (const item of study.stack) {
        expect(host.textContent).toContain(item);
      }
    },
  );

  it("REQ-CNT-04 SystemSeven is marked in progress with its status; t7sen-url is not", () => {
    const systemseven = getStudy("systemseven");
    const t7senUrl = getStudy("t7sen-url");
    if (systemseven?.kind !== "short" || t7senUrl?.kind !== "short") {
      throw new Error("short studies missing");
    }
    const inProgress = render(<ShortStudy study={systemseven} />).textContent;
    expect(inProgress).toContain("In progress");
    if (systemseven.inProgress) {
      expect(inProgress).toContain(systemseven.status);
    }
    expect(render(<ShortStudy study={t7senUrl} />).textContent).not.toContain(
      "In progress",
    );
  });
});

describe("links", () => {
  it("REQ-CNT-05 an address not supplied yet stays visible text, never a link", () => {
    for (const study of studies) {
      const element =
        study.kind === "full" ? (
          <FullStudy study={study} />
        ) : (
          <ShortStudy study={study} />
        );
      const host = render(element);
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
    const study = getStudy("t7sen-url");
    if (study?.kind !== "short") throw new Error("t7sen-url missing");
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
    const study = fullOf("archelab");
    const quote = study.listing.quote;
    if (typeof quote !== "string") throw new Error("ArcheLab has a quote");
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
