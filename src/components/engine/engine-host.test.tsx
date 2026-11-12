import { act, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Engine,
  EngineEvent,
  EngineListener,
  EngineOptions,
} from "@/engine/types";
import { calmStore, createCalmStore } from "@/lib/calm-store";
import { createStoryBridge, storyBridge } from "@/lib/story-bridge";
import { tierStore } from "@/lib/tier-store";

import { EngineHost } from "./engine-host";
import { createEngineSession } from "./engine-session";

const mocks = vi.hoisted(() => {
  // The OS reduced motion setting that the host's calm store reads.
  const motionListeners = new Set<() => void>();
  const reducedMotion = {
    matches: false,
    addEventListener: (_type: string, listener: () => void) => {
      motionListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      motionListeners.delete(listener);
    },
  };
  const stored = new Map<string, string>();

  return {
    pathname: "/",
    scheduled: [] as Array<{ run: () => void; isCancelled: boolean }>,
    loadEngine: vi.fn(),
    calmWindow: {
      matchMedia: () => reducedMotion,
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => {
          stored.set(key, value);
        },
        removeItem: (key: string) => {
          stored.delete(key);
        },
      },
    },
    setSystemCalm(next: boolean) {
      reducedMotion.matches = next;
      motionListeners.forEach((listener) => listener());
    },
  };
});

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("./load-engine", () => ({ loadEngine: mocks.loadEngine }));
vi.mock("./after-first-content", () => ({
  afterFirstContent: (run: () => void) => {
    const entry = { run, isCancelled: false };
    mocks.scheduled.push(entry);
    return () => {
      entry.isCancelled = true;
    };
  },
}));
// The real calm store, over a window whose OS setting the tests control.
vi.mock("@/lib/calm-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calm-store")>();
  return {
    ...actual,
    calmStore: actual.createCalmStore(mocks.calmWindow as unknown as Window),
  };
});

type FakeEngine = Engine & {
  host: HTMLElement;
  options: EngineOptions | undefined;
  calls: string[];
  emit(event: EngineEvent): void;
};

const engines: FakeEngine[] = [];

