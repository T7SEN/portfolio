import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { headlines } from "@/content/hero";
import { studies, studyHref } from "@/content";
import { services } from "@/content/services";
import { chapterOrder, story } from "@/content/story";
import type { EngineEvent } from "@/engine/types";
import { tierStore } from "@/lib/tier-store";

import { AboutSection } from "./about-section";
import { BloomLine } from "./bloom-line";
import { BloomSection } from "./bloom-section";
import { ContactSection } from "./contact-section";
import { Hero } from "./hero";
import { HeroHeadline } from "./hero-headline";
import { MakingOfSection } from "./making-of-section";
import { ServicesSection } from "./services-section";
import { WorkSection } from "./work-section";

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

describe("Hero", () => {
  it("REQ-CNT-10 the h1 holds only the tier 3 line", () => {
    const h1s = render(<Hero />).querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe("Real-time worlds, built for your GPU.");
  });

  it("REQ-PERF-03 the other line reserves its space in the h1's cell through a hidden ::before", () => {
    const host = render(<Hero />);
    const h1 = host.querySelector("h1");
    const cell = h1?.parentElement;
    expect(cell?.getAttribute("data-reserve")).toBe(headlines.gpu);
    for (const name of [
      "before:content-[attr(data-reserve)]",
      "before:invisible",
      "before:col-start-1",
      "before:row-start-1",
    ]) {
      expect(cell?.className.split(" ")).toContain(name);
    }
    for (const name of ["col-start-1", "row-start-1"]) {
      expect(h1?.className.split(" ")).toContain(name);
    }
  });

  it("REQ-PERF-03 A14 the static HTML text never states the tier 1 and 2 line", () => {
    const host = render(<Hero />);
    expect(host.textContent).not.toContain(headlines.gpu);
  });

  it("REQ-PERF-03 the reserved line and the h1 share the same type", () => {
    const host = render(<HeroHeadline id="x" text={headlines.still} />);
    const h1 = host.querySelector("h1");
    const cell = h1?.parentElement;
    const h1Type = (h1?.className ?? "")
      .split(" ")
      .filter((name) => !name.endsWith("-start-1"))
      .sort();
    const reservedType = (cell?.className ?? "")
      .split(" ")
      .filter(
        (name) =>
          name.startsWith("before:font-") || name.startsWith("before:text-"),
      )
      .map((name) => name.replace("before:", ""))
      .sort();
    expect(reservedType).toEqual(h1Type);
  });

  it("REQ-PERF-03 the tier 1 and 2 headline reserves the tier 3 line in turn", () => {
    const cell = render(
      <HeroHeadline id="x" text={headlines.gpu} />,
    ).querySelector("h1")?.parentElement;
    expect(cell?.getAttribute("data-reserve")).toBe(headlines.still);
  });

  it("REQ-NAV-01 See the work, Send a message and Skip intro link to /work, /contact and #work", () => {
    const links = [...render(<Hero />).querySelectorAll("a")].map((link) => [
      link.textContent?.replace("→", ""),
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["See the work", "/work"],
      ["Send a message", "/contact"],
      ["Skip intro", "#work"],
    ]);
  });

  it("REQ-NAV-01 hero actions are at least 44 px tall", () => {
    for (const link of render(<Hero />).querySelectorAll("a")) {
      expect(link.className).toContain("min-h-11");
    }
  });

  it("REQ-NAV-01 the hero fills the screen below the bar's one row, and below its two rows under 22rem, where the bar wraps", () => {
    const box = render(<Hero />).querySelector("section > div");
    const heights = (box?.className.split(" ") ?? []).filter((name) =>
      name.includes("min-h-"),
    );
    expect(heights.sort()).toEqual([
      "max-[22rem]:min-h-[calc(100svh_-_7rem)]",
      "min-h-[calc(100svh_-_4.25rem)]",
    ]);
  });
});

