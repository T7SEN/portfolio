import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FACE_CORNERS } from "@/components/story/pass-face";
import {
  DEFAULT_PASS,
  passAnnouncement,
  passNumber,
  passPosition,
  passViewer,
} from "@/content/passes";
import { pages } from "@/content/pages";
import { story } from "@/content/story";
import { LIVE_PASSES, PASSES, type PassId } from "@/engine/story";
import type { EngineEvent } from "@/engine/types";
import { calmStore } from "@/lib/calm-store";
import { tierStore } from "@/lib/tier-store";
import { colors, type ColorName } from "@/tokens/colors";
import { contrastRatio } from "@/tokens/contrast";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { MakingOfSection } from "./making-of-section";
import { PASS_STILLS } from "./pass-stills";
import { PassTiers } from "./pass-tiers";
import { isPassLive, PassViewer } from "./pass-viewer";

function render() {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<MakingOfSection />);
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

/** What assistive technology hears of an element: aria-hidden parts left out. */
function spoken(element: Element | null | undefined): string {
  if (!element) return "";
  return [...element.childNodes]
    .map((node) => {
      if (node instanceof Element) {
        return node.getAttribute("aria-hidden") === "true" ? "" : spoken(node);
      }
      return node.textContent ?? "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function cards(host: ParentNode) {
  return [...host.querySelectorAll<HTMLButtonElement>("button[data-pass]")];
}

function faceOf(host: ParentNode, pass: PassId) {
  return host.querySelector<HTMLElement>(`[data-pass-face="${pass}"]`);
}

/** The breakdown a sighted visitor sees: the one not hidden. */
function shownBreakdowns(host: ParentNode) {
  return [
    ...host.querySelectorAll<HTMLElement>("[data-pass-breakdown]"),
  ].filter((breakdown) => !classesOf(breakdown).includes("invisible"));
}

describe("the pass viewer in the static HTML", () => {
  it("REQ-ENG-09 REQ-CNT-01 five cards in the frame's order, each a button with its numbered label, velocity chosen", () => {
    const host = render();
    const buttons = cards(host);
    expect(buttons.map((button) => button.dataset.pass)).toEqual([...PASSES]);
    for (const button of buttons) {
      expect(button.getAttribute("type")).toBe("button");
      const pass = button.dataset.pass as PassId;
      const label = button.querySelector('[data-plate="box"]');
      expect(label?.textContent).toBe(
        `${passNumber(pass)} · ${passViewer.passes[pass].name}`,
      );
      // The middle dot is for the eye; the name reads "2 Velocity".
      expect(spoken(button)).toBe(
        `${passNumber(pass)} ${passViewer.passes[pass].name}`,
      );
      expect(button.getAttribute("aria-pressed")).toBe(
        String(pass === DEFAULT_PASS),
      );
    }
    const group = host.querySelector('[role="group"]');
    expect(group?.getAttribute("aria-label")).toBe(passViewer.group);
    expect(cards(group!)).toHaveLength(PASSES.length);
  });

  it("REQ-ENG-09 REQ-CNT-01 the panel holds the default pass's breakdown, its label, the link and the tier table", () => {
    const host = render();
    const [shown, ...others] = shownBreakdowns(host);
    expect(others).toHaveLength(0);
    expect(shown?.dataset.passBreakdown).toBe("velocity");
    const copy = passViewer.passes.velocity;
    expect(shown?.querySelector("p")?.textContent).toBe("Pass 2 of 5");
    expect(classesOf(shown?.querySelector("p"))).toEqual(
      expect.arrayContaining(["font-mono", "uppercase", "text-violet"]),
    );
    expect(shown?.querySelector("h3")?.textContent).toBe(copy.title);
    expect(classesOf(shown?.querySelector("h3"))).toContain("font-display");
    expect(
      [...(shown?.querySelectorAll("p") ?? [])]
        .slice(1)
        .map((p) => p.textContent),
    ).toEqual([...copy.body]);

    // The other breakdowns keep their place, unseen and unheard, so the
    // panel never changes height.
    const hidden = [
      ...host.querySelectorAll<HTMLElement>("[data-pass-breakdown]"),
    ].filter((breakdown) => breakdown !== shown);
    expect(hidden).toHaveLength(PASSES.length - 1);
    for (const breakdown of hidden) {
      expect(breakdown.getAttribute("aria-hidden")).toBe("true");
      expect(classesOf(breakdown)).toEqual(
        expect.arrayContaining(["invisible", "col-start-1", "row-start-1"]),
      );
    }

    const links = [...host.querySelectorAll("a")];
    expect(
      links.map((link) => [spoken(link), link.getAttribute("href")]),
    ).toEqual([
      [pages.home.makingOf.link.label, pages.home.makingOf.link.href],
    ]);

    const rows = [...host.querySelectorAll("dl > div")];
    expect(
      rows.map((row) => [
        spoken(row.querySelector("dt")),
        row.querySelector("dd")?.textContent,
      ]),
    ).toEqual(passViewer.tiers.map((row) => [row.tier.join(" "), row.value]));
    expect(rows[0]?.querySelector("dt")?.textContent).toBe("Tier 1 · WebGPU");
    expect(rows[2]?.querySelector("dd")?.textContent).toBe("Static image");
  });

  it("REQ-A11Y-05 REQ-CNT-01 before the tier is known every card shows its still, which says what the pass shows", () => {
    const host = render();
    for (const pass of PASSES) {
      const face = faceOf(host, pass);
      expect(face?.getAttribute("aria-hidden")).toBe("true");
      expect(face?.hasAttribute("data-live")).toBe(false);
      expect(classesOf(face)).toContain("bg-surface");
      const image = face?.querySelector("img");
      expect(image?.getAttribute("src")).toBe(PASS_STILLS[pass]);
      expect(image?.getAttribute("alt")).toBe(passViewer.passes[pass].shows);
      expect(image?.getAttribute("loading")).toBe("lazy");
      // Shown at once: a still in the static HTML is never left at opacity 0.
      expect(classesOf(image)).not.toContain("opacity-0");
    }
    expect(Object.keys(PASS_STILLS)).toEqual([...PASSES]);
    for (const [pass, src] of Object.entries(PASS_STILLS)) {
      expect(src).toBe(`/still/pass-${pass}.webp`);
    }
  });

  it("REQ-A11Y-05 each card is described by what its pass shows, from text the page does not show", () => {
    const host = render();
    for (const button of cards(host)) {
      const id = button.getAttribute("aria-describedby") ?? "";
      const description = host.querySelector(`[id="${id}"]`);
      expect(description?.textContent).toBe(
        passViewer.passes[button.dataset.pass as PassId].shows,
      );
      expect(description?.closest("[hidden]")).not.toBeNull();
      const panel = host.querySelector(
        `[id="${button.getAttribute("aria-controls")}"]`,
      );
      expect(panel?.contains(shownBreakdowns(host)[0] ?? null)).toBe(true);
    }
  });

  it("REQ-A11Y-02 the live region is empty at load, so nothing is announced then", () => {
    const host = render();
    const live = host.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0]?.getAttribute("aria-live")).toBe("polite");
    expect(live[0]?.textContent).toBe("");
    expect(classesOf(live[0])).toContain("sr-only");
  });

  it("REQ-ENG-09 each face holds four empty corner marks, placed by reading direction, for the field to read", () => {
    const host = render();
    for (const pass of PASSES) {
      const marks = [
        ...(faceOf(host, pass)?.querySelectorAll<HTMLElement>(
          "[data-corner]",
        ) ?? []),
      ];
      expect(marks.map((mark) => mark.dataset.corner)).toEqual([
        ...FACE_CORNERS,
      ]);
      for (const mark of marks) {
        expect(mark.textContent).toBe("");
        expect(classesOf(mark)).toEqual(
          expect.arrayContaining(["absolute", "size-0"]),
        );
      }
      const places = marks.map((mark) =>
        classesOf(mark).filter((name) =>
          /^(top|bottom|start|end)-0$/.test(name),
        ),
      );
      expect(places).toEqual([
        ["top-0", "start-0"],
        ["top-0", "end-0"],
        ["bottom-0", "end-0"],
        ["bottom-0", "start-0"],
      ]);
    }
  });

  it("REQ-ENG-09 REQ-A11Y-03 the look: portrait faces turned and overlapping from 1024 px, a flat grid below, and only colours change", () => {
    const host = render();
    const group = host.querySelector('[role="group"]');
    expect(classesOf(group)).toEqual(
      expect.arrayContaining(["grid", "grid-cols-2", "lg:flex"]),
    );
    const face = faceOf(host, "velocity");
    expect(classesOf(face)).toEqual(
      expect.arrayContaining([
        "h-35",
        "lg:h-67.5",
        "lg:w-50",
        "lg:[transform:rotateY(-34deg)]",
        "lg:rtl:[transform:rotateY(34deg)]",
        "border-glow",
      ]),
    );
    expect(classesOf(faceOf(host, "points"))).toContain("border-edge/40");
    expect(classesOf(cards(host)[0])).toEqual(
      expect.arrayContaining([
        "lg:-me-6.5",
        "lg:last:me-0",
        "max-sm:last:col-span-2",
      ]),
    );
    // No movement anywhere: no animation and no transition of position.
    const classes = allClasses(host);
    expect(classes).not.toMatch(/\banimate-|transition-(?:all|transform)\b/);
  });

  it("REQ-I18N-01 the viewer uses logical properties only", () => {
    expect(findPhysicalClasses(allClasses(render()))).toEqual([]);
  });

  it("REQ-SCR-01 REQ-A11Y-05 the chapter is as tall as its content, with its label, revealed title, intro and scene line", () => {
    const section = render().querySelector("section");
    expect(section?.dataset.chapter).toBe("making-of");
    expect(classesOf(section).some((name) => /min-h-/.test(name))).toBe(false);
    expect(section?.querySelector("h2")?.textContent).toBe(
      pages.home.makingOf.title,
    );
    expect(section?.querySelector("[data-story-intro]")?.textContent).toBe(
      pages.home.makingOf.intro,
    );
    expect(
      section?.querySelector('[data-scene="making-of"]')?.textContent,
    ).toBe(story.scenes["making-of"]);
    expect(section?.querySelector("[data-pass-viewer]")).not.toBeNull();
  });
});

