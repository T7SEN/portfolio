import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calmStore, createCalmStore } from "@/lib/calm-store";

import { SmoothScroll } from "./smooth-scroll";
import {
  createSmoothScroll,
  type SmoothScrollModules,
} from "./smooth-scroll-session";

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const reducedMotion = {
    matches: false,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };
  const scheduled: Array<{ run: () => void; isCancelled: boolean }> = [];
  return {
    scheduled,
    /** Records what afterFirstContent was given; passFirstContent runs it. */
    schedule(run: () => void) {
      const entry = { run, isCancelled: false };
      scheduled.push(entry);
      return () => {
        entry.isCancelled = true;
      };
    },
    loadLenis: vi.fn(),
    loadScrollTrigger: vi.fn(),
    loadMotion: vi.fn(),
    calmWindow: {
      matchMedia: () => reducedMotion,
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  };
});

vi.mock("@/lib/load-motion", () => ({
  loadLenis: mocks.loadLenis,
  loadScrollTrigger: mocks.loadScrollTrigger,
  loadMotion: mocks.loadMotion,
}));
vi.mock("../engine/after-first-content", () => ({
  afterFirstContent: mocks.schedule,
}));
vi.mock("@/lib/calm-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calm-store")>();
  return {
    ...actual,
    calmStore: actual.createCalmStore(mocks.calmWindow as unknown as Window),
  };
});

const { schedule } = mocks;

async function passFirstContent() {
  const due = mocks.scheduled.filter((entry) => !entry.isCancelled);
  mocks.scheduled.length = 0;
  await act(async () => {
    for (const entry of due) entry.run();
  });
}

/** Lets a load's promise chain finish. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

type FakeLenis = {
  readonly args: unknown[];
  readonly scrollCallbacks: Array<() => void>;
  /** True while a wheel glide runs. */
  isSmooth: boolean;
  raf: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function fakeModules() {
  const instances: FakeLenis[] = [];
  const tickerCallbacks = new Set<(time: number) => void>();

  class Lenis implements FakeLenis {
    readonly args: unknown[];
    readonly scrollCallbacks: Array<() => void> = [];
    isSmooth = false;
    raf = vi.fn();
    stop = vi.fn();
    start = vi.fn();
    destroy = vi.fn();
    constructor(...args: unknown[]) {
      this.args = args;
      instances.push(this);
    }
    on(event: string, callback: () => void) {
      if (event === "scroll") this.scrollCallbacks.push(callback);
      return () => undefined;
    }
  }

  const ticker = {
    add: vi.fn((callback: (time: number) => void) => {
      tickerCallbacks.add(callback);
    }),
    remove: vi.fn((callback: (time: number) => void) => {
      tickerCallbacks.delete(callback);
    }),
    lagSmoothing: vi.fn(),
  };
  const ScrollTrigger = { update: vi.fn() };
  const modules: SmoothScrollModules = {
    Lenis,
    gsap: { ticker },
    ScrollTrigger,
  };

  return {
    modules,
    instances,
    ticker,
    tickerCallbacks,
    ScrollTrigger,
    /** One GSAP tick, time in seconds as GSAP gives it. */
    tick(seconds: number) {
      tickerCallbacks.forEach((callback) => callback(seconds));
    },
  };
}

