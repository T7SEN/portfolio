import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getStudy, studies, studyHref } from "@/content";
import { isMarker } from "@/content/markers";
import type {
  FullStudy as FullContent,
  ShortStudy as ShortContent,
} from "@/content/types";

import { FullStudy } from "./full-study";
import { ShortStudy } from "./short-study";
import { StudyList } from "./study-list";

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
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

describe("StudyList", () => {
  it.each(["h2", "h3"] as const)(
    "REQ-CNT-07 lists the five studies in order under %s titles",
    (level) => {
      const host = render(<StudyList headingLevel={level} />);
      const titles = [...host.querySelectorAll(`ol > li ${level} a`)];
      expect(titles.map((link) => link.getAttribute("href"))).toEqual(
        studies.map((study) => studyHref(study.slug)),
      );
    },
  );

  it("REQ-CNT-04 only SystemSeven carries the In progress label in the list", () => {
    const items = [
      ...render(<StudyList headingLevel="h2" />).querySelectorAll("ol > li"),
    ];
    const marked = items
      .filter((item) => item.textContent?.includes("In progress"))
      .map((item) => item.querySelector("h2")?.textContent?.replace("→", ""));
    expect(marked).toEqual(["SystemSeven"]);
  });
});