describe("live or still", () => {
  const snapshot = (
    tier: 1 | 2 | 3 | null,
    ready = true,
    look: "halftone" | "soft" | null = tier === 3 ? null : "halftone",
  ) => ({ tier, ready, look });

  it("REQ-ENG-09 A14 a card is live only on a drawn tier 1 or 2 halftone field, for a pass its tier draws", () => {
    for (const pass of PASSES) {
      expect(isPassLive(pass, snapshot(null, false, null))).toBe(false);
      expect(isPassLive(pass, snapshot(1, false, null))).toBe(false);
      expect(isPassLive(pass, snapshot(1))).toBe(true);
      expect(isPassLive(pass, snapshot(2))).toBe(LIVE_PASSES[2].includes(pass));
      expect(isPassLive(pass, snapshot(3))).toBe(false);
      // The soft look has no passes, so every card shows its still.
      expect(isPassLive(pass, snapshot(1, true, "soft"))).toBe(false);
      expect(isPassLive(pass, snapshot(2, true, "soft"))).toBe(false);
      expect(isPassLive(pass, snapshot(1, true, null))).toBe(false);
    }
    expect(isPassLive("velocity", snapshot(2))).toBe(false);
  });
});

describe("the pass viewer, running", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function report(event: EngineEvent) {
    await act(async () => {
      tierStore.apply(event);
    });
  }

  async function mount() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <PassViewer
          link={
            <a href={pages.home.makingOf.link.href}>
              {pages.home.makingOf.link.label}
            </a>
          }
          tiers={<PassTiers />}
        />,
      );
    });
  }

  function card(pass: PassId) {
    return container.querySelector<HTMLButtonElement>(
      `button[data-pass="${pass}"]`,
    )!;
  }

  function liveFaces() {
    return [
      ...container.querySelectorAll<HTMLElement>("[data-pass-face][data-live]"),
    ].map((face) => face.dataset.passFace);
  }

  function announcement() {
    return container.querySelector("[aria-live]")?.textContent;
  }

  /**
   * A key press as a browser handles it on a button: Enter clicks on its
   * keydown and Space on its keyup, unless a listener cancels the key. jsdom
   * runs neither default, so this does what the browser would.
   */
  async function press(button: HTMLButtonElement, key: "Enter" | " ") {
    await act(async () => {
      button.focus();
      const down = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      const isDownKept = button.dispatchEvent(down);
      if (key === "Enter" && isDownKept) button.click();
      const up = new KeyboardEvent("keyup", {
        key,
        bubbles: true,
        cancelable: true,
      });
      const isUpKept = button.dispatchEvent(up);
      if (key === " " && isDownKept && isUpKept) button.click();
    });
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    tierStore.reset();
    calmStore.setChosen(false);
    vi.unstubAllGlobals();
  });

  it("REQ-ENG-09 REQ-A11Y-02 a click chooses a pass: the cards say which is pressed and the panel shows its breakdown", async () => {
    await mount();
    expect(announcement()).toBe("");

    await act(async () => {
      card("density").click();
    });
    expect(
      PASSES.filter(
        (pass) => card(pass).getAttribute("aria-pressed") === "true",
      ),
    ).toEqual(["density"]);
    const [shown, ...others] = shownBreakdowns(container);
    expect(others).toHaveLength(0);
    expect(shown?.dataset.passBreakdown).toBe("density");
    expect(shown?.querySelector("p")?.textContent).toBe(
      passPosition("density"),
    );
    expect(shown?.querySelector("h3")?.textContent).toBe(
      passViewer.passes.density.title,
    );
    expect(shown?.hasAttribute("aria-hidden")).toBe(false);
    expect(announcement()).toBe(passAnnouncement("density"));
    // The chosen card's face and label turn glow; the old one goes back.
    expect(classesOf(faceOf(container, "density"))).toContain("border-glow");
    expect(classesOf(faceOf(container, "velocity"))).not.toContain(
      "border-glow",
    );
  });

  it("REQ-A11Y-02 Enter and Space choose a pass from the keyboard, and nothing cancels either key", async () => {
    await mount();
    await press(card("final"), "Enter");
    expect(card("final").getAttribute("aria-pressed")).toBe("true");
    expect(shownBreakdowns(container)[0]?.dataset.passBreakdown).toBe("final");
    expect(announcement()).toBe(passAnnouncement("final"));

    await press(card("points"), " ");
    expect(card("points").getAttribute("aria-pressed")).toBe("true");
    expect(card("final").getAttribute("aria-pressed")).toBe("false");
    expect(shownBreakdowns(container)[0]?.dataset.passBreakdown).toBe("points");
    expect(document.activeElement).toBe(card("points"));
  });

  it("REQ-ENG-09 A14 before the tier is known, and while a chosen tier has not drawn, every card shows its still", async () => {
    await mount();
    expect(liveFaces()).toEqual([]);
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    expect(liveFaces()).toEqual([]);
    expect(container.querySelectorAll("[data-pass-face] img")).toHaveLength(
      PASSES.length,
    );
  });

  it("REQ-ENG-09 tier 1 draws every pass live: each face is an open window with no still and no fill", async () => {
    await mount();
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "halftone",
    });
    expect(liveFaces()).toEqual([...PASSES]);
    for (const pass of PASSES) {
      const face = faceOf(container, pass);
      expect(face?.querySelector("img")).toBeNull();
      expect(classesOf(face)).not.toContain("bg-surface");
    }
  });

  it("REQ-ENG-09 tier 2 draws fewer passes: velocity keeps its still, the rest are live", async () => {
    await mount();
    await report({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
    await report({
      type: "ready",
      tier: 2,
      particles: 250_000,
      look: "halftone",
    });
    expect(liveFaces()).toEqual([...LIVE_PASSES[2]]);
    expect(
      faceOf(container, "velocity")?.querySelector("img")?.getAttribute("src"),
    ).toBe(PASS_STILLS.velocity);
  });

  it("REQ-ENG-09 A14 on the soft look, which has no passes, every card shows its still", async () => {
    await mount();
    await report({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
    await report({ type: "ready", tier: 2, particles: 250_000, look: "soft" });
    expect(liveFaces()).toEqual([]);
    expect(container.querySelectorAll("[data-pass-face] img")).toHaveLength(
      PASSES.length,
    );
  });

  it("REQ-ENG-09 REQ-ENG-08 tier 3, and a tier lost to a failure, show only stills", async () => {
    await mount();
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "halftone",
    });
    await report({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(liveFaces()).toEqual([]);
    await report({ type: "ready", tier: 3, particles: 0 });
    expect(liveFaces()).toEqual([]);
    expect(container.querySelectorAll("[data-pass-face] img")).toHaveLength(
      PASSES.length,
    );
  });

  it("REQ-A11Y-03 REQ-A11Y-04 in calm the cards keep their places and their windows, which the still field fills", async () => {
    await mount();
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "halftone",
    });
    const look = () =>
      cards(container).map((button) => [
        button.dataset.pass,
        button.getAttribute("class"),
        button.querySelector("[data-pass-face]")?.getAttribute("class"),
      ]);
    const before = look();
    await act(async () => {
      calmStore.setChosen(true);
    });
    expect(liveFaces()).toEqual([...PASSES]);
    expect(look()).toEqual(before);
  });

  it("REQ-ENG-08 a still that fails to load is removed, and the card keeps its own fill", async () => {
    await mount();
    const image = faceOf(container, "glow")?.querySelector("img");
    await act(async () => {
      image?.dispatchEvent(new Event("error"));
    });
    expect(faceOf(container, "glow")?.querySelector("img")).toBeNull();
    expect(classesOf(faceOf(container, "glow"))).toContain("bg-surface");
    expect(faceOf(container, "density")?.querySelector("img")).not.toBeNull();
  });
});

