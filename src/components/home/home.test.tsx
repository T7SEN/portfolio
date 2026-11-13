import { readFileSync } from "node:fs";

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { fullStudies, shortStudies, studyHref } from "@/content";
import { about } from "@/content/about";
import {
  headlineParts,
  headlines,
  heroCopy,
  STATIC_TIER,
  tierLabel,
} from "@/content/hero";
import { isMarker } from "@/content/markers";
import { pages } from "@/content/pages";
import { passViewer } from "@/content/passes";
import { services } from "@/content/services";
import { site } from "@/content/site";
import { chapterOrder, story } from "@/content/story";
import { BLOOM_ROOMS } from "@/engine/runtime/story";
import type { EngineEvent } from "@/engine/types";
import {
  DENSE_ALPHA,
  DENSE_SOFT,
  PLATE_ALPHA,
  PLATE_SOFT,
  VEIL_DENSE,
  VEIL_OPEN,
  VEIL_TEXT,
} from "@/components/story/story-veil";
import { calmStore } from "@/lib/calm-store";
import { tierStore } from "@/lib/tier-store";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { AboutSection } from "./about-section";
import { BloomSection } from "./bloom-section";
import { ContactSection } from "./contact-section";
import { FieldNote } from "./field-note";
import { FieldStill } from "./field-still";
import { FIELD_STILLS } from "./field-stills";
import { Hero } from "./hero";
import { HeroHeadline } from "./hero-headline";
import { MakingOfSection } from "./making-of-section";
import { PointerRing } from "./pointer-ring";
import { TierReadout } from "./tier-readout";
import { FINE_POINTER_QUERY } from "./use-fine-pointer";
import { WorkSection } from "./work-section";

const copy = heroCopy(STATIC_TIER);

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

function classesOf(element: Element | null | undefined) {
  return (element?.getAttribute("class") ?? "").split(/\s+/);
}

/** A height set on an element itself: a minimum or a fixed one, at any width. */
function heightClasses(element: Element | null | undefined) {
  return classesOf(element).filter((name) => /(?:^|:)(?:min-h|h)-/.test(name));
}

function allClasses(host: Element) {
  return [host, ...host.querySelectorAll("[class]")]
    .map((node) => node.getAttribute("class") ?? "")
    .join(" ");
}

