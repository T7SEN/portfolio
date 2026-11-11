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
  raf: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function fakeModules() {
  const instances: FakeLenis[] = [];
  const tickerCallbacks = new Set<(time: number) => void>();

  class Lenis implements FakeLenis {
    readonly args: unknown[];
    readonly scrollCallbacks: Array<() => void> = [];
    raf = vi.fn();
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
  function setUp(device = fakeDevice()) {
    const fake = fakeModules();
    const load = vi.fn(async () => fake.modules);
    const session = createSmoothScroll({
      calm: device.calm,
      pointer: device.pointer,
      load,
      schedule,
    });
    return { device, fake, load, session };
  }

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