describe("colour", () => {
  // Every text and background pairing the viewer draws, with the ratio
  // WCAG 2.2 asks of it. The labels under the cards sit on the page over
  // the field, behind their plates; the headed contrast run measures those.
  const PAIRS: ReadonlyArray<[ColorName, ColorName, number, string]> = [
    ["violet", "surface", 4.5, "Pass 2 of 5"],
    ["text", "surface", 4.5, "the pass name, the link, the tier values"],
    ["muted", "surface", 4.5, "the breakdown, the tier names"],
    ["glow", "surface", 4.5, "the link's arrow"],
    ["muted", "void", 4.5, "a card's label"],
    ["glow", "void", 4.5, "the chosen card's label"],
    ["text", "void", 4.5, "a card's label on hover"],
  ];

  it.each(PAIRS)(
    "REQ-A11Y-06 %s on %s meets %d to 1 (%s)",
    (foreground, background, needs) => {
      expect(
        contrastRatio(colors[foreground], colors[background]),
      ).toBeGreaterThanOrEqual(needs);
    },
  );

  it("REQ-A11Y-06 the viewer's colours come from the tokens only", () => {
    const viewer = render().querySelector("[data-pass-viewer]")!;
    // Each class without its variants, then the colour of every text,
    // background, border and ring utility; sizes, sides and alignments are
    // not colours.
    const NOT_COLOURS = new Set(["base", "sm", "xs", "start", "center", "b"]);
    const colourNames = allClasses(viewer)
      .split(/\s+/)
      .map((name) => name.slice(name.lastIndexOf(":") + 1))
      .flatMap((name) => {
        const match =
          /^(?:text|bg|border|inset-ring)-([a-z-]+)(?:\/\d+)?$/.exec(name);
        return match?.[1] && !NOT_COLOURS.has(match[1]) ? [match[1]] : [];
      });
    expect(colourNames).toEqual(
      expect.arrayContaining(["surface", "glow", "violet", "muted", "text"]),
    );
    for (const name of colourNames) {
      expect(name === "transparent" || name in colors).toBe(true);
    }
  });
});
