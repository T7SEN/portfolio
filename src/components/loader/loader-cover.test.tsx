import { act, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngineEvent } from "@/engine/types";
import { calmStore } from "@/lib/calm-store";
import {
  LIFT_LIMIT_MS,
  loaderStore,
  MIN_COVER_MS,
  READY_HOLD_MS,
} from "@/lib/loader-store";
import { tierStore } from "@/lib/tier-store";

import { LoaderCover } from "./loader-cover";
import {
  CALM_FADE_MS,
  CALM_KEY,
  EXIT_LIMIT_MS,
  PIXEL_RATIO_CAP,
} from "./loader-config";
import type {
  CreateLoaderScene,
  LoaderScene,
  SceneProgress,
} from "./scene/types";

const mocks = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

const html = document.documentElement;

/** A scene that records what the cover asks of it. */
function fakeScene({ fails = false } = {}) {
  const progress: SceneProgress[] = [];
  let finishExit: (() => void) | null = null;
  const scene = {
    enter: vi.fn(),
    setProgress: vi.fn((next: SceneProgress) => {
      progress.push(next);
    }),
    setEffort: vi.fn(),
    exit: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishExit = resolve;
        }),
    ),
    resize: vi.fn(),
    dispose: vi.fn(),
  } satisfies LoaderScene;
  const create = vi.fn<CreateLoaderScene>((_canvas, options) => {
    options.onFirstFrame?.();
    return scene;
  });
  const load = vi.fn(() =>
    fails
      ? Promise.reject(new Error("chunk failed"))
      : Promise.resolve(create as CreateLoaderScene),
  );
  return {
    scene,
    create,
    load,
    progress,
    finishExit: () => finishExit?.(),
  };
}

type Fake = ReturnType<typeof fakeScene>;

/** The cover with the page it covers, as the root layout lays them out. */
function Page({ fake }: { fake: Fake }) {
  return (
    <>
      <LoaderCover loadScene={fake.load} />
      <a href="#main">Skip to content</a>
      <main id="main" />
    </>
  );
}

let root: Root | null = null;
let container: HTMLElement | null = null;

async function mount(element: ReactElement) {
  container = document.createElement("div");
  document.body.append(container);
  const next = createRoot(container);
  root = next;
  await act(async () => {
    next.render(element);
  });
}

async function rerender(element: ReactElement) {
  await act(async () => {
    root?.render(element);
  });
}

/** Moves the clock on, running timers, frames and promises on the way. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function send(...events: EngineEvent[]) {
  await act(async () => {
    for (const event of events) loaderStore.apply(event);
  });
}

/** Events as the engine session hands them on: to the loader and the tier store. */
async function report(...events: EngineEvent[]) {
  await act(async () => {
    for (const event of events) {
      loaderStore.apply(event);
      tierStore.apply(event);
    }
  });
}

const cover = () =>
  container?.querySelector<HTMLElement>("[data-loader-cover]") ?? null;

function words() {
  return cover()?.querySelector('[role="status"]')?.textContent ?? null;
}

const READY: EngineEvent = {
  type: "ready",
  tier: 1,
  particles: 1_000_000,
  look: "halftone",
};

/** A full load of "/": the inline script marked the cover up. */
async function mountCover(fake = fakeScene()) {
  html.setAttribute("data-loader", "up");
  await mount(<Page fake={fake} />);
  // The scene's module arrives.
  await advance(0);
  return fake;
}

/** A client move to the path, as the router makes it. */
async function moveTo(path: string, fake: Fake) {
  mocks.pathname = path;
  await rerender(<Page fake={fake} />);
}

/**
 * A document first loaded on /work, marked as the inline script marks it
 * (off null: a script that never ran), then a move to "/".
 */
async function moveHome(
  fake = fakeScene(),
  { off = "route" }: { off?: string | null } = {},
) {
  mocks.pathname = "/work";
  if (off !== null) html.setAttribute("data-loader-off", off);
  await mount(<Page fake={fake} />);
  expect(cover()).toBeNull();
  await moveTo("/", fake);
  // The scene's module arrives.
  await advance(0);
  return fake;
}