describe("HeroHeadline with the tier store", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function report(event: EngineEvent) {
    await act(async () => {
      tierStore.apply(event);
    });
  }

  function cell() {
    const h1 = container.querySelector("h1");
    return { h1, text: h1?.textContent, reserve: h1?.parentElement?.dataset };
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<HeroHeadline id="x" text={headlines.still} />);
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

  it("REQ-CNT-10 A14 before the engine reports, the h1 holds the tier 3 line", () => {
    expect(cell().text).toBe(headlines.still);
    expect(cell().reserve?.reserve).toBe(headlines.gpu);
  });

  it.each([
    [1, "probe-pass"],
    [2, "no-webgpu"],
  ] as const)(
    "REQ-CNT-10 A14 tier %i switches the h1 to the tiers 1 and 2 line once it has drawn, and reserves the tier 3 line",
    async (tier, reason) => {
      const before = cell().h1;
      await report({ type: "tierChosen", tier, reason });
      expect(cell().text).toBe(headlines.still);

      await report({ type: "ready", tier });
      expect(cell().text).toBe(headlines.gpu);
      expect(cell().reserve?.reserve).toBe(headlines.still);
      expect(cell().h1).toBe(before);
    },
  );

  it("REQ-CNT-10 A14 tier 3 keeps the tier 3 line", async () => {
    await report({ type: "tierChosen", tier: 3, reason: "save-data" });
    await report({ type: "ready", tier: 3 });
    expect(cell().text).toBe(headlines.still);
    expect(cell().reserve?.reserve).toBe(headlines.gpu);
  });

  it("REQ-CNT-10 A14 the tier 3 line returns when the tier drops to 3", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({ type: "ready", tier: 1 });
    expect(cell().text).toBe(headlines.gpu);

    await report({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(cell().text).toBe(headlines.still);
    expect(cell().reserve?.reserve).toBe(headlines.gpu);
  });

  it("REQ-CNT-10 A14 the tier 3 line shows while a lost tier 1 is rebuilt as tier 2", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({ type: "ready", tier: 1 });

    await report({ type: "tierChosen", tier: 2, reason: "device-lost" });
    expect(cell().text).toBe(headlines.still);

    await report({ type: "ready", tier: 2 });
    expect(cell().text).toBe(headlines.gpu);
  });

  it("REQ-CNT-10 frame rate reports leave the headline alone", async () => {
    await report({ type: "tierChosen", tier: 2, reason: "phone" });
    await report({ type: "ready", tier: 2 });
    await report({ type: "frameRate", fps: 30 });
    expect(cell().text).toBe(headlines.gpu);
  });

  it("REQ-CNT-01 A14 a server render keeps the tier 3 line whatever the store holds", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({ type: "ready", tier: 1 });
    const host = render(<Hero />);
    expect(host.querySelector("h1")?.textContent).toBe(headlines.still);
    expect(host.textContent).not.toContain(headlines.gpu);
  });
});

describe("ServicesSection", () => {
  it("REQ-CNT-11 shows the two headline offers and the one also line", () => {
    const host = render(<ServicesSection />);
    expect(
      [...host.querySelectorAll("li")].map((item) => item.textContent),
    ).toEqual([...services.offers]);
    expect(host.textContent).toContain(services.also);
  });
});

describe("WorkSection", () => {
  it("REQ-CNT-07 lists every study in order, each linking to its page", () => {
    const host = render(<WorkSection />);
    expect(host.querySelector("section")?.id).toBe("work");
    const links = [...host.querySelectorAll("h3 a")].map((link) =>
      link.getAttribute("href"),
    );
    expect(links).toEqual(studies.map((study) => studyHref(study.slug)));
  });

  it("REQ-SCR-01 each study card is a step of the work chapter, in study order", () => {
    const section = render(<WorkSection />).querySelector("section");
    expect(section?.dataset.chapter).toBe("work");
    const steps = [...(section?.querySelectorAll("li[data-work-step]") ?? [])];
    expect(steps.map((step) => step.getAttribute("data-work-step"))).toEqual(
      studies.map((_study, index) => String(index)),
    );
  });
});

describe("scene chapters", () => {
  it.each([
    [
      "bloom",
      BloomSection,
      story.bloom.label,
      story.bloom.lines.still,
      "Bloom",
    ],
    [
      "making-of",
      MakingOfSection,
      story.makingOf.label,
      story.makingOf.line,
      "Making-of",
    ],
  ] as const)(
    "REQ-SCR-01 REQ-SCR-07 %s shows its mono label as the h2, read as the name alone, and its one line",
    (chapter, Section, label, line, name) => {
      const section = render(<Section />).querySelector("section");
      expect(section?.dataset.chapter).toBe(chapter);
      const heading = section?.querySelector("h2");
      expect(heading?.textContent).toBe(`${label.number} · ${label.name}`);
      expect(section?.getAttribute("aria-labelledby")).toBe(heading?.id);
      const hidden = heading?.querySelector('[aria-hidden="true"]');
      expect(hidden?.textContent).toBe(`${label.number} · `);
      const spoken = [...(heading?.childNodes ?? [])]
        .filter((node) => node !== hidden)
        .map((node) => node.textContent)
        .join("");
      expect(spoken).toBe(name);
      expect(heading?.className).toContain("font-mono");
      expect(heading?.hasAttribute("data-story-title")).toBe(false);
      expect(section?.textContent).toContain(line);
    },
  );

  it("REQ-SCR-01 the making-of chapter links to its study", () => {
    const links = [...render(<MakingOfSection />).querySelectorAll("a")].map(
      (link) => [link.textContent?.replace("→", ""), link.getAttribute("href")],
    );
    expect(links).toEqual([["Read the making-of", "/work/making-of"]]);
  });

  it("REQ-SCR-01 REQ-SCR-07 the bloom chapter gives the field about one and three quarter screens, the making-of almost two, with the words at the bottom", () => {
    const bloom = render(<BloomSection />).querySelector("section > div");
    const makingOf = render(<MakingOfSection />).querySelector("section > div");
    expect(bloom?.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-[175svh]", "flex-col", "justify-end"]),
    );
    expect(makingOf?.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-[185svh]", "flex-col", "justify-end"]),
    );
  });
});

