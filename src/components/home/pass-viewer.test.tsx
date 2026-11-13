import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FACE_CORNERS } from "@/components/story/pass-face";
import { passPosition, passViewer } from "@/content/passes";
import { pages } from "@/content/pages";
import { story } from "@/content/story";
import { LIVE_PASSES, PASSES, type PassId } from "@/engine/story";
import type { EngineEvent } from "@/engine/types";
import { calmStore } from "@/lib/calm-store";
import { tierStore } from "@/lib/tier-store";
import { wheelSteps } from "@/lib/wheel-steps";
import { colors, type ColorName } from "@/tokens/colors";
import { contrastRatio } from "@/tokens/contrast";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { MakingOfSection } from "./making-of-section";
import {
  restProgress,
  SETTLE_DELAY_MS,
  SLIDE_MOVE,
  SLIDE_MOVED,
  SLIDE_REST,
  SLIDE_ROOM,
  SLIDE_SCREENS,
  slideAt,
  STRETCH_SCREENS,
} from "./pass-slide";
import { PASS_STILLS } from "./pass-stills";
import { isPassLive, PASS_STRETCH, PassViewer } from "./pass-viewer";

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

/** A height set on an element itself: a minimum or a fixed one, at any width. */
function heightClasses(element: Element | null | undefined) {
  return classesOf(element).filter((name) => /(?:^|:)(?:min-h|h)-/.test(name));
}

function items(host: ParentNode) {
  return [...host.querySelectorAll<HTMLLIElement>("li[data-pass]")];
}

function faceOf(host: ParentNode, pass: PassId) {
  return host.querySelector<HTMLElement>(`[data-pass-face="${pass}"]`);
}

function part(host: ParentNode, name: string) {
  return host.querySelector<HTMLElement>(`[data-part="${name}"]`);
}