function createFakeEngine(host: HTMLElement, options?: EngineOptions) {
  const listeners = new Set<EngineListener>();
  const calls: string[] = [];
  const engine: FakeEngine = {
    host,
    options,
    calls,
    emit: (event) => listeners.forEach((listener) => listener(event)),
    start: vi.fn(async () => {
      calls.push("start");
    }),
    setTier: vi.fn(),
    setStory: vi.fn(),
    setStage: vi.fn(),
    setPasses: vi.fn(),
    setPointer: vi.fn(),
    setCalm: vi.fn(),
    on: (listener) => {
      calls.push("on");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn(async () => {
      calls.push("dispose");
    }),
  };
  engines.push(engine);
  return engine;
}

/** A calm store of its own for one session, with the OS setting in hand. */
function fakeCalm({ system = false } = {}) {
  const listeners = new Set<() => void>();
  const query = {
    matches: system,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };
  const matchMedia = vi.fn(() => query);
  const store = createCalmStore({
    matchMedia,
    sessionStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  } as unknown as Window);

  return {
    store,
    matchMedia,
    listeners,
    setSystem(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

/** Runs what afterFirstContent was given, as the browser would when idle. */
async function passFirstContent() {
  const due = mocks.scheduled.filter((entry) => !entry.isCancelled);
  mocks.scheduled.length = 0;
  await act(async () => {
    for (const entry of due) entry.run();
  });
}

/** Lets the browser draw one frame, so a waiting pointer move is sent. */
async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.pathname = "/";
  mocks.scheduled.length = 0;
  mocks.loadEngine.mockReset();
  mocks.loadEngine.mockResolvedValue({ createEngine: createFakeEngine });
  engines.length = 0;
});

afterEach(() => {
  tierStore.reset();
  storyBridge.reset();
  mocks.setSystemCalm(false);
  calmStore.setChosen(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("engine session", () => {
  function setUp({ calm = fakeCalm(), bridge = createStoryBridge() } = {}) {
    const wrapper = document.createElement("div");
    const host = document.createElement("div");
    wrapper.append(host);
    const session = createEngineSession(wrapper, host, {
      calm: calm.store,
      bridge,
    });
    return { wrapper, host, calm, bridge, session };
  }

  it("REQ-PERF-04 loads nothing until the field is asked for and first content has passed", async () => {
    const { session } = setUp();
    expect(mocks.scheduled).toHaveLength(0);

    session.request();
    expect(mocks.loadEngine).not.toHaveBeenCalled();

    await passFirstContent();
    expect(mocks.loadEngine).toHaveBeenCalledTimes(1);
  });

  it("REQ-ENG-03 creates one engine on the host, subscribes, then starts it", async () => {
    const { host, session } = setUp();
    session.request();
    await passFirstContent();

    expect(engines).toHaveLength(1);
    expect(engines[0]?.host).toBe(host);
    expect(engines[0]?.calls).toEqual(["on", "start"]);

    session.request();
    await passFirstContent();
    expect(mocks.loadEngine).toHaveBeenCalledTimes(1);
    expect(engines).toHaveLength(1);
  });

  it("REQ-PERF-04 a request cancelled before first content never loads the engine", async () => {
    const { session } = setUp();
    session.request()();
    await passFirstContent();
    expect(mocks.loadEngine).not.toHaveBeenCalled();
  });

  it("REQ-A11Y-03 starts calm under reduced motion and follows the setting live", async () => {
    const calm = fakeCalm({ system: true });
    const { session } = setUp({ calm });
    expect(calm.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
    session.request();
    await passFirstContent();
    expect(engines[0]?.options).toEqual({ calm: true });

    calm.setSystem(false);
    calm.setSystem(true);
    expect(engines[0]?.setCalm).toHaveBeenNthCalledWith(1, false);
    expect(engines[0]?.setCalm).toHaveBeenNthCalledWith(2, true);
  });

  it("REQ-A11Y-04 the calm toggle's choice starts the engine calm and reaches it live", async () => {
    const { calm, session } = setUp();
    calm.store.setChosen(true);
    session.request();
    await passFirstContent();
    expect(engines[0]?.options).toEqual({ calm: true });

    calm.store.setChosen(false);
    expect(engines[0]?.setCalm).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("REQ-A11Y-03 a change that leaves calm as it was sends the engine nothing", async () => {
    const calm = fakeCalm({ system: true });
    const { session } = setUp({ calm });
    session.request();
    await passFirstContent();

    calm.store.setChosen(true);
    calm.setSystem(false);
    expect(engines[0]?.setCalm).not.toHaveBeenCalled();

    calm.store.setChosen(false);
    expect(engines[0]?.setCalm).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("REQ-A11Y-03 an OS change made before the engine loads is counted when it is created", async () => {
    const calm = fakeCalm();
    const { session } = setUp({ calm });
    session.request();
    calm.setSystem(true);
    await passFirstContent();

    expect(engines[0]?.options).toEqual({ calm: true });
    expect(engines[0]?.setCalm).not.toHaveBeenCalled();
  });

  it("REQ-SCR-01 the page's stages reach the engine ahead of the story, and later ones follow", async () => {
    const { bridge, session } = setUp();
    const hero = { x: 0, y: -0.6, halfWidth: 0, halfHeight: 0 };
    bridge.setStage({ hero });
    bridge.setStory("hero", 0.2);
    session.request();
    await passFirstContent();

    const engine = engines[0];
    if (engine === undefined) throw new Error("No engine was created");
    expect(engine.setStage).toHaveBeenCalledExactlyOnceWith({ hero });
    const [stageOrder] = vi.mocked(engine.setStage).mock.invocationCallOrder;
    const [storyOrder] = vi.mocked(engine.setStory).mock.invocationCallOrder;
    expect(stageOrder).toBeLessThan(storyOrder ?? 0);

    bridge.setStage({});
    expect(engine.setStage).toHaveBeenLastCalledWith({});
  });

  it("REQ-ENG-09 the pass cards reach the engine as it is created, ahead of the story, and later ones follow", async () => {
    const { bridge, session } = setUp();
    const corners = [
      { x: -0.4, y: 0.2 },
      { x: -0.1, y: 0.2 },
      { x: -0.1, y: -0.3 },
      { x: -0.4, y: -0.3 },
    ] as const;
    const cards = [{ pass: "velocity" as const, corners }];
    bridge.setPasses(cards);
    bridge.setStory("making-of", 0.5);
    session.request();
    await passFirstContent();

    const engine = engines[0];
    if (engine === undefined) throw new Error("No engine was created");
    expect(engine.setPasses).toHaveBeenCalledExactlyOnceWith(cards);
    const [passesOrder] = vi.mocked(engine.setPasses).mock.invocationCallOrder;
    const [storyOrder] = vi.mocked(engine.setStory).mock.invocationCallOrder;
    expect(passesOrder).toBeLessThan(storyOrder ?? 0);

    bridge.setPasses(null);
    expect(engine.setPasses).toHaveBeenLastCalledWith(null);
  });

  it("REQ-ENG-08 REQ-ENG-09 with no engine the cards go nowhere, and the bridge keeps them for the page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadEngine.mockRejectedValue(new Error("chunk failed"));
    const { bridge, session } = setUp();
    session.request();
    await passFirstContent();

    const cards = [
      {
        pass: "glow" as const,
        corners: [
          { x: 0, y: 0 },
          { x: 0.2, y: 0 },
          { x: 0.2, y: -0.2 },
          { x: 0, y: -0.2 },
        ] as const,
      },
    ];
    expect(() => bridge.setPasses(cards)).not.toThrow();
    expect(engines).toHaveLength(0);

    const later = {
      setStory: vi.fn(),
      setStage: vi.fn(),
      setPasses: vi.fn(),
      setPointer: vi.fn(),
      setVeil: vi.fn(),
    };
    bridge.connect(later);
    expect(later.setPasses).toHaveBeenCalledExactlyOnceWith(cards);
  });

  it("REQ-A11Y-06 the page's veil lies over a live field only; tier 3's still and a closed session keep the measured one", async () => {
    const { bridge, session, wrapper } = setUp();
    const veil = () => wrapper.style.getPropertyValue("--field-veil");
    bridge.setVeil(0.35);
    expect(veil()).toBe("");

    session.request();
    await passFirstContent();
    const engine = engines[0];
    if (engine === undefined) throw new Error("No engine was created");
    engine.emit({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
    expect(veil()).toBe("0.35");
    bridge.setVeil(0.5);
    expect(veil()).toBe("0.5");
    bridge.setVeil(null);
    expect(veil()).toBe("");
    bridge.setVeil(0.4);

    engine.emit({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(veil()).toBe("");
    engine.emit({ type: "tierChosen", tier: 1, reason: "forced" });
    expect(veil()).toBe("0.4");

    await session.dispose();
    expect(veil()).toBe("");
  });

  it("REQ-SCR-01 the latest story and pointer reach the engine before it starts, and later ones follow", async () => {
    const { bridge, session } = setUp();
    bridge.setStory("hero", 0.2);
    bridge.setStory("bloom", 0.5);
    bridge.setPointer(0.2, 0.3, true);
    session.request();
    await passFirstContent();

    const engine = engines[0];
    if (engine === undefined) throw new Error("No engine was created");
    expect(engine.setStory).toHaveBeenCalledExactlyOnceWith("bloom", 0.5);
    expect(engine.setPointer).toHaveBeenCalledExactlyOnceWith(0.2, 0.3, true);
    const [storyOrder] = vi.mocked(engine.setStory).mock.invocationCallOrder;
    const [startOrder] = vi.mocked(engine.start).mock.invocationCallOrder;
    expect(storyOrder).toBeLessThan(startOrder ?? 0);

    bridge.setStory("work", 0.25);
    bridge.setPointer(-0.5, 0.5, false);
    expect(engine.setStory).toHaveBeenLastCalledWith("work", 0.25);
    expect(engine.setPointer).toHaveBeenLastCalledWith(-0.5, 0.5, false);
  });

  it("REQ-SCR-01 the wrapper mirrors the chapter from the first story sent, before the engine loads and on tier 3", async () => {
    const { wrapper, bridge, session } = setUp();
    bridge.setStory("hero", 1);
    expect(wrapper.dataset.chapter).toBe("hero");

    session.request();
    await passFirstContent();
    engines[0]?.emit({ type: "tierChosen", tier: 3, reason: "save-data" });
    engines[0]?.emit({ type: "ready", tier: 3, particles: 0 });

    bridge.setStory("bloom", 0.1);
    expect(wrapper.dataset.chapter).toBe("bloom");
    // The engine keeps it for a GPU tier that setTier may bring back.
    expect(engines[0]?.setStory).toHaveBeenLastCalledWith("bloom", 0.1);
  });

  it("REQ-SCR-01 the chapter attribute is written only when the chapter changes", async () => {
    const { wrapper, bridge, session } = setUp();
    session.request();
    await passFirstContent();
    const observer = new MutationObserver(() => undefined);
    observer.observe(wrapper, { attributes: true });

    bridge.setStory("work", 0.1);
    bridge.setStory("work", 0.2);
    bridge.setStory("work", 0.3);
    bridge.setStory("making-of", 0);

    const names = observer.takeRecords().map((record) => record.attributeName);
    observer.disconnect();
    expect(names).toEqual(["data-chapter", "data-chapter"]);
    expect(engines[0]?.setStory).toHaveBeenCalledTimes(4);
  });

  it("REQ-ENG-03 sends tierChosen and ready, with the particles the field draws, to the store and mirrors them on the wrapper", async () => {
    const { wrapper, session } = setUp();
    expect(wrapper.hasAttribute("data-ready")).toBe(false);
    session.request();
    await passFirstContent();

    engines[0]?.emit({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    expect(wrapper.dataset.tier).toBe("1");
    expect(wrapper.dataset.tierReason).toBe("probe-pass");
    expect(wrapper.dataset.ready).toBe("false");
    expect(tierStore.getSnapshot()).toEqual({
      tier: 1,
      reason: "probe-pass",
      ready: false,
      particles: null,
      look: null,
    });
    expect(wrapper.hasAttribute("data-look")).toBe(false);

    engines[0]?.emit({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "halftone",
    });
    expect(wrapper.dataset.ready).toBe("true");
    expect(wrapper.dataset.look).toBe("halftone");
    expect(tierStore.getSnapshot().ready).toBe(true);
    expect(tierStore.getSnapshot().particles).toBe(1_000_000);
    expect(tierStore.getSnapshot().look).toBe("halftone");
  });

  it("REQ-ENG-08 a change of tier is not ready until the new tier reports ready", async () => {
    const { wrapper, session } = setUp();
    session.request();
    await passFirstContent();
    engines[0]?.emit({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    engines[0]?.emit({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "halftone",
    });
    expect(wrapper.dataset.look).toBe("halftone");

    engines[0]?.emit({ type: "tierChosen", tier: 2, reason: "device-lost" });
    expect(wrapper.dataset.tier).toBe("2");
    expect(wrapper.dataset.tierReason).toBe("device-lost");
    expect(wrapper.dataset.ready).toBe("false");
    expect(wrapper.hasAttribute("data-look")).toBe(false);

    expect(tierStore.getSnapshot().particles).toBeNull();

    engines[0]?.emit({ type: "ready", tier: 2, particles: 250_000 });
    expect(wrapper.dataset.ready).toBe("true");
    expect(tierStore.getSnapshot().particles).toBe(250_000);
  });

  it("REQ-ENG-03 writes data-fps on every frameRate event, without waking the store", async () => {
    const { wrapper, session } = setUp();
    session.request();
    await passFirstContent();
    const storeListener = vi.fn();
    const unsubscribe = tierStore.subscribe(storeListener);
    const observer = new MutationObserver(() => undefined);
    observer.observe(wrapper, { attributes: true });

    engines[0]?.emit({ type: "frameRate", fps: 60 });
    engines[0]?.emit({ type: "frameRate", fps: 60 });

    const names = observer.takeRecords().map((record) => record.attributeName);
    observer.disconnect();
    unsubscribe();
    expect(names).toEqual(["data-fps", "data-fps"]);
    expect(wrapper.dataset.fps).toBe("60");
    expect(storeListener).not.toHaveBeenCalled();
  });

  it("REQ-ENG-08 a failed import becomes tier 3 with the reason no-backend, and ready", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadEngine.mockRejectedValue(new Error("chunk failed"));
    const { wrapper, session } = setUp();
    session.request();
    await passFirstContent();

    expect(tierStore.getSnapshot()).toEqual({
      tier: 3,
      reason: "no-backend",
      ready: true,
      particles: 0,
      look: null,
    });
    expect(wrapper.dataset.tier).toBe("3");
    expect(wrapper.dataset.tierReason).toBe("no-backend");
    expect(wrapper.dataset.ready).toBe("true");
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toBe("engine: no-backend");
  });

  it("REQ-ENG-08 a start that rejects becomes tier 3 too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadEngine.mockResolvedValue({
      createEngine: (host: HTMLElement, options?: EngineOptions) => {
        const engine = createFakeEngine(host, options);
        engine.start = () => Promise.reject(new Error("no start"));
        return engine;
      },
    });
    const { wrapper, session } = setUp();
    session.request();
    await passFirstContent();

    expect(wrapper.dataset.tier).toBe("3");
    expect(tierStore.getSnapshot().reason).toBe("no-backend");
  });

  it("REQ-ENG-08 when the engine cannot load, the bridge still mirrors the chapter", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadEngine.mockRejectedValue(new Error("offline"));
    const { wrapper, bridge, session } = setUp();
    session.request();
    await passFirstContent();

    bridge.setStory("about", 0.4);
    bridge.setPointer(0, 0, true);
    expect(wrapper.dataset.chapter).toBe("about");
    expect(engines).toHaveLength(0);
  });

  it("REQ-ENG-08 after a start that rejects, the bridge only mirrors the chapter", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadEngine.mockResolvedValue({
      createEngine: (host: HTMLElement, options?: EngineOptions) => {
        const engine = createFakeEngine(host, options);
        engine.start = () => Promise.reject(new Error("no start"));
        return engine;
      },
    });
    const { wrapper, bridge, session } = setUp();
    session.request();
    await passFirstContent();

    bridge.setStory("contact", 0.5);
    expect(wrapper.dataset.chapter).toBe("contact");
    expect(engines[0]?.setStory).not.toHaveBeenCalled();
  });

  it("REQ-ENG-07 dispose awaits the engine's dispose once, clears the store and the wrapper, and stops listening", async () => {
    const { wrapper, calm, bridge, session } = setUp();
    bridge.setStory("work", 0.5);
    session.request();
    await passFirstContent();
    engines[0]?.emit({ type: "tierChosen", tier: 2, reason: "phone" });
    engines[0]?.emit({ type: "ready", tier: 2, particles: 100_000 });
    engines[0]?.emit({ type: "frameRate", fps: 30 });
    expect(calm.listeners.size).toBe(1);

    let isSettled = false;
    let finishDispose = () => {};
    const engine = engines[0];
    if (engine === undefined) throw new Error("No engine was created");
    engine.dispose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDispose = resolve;
        }),
    );

    const first = session.dispose().then(() => {
      isSettled = true;
    });
    const second = session.dispose();
    await Promise.resolve();
    expect(isSettled).toBe(false);
    finishDispose();
    await Promise.all([first, second]);

    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(calm.listeners.size).toBe(0);
    expect(tierStore.getSnapshot()).toBe(tierStore.getServerSnapshot());
    for (const name of ["tier", "tier-reason", "ready", "fps", "chapter"]) {
      expect(wrapper.hasAttribute(`data-${name}`)).toBe(false);
    }

    engine.emit({ type: "tierChosen", tier: 1, reason: "forced" });
    expect(wrapper.hasAttribute("data-tier")).toBe(false);
    expect(tierStore.getSnapshot().tier).toBeNull();

    // The page owns the story: the bridge keeps it and sends nothing on.
    calm.store.setChosen(true);
    bridge.setStory("about", 0.1);
    expect(bridge.getStory()).toEqual({ chapter: "about", progress: 0.1 });
    expect(engine.setStory).toHaveBeenCalledExactlyOnceWith("work", 0.5);
    expect(engine.setCalm).not.toHaveBeenCalled();
    expect(wrapper.hasAttribute("data-chapter")).toBe(false);
  });

  it("REQ-ENG-07 a dispose while the engine is still loading creates no engine", async () => {
    let finishLoad = (value: { createEngine: typeof createFakeEngine }) => {
      void value;
    };
    mocks.loadEngine.mockReturnValue(
      new Promise((resolve) => {
        finishLoad = resolve;
      }),
    );
    const { calm, session } = setUp();
    session.request();
    await passFirstContent();

    await session.dispose();
    finishLoad({ createEngine: createFakeEngine });
    await Promise.resolve();
    await Promise.resolve();
    expect(engines).toHaveLength(0);
    expect(calm.listeners.size).toBe(0);
  });

  it("REQ-ENG-07 a dispose that rejects is logged, never thrown", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { session } = setUp();
    session.request();
    await passFirstContent();
    const engine = engines[0];
    if (engine === undefined) throw new Error("No engine was created");
    engine.dispose = () => Promise.reject(new Error("lost"));

    await expect(session.dispose()).resolves.toBeUndefined();
    expect(logged.mock.calls[0]?.[0]).toBe("engine: dispose");
  });
});

describe("EngineHost", () => {
  let container: HTMLDivElement;
  let root: Root;
  let isUnmounted = false;

  async function render(element: ReactElement = <EngineHost />) {
    await act(async () => {
      root.render(element);
    });
  }

  async function goTo(pathname: string) {
    mocks.pathname = pathname;
    await render();
  }

  function parts() {
    const wrapper = container.querySelector<HTMLElement>(
      '[data-testid="engine-field"]',
    );
    if (wrapper === null) throw new Error("The wrapper is missing");
    return {
      wrapper,
      host: wrapper.querySelector('[data-part="host"]'),
      veil: wrapper.querySelector('[data-part="veil"]'),
      still: wrapper.querySelector<HTMLImageElement>('[data-part="still"]'),
    };
  }

  async function emit(event: EngineEvent) {
    await act(async () => {
      engines[0]?.emit(event);
    });
  }

  async function unmount() {
    if (isUnmounted) return;
    isUnmounted = true;
    await act(async () => {
      root.unmount();
    });
  }

  /** A mouse move to a point given as a share of the viewport. */
  async function moveMouse(shareX: number, shareY: number) {
    await act(async () => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerType: "mouse",
          clientX: window.innerWidth * shareX,
          clientY: window.innerHeight * shareY,
        }),
      );
    });
    await nextFrame();
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    isUnmounted = false;
  });

  afterEach(unmount);

  it("REQ-CNT-01 the static HTML holds an empty wrapper, hidden from screen readers, and no picture", () => {
    const html = document.createElement("div");
    html.innerHTML = renderToStaticMarkup(<EngineHost />);
    const wrapper = html.firstElementChild;

    expect(html.children).toHaveLength(1);
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper?.hasAttribute("hidden")).toBe(false);
    expect(
      wrapper?.querySelector('[data-part="host"]')?.childNodes,
    ).toHaveLength(0);
    expect(wrapper?.querySelector('[data-part="veil"]')).not.toBeNull();
    expect(html.querySelector("img, picture, canvas")).toBeNull();
    for (const name of [
      "data-tier",
      "data-ready",
      "data-fps",
      "data-chapter",
    ]) {
      expect(wrapper?.hasAttribute(name)).toBe(false);
    }
  });

  it("REQ-PERF-07 the wrapper sits behind the page, takes no pointer and stays transparent until ready", () => {
    const html = document.createElement("div");
    html.innerHTML = renderToStaticMarkup(<EngineHost />);
    const names = html.firstElementChild?.className.split(" ") ?? [];

    for (const name of [
      "fixed",
      "inset-0",
      "-z-10",
      "pointer-events-none",
      "opacity-0",
      "transition-opacity",
      "data-[ready=true]:opacity-100",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("REQ-A11Y-01 the veil takes its strength from the one custom property set on the wrapper", () => {
    const html = document.createElement("div");
    html.innerHTML = renderToStaticMarkup(<EngineHost />);
    const wrapper = html.firstElementChild;
    const veil = wrapper?.querySelector('[data-part="veil"]');

    expect(
      wrapper?.className
        .split(" ")
        .filter((name) => name.startsWith("[--field-veil:")),
    ).toHaveLength(1);
    expect(veil?.className.split(" ")).toContain("opacity-(--field-veil)");
    expect(veil?.className.split(" ")).toContain("bg-void");
  });

  it("REQ-A11Y-06 REQ-TIER-03 tier 3's still lies under a veil of 0.75, where a glow dot of the sprinkle behind muted text read 4.49 to 1 at 0.7", () => {
    const html = document.createElement("div");
    html.innerHTML = renderToStaticMarkup(<EngineHost />);
    const classes = html.firstElementChild?.className.split(" ") ?? [];

    expect(classes).toContain("[--field-veil:0.7]");
    expect(classes).toContain("data-[tier=3]:[--field-veil:0.75]");
  });

  it("REQ-CNT-02 a route without the field hides the wrapper and loads nothing", async () => {
    mocks.pathname = "/work";
    await render();
    await passFirstContent();

    expect(parts().wrapper.hidden).toBe(true);
    expect(mocks.scheduled).toHaveLength(0);
    expect(mocks.loadEngine).not.toHaveBeenCalled();
    expect(engines).toHaveLength(0);
  });

  it("REQ-CNT-02 the static HTML of a route without the field carries the hidden attribute", () => {
    mocks.pathname = "/work/coup-online";
    const html = document.createElement("div");
    html.innerHTML = renderToStaticMarkup(<EngineHost />);
    expect(html.firstElementChild?.hasAttribute("hidden")).toBe(true);
  });

  it("REQ-PERF-04 on the home route the engine loads only after first content", async () => {
    await render();
    expect(parts().wrapper.hidden).toBe(false);
    expect(mocks.loadEngine).not.toHaveBeenCalled();

    await passFirstContent();
    expect(mocks.loadEngine).toHaveBeenCalledTimes(1);
    expect(engines).toHaveLength(1);
    expect(engines[0]?.host).toBe(parts().host);
    expect(engines[0]?.options).toEqual({ calm: false });
  });

  it("REQ-ENG-01 one engine and one host element survive every route change", async () => {
    await render();
    await passFirstContent();
    const first = parts();
    const canvas = document.createElement("canvas");
    first.host?.append(canvas);

    await goTo("/work");
    expect(parts().wrapper.hidden).toBe(true);
    await goTo("/about");
    await goTo("/");
    await passFirstContent();

    const last = parts();
    expect(last.wrapper).toBe(first.wrapper);
    expect(last.host).toBe(first.host);
    expect(last.host?.firstChild).toBe(canvas);
    expect(last.wrapper.hidden).toBe(false);
    expect(mocks.loadEngine).toHaveBeenCalledTimes(1);
    expect(engines).toHaveLength(1);
    expect(engines[0]?.dispose).not.toHaveBeenCalled();
  });

  it("REQ-CNT-02 leaving the home route before first content cancels the load, and coming back asks again", async () => {
    await render();
    await goTo("/work");
    await passFirstContent();
    expect(mocks.loadEngine).not.toHaveBeenCalled();

    await goTo("/");
    await passFirstContent();
    expect(mocks.loadEngine).toHaveBeenCalledTimes(1);
  });

  it("REQ-ENG-07 strict mode's second mount still gives one engine", async () => {
    await render(
      <StrictMode>
        <EngineHost />
      </StrictMode>,
    );
    await passFirstContent();

    expect(mocks.loadEngine).toHaveBeenCalledTimes(1);
    expect(engines).toHaveLength(1);
    expect(engines[0]?.dispose).not.toHaveBeenCalled();

    await emit({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    expect(parts().wrapper.dataset.tier).toBe("1");
  });

  it("REQ-ENG-07 strict mode's second mount leaves the bridge connected to the one engine", async () => {
    await render(
      <StrictMode>
        <EngineHost />
      </StrictMode>,
    );
    await passFirstContent();

    storyBridge.setStory("hero", 1);
    expect(engines[0]?.setStory).toHaveBeenCalledExactlyOnceWith("hero", 1);
    expect(parts().wrapper.dataset.chapter).toBe("hero");
  });

  it("REQ-ENG-07 unmounting disposes the engine", async () => {
    await render();
    await passFirstContent();
    await unmount();
    expect(engines[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("REQ-ENG-03 the mirrored attributes survive a render", async () => {
    await render();
    await passFirstContent();
    await emit({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
    await emit({ type: "ready", tier: 2, particles: 250_000 });
    await emit({ type: "frameRate", fps: 58 });
    storyBridge.setStory("work", 0.5);
    await goTo("/work");
    await goTo("/");

    const { wrapper, still } = parts();
    expect(wrapper.dataset.tier).toBe("2");
    expect(wrapper.dataset.tierReason).toBe("no-webgpu");
    expect(wrapper.dataset.ready).toBe("true");
    expect(wrapper.dataset.fps).toBe("58");
    expect(wrapper.dataset.chapter).toBe("work");
    expect(still).toBeNull();
  });

  it("REQ-TIER-03 tier 3 shows the still, wide or tall by orientation, as decoration that loads late", async () => {
    await render();
    await passFirstContent();
    expect(parts().still).toBeNull();

    await emit({ type: "tierChosen", tier: 3, reason: "save-data" });
    await emit({ type: "ready", tier: 3, particles: 0 });

    const { still, host, veil } = parts();
    const source = still?.parentElement?.querySelector("source");
    expect(still?.parentElement?.tagName).toBe("PICTURE");
    expect(still?.getAttribute("src")).toBe("/still/field-wide.webp");
    expect(source?.getAttribute("srcset")).toBe("/still/field-tall.webp");
    expect(source?.getAttribute("media")).toBe("(orientation: portrait)");
    expect(still?.getAttribute("alt")).toBe("");
    expect(still?.getAttribute("decoding")).toBe("async");
    expect(still?.getAttribute("fetchpriority")).toBe("low");
    expect(still?.className.split(" ")).toContain("object-cover");
    expect(host?.childNodes).toHaveLength(0);
    // The veil comes after the still, so it dims the still as well.
    expect(still?.parentElement?.compareDocumentPosition(veil as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("REQ-TIER-03 the still fades in once it has loaded", async () => {
    await render();
    await passFirstContent();
    await emit({ type: "tierChosen", tier: 3, reason: "no-backend" });
    const { still } = parts();
    expect(still?.className.split(" ")).toContain("opacity-0");

    await act(async () => {
      still?.dispatchEvent(new Event("load"));
    });
    expect(parts().still?.className.split(" ")).toContain("opacity-100");
    expect(parts().still?.className.split(" ")).not.toContain("opacity-0");
  });

  it("REQ-ENG-08 a still that fails to load is removed", async () => {
    await render();
    await passFirstContent();
    await emit({ type: "tierChosen", tier: 3, reason: "no-backend" });

    await act(async () => {
      parts().still?.dispatchEvent(new Event("error"));
    });
    expect(parts().still).toBeNull();
    expect(container.querySelector("picture")).toBeNull();
  });

  it("REQ-TIER-03 the still leaves when the tier rises and on routes without the field", async () => {
    await render();
    await passFirstContent();
    await emit({ type: "tierChosen", tier: 3, reason: "save-data" });
    expect(parts().still).not.toBeNull();

    await goTo("/work");
    expect(parts().still).toBeNull();
    await goTo("/");
    expect(parts().still).not.toBeNull();

    await emit({ type: "tierChosen", tier: 2, reason: "forced" });
    expect(parts().still).toBeNull();
  });

  it("REQ-ENG-08 a failed import on the home route shows the still", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadEngine.mockRejectedValue(new Error("offline"));
    await render();
    await passFirstContent();

    const { wrapper, still } = parts();
    expect(wrapper.dataset.tier).toBe("3");
    expect(wrapper.dataset.tierReason).toBe("no-backend");
    expect(wrapper.dataset.ready).toBe("true");
    expect(still).not.toBeNull();
  });

  it("REQ-A11Y-03 the OS reduced motion setting starts the engine calm", async () => {
    mocks.setSystemCalm(true);
    await render();
    await passFirstContent();
    expect(engines[0]?.options).toEqual({ calm: true });

    await act(async () => {
      mocks.setSystemCalm(false);
    });
    expect(engines[0]?.setCalm).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("REQ-A11Y-04 the calm toggle's choice reaches the live engine", async () => {
    await render();
    await passFirstContent();

    await act(async () => {
      calmStore.setChosen(true);
    });
    expect(engines[0]?.setCalm).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("REQ-SCR-01 the wrapper mirrors the page's chapter before the engine loads and on tier 3", async () => {
    await render();
    storyBridge.setStory("bloom", 0.4);
    expect(parts().wrapper.dataset.chapter).toBe("bloom");

    await passFirstContent();
    await emit({ type: "tierChosen", tier: 3, reason: "save-data" });
    storyBridge.setStory("work", 0.1);
    expect(parts().wrapper.dataset.chapter).toBe("work");
  });

  it("REQ-ENG-01 a route change keeps the bridge connected and leaves its values alone", async () => {
    await render();
    await passFirstContent();
    storyBridge.setStory("work", 0.5);

    await goTo("/work");
    await goTo("/");
    expect(storyBridge.getStory()).toEqual({ chapter: "work", progress: 0.5 });

    storyBridge.setStory("about", 0.2);
    expect(engines[0]?.setStory).toHaveBeenLastCalledWith("about", 0.2);
    expect(engines).toHaveLength(1);
  });

  it("REQ-SCR-06 on the home route a mouse move reaches the engine through the bridge, in device coordinates", async () => {
    await render();
    await passFirstContent();

    await moveMouse(0.75, 0.25);
    expect(engines[0]?.setPointer).toHaveBeenLastCalledWith(0.5, 0.5, true);
  });

  it("REQ-SCR-06 a pointer that moved before the engine loaded reaches it as it is created", async () => {
    await render();
    await moveMouse(0.25, 0.75);
    await passFirstContent();

    expect(engines[0]?.setPointer).toHaveBeenCalledExactlyOnceWith(
      -0.5,
      -0.5,
      true,
    );
  });

  it("REQ-SCR-06 no pointer reaches the field on routes without it, in calm, or on tier 3", async () => {
    await render();
    await passFirstContent();
    const setPointer = engines[0]?.setPointer;

    await goTo("/work");
    await moveMouse(0.5, 0.5);
    expect(setPointer).not.toHaveBeenCalled();

    await goTo("/");
    await act(async () => {
      calmStore.setChosen(true);
    });
    await moveMouse(0.5, 0.5);
    expect(setPointer).not.toHaveBeenCalled();

    await act(async () => {
      calmStore.setChosen(false);
    });
    await emit({ type: "tierChosen", tier: 3, reason: "save-data" });
    await moveMouse(0.5, 0.5);
    expect(setPointer).not.toHaveBeenCalled();

    await emit({ type: "tierChosen", tier: 2, reason: "forced" });
    await moveMouse(0.5, 0.5);
    expect(setPointer).toHaveBeenCalledExactlyOnceWith(0, 0, true);
  });

  it("REQ-A11Y-04 turning calm on releases an active pointer at once", async () => {
    await render();
    await passFirstContent();
    await moveMouse(0.75, 0.25);

    await act(async () => {
      calmStore.setChosen(true);
    });
    expect(engines[0]?.setPointer).toHaveBeenLastCalledWith(0.5, 0.5, false);
  });

  it("REQ-ENG-07 leaving the route and unmounting remove the pointer listeners", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const pointerTypes = (calls: unknown[][]) =>
      calls
        .map(([type]) => type)
        .filter((type) => type === "pointermove" || type === "touchmove");

    await render();
    expect(pointerTypes(added.mock.calls)).toEqual([
      "pointermove",
      "touchmove",
    ]);

    await goTo("/work");
    expect(pointerTypes(removed.mock.calls)).toEqual([
      "pointermove",
      "touchmove",
    ]);

    await goTo("/");
    await unmount();
    expect(pointerTypes(removed.mock.calls)).toHaveLength(4);
  });
});
