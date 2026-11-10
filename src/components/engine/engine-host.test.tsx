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
import { tierStore } from "@/lib/tier-store";

import { EngineHost } from "./engine-host";
import { createEngineSession } from "./engine-session";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  scheduled: [] as Array<{ run: () => void; isCancelled: boolean }>,
  loadEngine: vi.fn(),
}));

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

function stubReducedMotion(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
  };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal("matchMedia", matchMedia);

  return {
    matchMedia,
    listeners,
    set(next: boolean) {
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

let motion: ReturnType<typeof stubReducedMotion>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  motion = stubReducedMotion(false);
  mocks.pathname = "/";
  mocks.scheduled.length = 0;
  mocks.loadEngine.mockReset();
  mocks.loadEngine.mockResolvedValue({ createEngine: createFakeEngine });
  engines.length = 0;
});

afterEach(() => {
  tierStore.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("engine session", () => {
  function setUp() {
    const wrapper = document.createElement("div");
    const host = document.createElement("div");
    wrapper.append(host);
    return { wrapper, host, session: createEngineSession(wrapper, host) };
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
    motion.set(true);
    const { session } = setUp();
    expect(motion.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
    session.request();
    await passFirstContent();
    expect(engines[0]?.options).toEqual({ calm: true });

    motion.set(false);
    motion.set(true);
    expect(engines[0]?.setCalm).toHaveBeenNthCalledWith(1, false);
    expect(engines[0]?.setCalm).toHaveBeenNthCalledWith(2, true);
  });

  it("REQ-ENG-03 sends tierChosen and ready to the store and mirrors them on the wrapper", async () => {
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
    });

    engines[0]?.emit({ type: "ready", tier: 1 });
    expect(wrapper.dataset.ready).toBe("true");
    expect(tierStore.getSnapshot().ready).toBe(true);
  });

  it("REQ-ENG-08 a change of tier is not ready until the new tier reports ready", async () => {
    const { wrapper, session } = setUp();
    session.request();
    await passFirstContent();
    engines[0]?.emit({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    engines[0]?.emit({ type: "ready", tier: 1 });

    engines[0]?.emit({ type: "tierChosen", tier: 2, reason: "device-lost" });
    expect(wrapper.dataset.tier).toBe("2");
    expect(wrapper.dataset.tierReason).toBe("device-lost");
    expect(wrapper.dataset.ready).toBe("false");

    engines[0]?.emit({ type: "ready", tier: 2 });
    expect(wrapper.dataset.ready).toBe("true");
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

  it("REQ-ENG-07 dispose awaits the engine's dispose once, clears the store and the wrapper, and stops listening", async () => {
    const { wrapper, session } = setUp();
    session.request();
    await passFirstContent();
    engines[0]?.emit({ type: "tierChosen", tier: 2, reason: "phone" });
    engines[0]?.emit({ type: "ready", tier: 2 });
    engines[0]?.emit({ type: "frameRate", fps: 30 });
    expect(motion.listeners.size).toBe(1);

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
    expect(motion.listeners.size).toBe(0);
    expect(tierStore.getSnapshot()).toBe(tierStore.getServerSnapshot());
    for (const name of ["tier", "tier-reason", "ready", "fps"]) {
      expect(wrapper.hasAttribute(`data-${name}`)).toBe(false);
    }

    engine.emit({ type: "tierChosen", tier: 1, reason: "forced" });
    expect(wrapper.hasAttribute("data-tier")).toBe(false);
    expect(tierStore.getSnapshot().tier).toBeNull();
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
    const { session } = setUp();
    session.request();
    await passFirstContent();

    await session.dispose();
    finishLoad({ createEngine: createFakeEngine });
    await Promise.resolve();
    await Promise.resolve();
    expect(engines).toHaveLength(0);
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
    for (const name of ["data-tier", "data-ready", "data-fps"]) {
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
    await emit({ type: "ready", tier: 2 });
    await emit({ type: "frameRate", fps: 58 });
    await goTo("/work");
    await goTo("/");

    const { wrapper, still } = parts();
    expect(wrapper.dataset.tier).toBe("2");
    expect(wrapper.dataset.tierReason).toBe("no-webgpu");
    expect(wrapper.dataset.ready).toBe("true");
    expect(wrapper.dataset.fps).toBe("58");
    expect(still).toBeNull();
  });

  it("REQ-TIER-03 tier 3 shows the still, wide or tall by orientation, as decoration that loads late", async () => {
    await render();
    await passFirstContent();
    expect(parts().still).toBeNull();

    await emit({ type: "tierChosen", tier: 3, reason: "save-data" });
    await emit({ type: "ready", tier: 3 });

    const { still, host, veil } = parts();
    const source = still?.parentElement?.querySelector("source");
    expect(still?.parentElement?.tagName).toBe("PICTURE");
    expect(still?.getAttribute("src")).toBe("/still/field-wide.jpg");
    expect(source?.getAttribute("srcset")).toBe("/still/field-tall.jpg");
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
});