const TIER_2_FIELD: EngineEvent[] = [
  { type: "rendererStarted", backend: "webgl2" },
  { type: "tierChosen", tier: 2, reason: "phone" },
  { type: "ready", tier: 2, particles: 100_000 },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.pathname = "/";
  sessionStorage.clear();
});

afterEach(async () => {
  if (root !== null) {
    const done = root;
    await act(async () => {
      done.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  loaderStore.reset();
  tierStore.reset();
  calmStore.setChosen(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  html.removeAttribute("data-loader");
  html.removeAttribute("data-loader-off");
  html.removeAttribute("style");
  window.history.replaceState(null, "", "/");
});

describe("LoaderCover", () => {
  it("REQ-LOAD-01 REQ-CNT-01 the static HTML of / holds the cover, named for what it waits for, with step 1 under the hole", () => {
    const markup = renderToStaticMarkup(<LoaderCover />);
    const doc = new DOMParser().parseFromString(markup, "text/html");
    const element = doc.querySelector("[data-loader-cover]");

    expect(element?.getAttribute("role")).toBe("dialog");
    expect(element?.getAttribute("aria-modal")).toBe("true");
    expect(element?.getAttribute("aria-label")).toBe(
      "Loading the particle field",
    );
    expect(element?.getAttribute("tabindex")).toBe("-1");
    expect(element?.hasAttribute("data-lenis-prevent")).toBe(true);
    expect(element?.getAttribute("data-loader-state")).toBe("entering");
    expect(element?.getAttribute("data-loader-step")).toBe("1");
    expect(element?.getAttribute("data-loader-done")).toBe("0");
    expect(element?.getAttribute("data-loader-test")).toBe("pending");
    expect(element?.getAttribute("data-loader-exit")).toBe("ripple");
    // The failsafe runs until the island takes the cover over.
    expect(element?.hasAttribute("data-loader-owned")).toBe(false);
    expect(element?.querySelector("canvas")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    const status = element?.querySelector('[role="status"]');
    expect(status?.textContent).toBe("01 / 04Loading the engine");
    expect(status?.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      "01 / 04",
    );
    // Nothing on it to press: no way past it.
    expect(
      element?.querySelectorAll("a, button, input, [tabindex='0']"),
    ).toHaveLength(0);
  });

  it("REQ-LOAD-01 REQ-I18N-01 the cover fills the screen above everything, its label placed with logical classes", () => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(<LoaderCover />),
      "text/html",
    );
    const element = doc.querySelector("[data-loader-cover]");
    for (const name of ["fixed", "inset-0", "z-100", "bg-void", "touch-none"]) {
      expect(element?.classList.contains(name)).toBe(true);
    }
    const label = doc.querySelector('[data-part="loader-label"]');
    expect(label?.classList.contains("inset-x-0")).toBe(true);
    for (const item of doc.querySelectorAll("[class]")) {
      expect(item.getAttribute("class")).not.toMatch(
        /(?:^|\s|:)(?:ml|mr|pl|pr|left|right)-/,
      );
    }
  });

  it("REQ-LOAD-01 no other route has the cover in its static HTML", () => {
    mocks.pathname = "/work";
    expect(renderToStaticMarkup(<LoaderCover />)).toBe("");
  });

  it("REQ-LOAD-01 takes the cover over: the page inert, scroll locked at the top, focus on the cover, the failsafe stood down", async () => {
    const fake = await mountCover();
    const element = cover();
    const skip = container?.querySelector("a");
    const main = container?.querySelector("main");

    expect(element?.hasAttribute("data-loader-owned")).toBe(true);
    expect(skip?.hasAttribute("inert")).toBe(true);
    expect(main?.hasAttribute("inert")).toBe(true);
    expect(element?.hasAttribute("inert")).toBe(false);
    expect(html.style.getPropertyValue("overflow")).toBe("hidden");
    expect(document.activeElement).toBe(element);
    expect(html.getAttribute("data-loader")).toBe("up");
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(fake.scene.enter).toHaveBeenCalledTimes(1);
    // The scene paints the void from its first frame.
    expect(element?.getAttribute("data-loader-scene")).toBe("drawn");
  });

  it("REQ-LOAD-01 sizes the scene to the screen at a capped pixel ratio, and resizes it with the window", async () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const fake = await mountCover();
    const options = fake.create.mock.calls[0]?.[1];
    expect(options).toMatchObject({
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: PIXEL_RATIO_CAP,
      phone: false,
    });

    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    await advance(20);
    expect(fake.scene.resize).toHaveBeenCalledExactlyOnceWith(
      window.innerWidth,
      window.innerHeight,
      PIXEL_RATIO_CAP,
    );
  });

  it("REQ-LOAD-01 A14 names each step as it runs, streams the GPU test's share and says Field ready over the real count", async () => {
    const fake = await mountCover();
    expect(words()).toBe("01 / 04Loading the engine");

    await act(async () => loaderStore.engineLoaded());
    expect(cover()?.getAttribute("data-loader-step")).toBe("2");
    expect(words()).toBe("02 / 04Starting the renderer");

    expect(cover()?.getAttribute("data-loader-done")).toBe("1");

    await send({ type: "rendererStarted", backend: "webgpu" });
    expect(words()).toBe("02 / 04Starting the renderer");
    // The label holds step 2's words; the count says the step has ended.
    expect(cover()?.getAttribute("data-loader-done")).toBe("2");

    await send({ type: "probeStarted", durationMs: 2000 });
    expect(cover()?.getAttribute("data-loader-test")).toBe("running");
    expect(words()).toBe("03 / 04Testing your GPU");
    expect(fake.progress.at(-1)).toEqual({ done: 2, test: 0, ready: false });

    await advance(1000);
    const share = fake.progress.at(-1)?.test ?? 0;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThanOrEqual(0.5);
    // The light scene stays off until a measurement asks for it.
    expect(fake.scene.setEffort).not.toHaveBeenCalled();

    await send({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    expect(cover()?.getAttribute("data-loader-test")).toBe("done");
    expect(cover()?.getAttribute("data-loader-done")).toBe("3");
    expect(words()).toBe("04 / 04Drawing the field");
    const calls = fake.scene.setProgress.mock.calls.length;
    await advance(500);
    // Nothing moves between steps.
    expect(fake.scene.setProgress.mock.calls.length).toBe(calls);

    await send(READY);
    expect(cover()?.getAttribute("data-loader-state")).toBe("ready");
    expect(cover()?.getAttribute("data-loader-done")).toBe("4");
    expect(words()).toBe("04 / 04Field readyTier 1 · WebGPU · 1M particles");
    expect(fake.progress.at(-1)).toEqual({ done: 4, test: null, ready: true });
    expect(cover()?.querySelector('[role="status"] p')?.className).toContain(
      "text-glow",
    );
  });

  it("REQ-LOAD-01 A14 where no test runs, step 3's words never show", async () => {
    await mountCover();
    const seen: string[] = [];
    await act(async () => loaderStore.engineLoaded());
    seen.push(words() ?? "");
    await send({ type: "rendererStarted", backend: "webgl2" });
    seen.push(words() ?? "");
    await send({ type: "tierChosen", tier: 2, reason: "phone" });
    seen.push(words() ?? "");
    expect(seen.join(" ")).not.toContain("Testing your GPU");
    expect(cover()?.getAttribute("data-loader-test")).toBe("skipped");
  });

  it("REQ-LOAD-01 never lifts before 2 s from the first paint, then plays the ripple", async () => {
    const fake = await mountCover();
    await advance(500);
    await act(async () => loaderStore.engineLoaded());
    await send(
      { type: "rendererStarted", backend: "webgl2" },
      { type: "tierChosen", tier: 2, reason: "phone" },
      { type: "ready", tier: 2, particles: 100_000 },
    );

    await advance(MIN_COVER_MS - 501);
    expect(cover()?.getAttribute("data-loader-state")).toBe("ready");
    expect(fake.scene.exit).not.toHaveBeenCalled();

    await advance(1);
    expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
    expect(cover()?.getAttribute("data-loader-exit")).toBe("ripple");
    expect(fake.scene.exit).toHaveBeenCalledExactlyOnceWith();
  });

  it("REQ-LOAD-01 holds Field ready after a late ready, then frees the page once the exit ends", async () => {
    const fake = await mountCover();
    await act(async () => loaderStore.engineLoaded());
    await send({ type: "rendererStarted", backend: "webgpu" });
    await send({ type: "probeStarted", durationMs: 2000 });
    await advance(2500);
    await send({ type: "tierChosen", tier: 1, reason: "probe-pass" }, READY);

    await advance(READY_HOLD_MS - 1);
    expect(fake.scene.exit).not.toHaveBeenCalled();
    await advance(1);
    expect(fake.scene.exit).toHaveBeenCalledTimes(1);
    expect(cover()).not.toBeNull();

    await act(async () => fake.finishExit());
    expect(cover()).toBeNull();
    expect(fake.scene.dispose).toHaveBeenCalledTimes(1);
    expect(container?.querySelector("a")?.hasAttribute("inert")).toBe(false);
    expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(false);
    expect(html.style.getPropertyValue("overflow")).toBe("");
    expect(html.getAttribute("data-loader")).toBe("done");
    // Focus is back at the top of the page.
    expect(document.activeElement).toBe(document.body);
  });

  it("REQ-LOAD-01 lifts at the time limit onto the page as it is, saying so, with the ripple", async () => {
    const fake = await mountCover();
    await act(async () => loaderStore.engineLoaded());

    await advance(LIFT_LIMIT_MS - 1);
    expect(cover()?.getAttribute("data-loader-state")).not.toBe("leaving");
    await advance(1);
    expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
    expect(cover()?.getAttribute("data-loader-outcome")).toBe("limit");
    expect(cover()?.getAttribute("data-loader-exit")).toBe("ripple");
    expect(words()).toBe("Opening the page");
    expect(fake.scene.exit).toHaveBeenCalledTimes(1);
    await act(async () => fake.finishExit());
    expect(cover()).toBeNull();
  });

  it("REQ-LOAD-01 REQ-ENG-08 an engine that never loaded ends on the still, never Field ready, at the minimum", async () => {
    const fake = await mountCover();
    await send(
      { type: "tierChosen", tier: 3, reason: "no-backend" },
      { type: "ready", tier: 3, particles: 0 },
    );
    expect(words()).toBe("Still frame on this device");
    expect(cover()?.getAttribute("data-loader-outcome")).toBe("still");
    expect(cover()?.getAttribute("data-loader-step")).toBe("end");

    await advance(MIN_COVER_MS - 1);
    expect(cover()?.getAttribute("data-loader-state")).not.toBe("leaving");
    await advance(1);
    expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
    expect(cover()?.getAttribute("data-loader-exit")).toBe("ripple");
    expect(fake.scene.exit).toHaveBeenCalledTimes(1);
  });

  it("REQ-LOAD-01 REQ-ENG-08 a lost device lifts at the minimum without waiting for the next tier", async () => {
    const fake = await mountCover();
    await act(async () => loaderStore.engineLoaded());
    await send(
      { type: "rendererStarted", backend: "webgpu" },
      { type: "probeStarted", durationMs: 2000 },
      { type: "tierChosen", tier: 2, reason: "device-lost" },
    );
    expect(words()).toBe("Opening the page");
    await advance(MIN_COVER_MS);
    expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
    expect(cover()?.getAttribute("data-loader-exit")).toBe("ripple");
    expect(fake.scene.exit).toHaveBeenCalledTimes(1);
  });

  it("REQ-LOAD-01 nothing the visitor does lifts it", async () => {
    const fake = await mountCover();
    const element = cover();
    for (const key of ["Escape", "Enter", " ", "Tab", "ArrowDown", "End"]) {
      element?.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      document.dispatchEvent(new KeyboardEvent("keydown", { key }));
    }
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element?.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    await advance(MIN_COVER_MS + 100);

    expect(cover()?.getAttribute("data-loader-state")).not.toBe("leaving");
    expect(fake.scene.exit).not.toHaveBeenCalled();
  });

  it("REQ-LOAD-01 REQ-A11Y-04 calm that comes on while the cover is up fades it at the minimum instead of the ripple", async () => {
    const fake = await mountCover();
    await advance(500);
    await act(async () => calmStore.setChosen(true));
    expect(sessionStorage.getItem(CALM_KEY)).toBe("on");
    expect(cover()?.getAttribute("data-loader-exit")).toBe("fade");

    await advance(MIN_COVER_MS - 501);
    expect(cover()?.getAttribute("data-loader-state")).not.toBe("leaving");
    await advance(1);
    expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
    expect(fake.scene.exit).not.toHaveBeenCalled();

    await advance(CALM_FADE_MS);
    expect(cover()).toBeNull();
    expect(html.getAttribute("data-loader")).toBe("done");
  });

  it("REQ-LOAD-01 a scene that fails to load leaves the void and its label, and the cover fades", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = await mountCover(fakeScene({ fails: true }));
    expect(cover()?.hasAttribute("data-loader-scene")).toBe(false);
    expect(words()).toBe("01 / 04Loading the engine");

    await send({ type: "tierChosen", tier: 3, reason: "no-backend" });
    await advance(MIN_COVER_MS);
    expect(cover()?.getAttribute("data-loader-exit")).toBe("fade");
    expect(fake.scene.exit).not.toHaveBeenCalled();
    await advance(CALM_FADE_MS);
    expect(cover()).toBeNull();
  });

  it("REQ-LOAD-01 an exit that never ends is cut off", async () => {
    const fake = await mountCover();
    await act(async () => loaderStore.engineLoaded());
    await send(
      { type: "rendererStarted", backend: "webgl2" },
      { type: "tierChosen", tier: 2, reason: "phone" },
      { type: "ready", tier: 2, particles: 100_000 },
    );
    await advance(MIN_COVER_MS);
    expect(fake.scene.exit).toHaveBeenCalledTimes(1);
    expect(cover()).not.toBeNull();
    await advance(EXIT_LIMIT_MS);
    expect(cover()).toBeNull();
    expect(html.style.getPropertyValue("overflow")).toBe("");
  });

  it("REQ-LOAD-01 REQ-NAV-01 a first load of a link into the home page goes to its part once the page is free", async () => {
    const scrolled: Element[] = [];
    const scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
    // jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState(null, "", "/#main");
    try {
      const fake = await mountCover();
      await act(async () => loaderStore.engineLoaded());
      await send(
        { type: "rendererStarted", backend: "webgl2" },
        { type: "tierChosen", tier: 2, reason: "phone" },
        { type: "ready", tier: 2, particles: 100_000 },
      );
      await advance(MIN_COVER_MS);
      expect(scrollIntoView).not.toHaveBeenCalled();
      await act(async () => fake.finishExit());
      expect(cover()).toBeNull();
      expect(scrolled).toEqual([container?.querySelector("main")]);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it("REQ-LOAD-01 REQ-ENG-07 an unmount before the lift frees the page and the scene", async () => {
    const fake = await mountCover();
    const done = root;
    await act(async () => {
      done?.unmount();
    });
    root = null;

    expect(fake.scene.dispose).toHaveBeenCalledTimes(1);
    expect(container?.querySelector("a")).toBeNull();
    expect(html.style.getPropertyValue("overflow")).toBe("");
    expect(html.getAttribute("data-loader")).toBe("up");

    // Its listeners are gone: a lift that falls due finds no one.
    await send({ type: "tierChosen", tier: 3, reason: "phone" });
    await advance(MIN_COVER_MS + EXIT_LIMIT_MS);
    expect(fake.scene.exit).not.toHaveBeenCalled();
  });

  it("REQ-LOAD-01 REQ-A11Y-03 REQ-A11Y-04 calm or reduced motion: the island removes the cover at once and writes the reason back", async () => {
    for (const reason of ["calm", "reduced"]) {
      html.setAttribute("data-loader-off", reason);
      const fake = fakeScene();
      await mount(<Page fake={fake} />);
      expect(cover()).toBeNull();
      expect(fake.load).not.toHaveBeenCalled();
      expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(
        false,
      );
      expect(html.getAttribute("data-loader-off")).toBe(reason);

      await act(async () => root?.unmount());
      root = null;
      container?.remove();
      sessionStorage.clear();
      html.removeAttribute("data-loader-off");
    }
  });

  it("REQ-LOAD-01 when the inline script never ran, no cover was painted and none is taken over", async () => {
    const fake = fakeScene();
    await mount(<Page fake={fake} />);
    expect(cover()).toBeNull();
    expect(fake.load).not.toHaveBeenCalled();
    expect(html.hasAttribute("data-loader")).toBe(false);
    expect(html.hasAttribute("data-loader-off")).toBe(false);
  });

  it("REQ-LOAD-01 counts the minimum from the browser's first paint", async () => {
    const paintedAt = performance.now();
    vi.spyOn(performance, "getEntriesByType").mockImplementation((type) =>
      type === "paint"
        ? ([
            { name: "first-paint", startTime: paintedAt },
            { name: "first-contentful-paint", startTime: paintedAt + 10 },
          ] as PerformanceEntryList)
        : [],
    );
    // Mounted 1 s after the paint, so the ready hold ends before the minimum.
    await advance(1000);
    const fake = await mountCover();
    await act(async () => loaderStore.engineLoaded());
    await send(
      { type: "rendererStarted", backend: "webgl2" },
      { type: "tierChosen", tier: 2, reason: "phone" },
      { type: "ready", tier: 2, particles: 100_000 },
    );
    await advance(MIN_COVER_MS - 1000 + 9);
    expect(fake.scene.exit).not.toHaveBeenCalled();
    await advance(1);
    expect(fake.scene.exit).toHaveBeenCalledTimes(1);
  });

  it("REQ-LOAD-01 an island that runs after the time limit leaves the cover to the failsafe and frees the page at once", async () => {
    const paintedAt = performance.now();
    vi.spyOn(performance, "getEntriesByType").mockImplementation((type) =>
      type === "paint"
        ? ([
            { name: "first-contentful-paint", startTime: paintedAt },
          ] as PerformanceEntryList)
        : [],
    );
    await advance(LIFT_LIMIT_MS);
    const fake = await mountCover();
    expect(cover()).toBeNull();
    expect(fake.create).not.toHaveBeenCalled();
    expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(false);
    expect(html.getAttribute("data-loader")).toBe("done");
  });

  describe("after a move to / from inside the site", () => {
    it("REQ-LOAD-01 while the field has not drawn, a cover is added and taken over before the browser paints: the page inert, scroll held, focus on it, html up", async () => {
      const fake = await moveHome();
      const element = cover();

      expect(element).not.toBeNull();
      // Owned in the commit that adds it, so the CSS failsafe never runs
      // over a cover the island holds.
      expect(element?.hasAttribute("data-loader-owned")).toBe(true);
      expect(container?.querySelector("a")?.hasAttribute("inert")).toBe(true);
      expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(
        true,
      );
      expect(html.style.getPropertyValue("overflow")).toBe("hidden");
      expect(document.activeElement).toBe(element);
      expect(html.getAttribute("data-loader")).toBe("up");
      // What the inline script decided for the document stays as it was.
      expect(html.getAttribute("data-loader-off")).toBe("route");
      expect(fake.create).toHaveBeenCalledTimes(1);
      expect(element?.getAttribute("data-loader-state")).toBe("entering");
      expect(words()).toBe("01 / 04Loading the engine");
    });

    it("REQ-LOAD-01 times the minimum from the cover's own first frame, not the page's first paint, then lifts with the ripple and frees the page with focus at the top", async () => {
      const paintedAt = performance.now();
      vi.spyOn(performance, "getEntriesByType").mockImplementation((type) =>
        type === "paint"
          ? ([
              { name: "first-contentful-paint", startTime: paintedAt },
            ] as PerformanceEntryList)
          : [],
      );
      // The page painted long before the move, past the time limit.
      mocks.pathname = "/work";
      html.setAttribute("data-loader-off", "route");
      const fake = fakeScene();
      await mount(<Page fake={fake} />);
      await advance(LIFT_LIMIT_MS + 1000);

      await moveTo("/", fake);
      const movedAt = performance.now();
      await advance(0);
      expect(cover()?.hasAttribute("data-loader-owned")).toBe(true);
      await act(async () => loaderStore.engineLoaded());
      await report(...TIER_2_FIELD);
      expect(cover()?.getAttribute("data-loader-state")).toBe("ready");

      await advance(MIN_COVER_MS - 1);
      expect(performance.now() - movedAt).toBe(MIN_COVER_MS - 1);
      expect(fake.scene.exit).not.toHaveBeenCalled();
      // The first frame comes within one frame of the move.
      await advance(20);
      expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
      expect(cover()?.getAttribute("data-loader-exit")).toBe("ripple");
      expect(fake.scene.exit).toHaveBeenCalledTimes(1);

      await act(async () => fake.finishExit());
      expect(cover()).toBeNull();
      expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(
        false,
      );
      expect(html.style.getPropertyValue("overflow")).toBe("");
      expect(html.getAttribute("data-loader")).toBe("done");
      expect(document.activeElement).toBe(document.body);
    });

    it("REQ-LOAD-01 lifts at the time limit from its own first frame, saying so, with the ripple", async () => {
      const fake = await moveHome();
      await act(async () => loaderStore.engineLoaded());
      await advance(LIFT_LIMIT_MS - 1);
      expect(cover()?.getAttribute("data-loader-state")).not.toBe("leaving");
      await advance(20);
      expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
      expect(cover()?.getAttribute("data-loader-outcome")).toBe("limit");
      expect(cover()?.getAttribute("data-loader-exit")).toBe("ripple");
      expect(words()).toBe("Opening the page");
      await act(async () => fake.finishExit());
      expect(cover()).toBeNull();
    });

    it("REQ-LOAD-01 REQ-ENG-08 an engine that never loaded lifts it at its minimum, with the ripple", async () => {
      const fake = await moveHome();
      await report(
        { type: "tierChosen", tier: 3, reason: "no-backend" },
        { type: "ready", tier: 3, particles: 0 },
      );
      expect(words()).toBe("Still frame on this device");
      await advance(MIN_COVER_MS + 20);
      expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
      expect(fake.scene.exit).toHaveBeenCalledTimes(1);
      await act(async () => fake.finishExit());
      expect(cover()).toBeNull();
    });

    it("REQ-LOAD-01 REQ-A11Y-04 calm that comes on while it is up fades it at its minimum", async () => {
      const fake = await moveHome();
      await advance(500);
      await act(async () => calmStore.setChosen(true));
      expect(cover()?.getAttribute("data-loader-exit")).toBe("fade");
      await advance(MIN_COVER_MS - 501);
      expect(cover()?.getAttribute("data-loader-state")).not.toBe("leaving");
      await advance(20);
      expect(cover()?.getAttribute("data-loader-state")).toBe("leaving");
      expect(fake.scene.exit).not.toHaveBeenCalled();
      await advance(CALM_FADE_MS);
      expect(cover()).toBeNull();
    });

    it("REQ-LOAD-01 A14 starts from the steps the engine has already passed, not from what an earlier cover left", async () => {
      // A full load whose cover lifted at the time limit, its words frozen
      // on "Opening the page", while the engine went on loading.
      const fake = await mountCover();
      await act(async () => loaderStore.engineLoaded());
      await report({ type: "rendererStarted", backend: "webgpu" });
      await advance(LIFT_LIMIT_MS);
      expect(words()).toBe("Opening the page");
      await act(async () => fake.finishExit());
      expect(cover()).toBeNull();
      await report({ type: "probeStarted", durationMs: 2000 });

      await moveTo("/work", fake);
      await moveTo("/", fake);
      await advance(0);
      expect(cover()?.getAttribute("data-loader-state")).not.toBe("leaving");
      expect(cover()?.getAttribute("data-loader-test")).toBe("running");
      expect(words()).toBe("03 / 04Testing your GPU");
      expect(fake.create).toHaveBeenCalledTimes(2);

      await report(
        { type: "tierChosen", tier: 1, reason: "probe-pass" },
        READY,
      );
      expect(words()).toBe("04 / 04Field readyTier 1 · WebGPU · 1M particles");
    });

    it("REQ-LOAD-01 once the field has drawn, a move to / shows no cover", async () => {
      const fake = await mountCover();
      await act(async () => loaderStore.engineLoaded());
      await report(...TIER_2_FIELD);
      await advance(MIN_COVER_MS);
      await act(async () => fake.finishExit());
      expect(cover()).toBeNull();

      await moveTo("/work", fake);
      await moveTo("/", fake);
      await advance(MIN_COVER_MS);
      expect(cover()).toBeNull();
      expect(fake.create).toHaveBeenCalledTimes(1);
      expect(html.getAttribute("data-loader")).toBe("done");
      expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(
        false,
      );
    });

    it("REQ-LOAD-01 REQ-TIER-03 once tier 3 shows its still, a move to / shows no cover", async () => {
      mocks.pathname = "/work";
      html.setAttribute("data-loader-off", "route");
      const fake = fakeScene();
      await mount(<Page fake={fake} />);
      await report(
        { type: "tierChosen", tier: 3, reason: "save-data" },
        { type: "ready", tier: 3, particles: 0 },
      );
      await moveTo("/", fake);
      expect(cover()).toBeNull();
      expect(fake.load).not.toHaveBeenCalled();
    });

    it("REQ-LOAD-01 REQ-A11Y-03 REQ-A11Y-04 in calm mode, which the OS setting also turns on, a move to / shows no cover", async () => {
      await act(async () => calmStore.setChosen(true));
      const fake = await moveHome();
      expect(cover()).toBeNull();
      expect(fake.load).not.toHaveBeenCalled();
      expect(html.hasAttribute("data-loader")).toBe(false);
    });

    it("REQ-LOAD-01 REQ-CNT-01 on a document whose inline script never ran, a move to / shows no cover", async () => {
      const fake = await moveHome(fakeScene(), { off: null });
      expect(cover()).toBeNull();
      expect(fake.load).not.toHaveBeenCalled();
      expect(html.hasAttribute("data-loader")).toBe(false);
    });

    it("REQ-LOAD-01 REQ-ENG-07 going back from / while it is up takes it away and frees the page", async () => {
      const fake = await moveHome();
      expect(cover()).not.toBeNull();
      await moveTo("/work", fake);
      expect(cover()).toBeNull();
      expect(fake.scene.dispose).toHaveBeenCalledTimes(1);
      expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(
        false,
      );
      expect(html.style.getPropertyValue("overflow")).toBe("");
      expect(html.getAttribute("data-loader")).toBe("done");

      // Its timers are gone with it.
      await report(...TIER_2_FIELD);
      await advance(MIN_COVER_MS + EXIT_LIMIT_MS);
      expect(fake.scene.exit).not.toHaveBeenCalled();
    });

    it("REQ-LOAD-01 REQ-NAV-01 a move to a link into the home page goes to its part once the page is free", async () => {
      const scrolled: Element[] = [];
      Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
        scrolled.push(this);
      });
      try {
        mocks.pathname = "/work";
        html.setAttribute("data-loader-off", "route");
        const fake = fakeScene();
        await mount(<Page fake={fake} />);
        window.history.replaceState(null, "", "/#main");
        await moveTo("/", fake);
        await advance(0);
        await report(
          { type: "tierChosen", tier: 3, reason: "no-backend" },
          { type: "ready", tier: 3, particles: 0 },
        );
        await advance(MIN_COVER_MS + 20);
        expect(scrolled).toEqual([]);
        await act(async () => fake.finishExit());
        expect(cover()).toBeNull();
        expect(scrolled).toEqual([container?.querySelector("main")]);
      } finally {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    });
  });

  it("REQ-ENG-07 strict mode's second mount leaves one session and one scene", async () => {
    html.setAttribute("data-loader", "up");
    const fake = fakeScene();
    await mount(
      <StrictMode>
        <Page fake={fake} />
      </StrictMode>,
    );
    await advance(0);
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(true);
    expect(html.style.getPropertyValue("overflow")).toBe("hidden");

    await act(async () => loaderStore.engineLoaded());
    await send(
      { type: "rendererStarted", backend: "webgl2" },
      { type: "tierChosen", tier: 2, reason: "phone" },
      { type: "ready", tier: 2, particles: 100_000 },
    );
    await advance(MIN_COVER_MS);
    expect(fake.scene.exit).toHaveBeenCalledTimes(1);
    await act(async () => fake.finishExit());
    expect(cover()).toBeNull();
    expect(container?.querySelector("main")?.hasAttribute("inert")).toBe(false);
  });
});