describe("BloomSection line", () => {
  const { gpu, still } = story.bloom.lines;

  function bloomLine() {
    const section = render(<BloomSection />).querySelector("section");
    const cell = section?.querySelector("[data-reserve]");
    return { section, cell, line: cell?.querySelector("p") };
  }

  it("REQ-SCR-01 REQ-CNT-01 A14 the static HTML carries the tier 3 line and never states the approved line", () => {
    const { section, cell, line } = bloomLine();
    expect(cell?.children).toHaveLength(1);
    expect(line?.textContent).toBe(still);
    expect(section?.textContent).not.toContain(gpu);
  });

  it("REQ-SCR-01 REQ-CNT-01 REQ-PERF-03 the approved line reserves its space in the line's cell through a hidden ::before", () => {
    const { cell, line } = bloomLine();
    expect(cell?.getAttribute("data-reserve")).toBe(gpu);
    for (const name of [
      "grid",
      "grid-cols-1",
      "before:content-[attr(data-reserve)]",
      "before:invisible",
      "before:col-start-1",
      "before:row-start-1",
    ]) {
      expect(cell?.className.split(" ")).toContain(name);
    }
    expect(line?.className.split(" ").sort()).toEqual([
      "col-start-1",
      "row-start-1",
    ]);
  });

  it("REQ-SCR-01 REQ-CNT-01 REQ-PERF-03 the line and the reserved line inherit one type and one measure from the cell", () => {
    const { cell, line } = bloomLine();
    const cellClasses = cell?.className.split(" ") ?? [];
    expect(cellClasses).toEqual(
      expect.arrayContaining(["text-lead", "max-w-measure"]),
    );
    expect(
      cellClasses.filter((name) => /^before:(?:text|font|max-w)-/.test(name)),
    ).toEqual([]);
    expect(
      (line?.className.split(" ") ?? []).filter((name) =>
        /^(?:text|font|max-w)-/.test(name),
      ),
    ).toEqual([]);
  });
});