function fakeDevice({ system = false, coarse = false } = {}) {
  const motionListeners = new Set<() => void>();
  const motionQuery = {
    matches: system,
    addEventListener: (_type: string, listener: () => void) => {
      motionListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      motionListeners.delete(listener);
    },
  };
  const calm = createCalmStore({
    matchMedia: () => motionQuery,
    sessionStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  } as unknown as Window);

  const pointerListeners = new Set<() => void>();
  const pointer = {
    matches: coarse,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      pointerListeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      pointerListeners.delete(listener);
    }),
  };

  return {
    calm,
    pointer,
    motionListeners,
    pointerListeners,
    setSystem(next: boolean) {
      motionQuery.matches = next;
      motionListeners.forEach((listener) => listener());
    },
    setCoarse(next: boolean) {
      pointer.matches = next;
      pointerListeners.forEach((listener) => listener());
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.scheduled.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("smooth scroll session", () => {
  const sessions: Array<{ dispose(): void }> = [];

  function setUp(device = fakeDevice()) {
    const fake = fakeModules();
    const load = vi.fn(async () => fake.modules);
    const session = createSmoothScroll({
      calm: device.calm,
      pointer: device.pointer,
      load,
      schedule,
    });
    sessions.push(session);
    return { device, fake, load, session };
  }

  afterEach(() => {
    for (const session of sessions.splice(0)) session.dispose();
  });

  it("REQ-PERF-04 loads nothing before first content", async () => {
    const { load } = setUp();
    await settle();
    expect(load).not.toHaveBeenCalled();

    await passFirstContent();
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("REQ-SCR-03 on a fine pointer with calm off, wires Lenis to GSAP's ticker as the Lenis README does", async () => {
    const { fake } = setUp();
    await passFirstContent();
    await settle();

    expect(fake.instances).toHaveLength(1);
    const lenis = fake.instances[0];
    // Lenis's defaults except one: the wheel keeps its distance and
    // syncTouch stays false (REQ-SCR-02), and a click on a link to another
    // page stops the inertia, so the new page starts at its top.
    expect(lenis?.args).toEqual([{ stopInertiaOnNavigate: true }]);
    expect(lenis?.scrollCallbacks).toEqual([fake.ScrollTrigger.update]);
    expect(fake.ticker.add).toHaveBeenCalledTimes(1);
    expect(fake.ticker.lagSmoothing).toHaveBeenCalledWith(0);

    fake.tick(2.5);
    expect(lenis?.raf).toHaveBeenCalledWith(2500);
  });

  it("REQ-SCR-03 never loads or creates Lenis on a coarse primary pointer", async () => {
    const { fake, load } = setUp(fakeDevice({ coarse: true }));
    await passFirstContent();
    await settle();

    expect(load).not.toHaveBeenCalled();
    expect(fake.instances).toHaveLength(0);
  });

  it("REQ-SCR-03 a browser that cannot answer the pointer question keeps native scroll", async () => {
    const device = fakeDevice();
    const load = vi.fn(async () => fakeModules().modules);
    createSmoothScroll({ calm: device.calm, pointer: null, load, schedule });
    await passFirstContent();
    await settle();

    expect(load).not.toHaveBeenCalled();
  });

  it("REQ-A11Y-03 never loads or creates Lenis under reduced motion", async () => {
    const { fake, load } = setUp(fakeDevice({ system: true }));
    await passFirstContent();
    await settle();

    expect(load).not.toHaveBeenCalled();
    expect(fake.instances).toHaveLength(0);
  });

  it("REQ-A11Y-04 calm turning on destroys Lenis and its ticker callback; turning off creates it again", async () => {
    const { device, fake, load } = setUp();
    await passFirstContent();
    await settle();
    const first = fake.instances[0];
    const tick = fake.ticker.add.mock.calls[0]?.[0];

    device.calm.setChosen(true);
    expect(first?.destroy).toHaveBeenCalledTimes(1);
    expect(fake.ticker.remove).toHaveBeenCalledWith(tick);
    expect(fake.tickerCallbacks.size).toBe(0);
    expect(fake.ticker.lagSmoothing).toHaveBeenLastCalledWith(500, 33);

    device.calm.setChosen(false);
    await settle();
    expect(fake.instances).toHaveLength(2);
    expect(fake.tickerCallbacks.size).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);

    fake.tick(1);
    expect(first?.raf).not.toHaveBeenCalled();
    expect(fake.instances[1]?.raf).toHaveBeenCalledWith(1000);
  });

  it("REQ-A11Y-03 reduced motion turning on mid-visit destroys Lenis", async () => {
    const { device, fake } = setUp();
    await passFirstContent();
    await settle();

    device.setSystem(true);
    expect(fake.instances[0]?.destroy).toHaveBeenCalledTimes(1);
    device.calm.setChosen(false);
    await settle();
    expect(fake.instances).toHaveLength(1);
  });

  it("REQ-SCR-03 a primary pointer that turns coarse stops Lenis, and a fine one starts it again", async () => {
    const { device, fake } = setUp();
    await passFirstContent();
    await settle();

    device.setCoarse(true);
    expect(fake.instances[0]?.destroy).toHaveBeenCalledTimes(1);
    device.setCoarse(false);
    await settle();
    expect(fake.instances).toHaveLength(2);
  });

  it("REQ-A11Y-04 calm that arrives while Lenis loads means no Lenis; calm that leaves again still gives one", async () => {
    const device = fakeDevice();
    const fake = fakeModules();
    let finish = (value: SmoothScrollModules) => {
      void value;
    };
    const load = vi.fn(
      () =>
        new Promise<SmoothScrollModules>((resolve) => {
          finish = resolve;
        }),
    );
    createSmoothScroll({
      calm: device.calm,
      pointer: device.pointer,
      load,
      schedule,
    });
    await passFirstContent();

    device.calm.setChosen(true);
    finish(fake.modules);
    await settle();
    expect(fake.instances).toHaveLength(0);

    device.calm.setChosen(false);
    await settle();
    expect(fake.instances).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("REQ-SCR-04 dispose destroys Lenis and removes the ticker callback and every listener", async () => {
    const { device, fake, session } = setUp();
    await passFirstContent();
    await settle();
    expect(device.motionListeners.size).toBe(1);
    expect(device.pointerListeners.size).toBe(1);

    session.dispose();
    session.dispose();
    expect(fake.instances[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(fake.tickerCallbacks.size).toBe(0);
    expect(device.motionListeners.size).toBe(0);
    expect(device.pointerListeners.size).toBe(0);

    device.calm.setChosen(true);
    device.calm.setChosen(false);
    await settle();
    expect(fake.instances).toHaveLength(1);
  });

  it("REQ-PERF-04 a dispose before first content cancels the wait and loads nothing", async () => {
    const { load, session } = setUp();
    session.dispose();
    await passFirstContent();
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("REQ-SCR-04 a dispose while Lenis loads creates no Lenis", async () => {
    const device = fakeDevice();
    const fake = fakeModules();
    let finish = (value: SmoothScrollModules) => {
      void value;
    };
    const session = createSmoothScroll({
      calm: device.calm,
      pointer: device.pointer,
      load: () =>
        new Promise<SmoothScrollModules>((resolve) => {
          finish = resolve;
        }),
      schedule,
    });
    await passFirstContent();

    session.dispose();
    finish(fake.modules);
    await settle();
    expect(fake.instances).toHaveLength(0);
    expect(fake.ticker.add).not.toHaveBeenCalled();
  });

  it("REQ-SCR-03 a failed load keeps native scroll, is logged, and is tried again on the next change", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const device = fakeDevice();
    const fake = fakeModules();
    const load = vi
      .fn<() => Promise<SmoothScrollModules>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(fake.modules);
    createSmoothScroll({
      calm: device.calm,
      pointer: device.pointer,
      load,
      schedule,
    });
    await passFirstContent();
    await settle();
    expect(fake.instances).toHaveLength(0);
    expect(logged.mock.calls[0]?.[0]).toBe("smooth scroll: no-lenis");

    device.calm.setChosen(true);
    device.calm.setChosen(false);
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(fake.instances).toHaveLength(1);
  });

  describe("a native scroll during a wheel glide", () => {
    const SCROLL_KEYS = [
      " ",
      "PageUp",
      "PageDown",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];

    /** A link with an arrow inside it, as TextLink draws one. */
    function addLink(href: string) {
      const link = document.createElement("a");
      link.setAttribute("href", href);
      const arrow = document.createElement("span");
      arrow.textContent = "→";
      link.append("Skip intro", arrow);
      document.body.append(link);
      return { link, arrow };
    }

    // jsdom would follow the link; only the order of the listeners matters.
    function clickOn(element: Element) {
      element.addEventListener("click", (event) => event.preventDefault(), {
        once: true,
      });
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    }

    function press(target: EventTarget, key: string) {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    }

    /** A Lenis with a wheel glide running. */
    async function withLenis() {
      const set = setUp();
      await passFirstContent();
      await settle();
      const lenis = set.fake.instances[0];
      if (lenis === undefined) throw new Error("No Lenis was made");
      lenis.isSmooth = true;
      return { ...set, lenis };
    }

    /**
     * How many times the glide was ended: stop() and then start(), the
     * public way to Lenis's private reset().
     */
    function glideEnds(lenis: FakeLenis | undefined): number {
      const stops = lenis?.stop.mock.invocationCallOrder ?? [];
      const starts = lenis?.start.mock.invocationCallOrder ?? [];
      expect(starts).toHaveLength(stops.length);
      stops.forEach((order, index) => {
        expect(order).toBeLessThan(starts[index] ?? 0);
      });
      return stops.length;
    }

    /** A same-page link click, a Page Down and a focus change. */
    function scrollNatively() {
      clickOn(addLink("#work").arrow);
      press(document.body, "PageDown");
      const button = document.createElement("button");
      document.body.append(button);
      button.focus();
    }

    it("REQ-NAV-01 REQ-SCR-02 a click on a link to a place on this page stops the glide before the link acts", async () => {
      const { lenis } = await withLenis();

      for (const href of ["#work", "#main", "/#work", "?view=all#work", "#"]) {
        const { link, arrow } = addLink(href);
        let endsAtLink = 0;
        link.addEventListener("click", () => {
          endsAtLink = glideEnds(lenis);
        });
        const before = glideEnds(lenis);
        clickOn(arrow);
        expect(glideEnds(lenis), href).toBe(before + 1);
        expect(endsAtLink, `${href}: ended before the link's own click`).toBe(
          before + 1,
        );
      }
    });

    it("REQ-SCR-02 a click on a link to another page or site, or off any link, leaves the glide alone", async () => {
      const { lenis } = await withLenis();

      for (const href of [
        "/work",
        "/work#coup-online",
        "/about?view=all",
        "https://example.com/#work",
      ]) {
        clickOn(addLink(href).arrow);
      }
      const text = document.createElement("p");
      document.body.append(text);
      clickOn(text);
      expect(glideEnds(lenis)).toBe(0);
    });

    it("REQ-SCR-02 each scroll key stops the glide before the browser scrolls; other keys and keys in a text field do not", async () => {
      const { lenis } = await withLenis();
      let endsAtBody = 0;
      document.body.addEventListener("keydown", () => {
        endsAtBody = glideEnds(lenis);
      });

      for (const [index, key] of SCROLL_KEYS.entries()) {
        press(document.body, key);
        expect(glideEnds(lenis), JSON.stringify(key)).toBe(index + 1);
        expect(endsAtBody, JSON.stringify(key)).toBe(index + 1);
      }

      for (const key of ["a", "Enter", "Tab", "Escape", "ArrowLeft"]) {
        press(document.body, key);
      }
      const input = document.createElement("input");
      const area = document.createElement("textarea");
      document.body.append(input, area);
      for (const key of SCROLL_KEYS) {
        press(input, key);
        press(area, key);
      }
      expect(glideEnds(lenis)).toBe(SCROLL_KEYS.length);
    });

    it("REQ-NAV-01 REQ-SCR-02 a focus change stops the glide, so the scroll that brings the focused element into view stands", async () => {
      const { lenis } = await withLenis();
      const first = document.createElement("button");
      const second = document.createElement("a");
      second.setAttribute("href", "/work");
      document.body.append(first, second);

      first.focus();
      expect(glideEnds(lenis)).toBe(1);
      second.focus();
      expect(glideEnds(lenis)).toBe(2);
    });

    it("REQ-SCR-02 with no glide running, a click, key or focus leaves Lenis alone", async () => {
      const { lenis } = await withLenis();
      lenis.isSmooth = false;
      scrollNatively();
      expect(glideEnds(lenis)).toBe(0);
    });

    it("REQ-SCR-02 REQ-SCR-04 REQ-A11Y-04 no click, key or focus reaches a Lenis that calm or a dispose removed", async () => {
      const { device, fake, session, lenis } = await withLenis();

      device.calm.setChosen(true);
      scrollNatively();
      expect(glideEnds(lenis)).toBe(0);

      device.calm.setChosen(false);
      await settle();
      const next = fake.instances[1];
      if (next !== undefined) next.isSmooth = true;
      scrollNatively();
      expect(glideEnds(next)).toBe(3);
      expect(glideEnds(lenis)).toBe(0);

      session.dispose();
      scrollNatively();
      expect(glideEnds(next)).toBe(3);
      expect(glideEnds(lenis)).toBe(0);
    });
  });
});

describe("SmoothScroll", () => {
  function stubPointer(coarse: boolean) {
    const matchMedia = vi.fn(() => ({
      matches: coarse,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);
    return matchMedia;
  }

  function useFakeLibraries() {
    const fake = fakeModules();
    mocks.loadLenis.mockReset();
    mocks.loadScrollTrigger.mockReset();
    mocks.loadMotion.mockReset();
    mocks.loadLenis.mockResolvedValue(fake.modules.Lenis);
    mocks.loadScrollTrigger.mockResolvedValue({
      gsap: fake.modules.gsap,
      ScrollTrigger: fake.modules.ScrollTrigger,
    });
    return fake;
  }

  afterEach(() => {
    calmStore.setChosen(false);
  });

  it("REQ-SCR-03 renders nothing, creates Lenis after first content on a fine pointer, and unmount destroys it", async () => {
    const matchMedia = stubPointer(false);
    const fake = useFakeLibraries();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SmoothScroll />);
    });
    expect(container.childNodes).toHaveLength(0);
    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
    expect(mocks.loadLenis).not.toHaveBeenCalled();

    await passFirstContent();
    await settle();
    expect(mocks.loadLenis).toHaveBeenCalledTimes(1);
    expect(mocks.loadScrollTrigger).toHaveBeenCalledTimes(1);
    expect(fake.instances).toHaveLength(1);

    await act(async () => {
      root.unmount();
    });
    expect(fake.instances[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(fake.tickerCallbacks.size).toBe(0);
  });

  it("REQ-PERF-04 the component loads GSAP and ScrollTrigger alone, never the story's loader that adds SplitText", async () => {
    stubPointer(false);
    const fake = useFakeLibraries();
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(<SmoothScroll />);
    });
    await passFirstContent();
    await settle();
    expect(fake.instances).toHaveLength(1);
    expect(mocks.loadScrollTrigger).toHaveBeenCalledTimes(1);
    expect(mocks.loadMotion).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("REQ-SCR-03 on a coarse pointer the component loads no motion library", async () => {
    stubPointer(true);
    useFakeLibraries();
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(<SmoothScroll />);
    });
    await passFirstContent();
    await settle();
    expect(mocks.loadLenis).not.toHaveBeenCalled();
    expect(mocks.loadScrollTrigger).not.toHaveBeenCalled();
    expect(mocks.loadMotion).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("REQ-A11Y-04 the toggle's calm reaches the component's Lenis", async () => {
    stubPointer(false);
    const fake = useFakeLibraries();
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<SmoothScroll />);
    });
    await passFirstContent();
    await settle();

    await act(async () => {
      calmStore.setChosen(true);
    });
    expect(fake.instances[0]?.destroy).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });
});