/** The words a link says, its aria-hidden arrows left out. */
function linkName(link: Element) {
  return [...link.childNodes]
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

/** The text a screen reader reaches: aria-hidden parts left out. */
function spokenText(element: Element | null | undefined): string {
  if (!element) return "";
  return [...element.childNodes]
    .map((node) => {
      if (node instanceof Element) {
        return node.getAttribute("aria-hidden") === "true"
          ? ""
          : spokenText(node);
      }
      return node.textContent ?? "";
    })
    .join("");
}

const ready = (tier: 1 | 2 | 3, particles = tier === 3 ? 0 : 100_000) =>
  ({ type: "ready", tier, particles }) as const satisfies EngineEvent;

// A client component mounted in jsdom, with the stores it reads.
let container: HTMLDivElement;
let root: Root;

async function mount(element: ReactElement) {
  await act(async () => {
    root.render(element);
  });
}

async function report(event: EngineEvent) {
  await act(async () => {
    tierStore.apply(event);
  });
}

async function setCalm(on: boolean) {
  await act(async () => {
    calmStore.setChosen(on);
  });
}

/** Stands in for matchMedia: true answers the fine pointer query. */
function stubPointer(isFine: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: media === FINE_POINTER_QUERY ? isFine : false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function useLiveRoot() {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    tierStore.reset();
    calmStore.setChosen(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}

describe("Hero", () => {
  it("REQ-A11Y-06 the violet eyebrow is as wide as its words and brings a dense plate, which the dot glides past", () => {
    const eyebrow = render(<Hero />).querySelector("p.text-violet");
    expect(eyebrow?.textContent).toBe(heroCopy(STATIC_TIER).eyebrow);
    expect(classesOf(eyebrow)).toEqual(
      expect.arrayContaining(["justify-self-start", "relative", "isolate"]),
    );
    const plate = eyebrow?.firstElementChild;
    expect(plate?.getAttribute("data-part")).toBe("dense-plate");
    expect(plate?.getAttribute("aria-hidden")).toBe("true");
    expect(plate?.textContent).toBe("");
    expect(classesOf(plate)).toEqual(
      expect.arrayContaining(["absolute", "-inset-1", "-z-10"]),
    );
  });

  it("REQ-A11Y-06 the dense plate makes VEIL_DENSE over the page's plate, with its soft edge", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule =
      /\[data-part="dense-plate"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain(
      `calc(100% * (1 - (1 - ${VEIL_DENSE}) / (1 - ${VEIL_TEXT})))`,
    );
    expect(rule).toContain("var(--color-void)");
    expect(rule).toContain(`border-radius: ${DENSE_SOFT / 2}px`);
    expect(rule).toContain(
      `box-shadow: 0 0 ${DENSE_SOFT}px ${DENSE_SOFT / 2}px var(--plate)`,
    );
    expect(DENSE_ALPHA).toBeCloseTo(1 - (1 - VEIL_DENSE) / (1 - VEIL_TEXT), 12);
    // Two void layers let through the product of what each lets through.
    expect(1 - (1 - VEIL_TEXT) * (1 - DENSE_ALPHA)).toBeCloseTo(VEIL_DENSE, 12);
    expect(VEIL_DENSE).toBeGreaterThan(VEIL_TEXT);
  });

  it("REQ-CNT-10 the h1 holds the tier 3 headline in two lines, the second muted", () => {
    const h1s = render(<Hero />).querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    const h1 = h1s[0];
    expect(h1?.textContent).toBe(headlines.still);
    const second = h1?.querySelector("span");
    expect(second?.textContent).toBe(headlineParts.second.still);
    expect(classesOf(second)).toEqual(
      expect.arrayContaining(["block", "text-muted"]),
    );
    expect(h1?.firstChild?.textContent?.trim()).toBe(headlineParts.first);
  });

  it("REQ-PERF-03 the other headline reserves its two lines in the h1's cell through a hidden ::before", () => {
    const h1 = render(<Hero />).querySelector("h1");
    const cell = h1?.parentElement;
    expect(cell?.getAttribute("data-reserve")).toBe(
      `${headlineParts.first}\n${headlineParts.second.gpu}`,
    );
    expect(classesOf(cell)).toEqual(
      expect.arrayContaining([
        "grid",
        "before:content-[attr(data-reserve)]",
        "before:invisible",
        "before:col-start-1",
        "before:row-start-1",
        "before:whitespace-pre-line",
      ]),
    );
    expect(classesOf(h1)).toEqual(
      expect.arrayContaining(["col-start-1", "row-start-1"]),
    );
  });

  it("REQ-PERF-03 A14 the static HTML text never states the tier 1 and 2 line", () => {
    const text = render(<Hero />).textContent ?? "";
    expect(text).not.toContain(headlineParts.second.gpu);
    expect(text).not.toContain(headlines.gpu);
  });

  it("REQ-PERF-03 the reserved lines and the h1 share the same type", () => {
    const h1 = render(<HeroHeadline id="x" />).querySelector("h1");
    const h1Type = classesOf(h1)
      .filter((name) => !name.endsWith("-start-1"))
      .sort();
    const reservedType = classesOf(h1?.parentElement)
      .filter(
        (name) =>
          name.startsWith("before:font-") || name.startsWith("before:text-"),
      )
      .map((name) => name.replace("before:", ""))
      .sort();
    expect(reservedType).toEqual(h1Type);
  });

  it("REQ-NAV-01 the links in keyboard order: See the work, Send a message, Skip intro", () => {
    const links = [...render(<Hero />).querySelectorAll("a")].map((link) => [
      linkName(link),
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      [copy.primaryAction, "/work"],
      [copy.secondaryAction, "/contact"],
      [copy.cornerControl, "#work"],
    ]);
  });

  it("REQ-NAV-01 every hero target is at least 44 px tall", () => {
    const host = render(<Hero />);
    for (const target of host.querySelectorAll("a, button")) {
      const heights = classesOf(target).filter((name) =>
        /^(?:max-sm:)?min-h-1[13]$/.test(name),
      );
      expect(heights.length, linkName(target)).toBeGreaterThan(0);
      expect(classesOf(target)).not.toContain("max-sm:min-h-0");
    }
  });

  it("REQ-NAV-01 the hero fills the screen below the bar at each of the bar's heights", () => {
    const box = render(<Hero />).querySelector("section > div");
    const heights = classesOf(box).filter((name) => /min-h-\[calc/.test(name));
    expect(heights.sort()).toEqual([
      "lg:min-h-[calc(100svh_-_6.25rem)]",
      "min-h-[calc(100svh_-_7.5rem)]",
      "sm:min-h-[calc(100svh_-_4.25rem)]",
    ]);
  });

  it("REQ-NAV-01 on phones Send a message and Skip intro share a row, the arrow after the words; from 640 px Skip intro is a pill with the arrow before them", () => {
    const host = render(<Hero />);
    const [primary, send, skip] = [...host.querySelectorAll("a")];
    expect(classesOf(primary)).toContain("max-sm:col-span-2");
    expect(classesOf(send)).toContain("justify-self-start");
    expect(classesOf(skip)).toEqual(
      expect.arrayContaining(["justify-self-end", "sm:justify-self-start"]),
    );
    const arrows = [...(skip?.querySelectorAll("svg") ?? [])];
    expect(arrows).toHaveLength(2);
    expect(skip?.firstElementChild).toBe(arrows[0]);
    expect(skip?.lastElementChild).toBe(arrows[1]);
    expect(classesOf(arrows[0])).toContain("max-sm:hidden");
    expect(classesOf(arrows[1])).toContain("sm:hidden");
  });

  it("REQ-SCR-01 REQ-A11Y-05 the hero is the section named Intro, with one empty hidden box for the dot", () => {
    const section = render(<Hero />).querySelector("section");
    expect(section?.getAttribute("aria-label")).toBe(site.names.intro);
    expect(section?.dataset.chapter).toBe("hero");
    const dots = section?.querySelectorAll('[data-stage="dot"]') ?? [];
    expect(dots).toHaveLength(1);
    expect(dots[0]?.childNodes).toHaveLength(0);
    expect(dots[0]?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("REQ-A11Y-03 the scroll cue is hidden from assistive technology and never moves", () => {
    const host = render(<Hero />);
    const cue = [...host.querySelectorAll('[aria-hidden="true"]')].find(
      (node) => node.textContent === copy.scrollCue,
    );
    expect(cue).toBeDefined();
    expect(
      classesOf(cue).filter((name) => /animate|transition/.test(name)),
    ).toEqual([]);
  });

  it("REQ-A11Y-04 the hero's foot carries the Calm switch, off in the static HTML", () => {
    const host = render(<Hero />);
    const switches = host.querySelectorAll('button[role="switch"]');
    expect(switches).toHaveLength(1);
    expect(switches[0]?.getAttribute("aria-checked")).toBe("false");
    expect(switches[0]?.textContent).toContain("Calm mode");
  });

  it("REQ-CNT-10 A14 the phone readout says nothing in the static HTML", () => {
    const host = render(<Hero />);
    const readout = [...host.querySelectorAll("p")].find((node) =>
      classesOf(node).includes("sm:hidden"),
    );
    expect(readout).toBeDefined();
    expect(readout?.textContent).toBe("");
  });
});

describe("HeroHeadline with the tier store", () => {
  useLiveRoot();

  function cell() {
    const h1 = container.querySelector("h1");
    return {
      h1,
      text: h1?.textContent,
      reserve: h1?.parentElement?.getAttribute("data-reserve"),
    };
  }

  beforeEach(async () => {
    await mount(<HeroHeadline id="x" />);
  });

  it("REQ-CNT-10 A14 before the engine reports, the h1 holds the tier 3 line", () => {
    expect(cell().text).toBe(headlines.still);
    expect(cell().reserve).toBe(
      `${headlineParts.first}\n${headlineParts.second.gpu}`,
    );
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

      await report(ready(tier));
      expect(cell().text).toBe(headlines.gpu);
      expect(cell().reserve).toBe(
        `${headlineParts.first}\n${headlineParts.second.still}`,
      );
      expect(cell().h1).toBe(before);
    },
  );

  it("REQ-CNT-10 A14 tier 3 keeps the tier 3 line", async () => {
    await report({ type: "tierChosen", tier: 3, reason: "save-data" });
    await report(ready(3));
    expect(cell().text).toBe(headlines.still);
  });

  it("REQ-CNT-10 A14 the tier 3 line returns when the tier drops, and while a lost tier 1 is rebuilt as tier 2", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report(ready(1));
    expect(cell().text).toBe(headlines.gpu);

    await report({ type: "tierChosen", tier: 2, reason: "device-lost" });
    expect(cell().text).toBe(headlines.still);
    await report(ready(2));
    expect(cell().text).toBe(headlines.gpu);

    await report({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(cell().text).toBe(headlines.still);
  });

  it("REQ-CNT-01 A14 a server render keeps the tier 3 line whatever the store holds", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report(ready(1));
    const host = render(<Hero />);
    expect(host.querySelector("h1")?.textContent).toBe(headlines.still);
    expect(host.textContent).not.toContain(headlineParts.second.gpu);
  });
});

describe("TierReadout with the tier store", () => {
  useLiveRoot();

  const text = () => container.querySelector("p")?.textContent ?? "";

  it("REQ-CNT-10 A14 the phone readout names the tier and the count the field reported, once it is ready", async () => {
    await mount(<TierReadout variant="hero" />);
    expect(text()).toBe("");
    // Plain text, so nothing is announced at load (REQ-A11Y-05).
    expect(container.querySelector('[role="status"], [aria-live]')).toBeNull();

    await report({ type: "tierChosen", tier: 2, reason: "phone" });
    expect(text()).toBe("");
    await report(ready(2, 100_000));
    expect(text()).toBe("Tier 2 · WebGL2 · 100K particles");
    // The dots are for the eye only.
    expect(spokenText(container.querySelector("p"))).toBe(
      "Tier 2  WebGL2  100K particles",
    );

    await report({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(text()).toBe("");
    await report(ready(3));
    expect(text()).toBe("");
  });

  it.each([1, 2, 3] as const)(
    "REQ-CNT-10 A14 REQ-A11Y-05 the field readout is plain text, not a live region, that shows tier %i only once it is ready, after a violet dot",
    async (tier) => {
      await mount(<TierReadout variant="field" />);
      expect(
        container.querySelector('[role="status"], [aria-live]'),
      ).toBeNull();
      const status = container.querySelector('[data-part="tier-readout"]');
      expect(status).not.toBeNull();
      expect(status?.textContent).toBe("");

      await report({ type: "tierChosen", tier, reason: "forced" });
      expect(status?.textContent).toBe("");
      await report(ready(tier));
      expect(status?.textContent).toBe(tierLabel(tier));
      const dot = status?.firstElementChild;
      expect(dot?.getAttribute("aria-hidden")).toBe("true");
      expect(classesOf(dot)).toContain("bg-violet");
    },
  );
});

describe("FieldNote", () => {
  useLiveRoot();

  const note = () => container.querySelector("p")?.textContent ?? "";

  it("REQ-CNT-10 A14 says nothing before the tier is ready", async () => {
    stubPointer(true);
    await mount(<FieldNote />);
    expect(note()).toBe("");
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    expect(note()).toBe("");
  });

  it.each([
    [true, story.field.notes.pointer],
    [false, story.field.notes.touch],
  ] as const)(
    "REQ-SCR-06 with a fine pointer %s, a live field shows its stir hint",
    async (isFine, words) => {
      stubPointer(isFine);
      await mount(<FieldNote />);
      await report({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
      await report(ready(2));
      expect(note()).toBe(words);
    },
  );

  it("REQ-CNT-10 A14 tier 3 says it is a still", async () => {
    stubPointer(true);
    await mount(<FieldNote />);
    await report({ type: "tierChosen", tier: 3, reason: "save-data" });
    await report(ready(3));
    expect(note()).toBe(story.field.notes.still);
  });

  it("REQ-A11Y-04 calm mode shows no note, and the hint returns when it ends", async () => {
    stubPointer(true);
    await mount(<FieldNote />);
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report(ready(1));
    await setCalm(true);
    expect(note()).toBe("");
    await setCalm(false);
    expect(note()).toBe(story.field.notes.pointer);
  });
});

describe("PointerRing", () => {
  useLiveRoot();

  function parts() {
    const section = container.querySelector("section");
    const ring = container.querySelector<HTMLElement>(
      '[data-part="pointer-ring"]',
    );
    if (section === null || ring === null) throw new Error("No ring");
    return { section, ring };
  }

  function pointer(
    target: EventTarget,
    type: string,
    { pointerType = "mouse", x = 0, y = 0 } = {},
  ) {
    const event = new Event(type, { bubbles: type === "pointermove" });
    Object.defineProperties(event, {
      pointerType: { value: pointerType },
      clientX: { value: x },
      clientY: { value: y },
    });
    act(() => {
      target.dispatchEvent(event);
    });
  }

  const isShown = () => parts().ring.dataset.shown === "true";

  async function liveField(tier: 1 | 2 | 3 = 1) {
    await report({ type: "tierChosen", tier, reason: "forced" });
    await report(ready(tier));
  }

  it("REQ-A11Y-05 is hidden from assistive technology, takes no pointer events and is absent from the static HTML's view", () => {
    const host = render(
      <section>
        <PointerRing />
      </section>,
    );
    const layer = host.querySelector("section > div");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(classesOf(layer)).toEqual(
      expect.arrayContaining(["pointer-events-none", "fixed"]),
    );
    const ring = host.querySelector('[data-part="pointer-ring"]');
    expect(classesOf(ring)).toEqual(
      expect.arrayContaining(["invisible", "size-11", "data-shown:visible"]),
    );
    expect(ring?.hasAttribute("data-shown")).toBe(false);
  });

  it("REQ-SCR-06 follows a mouse over the field chapter, its centre on the pointer, and leaves with it", async () => {
    stubPointer(true);
    await mount(
      <section>
        <PointerRing />
      </section>,
    );
    await liveField(1);
    const { section, ring } = parts();

    pointer(section, "pointermove", { x: 300, y: 200 });
    expect(isShown()).toBe(true);
    expect(ring.style.transform).toMatch(
      /^translate3d\(278px, 178px, 0(?:px)?\)$/,
    );

    pointer(section, "pointerleave");
    expect(isShown()).toBe(false);
  });

  it("REQ-SCR-06 ignores a pen or a finger", async () => {
    stubPointer(true);
    await mount(
      <section>
        <PointerRing />
      </section>,
    );
    await liveField(2);
    const { section } = parts();
    pointer(section, "pointermove", { pointerType: "touch", x: 10, y: 10 });
    expect(isShown()).toBe(false);
    pointer(section, "pointermove", { pointerType: "pen", x: 10, y: 10 });
    expect(isShown()).toBe(false);
  });

  it.each([
    ["before the field is ready", false, true, null],
    ["on tier 3", false, true, 3],
    ["without a fine pointer", false, false, 1],
    ["in calm mode", true, true, 1],
  ] as const)(
    "REQ-A11Y-03 REQ-SCR-06 shows nothing %s",
    async (_case, isCalm, isFine, tier) => {
      stubPointer(isFine);
      if (isCalm) await setCalm(true);
      const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
      await mount(
        <section>
          <PointerRing />
        </section>,
      );
      if (tier !== null) await liveField(tier);
      pointer(parts().section, "pointermove", { x: 50, y: 50 });
      expect(isShown()).toBe(false);
      expect(add.mock.calls.filter(([type]) => type === "pointermove")).toEqual(
        [],
      );
    },
  );

  it("REQ-A11Y-04 REQ-SCR-04 calm mode and unmounting remove every listener and hide the ring", async () => {
    stubPointer(true);
    await mount(
      <section>
        <PointerRing />
      </section>,
    );
    await liveField(1);
    const { section } = parts();
    const removeArea = vi.spyOn(section, "removeEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    pointer(section, "pointermove", { x: 20, y: 20 });
    expect(isShown()).toBe(true);

    await setCalm(true);
    expect(isShown()).toBe(false);
    expect(removeArea.mock.calls.map(([type]) => type).sort()).toEqual([
      "pointerleave",
      "pointermove",
    ]);
    expect(removeWindow.mock.calls.map(([type]) => type)).toContain("scroll");
    pointer(section, "pointermove", { x: 30, y: 30 });
    expect(isShown()).toBe(false);

    await setCalm(false);
    pointer(section, "pointermove", { x: 30, y: 30 });
    expect(isShown()).toBe(true);
  });

  it("REQ-SCR-06 a scroll that carries the chapter out from under a still cursor hides the ring", async () => {
    stubPointer(true);
    await mount(
      <section>
        <PointerRing />
      </section>,
    );
    await liveField(1);
    const { section } = parts();
    let box = { top: 0, bottom: 800, left: 0, right: 1280 };
    section.getBoundingClientRect = () => box as DOMRect;
    pointer(section, "pointermove", { x: 400, y: 400 });
    expect(isShown()).toBe(true);

    box = { top: -900, bottom: -100, left: 0, right: 1280 };
    pointer(window, "scroll");
    expect(isShown()).toBe(false);

    box = { top: 0, bottom: 800, left: 0, right: 1280 };
    pointer(window, "scroll");
    expect(isShown()).toBe(true);
  });
});

describe("FieldStill, the wordmark on tier 3", () => {
  useLiveRoot();

  it("REQ-TIER-03 A14 nothing before a tier is chosen, and nothing on tiers 1 and 2, which form the wordmark live", async () => {
    await mount(<FieldStill />);
    expect(container.querySelector("img")).toBeNull();
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report(ready(1));
    expect(container.querySelector("img")).toBeNull();
    await report({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
    expect(container.querySelector("img")).toBeNull();
  });

  it("REQ-TIER-03 REQ-A11Y-05 tier 3 shows the wordmark's still, wide or tall, named for what it shows, loaded lazily; a failed load removes it", async () => {
    await mount(<FieldStill />);
    await report({ type: "tierChosen", tier: 3, reason: "save-data" });
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(FIELD_STILLS.wide);
    expect(container.querySelector("source")?.getAttribute("srcset")).toBe(
      FIELD_STILLS.tall,
    );
    expect(image?.getAttribute("alt")).toBe(
      "The T7SEN wordmark formed in the particle field",
    );
    expect(image?.getAttribute("loading")).toBe("lazy");
    const still = container.querySelector('[data-part="field-still"]');
    expect(classesOf(still)).toContain("opacity-0");

    await act(async () => {
      image?.dispatchEvent(new Event("load"));
    });
    expect(
      classesOf(container.querySelector('[data-part="field-still"]')),
    ).toContain("opacity-100");

    await act(async () => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("BloomSection, the field chapter", () => {
  const section = () => render(<BloomSection />).querySelector("section");

  it("REQ-SCR-01 is the section named The particle field, its mono label heading read as Field", () => {
    const field = section();
    expect(field?.dataset.chapter).toBe("bloom");
    expect(field?.id).toBe("bloom");
    expect(field?.getAttribute("aria-label")).toBe(site.names.field);
    const heading = field?.querySelector("h2");
    expect(heading?.textContent).toBe(
      `${story.labels.bloom.number} / ${story.labels.bloom.name}`,
    );
    expect(spokenText(heading)).toBe(story.labels.bloom.name);
    expect(heading?.hasAttribute("data-story-title")).toBe(false);
  });

  it("REQ-CNT-10 A14 the readout and the note say nothing in the static HTML", () => {
    const field = section();
    expect(
      field?.querySelector('[data-part="tier-readout"]')?.textContent,
    ).toBe("");
    // Plain text: no live region announces the tier at load (REQ-A11Y-05).
    expect(field?.querySelector('[role="status"], [aria-live]')).toBeNull();
    expect(field?.textContent).not.toContain(tierLabel(1));
    for (const words of Object.values(story.field.notes)) {
      expect(field?.textContent).not.toContain(words);
    }
  });

  it("REQ-SCR-01 REQ-SCR-07 one screen holds through the chapter, label and readout at the top, the note at the bottom, in a room as long as the field's timeline", () => {
    const field = section();
    // The engine times the mark and the wordmark as progress through this
    // room, one length on phones and one from lg (runtime/story.ts,
    // BLOOM_ROOMS).
    expect(heightClasses(field)).toEqual([
      `min-h-[${Math.round(BLOOM_ROOMS.phone * 100)}svh]`,
      `lg:min-h-[${Math.round(BLOOM_ROOMS.desktop * 100)}svh]`,
    ]);
    // Sticky, so the three stay on screen while the wordmark forms, and a
    // stacking context of its own, so their plates sit under the words.
    const screen = field?.querySelector('[data-part="field-screen"]');
    expect(classesOf(screen)).toEqual(
      expect.arrayContaining(["sticky", "top-0", "h-svh", "isolate"]),
    );
    const frame = screen?.querySelector(".justify-between");
    expect(classesOf(frame)).toEqual(
      expect.arrayContaining(["h-full", "flex-col", "justify-between"]),
    );
    expect(frame?.firstElementChild?.querySelector("h2")).not.toBeNull();
    expect(
      frame?.firstElementChild?.querySelector('[data-part="tier-readout"]'),
    ).not.toBeNull();
    expect(frame?.lastElementChild?.querySelector("p")).not.toBeNull();
    expect(field?.querySelector('[data-part="pointer-ring"]')).not.toBeNull();
  });

  it("REQ-A11Y-06 the label, the readout and the note each bring their own plate, which the veil's plates leave to them", () => {
    const field = section();
    const held = [...(field?.querySelectorAll('[data-plate="own"]') ?? [])];
    expect(held).toHaveLength(3);
    for (const wrapper of held) {
      const plate = wrapper.firstElementChild;
      expect(plate?.getAttribute("data-part")).toBe("own-plate");
      expect(plate?.getAttribute("aria-hidden")).toBe("true");
      expect(classesOf(plate)).toEqual(
        expect.arrayContaining(["absolute", "-inset-4", "-z-10"]),
      );
    }
    expect(held[0]?.querySelector("h2")).not.toBeNull();
    expect(held[1]?.querySelector('[data-part="tier-readout"]')).not.toBeNull();
    expect(held[2]?.querySelector("p")).not.toBeNull();
  });

  it("REQ-A11Y-06 the held plate is the veil's own plate: the void at PLATE_ALPHA over the open veil, with its soft edge", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = /\[data-part="own-plate"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain(
      `calc(100% * (1 - (1 - ${VEIL_TEXT}) / (1 - ${VEIL_OPEN})))`,
    );
    expect(rule).toContain("var(--color-void)");
    expect(rule).toContain(`border-radius: ${PLATE_SOFT / 2}px`);
    expect(rule).toContain(
      `box-shadow: 0 0 ${PLATE_SOFT}px ${PLATE_SOFT / 2}px var(--plate)`,
    );
    expect(PLATE_ALPHA).toBeCloseTo(1 - (1 - VEIL_TEXT) / (1 - VEIL_OPEN), 12);
  });

  it("REQ-TIER-03 REQ-A11Y-05 the static HTML holds no still; the wordmark's still waits for tier 3", () => {
    const field = section();
    expect(field?.querySelector("img")).toBeNull();
    expect(field?.querySelector('[data-part="field-still"]')).toBeNull();
  });
});

describe("WorkSection", () => {
  const section = () => render(<WorkSection />).querySelector("section");

  it("REQ-NAV-01 REQ-SCR-05 is Skip intro's target, with its label, its revealed title and its intro", () => {
    const work = section();
    expect(work?.id).toBe("work");
    expect(work?.dataset.chapter).toBe("work");
    const heading = work?.querySelector("h2");
    expect(heading?.id).toBe("work-heading");
    expect(heading?.textContent).toBe(pages.home.work.title);
    expect(heading?.hasAttribute("data-story-title")).toBe(true);
    expect(work?.getAttribute("aria-labelledby")).toBe("work-heading");
    expect(heading?.previousElementSibling?.textContent).toBe(
      `${story.labels.work.number} / ${story.labels.work.name}`,
    );
    expect(work?.querySelector("[data-story-intro]")?.textContent).toBe(
      pages.home.work.intro,
    );
  });

  it("REQ-CNT-02 the boxed link opens the full index, with its note in its name", () => {
    const index = section()?.querySelector('a[href="/work"]');
    expect(index?.textContent).toContain(pages.home.work.index.label);
    for (const word of pages.home.work.index.note) {
      expect(index?.textContent).toContain(word);
    }
  });

  it("REQ-SCR-01 each full study is a step of the chapter in study order, with one frame the field forms its shape in", () => {
    const steps = [
      ...(section()?.querySelectorAll("li[data-work-step]") ?? []),
    ];
    expect(steps.map((step) => step.getAttribute("data-work-step"))).toEqual(
      fullStudies.map((_study, index) => String(index)),
    );
    for (const [index, step] of steps.entries()) {
      const study = fullStudies[index];
      expect(step.querySelector("h3")?.textContent).toBe(study?.title);
      const frames = step.querySelectorAll('[data-stage="frame"]');
      expect(frames).toHaveLength(1);
      expect(frames[0]?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("REQ-CNT-07 every study links to its page in study order, the full rows first", () => {
    const links = [...(section()?.querySelectorAll('a[href^="/work/"]') ?? [])];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      ...fullStudies.map((study) => studyHref(study.slug)),
      ...shortStudies.map((study) => studyHref(study.slug)),
    ]);
  });

  it("REQ-CNT-04 the short studies are cards after the rows, not steps, the in-progress one marked", () => {
    const work = section();
    const cards = [...(work?.querySelectorAll("ul > li > article") ?? [])];
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual(
      shortStudies.map((study) => study.title),
    );
    for (const card of cards) {
      expect(card.closest("[data-work-step]")).toBeNull();
      expect(card.querySelector('[data-stage="frame"]')).toBeNull();
    }
    expect(cards[1]?.textContent).toContain("In progress");
  });

  it("REQ-CNT-09 the old site is one line away", () => {
    const v1 = section()?.querySelector('a[href="/v1"]');
    expect(linkName(v1 as Element)).toBe(pages.home.work.archive.link.label);
    expect(v1?.parentElement?.textContent).toContain(
      pages.home.work.archive.lead,
    );
  });
});

describe("MakingOfSection", () => {
  it("REQ-SCR-01 REQ-SCR-05 shows its label, its revealed title, a line true on every tier and the link to its study, as tall as its content", () => {
    const section = render(<MakingOfSection />).querySelector("section");
    expect(section?.dataset.chapter).toBe("making-of");
    const heading = section?.querySelector("h2");
    expect(heading?.textContent).toBe(pages.home.makingOf.title);
    expect(heading?.hasAttribute("data-story-title")).toBe(true);
    expect(heading?.previousElementSibling?.textContent).toBe(
      `${story.labels["making-of"].number} / ${story.labels["making-of"].name}`,
    );
    expect(section?.querySelector("[data-story-intro]")?.textContent).toBe(
      pages.home.makingOf.intro,
    );
    const links = [...(section?.querySelectorAll("a") ?? [])].map((link) => [
      linkName(link),
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      [pages.home.makingOf.link.label, pages.home.makingOf.link.href],
    ]);
    // No room of its own: no height on the section.
    expect(heightClasses(section)).toEqual([]);
  });

  it("REQ-ENG-09 REQ-CNT-01 its words in the page's column, then the pass viewer across the whole width, then one panel with the link to the full study and the tier table", () => {
    const section = render(<MakingOfSection />).querySelector("section");
    const [words, viewer, closing, ...rest] = [...(section?.children ?? [])];
    expect(rest).toEqual([]);

    expect(classesOf(words)).toEqual(
      expect.arrayContaining(["mx-auto", "max-w-7xl"]),
    );
    expect(words?.querySelector("h2")?.id).toBe("making-of-heading");
    expect(words?.querySelector("[data-story-intro]")).not.toBeNull();

    // No column round the viewer: its row runs from edge to edge.
    expect(viewer?.hasAttribute("data-pass-viewer")).toBe(true);
    expect(viewer?.getAttribute("class")).toBeNull();
    expect(viewer?.querySelectorAll("a, dl")).toHaveLength(0);

    expect(classesOf(closing)).toEqual(
      expect.arrayContaining(["mx-auto", "max-w-7xl"]),
    );
    expect(closing?.children).toHaveLength(1);
    const panel = closing?.firstElementChild;
    expect(classesOf(panel)).toEqual(
      expect.arrayContaining(["rounded-2xl", "border", "bg-surface"]),
    );
    const links = [...(panel?.querySelectorAll("a") ?? [])].map((link) => [
      linkName(link),
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      [pages.home.makingOf.link.label, pages.home.makingOf.link.href],
    ]);
    expect(panel?.querySelector(".sr-only")?.textContent).toBe(
      passViewer.tiersName,
    );
    const rows = [...(panel?.querySelectorAll("dl > div") ?? [])];
    expect(
      rows.map((row) => [
        row.querySelector("dt")?.textContent,
        spokenText(row.querySelector("dt")).replace(/\s+/g, " ").trim(),
        row.querySelector("dd")?.textContent,
      ]),
    ).toEqual(
      passViewer.tiers.map((row) => [
        row.tier.join(" · "),
        row.tier.join(" "),
        row.value,
      ]),
    );
    expect(rows[2]?.querySelector("dd")?.textContent).toBe("Static image");
  });
});

describe("AboutSection", () => {
  const section = () => render(<AboutSection />).querySelector("section");

  it("REQ-CNT-08 REQ-SCR-05 holds the title, the streamer thread as the intro, and the skills under their labels", () => {
    const about_ = section();
    const heading = about_?.querySelector("h2");
    expect(heading?.textContent).toBe(about.heading);
    expect(heading?.hasAttribute("data-story-title")).toBe(true);
    const intro = about_?.querySelector("[data-story-intro]");
    expect(
      [...(intro?.querySelectorAll("p") ?? [])].map((p) => p.textContent),
    ).toEqual([...about.paragraphs]);
    const groups = [...(about_?.querySelectorAll("dl > div") ?? [])];
    expect(
      groups.map((group) => [
        group.querySelector("dt")?.textContent,
        group.querySelector("dd")?.textContent,
      ]),
    ).toEqual(
      about.skills.map((group) => [group.label, group.items.join(" · ")]),
    );
  });

  it("REQ-CNT-05 REQ-CNT-08 GitHub and the CV request are pills; the stream address not supplied yet is text, never a link", () => {
    const about_ = section();
    const links = [...(about_?.querySelectorAll("a") ?? [])].map((link) => [
      linkName(link),
      link.getAttribute("href"),
    ]);
    const [github, stream] = about.links;
    expect(links).toEqual([
      [github.label, github.href],
      [about.cv.ask.label, "/contact"],
    ]);
    expect(isMarker(stream.href)).toBe(true);
    expect(about_?.textContent).toContain(`${stream.label} ${stream.href}`);
  });

  it("REQ-SCR-01 leaves room above the words for the field's strands, and none after them", () => {
    const inner = section()?.firstElementChild;
    expect(classesOf(inner)).toContain("pt-[45svh]");
    expect(heightClasses(section())).toEqual([]);
    expect(heightClasses(inner)).toEqual([]);
  });
});

describe("ContactSection", () => {
  const section = () => render(<ContactSection />).querySelector("section");

  it("REQ-CNT-11 holds what T7SEN takes on: the two offers, the also line and the hiring line", () => {
    const contact = section();
    expect(
      [...(contact?.querySelectorAll("h3") ?? [])].map((h3) => h3.textContent),
    ).toEqual(services.offers.map((offer) => offer.title));
    for (const text of [
      ...services.offers.map((offer) => offer.description),
      services.also,
      services.hiring,
      pages.home.contact.servicesLabel,
    ]) {
      expect(contact?.textContent).toContain(text);
    }
  });

  it("REQ-CNT-05 REQ-SCR-05 its panel, which the field's rings centre on, leads to /contact until the form arrives, with no fields", () => {
    const contact = section();
    const heading = contact?.querySelector("h2");
    expect(heading?.textContent).toBe(pages.home.contact.title);
    expect(heading?.hasAttribute("data-story-title")).toBe(true);
    const panels = contact?.querySelectorAll('[data-stage="contact"]') ?? [];
    expect(panels).toHaveLength(1);
    const link = panels[0]?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/contact");
    expect(linkName(link as Element)).toBe(
      pages.home.contact.panel.action.label,
    );
    expect(panels[0]?.textContent).toContain(pages.contact.form);
    expect(contact?.querySelectorAll("form, input, textarea")).toHaveLength(0);
  });

  it("REQ-SCR-01 the last chapter is as tall as its words, with no room above them", () => {
    const contact = section();
    expect(heightClasses(contact)).toEqual([]);
    expect(classesOf(contact)).not.toContain("justify-end");
    expect(heightClasses(contact?.firstElementChild)).toEqual([]);
  });
});

describe("HomePage", () => {
  const page = () => render(<HomePage />);

  it("REQ-SCR-01 renders the six chapters in order, and no other section", () => {
    const sections = [...page().querySelectorAll("section")];
    expect(sections.map((section) => section.dataset.chapter)).toEqual([
      ...chapterOrder,
    ]);
  });

  it("REQ-SCR-01 a hairline rule opens every chapter after the hero", () => {
    const [hero, ...rest] = [...page().querySelectorAll("section")];
    expect(classesOf(hero)).not.toContain("border-t");
    for (const section of rest) {
      expect(classesOf(section)).toEqual(
        expect.arrayContaining(["border-t", "border-raised"]),
      );
    }
  });

  it("REQ-SCR-01 REQ-NAV-01 the hero is its first screen below the bar and no more, with no room after it before the field chapter", () => {
    const hero = page().querySelector('section[data-chapter="hero"]');
    expect(
      classesOf(hero).filter((name) =>
        /(?:^|:)(?:min-h|h|p|py|pb)-/.test(name),
      ),
    ).toEqual([]);
    // Nothing after its one screen, the box the hero's own test sizes to
    // the screen below the bar.
    expect(hero?.children).toHaveLength(1);
  });

  it("REQ-SCR-01 every chapter is as tall as its content but the field chapter, whose room is on the section; the making-of's slide holds its stretch inside its viewer, only once the script runs", () => {
    const host = page();
    for (const section of host.querySelectorAll("section")) {
      const heights = heightClasses(section);
      if (section.dataset.chapter === "bloom") {
        // One room on phones and one from lg.
        expect(heights).toHaveLength(2);
      } else {
        expect(heights, section.dataset.chapter).toEqual([]);
      }
    }
    // The static HTML has the still grid, so no stretch yet (pass-viewer.test.tsx
    // checks the stretch the sliding row adds).
    expect(host.querySelector('[data-part="pass-stretch"]')).toBeNull();
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

  it("REQ-SCR-05 the work, making-of, about and contact titles are revealed, each intro in its title's chapter", () => {
    const host = page();
    expect(
      [...host.querySelectorAll("[data-story-title]")].map((title) => title.id),
    ).toEqual([
      "work-heading",
      "making-of-heading",
      "about-heading",
      "contact-heading",
    ]);
    for (const intro of host.querySelectorAll("[data-story-intro]")) {
      expect(
        intro.closest("section")?.querySelector("[data-story-title]"),
      ).not.toBeNull();
    }
  });

  it("REQ-NAV-01 Skip intro targets the work chapter, and See the work stays in the hero", () => {
    const host = page();
    const hero = host.querySelector('section[data-chapter="hero"]');
    const names = [...(hero?.querySelectorAll("a") ?? [])].map(linkName);
    expect(names).toContain(copy.primaryAction);
    const skip = [...(hero?.querySelectorAll("a") ?? [])].find(
      (link) => linkName(link) === copy.cornerControl,
    );
    expect(skip?.getAttribute("href")).toBe("#work");
    expect(
      host.querySelector<HTMLElement>("section#work")?.dataset.chapter,
    ).toBe("work");
  });

  it("REQ-CNT-11 the services sit inside the contact chapter, not at the top of the page", () => {
    const host = page();
    const contact = host.querySelector('section[data-chapter="contact"]');
    for (const offer of services.offers) {
      expect(contact?.textContent).toContain(offer.title);
    }
    expect(host.querySelector("#services")).toBeNull();
  });

  it("REQ-CNT-01 A14 every chapter's text is in the static HTML, with nothing hidden by style and no tier 1 and 2 claim", () => {
    const host = page();
    expect(host.querySelectorAll("[style]")).toHaveLength(0);
    expect(host.querySelector("h1")?.textContent).toBe(headlines.still);
    const text = host.textContent ?? "";
    expect(text).not.toContain(headlineParts.second.gpu);
    for (const words of [
      pages.home.work.intro,
      pages.home.makingOf.intro,
      about.heading,
      pages.home.contact.title,
      ...fullStudies.map((study) => study.listing.line),
    ]) {
      expect(text).toContain(words);
    }
  });

  it("REQ-CNT-05 no link on the page points at an address not supplied yet", () => {
    for (const anchor of page().querySelectorAll("a")) {
      expect(isMarker(anchor.getAttribute("href") ?? "")).toBe(false);
    }
  });

  it("REQ-I18N-01 every class on the page is a logical one", () => {
    expect(findPhysicalClasses(allClasses(page()))).toEqual([]);
  });
});