describe("BloomLine with the tier store", () => {
  const { gpu, still } = story.bloom.lines;
  let container: HTMLDivElement;
  let root: Root;

  async function report(event: EngineEvent) {
    await act(async () => {
      tierStore.apply(event);
    });
  }

  function cell() {
    const line = container.querySelector("p");
    return {
      line,
      text: line?.textContent,
      reserve: line?.parentElement?.getAttribute("data-reserve"),
    };
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<BloomLine lines={story.bloom.lines} />);
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

  it("REQ-SCR-01 REQ-CNT-01 A14 before the engine reports, the line is the tier 3 line", () => {
    expect(cell().text).toBe(still);
    expect(cell().reserve).toBe(gpu);
  });

  it.each([
    [1, "probe-pass"],
    [2, "no-webgpu"],
  ] as const)(
    "REQ-SCR-01 REQ-CNT-01 A14 with a tier %i field on screen the approved line shows, reserving the tier 3 line",
    async (tier, reason) => {
      const before = cell().line;
      await report({ type: "tierChosen", tier, reason });
      expect(cell().text).toBe(still);

      await report({ type: "ready", tier });
      expect(cell().text).toBe(gpu);
      expect(cell().reserve).toBe(still);
      expect(cell().line).toBe(before);
    },
  );

  it("REQ-SCR-01 REQ-CNT-01 A14 tier 3 keeps the tier 3 line", async () => {
    await report({ type: "tierChosen", tier: 3, reason: "save-data" });
    await report({ type: "ready", tier: 3 });
    expect(cell().text).toBe(still);
    expect(cell().reserve).toBe(gpu);
  });

  it("REQ-SCR-01 REQ-CNT-01 A14 the tier 3 line returns when the tier drops to 3", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({ type: "ready", tier: 1 });
    expect(cell().text).toBe(gpu);

    await report({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(cell().text).toBe(still);
    expect(cell().reserve).toBe(gpu);
  });

  it("REQ-SCR-01 REQ-CNT-01 A14 a server render keeps the tier 3 line whatever the store holds", async () => {
    await report({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
    await report({ type: "ready", tier: 2 });
    const section = render(<BloomSection />).querySelector("section");
    expect(section?.querySelector("[data-reserve] > p")?.textContent).toBe(
      still,
    );
    expect(section?.textContent).not.toContain(gpu);
  });
});

describe("chapter sections", () => {
  it.each([
    ["work", WorkSection],
    ["about", AboutSection],
    ["contact", ContactSection],
  ] as const)(
    "REQ-SCR-05 the %s chapter's h2 is the title the story reveals",
    (chapter, Section) => {
      const section = render(<Section />).querySelector("section");
      expect(section?.dataset.chapter).toBe(chapter);
      expect(
        section?.querySelector("h2")?.hasAttribute("data-story-title"),
      ).toBe(true);
    },
  );

  it("REQ-SCR-01 the services block is a plain section, not a chapter", () => {
    const section = render(<ServicesSection />).querySelector("section");
    expect(section?.hasAttribute("data-chapter")).toBe(false);
    expect(section?.querySelector("[data-scene]")).toBeNull();
    expect(section?.querySelector("[data-story-title]")).toBeNull();
  });

  it("REQ-SCR-01 the last chapter has room for its top to reach the viewport's middle, with its words at the bottom", () => {
    const inner = render(<ContactSection />).querySelector("section > div");
    expect(inner?.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-[120svh]", "flex-col", "justify-end"]),
    );
  });

  it("REQ-SCR-01 the about chapter has room for the wave", () => {
    const inner = render(<AboutSection />).querySelector("section > div");
    expect(inner?.className.split(" ")).toContain("min-h-[140svh]");
  });
});

describe("HomePage", () => {
  const page = () => render(<HomePage />);

  it("REQ-SCR-01 renders the six chapters in order, with services between the hero and the bloom", () => {
    const host = page();
    const sections = [...host.querySelectorAll("section")];
    expect(
      sections.map((section) => section.dataset.chapter ?? "services"),
    ).toEqual(["hero", "services", ...chapterOrder.slice(1)]);
    expect(
      [...host.querySelectorAll("[data-chapter]")].map(
        (section) => (section as HTMLElement).dataset.chapter,
      ),
    ).toEqual([...chapterOrder]);
  });

  it("REQ-A11Y-05 each chapter holds one visually hidden scene line, true on every tier", () => {
    const host = page();
    for (const section of host.querySelectorAll<HTMLElement>(
      "[data-chapter]",
    )) {
      const chapter = section.dataset.chapter as (typeof chapterOrder)[number];
      const scenes = section.querySelectorAll("[data-scene]");
      expect(scenes).toHaveLength(1);
      expect(scenes[0]?.tagName).toBe("P");
      expect(scenes[0]?.className).toBe("sr-only");
      expect(scenes[0]?.textContent).toBe(story.scenes[chapter]);
    }
    expect(host.querySelectorAll("[data-scene]")).toHaveLength(6);
  });

  it("REQ-NAV-01 See the work and Skip intro stay in the hero", () => {
    const hero = page().querySelector('section[data-chapter="hero"]');
    const names = [...(hero?.querySelectorAll("a") ?? [])].map((link) =>
      link.textContent?.replace("→", ""),
    );
    expect(names).toContain("See the work");
    expect(names).toContain("Skip intro");
    const skip = [...(hero?.querySelectorAll("a") ?? [])].find((link) =>
      link.textContent?.startsWith("Skip intro"),
    );
    expect(skip?.getAttribute("href")).toBe("#work");
  });

  it("REQ-CNT-01 every chapter's text is in the static HTML, with nothing hidden by style", () => {
    const host = page();
    expect(host.querySelectorAll("[style]")).toHaveLength(0);
    expect(host.textContent).toContain(story.bloom.lines.still);
    expect(host.textContent).not.toContain(story.bloom.lines.gpu);
    expect(host.textContent).toContain(story.makingOf.line);
    expect(host.querySelector("h1")?.textContent).toBe(headlines.still);
  });
});