describe("the pass viewer in the static HTML", () => {
  it("REQ-ENG-09 REQ-CNT-01 a still grid of the five cards in the frame's order, each with its place, name and breakdown on its own surface", () => {
    const host = render();
    const list = host.querySelector("[data-pass-viewer] ol");
    expect(list?.getAttribute("aria-label")).toBe(passViewer.group);
    expect(classesOf(list)).toEqual(
      expect.arrayContaining(["grid", "sm:grid-cols-2", "lg:grid-cols-3"]),
    );
    expect(items(host).map((item) => item.dataset.pass)).toEqual([...PASSES]);

    for (const item of items(host)) {
      expect(item.parentElement).toBe(list);
      const pass = item.dataset.pass as PassId;
      const copy = passViewer.passes[pass];
      // Its own panel, not the veil's plates, which cannot follow a card.
      const plate = item.querySelector('[data-plate="own"]');
      expect(classesOf(plate?.parentElement)).toEqual(
        expect.arrayContaining(["rounded-2xl", "border", "bg-surface"]),
      );
      const [label, ...body] = [...(plate?.querySelectorAll("p") ?? [])];
      expect(label?.textContent).toBe(passPosition(pass));
      expect(classesOf(label)).toEqual(
        expect.arrayContaining(["font-mono", "uppercase", "text-violet"]),
      );
      const title = plate?.querySelector("h3");
      expect(title?.textContent).toBe(copy.title);
      expect(classesOf(title)).toContain("font-display");
      expect(body.map((paragraph) => paragraph.textContent)).toEqual([
        ...copy.body,
      ]);
      // Nothing in the grid is hidden from assistive technology: the still's
      // alt text is read with the card.
      expect(item.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    }
    expect(passPosition("velocity")).toBe("Pass 2 of 5");
  });

  it("REQ-CNT-01 REQ-SCR-02 before any script nothing slides: no stretch, held screen or rail, no buttons, and no card dimmed, marked or live", () => {
    const host = render();
    const viewer = host.querySelector("[data-pass-viewer]")!;
    expect(viewer.hasAttribute("data-sliding")).toBe(false);
    for (const name of ["pass-stretch", "pass-screen", "pass-rail"]) {
      expect(part(host, name), name).toBeNull();
    }
    expect(viewer.querySelectorAll("button")).toHaveLength(0);
    expect(
      viewer.querySelectorAll("[aria-current], [data-middle], [data-live]"),
    ).toHaveLength(0);
    expect(viewer.querySelectorAll("[aria-live]")).toHaveLength(0);
    const classes = allClasses(viewer);
    expect(classes).not.toMatch(
      /\bopacity-35\b|\bborder-glow\b|\bsticky\b|--pass-at/,
    );
    for (const pass of PASSES) {
      expect(classesOf(faceOf(host, pass)?.parentElement)).toContain(
        "shrink-0",
      );
      expect(faceOf(host, pass)?.parentElement?.tagName).toBe("SPAN");
    }
  });

  it("REQ-A11Y-05 REQ-CNT-01 every face shows its still of the pass on the T7 mark, whose alt text says what it shows and is read", () => {
    const host = render();
    for (const pass of PASSES) {
      const face = faceOf(host, pass);
      expect(face?.closest('[aria-hidden="true"]')).toBeNull();
      expect(face?.hasAttribute("data-live")).toBe(false);
      expect(classesOf(face)).toContain("bg-surface");
      const image = face?.querySelector("img");
      expect(image?.dataset.part).toBe("pass-still");
      expect(image?.getAttribute("src")).toBe(PASS_STILLS[pass]);
      expect(image?.getAttribute("alt")).toBe(passViewer.passes[pass].shows);
      expect(image?.getAttribute("alt")).toContain("T7 mark");
      expect(image?.getAttribute("loading")).toBe("lazy");
      // Shown at once: a still in the static HTML is never left at opacity 0.
      expect(classesOf(image)).not.toContain("opacity-0");
    }
    expect(Object.keys(PASS_STILLS)).toEqual([...PASSES]);
    for (const [pass, src] of Object.entries(PASS_STILLS)) {
      expect(src).toBe(`/still/pass-${pass}.webp`);
    }
  });

  it("REQ-ENG-09 in the still grid each face is a 4:5 portrait, about a third of the screen high and at most 260 px at every width, with a hairline border, above its words", () => {
    const host = render();
    for (const pass of PASSES) {
      const face = classesOf(faceOf(host, pass));
      expect(face).toEqual(
        expect.arrayContaining([
          "aspect-[4/5]",
          "h-[32svh]",
          "max-h-65",
          "rounded-xl",
          "border",
          "border-edge/40",
        ]),
      );
      // Three columns from 1024 px leave no room for the large face, or for
      // words beside it.
      expect(face.filter((name) => name.startsWith("lg:"))).toEqual([]);
      const item = faceOf(host, pass)?.closest("li");
      expect(classesOf(item)).toEqual(
        expect.arrayContaining(["flex", "flex-col", "items-center"]),
      );
      expect(allClasses(item!)).not.toMatch(/lg:flex-row|lg:flex-1|lg:max-w-/);
      expect(
        classesOf(item?.querySelector("[data-plate]")?.parentElement),
      ).toContain("w-full");
    }
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

  it("REQ-I18N-01 the still grid uses logical properties only", () => {
    expect(findPhysicalClasses(allClasses(render()))).toEqual([]);
  });

  it("REQ-SCR-01 REQ-A11Y-05 the chapter itself sets no height, and holds its label, revealed title, intro and scene line before the viewer", () => {
    const section = render().querySelector("section");
    expect(section?.dataset.chapter).toBe("making-of");
    expect(heightClasses(section)).toEqual([]);
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
  const middle = { isSliding: true, holdsMark: true };

  it("REQ-ENG-09 A14 only the middle card of a sliding row can be live: a still grid and every other card show their stills", () => {
    for (const pass of PASSES) {
      for (const place of [
        { isSliding: false, holdsMark: false },
        { isSliding: false, holdsMark: true },
        { isSliding: true, holdsMark: false },
      ]) {
        expect(isPassLive(pass, snapshot(1), place)).toBe(false);
        expect(isPassLive(pass, snapshot(2), place)).toBe(false);
      }
      expect(isPassLive(pass, snapshot(1), middle)).toBe(true);
    }
  });

  it("REQ-ENG-09 A14 the middle card is live only on a drawn tier 1 or 2 halftone field, for a pass its tier draws", () => {
    for (const pass of PASSES) {
      expect(isPassLive(pass, snapshot(null, false, null), middle)).toBe(false);
      expect(isPassLive(pass, snapshot(1, false, null), middle)).toBe(false);
      expect(isPassLive(pass, snapshot(1), middle)).toBe(true);
      expect(isPassLive(pass, snapshot(2), middle)).toBe(
        LIVE_PASSES[2].includes(pass),
      );
      expect(isPassLive(pass, snapshot(3), middle)).toBe(false);
      // The soft look has no passes, so every card shows its still.
      expect(isPassLive(pass, snapshot(1, true, "soft"), middle)).toBe(false);
      expect(isPassLive(pass, snapshot(2, true, "soft"), middle)).toBe(false);
      expect(isPassLive(pass, snapshot(1, true, null), middle)).toBe(false);
    }
    expect(isPassLive("velocity", snapshot(2), middle)).toBe(false);
  });
});

describe("the pass viewer, running", () => {
  // jsdom lays nothing out, so the stretch's box is set by hand on a window
  // 800 px high; every other element has no size.
  const HEIGHT = 800;
  const TRAVEL = STRETCH_SCREENS * HEIGHT - HEIGHT;
  const REDUCE = "(prefers-reduced-motion: reduce)";

  let container: HTMLDivElement;
  let root: Root | null = null;
  let frames: Map<number, FrameRequestCallback>;
  let lastFrame: number;
  let stretchBox: { top: number; height: number };
  let isReduced: boolean;
  let hasRoom: boolean;
  let roomListeners: Set<() => void>;
  let scrollTo: ReturnType<typeof vi.fn>;
  let cancelFrame: ReturnType<typeof vi.fn>;

  function box({ top, height }: { top: number; height: number }) {
    return {
      top,
      bottom: top + height,
      left: 0,
      right: 1280,
      width: 1280,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /** The stretch laid out with its top where the screen shows it now. */
  function layOut(top = 0) {
    stretchBox = { top, height: STRETCH_SCREENS * HEIGHT };
  }

  async function report(event: EngineEvent) {
    await act(async () => {
      tierStore.apply(event);
    });
  }

  async function ready(tier: 1 | 2, look: "halftone" | "soft" = "halftone") {
    await report({
      type: "tierChosen",
      tier,
      reason: tier === 1 ? "probe-pass" : "no-webgpu",
    });
    await report({ type: "ready", tier, particles: 250_000, look });
  }

  async function mount() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<PassViewer />);
    });
  }

  /** Runs the animation frames asked for so far. */
  async function runFrames() {
    await act(async () => {
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback(performance.now());
    });
  }

  /** Scrolls the page to a progress through the slide and runs its frame. */
  async function scrollAt(progress: number) {
    stretchBox = { ...stretchBox, top: -progress * TRAVEL };
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    await runFrames();
  }

  function track() {
    return part(container, "pass-screen")?.querySelector("ol") ?? null;
  }

  function place() {
    return Number(track()?.style.getPropertyValue("--pass-at"));
  }

  function button(pass: PassId) {
    return faceOf(container, pass)!.closest("button")!;
  }

  function current() {
    return items(container)
      .filter((item) => item.hasAttribute("aria-current"))
      .map((item) => [item.dataset.pass, item.getAttribute("aria-current")]);
  }

  function marked() {
    return [
      ...container.querySelectorAll<HTMLElement>(
        "[data-pass-face][data-middle]",
      ),
    ].map((face) => face.dataset.passFace);
  }

  function liveFaces() {
    return [
      ...container.querySelectorAll<HTMLElement>("[data-pass-face][data-live]"),
    ].map((face) => face.dataset.passFace);
  }

  function litTicks() {
    return [...(part(container, "pass-rail")?.children ?? [])].flatMap(
      (tick, index) => (classesOf(tick).includes("bg-glow") ? [index] : []),
    );
  }

  /** Where a click or Tab on a card takes the page. */
  function restTop(pass: PassId, scrollY: number) {
    return (
      scrollY +
      stretchBox.top +
      restProgress(PASSES.indexOf(pass)) * (stretchBox.height - HEIGHT)
    );
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("innerHeight", HEIGHT);
    vi.stubGlobal("scrollY", 0);
    frames = new Map();
    lastFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      lastFrame += 1;
      frames.set(lastFrame, callback);
      return lastFrame;
    });
    cancelFrame = vi.fn((id: number) => {
      frames.delete(id);
    });
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    isReduced = false;
    hasRoom = true;
    roomListeners = new Set();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === SLIDE_ROOM ? hasRoom : query === REDUCE && isReduced,
      media: query,
      addEventListener: (_type: string, listener: () => void) => {
        if (query === SLIDE_ROOM) roomListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        if (query === SLIDE_ROOM) roomListeners.delete(listener);
      },
    }));
    // The settle waits on a timer (D-131); only the tests that move it on
    // let it run.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // Not laid out until a test says so.
    stretchBox = { top: 0, height: 0 };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        return this instanceof HTMLElement &&
          this.dataset.part === "pass-stretch"
          ? box(stretchBox)
          : box({ top: 0, height: 0 });
      },
    );
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container.remove();
    tierStore.reset();
    calmStore.setChosen(false);
    vi.useRealTimers();
    wheelSteps.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** The progress at which the row has glided a share of the way from a card. */
  function glideAt(card: number, share: number) {
    return (
      (card * (SLIDE_REST + SLIDE_MOVE) + SLIDE_REST + share * SLIDE_MOVE) /
      SLIDE_SCREENS
    );
  }

  /** Lets the settle's wait run out. */
  async function waitOut() {
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_DELAY_MS);
    });
  }

  function hold(type: string, fields: Record<string, unknown>) {
    const event = new Event(type);
    for (const [key, value] of Object.entries(fields)) {
      Object.defineProperty(event, key, { value });
    }
    window.dispatchEvent(event);
  }

  it("REQ-SCR-02 once the scroll stops between two cards, the page glides on to the next card in the scroll's direction", async () => {
    layOut();
    await mount();
    await scrollAt(restProgress(1));
    await scrollAt(glideAt(1, 0.3));
    expect(slideAt(glideAt(1, 0.3))).toBeGreaterThan(1);
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_DELAY_MS - 1);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: restTop("density", 0),
      behavior: "smooth",
    });

    // Up from the fourth card the page settles on the third.
    scrollTo.mockClear();
    await scrollAt(restProgress(3));
    await scrollAt(glideAt(2, 0.6));
    await waitOut();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: restTop("density", 0),
      behavior: "smooth",
    });
  });

  it("REQ-SCR-02 a nudge too small to leave the card settles back on it; a scroll that goes on restarts the wait; at rest nothing moves", async () => {
    layOut();
    await mount();
    await scrollAt(restProgress(1));
    await scrollAt(glideAt(1, 0.05));
    await waitOut();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: restTop("velocity", 0),
      behavior: "smooth",
    });

    scrollTo.mockClear();
    await scrollAt(glideAt(1, 0.3));
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_DELAY_MS - 20);
    });
    await scrollAt(glideAt(1, 0.5));
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_DELAY_MS - 20);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    await waitOut();
    expect(scrollTo).toHaveBeenCalledTimes(1);

    scrollTo.mockClear();
    await scrollAt(restProgress(2));
    await waitOut();
    await scrollAt(0);
    await waitOut();
    await scrollAt(1.2);
    await waitOut();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("REQ-SCR-02 a finger on the screen or a pressed mouse holds the page; letting go settles it", async () => {
    layOut();
    await mount();
    await scrollAt(restProgress(0));
    hold("touchstart", { touches: { length: 1 } });
    await scrollAt(glideAt(0, 0.4));
    await waitOut();
    await waitOut();
    expect(scrollTo).not.toHaveBeenCalled();
    hold("touchend", { touches: { length: 0 } });
    await waitOut();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: restTop("velocity", 0),
      behavior: "smooth",
    });

    scrollTo.mockClear();
    await scrollAt(restProgress(2));
    hold("pointerdown", { pointerType: "mouse" });
    await scrollAt(glideAt(2, 0.4));
    await waitOut();
    expect(scrollTo).not.toHaveBeenCalled();
    hold("pointerup", { pointerType: "mouse" });
    await waitOut();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: restTop("glow", 0),
      behavior: "smooth",
    });
  });

  it("REQ-A11Y-03 in calm the grid never settles anything", async () => {
    calmStore.setChosen(true);
    layOut();
    await mount();
    await scrollAt(glideAt(1, 0.4));
    await waitOut();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("REQ-CNT-01 REQ-SCR-02 the static HTML takes over as the still grid with no mismatch, then becomes the sliding row once the script runs", async () => {
    container = document.createElement("div");
    container.innerHTML = renderToString(<PassViewer />);
    document.body.append(container);
    expect(part(container, "pass-stretch")).toBeNull();
    expect(container.querySelector("ol")?.className).toContain("grid");
    const onRecoverableError = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      root = hydrateRoot(container, <PassViewer />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(
      container
        .querySelector("[data-pass-viewer]")
        ?.hasAttribute("data-sliding"),
    ).toBe(true);
    expect(part(container, "pass-stretch")).not.toBeNull();
    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("button")).toHaveLength(PASSES.length);
  });

  it("REQ-ENG-09 REQ-SCR-02 the row is held in a sticky screen inside a stretch STRETCH_SCREENS screens tall, which clips sideways and never scrolls sideways", async () => {
    await mount();
    expect(PASS_STRETCH.screens).toBe(STRETCH_SCREENS);
    expect(Math.abs(STRETCH_SCREENS * 100 - 189)).toBeLessThan(1e-9);
    expect(PASS_STRETCH.className).toBe(
      `h-[${Math.round(STRETCH_SCREENS * 100)}svh]`,
    );

    const viewer = container.querySelector("[data-pass-viewer]")!;
    expect(viewer.hasAttribute("data-sliding")).toBe(true);
    const stretch = part(container, "pass-stretch");
    expect(stretch?.parentElement).toBe(viewer);
    expect(heightClasses(stretch)).toEqual([PASS_STRETCH.className]);
    expect(classesOf(stretch)).toContain("relative");

    const screen = part(container, "pass-screen");
    expect(screen?.parentElement).toBe(stretch);
    expect(classesOf(screen)).toEqual(
      expect.arrayContaining([
        "sticky",
        "top-0",
        "h-svh",
        "overflow-x-clip",
        "flex",
        "flex-col",
        "justify-center-safe",
      ]),
    );
    expect(track()?.parentElement).toBe(screen);
    expect(track()?.nextElementSibling).toBe(part(container, "pass-rail"));

    // No scrollbar and no snap points of its own: the page's own scroll
    // moves the row.
    expect(allClasses(viewer)).not.toMatch(
      /\boverflow-(?:x-)?(?:auto|scroll)\b|\bsnap-/,
    );
    expect(container.querySelector('[data-part="pass-snap"]')).toBeNull();
  });

  /** Puts the page at a scroll position, the stretch where it then shows. */
  function placeAt(y: number) {
    vi.stubGlobal("scrollY", y);
    stretchBox = { ...stretchBox, top: -y };
  }

  /** Where a card rests, as a page position, with the stretch from 0. */
  function restAt(index: number) {
    return restProgress(index) * TRAVEL;
  }

  /** Puts the page at a position and lets its scroll come to rest. */
  async function stopAt(y: number) {
    placeAt(y);
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    await waitOut();
    scrollTo.mockClear();
  }

  function key(
    name: string,
    init: KeyboardEventInit = {},
    target: EventTarget = document.body,
  ) {
    const event = new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  }

  it("REQ-SCR-02 REQ-A11Y-02 a scroll key in the slide glides a card, a second key on from where the first is heading; at an end, or on a button, the key does as ever", async () => {
    layOut();
    await mount();
    placeAt(restAt(1));
    const down = key("ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(2),
      behavior: "smooth",
    });
    key("PageDown");
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(3),
      behavior: "smooth",
    });
    // Once the keys' glide has come to rest the next key goes from the page.
    await stopAt(restAt(3));
    key(" ", { shiftKey: true });
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(2),
      behavior: "smooth",
    });
    key("PageUp");
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(1),
      behavior: "smooth",
    });

    // On the last card a key down leaves the slide as ever.
    await stopAt(restAt(PASSES.length - 1));
    expect(key("ArrowDown").defaultPrevented).toBe(false);
    expect(key("ArrowUp").defaultPrevented).toBe(true);
    // Space presses a focused button; Ctrl with an arrow, and Home, are
    // the browser's.
    await stopAt(restAt(2));
    expect(key(" ", {}, button("density")).defaultPrevented).toBe(false);
    expect(key("ArrowDown", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key("Home").defaultPrevented).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    // Away from the slide nothing is taken.
    await stopAt(-2_000);
    expect(key("ArrowDown").defaultPrevented).toBe(false);
  });

  /** Sends a touch event to the stretch with these fingers' heights. */
  function finger(type: string, ...ys: number[]) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", {
      value: ys.map((clientY) => ({ clientX: 100, clientY })),
    });
    part(container, "pass-stretch")?.dispatchEvent(event);
    return event;
  }

  it("REQ-SCR-02 a swipe in the slide moves the page with the finger and, when it lifts, glides a card its way; a touch goes back", async () => {
    layOut();
    await mount();
    placeAt(restAt(1));
    finger("touchstart", 500);
    const move = finger("touchmove", 470);
    expect(move.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(1) + 30,
      behavior: "instant",
    });
    finger("touchend");
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(2),
      behavior: "smooth",
    });

    // Up the screen is up the page: the card before.
    placeAt(restAt(2));
    finger("touchstart", 300);
    finger("touchmove", 320);
    finger("touchend");
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(1),
      behavior: "smooth",
    });

    // A touch that moves less than SWIPE_PX goes back to its card.
    placeAt(restAt(2));
    finger("touchstart", 500);
    finger("touchmove", 495);
    finger("touchend");
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(2),
      behavior: "smooth",
    });

    // A long swipe crosses a card for each card's length.
    const span = restAt(1) - restAt(0);
    placeAt(restAt(1));
    finger("touchstart", 600);
    finger("touchmove", 600 - span * 2.2);
    finger("touchend");
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(3),
      behavior: "smooth",
    });
  });

  it("REQ-SCR-02 a swipe off the slide's end, a second finger and a swipe from away are the browser's", async () => {
    layOut();
    await mount();
    // Up the page from the first card: no card that way.
    placeAt(restAt(0));
    finger("touchstart", 300);
    expect(finger("touchmove", 340).defaultPrevented).toBe(false);
    finger("touchend");
    expect(scrollTo).not.toHaveBeenCalled();

    // A second finger ends the row's swipe as a lift does.
    placeAt(restAt(1));
    finger("touchstart", 500);
    finger("touchmove", 480);
    scrollTo.mockClear();
    finger("touchstart", 480, 300);
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: restAt(2),
      behavior: "smooth",
    });
    expect(finger("touchmove", 470, 290).defaultPrevented).toBe(false);

    // Away from the slide nothing is taken.
    scrollTo.mockClear();
    placeAt(-2_000);
    finger("touchstart", 500);
    expect(finger("touchmove", 400).defaultPrevented).toBe(false);
    finger("touchend");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("REQ-SCR-02 while the row slides a wheel notch from a card's rest sends the page to the next card's rest; calm and unmounting take the step away", async () => {
    layOut();
    await mount();
    const at = (index: number) => restTop(PASSES[index] as PassId, 0);
    // A turn of the wheel each, a second apart.
    const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
    expect(wheelSteps.target(at(1), 100)).toBeCloseTo(at(2), 6);
    now.mockReturnValue(11_000);
    expect(wheelSteps.target(at(1), -100)).toBeCloseTo(at(0), 6);

    await act(async () => {
      calmStore.setChosen(true);
    });
    expect(wheelSteps.target(at(1), 100)).toBeNull();
    await act(async () => {
      calmStore.setChosen(false);
    });
    layOut();
    expect(wheelSteps.target(at(1) + 1_000_000, 100)).toBeNull();
    await act(async () => {
      root?.unmount();
    });
    root = null;
    expect(wheelSteps.target(at(1), 100)).toBeNull();
  });

  it("REQ-ENG-09 REQ-I18N-01 the track moves by --pass-at card widths, the other way right to left, with the first card centred", async () => {
    await mount();
    const list = track();
    expect(list?.getAttribute("aria-label")).toBe(passViewer.group);
    expect(classesOf(list)).toEqual(
      expect.arrayContaining([
        "flex",
        "items-center",
        "gap-(--pass-gap)",
        "[--pass-w:min(84vw,24rem)]",
        "lg:[--pass-w:min(84vw,52rem)]",
        "ps-[calc((100%-var(--pass-w))/2)]",
        "pe-[calc((100%-var(--pass-w))/2)]",
        "[transform:translateX(calc(var(--pass-at,0)*(var(--pass-w)+var(--pass-gap))*-1))]",
        "rtl:[transform:translateX(calc(var(--pass-at,0)*(var(--pass-w)+var(--pass-gap))))]",
      ]),
    );
    expect(items(container).map((item) => item.dataset.pass)).toEqual([
      ...PASSES,
    ]);
    for (const item of items(container)) {
      expect(item.parentElement).toBe(list);
      expect(classesOf(item)).toEqual(
        expect.arrayContaining(["w-(--pass-w)", "shrink-0"]),
      );
    }
    expect(findPhysicalClasses(allClasses(container))).toEqual([]);
  });

  it("REQ-A11Y-02 REQ-A11Y-05 each face is a button named by its place and pass and described by what its picture shows; the middle card is the current step", async () => {
    await mount();
    for (const pass of PASSES) {
      const face = faceOf(container, pass)!;
      const control = button(pass);
      expect(face.parentElement).toBe(control);
      expect(face.getAttribute("aria-hidden")).toBe("true");
      expect(control.getAttribute("type")).toBe("button");
      expect(control.getAttribute("aria-label")).toBe(
        `${passPosition(pass)}: ${passViewer.passes[pass].title}`,
      );
      const id = control.getAttribute("aria-describedby") ?? "";
      const description = container.querySelector(`[id="${id}"]`);
      expect(description?.textContent).toBe(passViewer.passes[pass].shows);
      expect(description?.closest("[hidden]")).not.toBeNull();
    }
    expect(button("glow").getAttribute("aria-label")).toBe("Pass 4 of 5: Glow");

    // Before any scroll the first card rests in the middle.
    expect(current()).toEqual([["points", "step"]]);
    expect(marked()).toEqual(["points"]);
    // Nothing is announced as the row slides: the current step is enough.
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(0);
  });

  it("REQ-ENG-09 REQ-A11Y-06 the middle card has the lavender border and glow; the others keep the hairline and their faces are dimmed, while every card's words keep their full colour", async () => {
    await mount();
    for (const item of items(container)) {
      const pass = item.dataset.pass as PassId;
      const isMiddle = pass === "points";
      const face = classesOf(faceOf(container, pass));
      expect(face.includes("border-glow"), pass).toBe(isMiddle);
      expect(
        face.some((name) => name.startsWith("shadow-[0_0_40px")),
        pass,
      ).toBe(isMiddle);
      expect(face.includes("border-edge/40"), pass).toBe(!isMiddle);
      expect(face.includes("opacity-35"), pass).toBe(!isMiddle);
      expect(face).toContain("motion-reduce:transition-none");
      // Nothing round the words is see-through, so their contrast holds,
      // and the button keeps its focus ring at full strength.
      const elsewhere = [item, ...item.querySelectorAll("[class]")]
        .filter((element) => element !== faceOf(container, pass))
        .flatMap((element) => classesOf(element));
      expect(
        elsewhere.filter((name) => /(?:^|:)opacity-/.test(name)),
        pass,
      ).toEqual([]);
    }
  });

  it("REQ-ENG-09 in the sliding row each face is up to 25rem high from 1024 px, beside its words, and as on phones below it", async () => {
    await mount();
    for (const item of items(container)) {
      const pass = item.dataset.pass as PassId;
      expect(classesOf(faceOf(container, pass))).toEqual(
        expect.arrayContaining([
          "aspect-[4/5]",
          "h-[32svh]",
          "max-h-65",
          "lg:h-[min(52svh,25rem)]",
          "lg:max-h-none",
        ]),
      );
      expect(classesOf(item)).toEqual(
        expect.arrayContaining([
          "flex-col",
          "lg:flex-row",
          "lg:items-center",
          "lg:gap-10",
        ]),
      );
      expect(
        classesOf(item.querySelector("[data-plate]")?.parentElement),
      ).toEqual(expect.arrayContaining(["lg:max-w-[28rem]", "lg:flex-1"]));
    }
  });

  it("REQ-ENG-09 REQ-A11Y-01 a screen too short for a whole card keeps the still grid, and the row comes and goes as the screen crosses the line", async () => {
    hasRoom = false;
    await mount();
    const viewer = () => container.querySelector("[data-pass-viewer]")!;
    expect(viewer().hasAttribute("data-sliding")).toBe(false);
    expect(part(container, "pass-stretch")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(marked()).toEqual([]);
    expect(roomListeners.size).toBe(1);

    hasRoom = true;
    await act(async () => {
      for (const listener of roomListeners) listener();
    });
    expect(viewer().hasAttribute("data-sliding")).toBe(true);
    expect(marked()).toEqual(["points"]);

    hasRoom = false;
    await act(async () => {
      for (const listener of roomListeners) listener();
    });
    expect(viewer().hasAttribute("data-sliding")).toBe(false);
    expect(container.querySelectorAll("button")).toHaveLength(0);

    // Every query names its sizes in rem, so larger text asks for more room.
    for (const size of SLIDE_ROOM.matchAll(/\d+(?:\.\d+)?(\w+)/g)) {
      expect(size[1]).toBe("rem");
    }
  });

  it("REQ-ENG-09 REQ-SCR-02 the row's place follows the page's scroll: --pass-at is slideAt of the progress through the stretch, and the middle card follows", async () => {
    await mount();
    layOut();
    await scrollAt(restProgress(2));
    expect(place()).toBe(2);
    expect(current()).toEqual([["density", "step"]]);
    expect(marked()).toEqual(["density"]);
    expect(litTicks()).toEqual([2]);

    // A quarter of the way through the glide from the first card to the
    // second, the row is between them, nearer the first.
    const early = (SLIDE_REST + SLIDE_MOVE / 4) / SLIDE_SCREENS;
    await scrollAt(early);
    expect(place()).toBeCloseTo(slideAt(early), 9);
    expect(place()).toBeGreaterThan(0);
    expect(place()).toBeLessThan(0.5);
    expect(marked()).toEqual(["points"]);
    const late = (SLIDE_REST + (3 * SLIDE_MOVE) / 4) / SLIDE_SCREENS;
    await scrollAt(late);
    expect(place()).toBeCloseTo(slideAt(late), 9);
    expect(place()).toBeGreaterThan(0.5);
    expect(marked()).toEqual(["velocity"]);
    expect(litTicks()).toEqual([1]);

    // Above the stretch the first card, past it the last.
    await scrollAt(-0.4);
    expect(place()).toBe(0);
    expect(current()).toEqual([["points", "step"]]);
    await scrollAt(1.3);
    expect(place()).toBe(PASSES.length - 1);
    expect(current()).toEqual([["final", "step"]]);
    expect(litTicks()).toEqual([PASSES.length - 1]);
  });

  it("REQ-SCR-02 a page opened part way down the slide shows its card at once, and a burst of scroll or resize events is read once a frame", async () => {
    layOut(-restProgress(3) * TRAVEL);
    await mount();
    expect(place()).toBe(3);
    expect(marked()).toEqual(["glow"]);
    expect(frames.size).toBe(0);

    stretchBox = { ...stretchBox, top: -restProgress(4) * TRAVEL };
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(frames.size).toBe(1);
    // Nothing moves until the frame runs.
    expect(place()).toBe(3);
    await runFrames();
    expect(place()).toBe(4);
    expect(marked()).toEqual(["final"]);
  });

  it("REQ-ENG-09 a rail of five ticks under the row, hidden from assistive technology, lights the middle card's", async () => {
    await mount();
    const rail = part(container, "pass-rail");
    expect(rail?.getAttribute("aria-hidden")).toBe("true");
    expect(rail?.children).toHaveLength(PASSES.length);
    expect(rail?.textContent).toBe("");
    expect(litTicks()).toEqual([0]);
    for (const [index, tick] of [...(rail?.children ?? [])].entries()) {
      expect(classesOf(tick)).toContain(index === 0 ? "bg-glow" : "bg-edge/50");
    }
    layOut();
    await scrollAt(restProgress(3));
    expect(litTicks()).toEqual([3]);
  });

  it("REQ-ENG-09 A14 at rest only the middle card's face is live: tier 1 draws whichever pass is there, and the faces beside it are empty frames open to the field", async () => {
    await mount();
    layOut();
    await ready(1);
    expect(liveFaces()).toEqual(["points"]);
    const live = faceOf(container, "points");
    expect(live?.hasAttribute("data-middle")).toBe(true);
    expect(live?.querySelector("img")).toBeNull();
    expect(classesOf(live)).not.toContain("bg-surface");
    // The particles are in the middle card only, so the others keep
    // nothing of them: an empty frame, open to the field drawn live, so
    // particles streaming past show through it.
    for (const pass of PASSES.slice(1)) {
      const face = faceOf(container, pass);
      expect(face?.querySelector("img")).toBeNull();
      expect(classesOf(face)).not.toContain("bg-surface");
    }

    for (const pass of PASSES) {
      await scrollAt(restProgress(PASSES.indexOf(pass)));
      expect(liveFaces()).toEqual([pass]);
      expect(marked()).toEqual([pass]);
    }
    // The card that left the middle is an empty frame again.
    expect(faceOf(container, "points")?.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("[data-pass-face] img")).toHaveLength(0);
  });

  it("REQ-ENG-09 while the row glides, the card the mark streams from and the card it streams to are both live, and at rest only the middle one", async () => {
    await mount();
    layOut();
    await ready(1);
    // A quarter of the way from points to velocity: points is the middle,
    // velocity the card the mark streams to.
    const early = (SLIDE_REST + SLIDE_MOVE / 4) / SLIDE_SCREENS;
    await scrollAt(early);
    expect(marked()).toEqual(["points"]);
    expect(liveFaces()).toEqual(["points", "velocity"]);
    // Three quarters: velocity is the middle, points the card it left.
    const late = (SLIDE_REST + (3 * SLIDE_MOVE) / 4) / SLIDE_SCREENS;
    await scrollAt(late);
    expect(marked()).toEqual(["velocity"]);
    expect(liveFaces()).toEqual(["points", "velocity"]);
    // Neither shows a still while live; the rest are open frames.
    expect(container.querySelectorAll("[data-pass-face] img")).toHaveLength(0);
    await scrollAt(restProgress(1));
    expect(liveFaces()).toEqual(["velocity"]);

    // On tier 2 velocity is never live: gliding from velocity to density,
    // only density is, and velocity shows its still while it is the middle.
    await ready(2);
    const toDensity = (restProgress(1) + restProgress(2)) / 2;
    await scrollAt(toDensity - 0.01);
    expect(marked()).toEqual(["velocity"]);
    expect(liveFaces()).toEqual(["density"]);
    expect(
      faceOf(container, "velocity")?.querySelector("img")?.getAttribute("src"),
    ).toBe(PASS_STILLS.velocity);
  });

  it("REQ-ENG-09 A14 before the field is drawn live the row's empty frames keep the card's own fill", async () => {
    await mount();
    for (const pass of PASSES.slice(1)) {
      expect(classesOf(faceOf(container, pass))).toContain("bg-surface");
    }
    await report({ type: "tierChosen", tier: 3, reason: "save-data" });
    await report({ type: "ready", tier: 3, particles: 0 });
    for (const pass of PASSES.slice(1)) {
      const face = faceOf(container, pass);
      expect(face?.querySelector("img")).toBeNull();
      expect(classesOf(face)).toContain("bg-surface");
    }
  });

  it("REQ-ENG-09 A14 on tier 2 velocity keeps its still even in the middle; every other pass is live there", async () => {
    await mount();
    layOut();
    await ready(2);
    for (const pass of PASSES) {
      await scrollAt(restProgress(PASSES.indexOf(pass)));
      expect(marked()).toEqual([pass]);
      expect(liveFaces()).toEqual(LIVE_PASSES[2].includes(pass) ? [pass] : []);
    }
    await scrollAt(restProgress(1));
    expect(
      faceOf(container, "velocity")?.querySelector("img")?.getAttribute("src"),
    ).toBe(PASS_STILLS.velocity);
  });

  it("REQ-ENG-09 REQ-ENG-08 A14 before the tier is ready, on the soft look, on tier 3 and after a loss, the middle card shows its still and the others are empty frames", async () => {
    await mount();
    const stills = () =>
      [...container.querySelectorAll("[data-pass-face] img")].map((image) =>
        image.closest("[data-pass-face]")?.getAttribute("data-pass-face"),
      );
    expect(liveFaces()).toEqual([]);
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    expect(liveFaces()).toEqual([]);
    expect(stills()).toEqual(["points"]);

    await report({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "soft",
    });
    expect(liveFaces()).toEqual([]);
    expect(stills()).toEqual(["points"]);

    await ready(1);
    expect(liveFaces()).toEqual(["points"]);
    await report({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(liveFaces()).toEqual([]);
    await report({ type: "ready", tier: 3, particles: 0 });
    expect(liveFaces()).toEqual([]);
    expect(stills()).toEqual(["points"]);
  });

  it("REQ-A11Y-03 REQ-A11Y-04 calm turns the row back into the still grid, with nothing live, marked or dimmed, and stops reading the scroll; off again it slides from where the page is", async () => {
    await mount();
    layOut();
    await ready(1);
    await scrollAt(restProgress(1));
    expect(liveFaces()).toEqual(["velocity"]);

    // A scroll whose frame has not run yet when calm comes on.
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    const [pending] = [...frames.keys()];
    await act(async () => {
      calmStore.setChosen(true);
    });
    expect(cancelFrame).toHaveBeenCalledWith(pending);
    expect(frames.size).toBe(0);

    const viewer = container.querySelector("[data-pass-viewer]")!;
    expect(viewer.hasAttribute("data-sliding")).toBe(false);
    for (const name of ["pass-stretch", "pass-screen", "pass-rail"]) {
      expect(part(container, name), name).toBeNull();
    }
    expect(classesOf(viewer.querySelector("ol"))).toEqual(
      expect.arrayContaining(["grid", "sm:grid-cols-2", "lg:grid-cols-3"]),
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(liveFaces()).toEqual([]);
    expect(marked()).toEqual([]);
    expect(current()).toEqual([]);
    expect(allClasses(viewer)).not.toMatch(/\bopacity-35\b|\bborder-glow\b/);
    expect(container.querySelectorAll("[data-pass-face] img")).toHaveLength(
      PASSES.length,
    );
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(frames.size).toBe(0);

    stretchBox = { ...stretchBox, top: -restProgress(3) * TRAVEL };
    await act(async () => {
      calmStore.setChosen(false);
    });
    expect(place()).toBe(3);
    expect(marked()).toEqual(["glow"]);
    expect(liveFaces()).toEqual(["glow"]);
  });

  it("REQ-SCR-04 unmounting stops reading the scroll and cancels a frame still waiting", async () => {
    await mount();
    layOut();
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    const [pending] = [...frames.keys()];
    await act(async () => {
      root?.unmount();
    });
    root = null;
    expect(cancelFrame).toHaveBeenCalledWith(pending);
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(frames.size).toBe(0);
  });

  it("REQ-ENG-09 a click on a face glides the page to where its card rests in the middle", async () => {
    await mount();
    vi.stubGlobal("scrollY", 2000);
    layOut(-600);
    await act(async () => {
      button("glow").click();
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const [{ top, behavior }] = scrollTo.mock.lastCall as [ScrollToOptions];
    expect(behavior).toBe("smooth");
    expect(top).toBeCloseTo(restTop("glow", 2000), 6);
    // Halfway through the card's rest, so it stands still in the middle.
    expect(slideAt(restProgress(3))).toBe(3);

    // With the system asking for reduced motion it jumps instead.
    isReduced = true;
    await act(async () => {
      button("density").click();
    });
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: expect.closeTo(restTop("density", 2000), 6),
      behavior: "instant",
    });
  });

  it("REQ-A11Y-02 Tab onto a face jumps the page there at once; the focus a pointer gives waits for its click", async () => {
    await mount();
    vi.stubGlobal("scrollY", 1000);
    layOut(-300);
    await act(async () => {
      button("final").focus();
    });
    expect(document.activeElement).toBe(button("final"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: expect.closeTo(restTop("final", 1000), 6),
      behavior: "instant",
    });

    // Focus with no focus ring is a pointer's: the click that follows glides.
    const pointed = button("points");
    vi.spyOn(pointed, "matches").mockReturnValue(false);
    await act(async () => {
      pointed.focus();
    });
    expect(document.activeElement).toBe(pointed);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("REQ-A11Y-02 REQ-SCR-02 a click gives its button focus, with no jump and no scroll of its own, then glides; the focus the window hands back on its return takes the page nowhere", async () => {
    await mount();
    vi.stubGlobal("scrollY", 1000);
    layOut(-300);

    // Safari gives a clicked button no focus: the click takes it, quietly,
    // so the glide is the only move.
    const glow = button("glow");
    const focus = vi.spyOn(glow, "focus");
    await act(async () => {
      glow.click();
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(glow);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: expect.closeTo(restTop("glow", 1000), 6),
      behavior: "smooth",
    });

    // A pointer's click on the button that has focus takes it again: the
    // focusin that ends a wheel glide comes with every click, and still
    // nothing jumps. A click from the keyboard (detail 0) keeps it.
    const focusins: EventTarget[] = [];
    const record = (event: Event) => {
      if (event.target !== null) focusins.push(event.target);
    };
    window.addEventListener("focusin", record, true);
    try {
      await act(async () => {
        glow.dispatchEvent(
          new MouseEvent("click", { bubbles: true, detail: 1 }),
        );
      });
      expect(focusins).toEqual([glow]);
      await act(async () => {
        glow.dispatchEvent(
          new MouseEvent("click", { bubbles: true, detail: 0 }),
        );
      });
      expect(focusins).toEqual([glow]);
    } finally {
      window.removeEventListener("focusin", record, true);
    }
    expect(document.activeElement).toBe(glow);
    expect(scrollTo).toHaveBeenCalledTimes(3);
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: expect.closeTo(restTop("glow", 1000), 6),
      behavior: "smooth",
    });

    // Tab to a card, then away from the window and back: the browser blurs
    // the button with the document out of focus, then focuses it again.
    await act(async () => {
      button("final").focus();
    });
    expect(scrollTo).toHaveBeenCalledTimes(4);
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await act(async () => {
      button("final").blur();
    });
    hasFocus.mockReturnValue(true);
    await act(async () => {
      button("final").focus();
    });
    expect(document.activeElement).toBe(button("final"));
    expect(scrollTo).toHaveBeenCalledTimes(4);

    // A blur within the page leaves the next Tab onto it as it was.
    await act(async () => {
      button("final").blur();
    });
    await act(async () => {
      button("final").focus();
    });
    expect(scrollTo).toHaveBeenCalledTimes(5);
  });

  it("REQ-ENG-09 the viewer tells the story when the row has moved and when a new card is in the middle or turns live, so the field reads the faces again", async () => {
    const heard: string[] = [];
    const listen = () => {
      heard.push(marked().join() + (liveFaces().length > 0 ? " live" : ""));
    };
    document.addEventListener(SLIDE_MOVED, listen);
    try {
      await mount();
      layOut();
      heard.length = 0;

      await scrollAt(restProgress(2));
      // Once the row has moved, then once the new middle card is drawn.
      expect(heard.at(-1)).toBe("density");
      const count = heard.length;
      expect(count).toBeGreaterThanOrEqual(2);

      // A face that turns live with the tier.
      await ready(1);
      expect(heard.at(-1)).toBe("density live");

      // A scroll within the rest moves the row by nothing new, and still
      // says so, once.
      const before = heard.length;
      await scrollAt(restProgress(2) + 0.001);
      expect(heard.length).toBe(before + 1);

      // Calm turns the row into the grid: no middle card.
      await act(async () => {
        calmStore.setChosen(true);
      });
      expect(heard.at(-1)).toBe("");
    } finally {
      document.removeEventListener(SLIDE_MOVED, listen);
    }
  });

  it("REQ-ENG-09 a stretch not laid out, or no taller than the screen, takes the page nowhere", async () => {
    await mount();
    await act(async () => {
      button("glow").click();
    });
    stretchBox = { top: 0, height: HEIGHT };
    await act(async () => {
      button("glow").click();
    });
    expect(scrollTo).not.toHaveBeenCalled();
    // And the row stands at the first card.
    await runFrames();
    expect(place()).toBe(0);
  });

  it("REQ-ENG-08 a still that fails to load is removed, and the card keeps its own fill", async () => {
    await mount();
    // Before the tier is ready the middle card shows its still.
    const image = faceOf(container, "points")?.querySelector("img");
    expect(image).not.toBeNull();
    await act(async () => {
      image?.dispatchEvent(new Event("error"));
    });
    expect(faceOf(container, "points")?.querySelector("img")).toBeNull();
    expect(classesOf(faceOf(container, "points"))).toContain("bg-surface");
  });
});

describe("colour", () => {
  // Every pairing the viewer draws, with the ratio WCAG 2.2 asks of it. The
  // cards' words sit on their own panels, and the chapter's link and tier
  // table on theirs; the middle card's border and the rail's lit tick mark
  // a state against the page.
  const PAIRS: ReadonlyArray<[ColorName, ColorName, number, string]> = [
    ["violet", "surface", 4.5, "Pass 2 of 5"],
    ["text", "surface", 4.5, "a pass's name, the link and the tier values"],
    ["muted", "surface", 4.5, "a pass's breakdown and the tier names"],
    ["glow", "surface", 4.5, "the link's arrow"],
    ["glow", "void", 3, "the middle card's border and the rail's lit tick"],
  ];

  it.each(PAIRS)(
    "REQ-A11Y-06 %s on %s meets %d to 1 (%s)",
    (foreground, background, needs) => {
      expect(
        contrastRatio(colors[foreground], colors[background]),
      ).toBeGreaterThanOrEqual(needs);
    },
  );

  it("REQ-A11Y-06 the viewer's colours come from the tokens only, in the grid and in the sliding row", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // A screen with room for the sliding row.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === SLIDE_ROOM,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PassViewer />);
    });
    const sliding = allClasses(container);
    expect(sliding).toContain("border-glow");
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();

    const grid = allClasses(render().querySelector("[data-pass-viewer]")!);
    // Each class without its variants, then the colour of every text,
    // background, border and ring utility; sizes, sides and alignments are
    // not colours.
    const NOT_COLOURS = new Set(["base", "sm", "xs", "start", "center", "b"]);
    const colourNames = `${grid} ${sliding}`
      .split(/\s+/)
      .map((name) => name.slice(name.lastIndexOf(":") + 1))
      .flatMap((name) => {
        const match =
          /^(?:text|bg|border|inset-ring)-([a-z-]+)(?:\/\d+)?$/.exec(name);
        return match?.[1] && !NOT_COLOURS.has(match[1]) ? [match[1]] : [];
      });
    expect(colourNames).toEqual(
      expect.arrayContaining([
        "surface",
        "raised",
        "edge",
        "glow",
        "violet",
        "muted",
      ]),
    );
    for (const name of colourNames) {
      expect(name === "transparent" || name in colors).toBe(true);
    }
  });
});
