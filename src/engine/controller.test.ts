import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest";

import { FRAME_RATE_INTERVAL_MS, PARTICLES, PROBE } from "./config";
import { createEngine } from "./index";
import type {
  Backend,
  Engine,
  EngineEvent,
  EngineOptions,
  Environment,
  Runtime,
  RuntimeFactory,
  RuntimeOptions,
} from "./types";

// A desktop with a real adapter: the decision table sends it to the probe.
const DESKTOP: Environment = {
  saveData: false,
  coarsePointer: false,
  hasWebGpu: true,
  adapter: {
    isFallbackAdapter: false,
    maxStorageBufferBindingSize: 2 ** 30,
    maxBufferSize: 2 ** 30,
  },
};
const NO_WEBGPU: Partial<Environment> = { hasWebGpu: false, adapter: null };

const facts =
  (overrides: Partial<Environment> = {}) =>
  (): Promise<Environment> =>
    Promise.resolve({ ...DESKTOP, ...overrides });

interface StubRuntime extends Runtime {
  readonly options: RuntimeOptions;
  readonly log: string[];
  running: boolean;
  isDisposed: boolean;
  /** Reports one drawn frame, as the real runtime does after each render. */
  frame(frameMs?: number): void;
  lose(): void;
}

/** What the factory does with a request: the live backend, or a rejection. */
type Outcome = Backend | "reject";

function stubRuntimes(outcomes: readonly Outcome[] = []) {
  const built: StubRuntime[] = [];
  const requests: RuntimeOptions[] = [];

  const factory: RuntimeFactory = (options) => {
    const outcome = outcomes[requests.length] ?? options.backend;
    requests.push(options);
    if (outcome === "reject") {
      return Promise.reject(new Error("no backend can start"));
    }

    const stub: StubRuntime = {
      options,
      backend: outcome,
      particleCount: options.particleCount[outcome],
      // The stub draws the look it was asked for.
      look: options.look,
      log: [],
      running: false,
      isDisposed: false,
      run() {
        stub.running = true;
        stub.log.push("run");
      },
      pause() {
        stub.running = false;
        stub.log.push("pause");
      },
      drawStill() {
        stub.log.push("drawStill");
        return Promise.resolve();
      },
      setPointer(x, y, active) {
        stub.log.push(`pointer ${x} ${y} ${active}`);
      },
      setStory(chapter, progress) {
        stub.log.push(`story ${chapter} ${progress}`);
      },
      setStage(stages) {
        stub.log.push(`stage ${JSON.stringify(stages)}`);
      },
      dispose() {
        stub.isDisposed = true;
        stub.log.push("dispose");
        return Promise.resolve();
      },
      frame(frameMs = 10) {
        options.onFrame(frameMs);
      },
      lose() {
        options.onLost("the device is gone");
      },
    };
    built.push(stub);
    return Promise.resolve(stub);
  };

  const loadRuntime = vi.fn(() => Promise.resolve(factory));
  return { built, requests, factory, loadRuntime };
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  report(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function nth<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`nothing at index ${index}`);
  return item;
}

const count = <T>(list: readonly T[], item: T): number =>
  list.filter((entry) => entry === item).length;

const engines: Engine[] = [];
let documentHidden = false;
// A renderer that cannot start is explained on the console outside
// production; the tests keep that quiet and read it from here.
let warnings: MockInstance<typeof console.warn>;

function setHidden(hidden: boolean): void {
  documentHidden = hidden;
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Lets every promise chain that is ready to run finish. */
const settle = () => vi.advanceTimersByTimeAsync(0);

function mount(options: EngineOptions) {
  const host = document.createElement("div");
  document.body.append(host);
  const engine = createEngine(host, options);
  engines.push(engine);
  const events: EngineEvent[] = [];
  engine.on((event) => {
    events.push(event);
  });
  const canvas = () => host.querySelector("canvas");
  return { host, engine, events, canvas };
}

async function startWith(
  options: EngineOptions,
  outcomes: readonly Outcome[] = [],
) {
  const stubs = stubRuntimes(outcomes);
  const mounted = mount({ loadRuntime: stubs.loadRuntime, ...options });
  void mounted.engine.start();
  await settle();
  return { ...mounted, stubs };
}

async function startTier2(options: EngineOptions = {}) {
  const started = await startWith({
    environment: facts(NO_WEBGPU),
    ...options,
  });
  return { ...started, runtime: nth(started.stubs.built, 0) };
}

/** Plays one whole probe window: a warm-up, then frames of one length. */
async function playProbe(runtime: StubRuntime, frameMs: number, frames = 30) {
  await vi.advanceTimersByTimeAsync(PROBE.warmupMs);
  for (let index = 0; index < frames; index += 1) runtime.frame(frameMs);
  await vi.advanceTimersByTimeAsync(PROBE.durationMs - PROBE.warmupMs);
  await settle();
}

async function startTier1(options: EngineOptions = {}) {
  const started = await startWith({ environment: facts(), ...options });
  const runtime = nth(started.stubs.built, 0);
  await playProbe(runtime, 10);
  return { ...started, runtime };
}

beforeEach(() => {
  vi.useFakeTimers();
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  documentHidden = false;
  FakeObserver.instances = [];
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => documentHidden,
  });
});

afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.dispose()));
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "hidden");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("commands and events", () => {
  test("REQ-ENG-03 the engine offers six commands, on and dispose", () => {
    const { engine } = mount({});

    expect(Object.keys(engine).sort()).toEqual([
      "dispose",
      "on",
      "setCalm",
      "setPointer",
      "setStage",
      "setStory",
      "setTier",
      "start",
    ]);
  });

  test("REQ-ENG-03 tierChosen, ready and frameRate carry their payloads and nothing more", async () => {
    const { events, runtime } = await startTier2();
    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "no-webgpu" },
    ]);

    for (let index = 0; index < 60; index += 1) runtime.frame();
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS);

    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "no-webgpu" },
      { type: "ready", tier: 2, particles: PARTICLES.tier2Desktop },
      { type: "frameRate", fps: 60 },
    ]);
  });

  test("REQ-ENG-03 ready is sent once the tier has drawn a frame, and start resolves with it", async () => {
    const stubs = stubRuntimes();
    const { engine, events } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: stubs.loadRuntime,
    });
    let resolved = false;
    void engine.start().then(() => {
      resolved = true;
    });
    await settle();

    expect(events.map((event) => event.type)).toEqual(["tierChosen"]);
    expect(resolved).toBe(false);

    nth(stubs.built, 0).frame();
    nth(stubs.built, 0).frame();
    await settle();

    expect(events.map((event) => event.type)).toEqual(["tierChosen", "ready"]);
    expect(resolved).toBe(true);
    await expect(engine.start()).resolves.toBeUndefined();
  });

  test("REQ-ENG-03 an unsubscribed listener hears nothing more", async () => {
    const stubs = stubRuntimes();
    const { engine, events } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: stubs.loadRuntime,
    });
    const heard: EngineEvent[] = [];
    const unsubscribe = engine.on((event) => {
      heard.push(event);
    });

    void engine.start();
    await settle();
    unsubscribe();
    nth(stubs.built, 0).frame();

    expect(heard).toEqual([
      { type: "tierChosen", tier: 2, reason: "no-webgpu" },
    ]);
    expect(events).toHaveLength(2);
  });

  test("REQ-ENG-03 no event is sent after dispose", async () => {
    const { engine, events, runtime } = await startTier2();
    runtime.frame();
    const before = events.length;

    await engine.dispose();
    const late: EngineEvent[] = [];
    engine.on((event) => {
      late.push(event);
    });
    runtime.frame();
    runtime.lose();
    engine.setTier(1);
    engine.setCalm(true);
    engine.setStory("work", 0.5);
    engine.setPointer(0, 0, true);
    await engine.start();
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS * 3);

    expect(events).toHaveLength(before);
    expect(late).toEqual([]);
  });

  test("REQ-ENG-03 a listener that throws does not stop the others", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const stubs = stubRuntimes();
    const { engine } = mount({
      environment: facts({ saveData: true }),
      loadRuntime: stubs.loadRuntime,
    });
    engine.on(() => {
      throw new Error("a broken listener");
    });
    const heard: EngineEvent[] = [];
    engine.on((event) => {
      heard.push(event);
    });

    await engine.start();

    expect(heard).toEqual([
      { type: "tierChosen", tier: 3, reason: "save-data" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(errors).toHaveBeenCalledTimes(2);
  });

  test("REQ-ENG-03 setStory and setPointer sent before the runtime exists reach it when it does", async () => {
    const stubs = stubRuntimes();
    const { engine } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: stubs.loadRuntime,
    });

    engine.setStory("hero", 0);
    engine.setStory("work", 0.25);
    engine.setPointer(0.5, -0.5, true);
    void engine.start();
    await settle();

    const first = nth(stubs.built, 0);
    expect(first.log.slice(0, 2)).toEqual([
      "story work 0.25",
      "pointer 0.5 -0.5 true",
    ]);

    engine.setStory("about", 1);
    engine.setPointer(-1, 1, false);
    expect(first.log.slice(-2)).toEqual([
      "story about 1",
      "pointer -1 1 false",
    ]);

    engine.setTier(2);
    await settle();
    expect(nth(stubs.built, 1).log.slice(0, 2)).toEqual([
      "story about 1",
      "pointer -1 1 false",
    ]);
  });

  test("REQ-ENG-03 REQ-SCR-01 setStage sent before the runtime exists reaches it ahead of the story, and again after a tier change", async () => {
    const stubs = stubRuntimes();
    const { engine } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: stubs.loadRuntime,
    });
    const hero = { x: 0, y: -0.6, halfWidth: 0, halfHeight: 0 };
    const work = { x: 0.4, y: 0, halfWidth: 0.5, halfHeight: 1 };

    engine.setStage({ hero });
    engine.setStage({ hero, work });
    engine.setStory("work", 0.25);
    void engine.start();
    await settle();

    const first = nth(stubs.built, 0);
    expect(first.log.slice(0, 2)).toEqual([
      `stage ${JSON.stringify({ hero, work })}`,
      "story work 0.25",
    ]);

    engine.setStage({ hero });
    expect(first.log.at(-1)).toBe(`stage ${JSON.stringify({ hero })}`);

    engine.setTier(2);
    await settle();
    expect(nth(stubs.built, 1).log.slice(0, 2)).toEqual([
      `stage ${JSON.stringify({ hero })}`,
      "story work 0.25",
    ]);
  });

  test("REQ-ENG-03 REQ-ENG-08 a runtime call that throws drops one tier and never reaches the caller", async () => {
    const { engine, events, runtime, canvas } = await startTier2();
    runtime.setPointer = () => {
      throw new Error("the renderer broke");
    };

    expect(() => engine.setPointer(0, 0, true)).not.toThrow();
    await settle();

    expect(runtime.isDisposed).toBe(true);
    expect(events.slice(-2)).toEqual([
      { type: "tierChosen", tier: 3, reason: "device-lost" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(canvas()).toBeNull();
  });

  test("REQ-ENG-08 start never rejects: an environment read that fails ends on tier 3", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const stubs = stubRuntimes();
    const { engine, events } = mount({
      environment: () => Promise.reject(new Error("no facts")),
      loadRuntime: stubs.loadRuntime,
    });

    await expect(engine.start()).resolves.toBeUndefined();

    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "no-backend" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(stubs.loadRuntime).not.toHaveBeenCalled();
    // Outside production the console says what stopped the field.
    expect(errors.mock.calls).toEqual([
      [
        "engine: the field stopped on an error",
        expect.objectContaining({ message: "no facts" }),
      ],
    ]);
  });
});

describe("tier flow", () => {
  test("REQ-TIER-03 REQ-PERF-07 Save-Data gives tier 3 at once and never loads the runtime", async () => {
    const { events, stubs, canvas } = await startWith({
      environment: facts({ saveData: true }),
    });

    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "save-data" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(stubs.loadRuntime).not.toHaveBeenCalled();
    expect(canvas()).toBeNull();
  });

  test("REQ-TIER-03 REQ-TIER-04 a forced tier 3 never loads the runtime", async () => {
    const { events, stubs, canvas } = await startWith({
      environment: facts(),
      forcedTier: 3,
    });

    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "forced" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(stubs.loadRuntime).not.toHaveBeenCalled();
    expect(canvas()).toBeNull();
  });

  test("REQ-TIER-02 REQ-TIER-05 a coarse pointer takes the WebGL2 path with the phone count", async () => {
    const { events, stubs } = await startWith({
      environment: facts({ coarsePointer: true }),
    });

    const request = nth(stubs.requests, 0);
    expect(request.backend).toBe("webgl2");
    expect(request.particleCount).toEqual({
      webgpu: PARTICLES.tier1,
      webgl2: PARTICLES.tier2Phone,
    });
    expect(events).toEqual([{ type: "tierChosen", tier: 2, reason: "phone" }]);
  });

  test("REQ-TIER-01 REQ-TIER-05 no WebGPU takes the WebGL2 path with the desktop count", async () => {
    const { events, stubs, runtime } = await startTier2();

    const request = nth(stubs.requests, 0);
    expect(request.backend).toBe("webgl2");
    expect(request.particleCount).toEqual({
      webgpu: PARTICLES.tier1,
      webgl2: PARTICLES.tier2Desktop,
    });
    expect(runtime.running).toBe(true);
    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "no-webgpu" },
    ]);
  });

  test("REQ-TIER-05 the particle count option replaces both counts and the size the limits are checked for", async () => {
    const smallAdapter: Partial<Environment> = {
      adapter: {
        isFallbackAdapter: false,
        maxStorageBufferBindingSize: 80_000,
        maxBufferSize: 80_000,
      },
    };

    const plain = await startWith({ environment: facts(smallAdapter) });
    expect(plain.events).toEqual([
      { type: "tierChosen", tier: 2, reason: "adapter-limits" },
    ]);

    const small = await startWith({
      environment: facts(smallAdapter),
      particleCount: 5000,
    });
    const request = nth(small.stubs.requests, 0);
    expect(request.backend).toBe("webgpu");
    expect(request.particleCount).toEqual({ webgpu: 5000, webgl2: 5000 });
  });

  test("REQ-ENG-08 every runtime is asked for the halftone, and for the soft field when the options ask for it (?look=soft)", async () => {
    const plain = await startTier2();
    expect(nth(plain.stubs.requests, 0).look).toBe("halftone");

    const soft = await startTier2({ look: "soft" });
    expect(nth(soft.stubs.requests, 0).look).toBe("soft");

    // A rebuild after a loss asks for the same look.
    const lost = await startWith({ environment: facts(), look: "soft" }, [
      "webgpu",
    ]);
    await playProbe(nth(lost.stubs.built, 0), 10);
    nth(lost.stubs.built, 0).lose();
    await settle();
    expect(lost.stubs.requests.map((request) => request.look)).toEqual([
      "soft",
      "soft",
    ]);
  });

  test("REQ-ENG-03 ready carries the live runtime's own particle count: the count of the backend that came up, or the option's", async () => {
    // WebGPU asked for, WebGL2 live: the WebGL2 count.
    const fellBack = await startWith({ environment: facts() }, ["webgl2"]);
    nth(fellBack.stubs.built, 0).frame();
    await settle();
    expect(fellBack.events).toEqual([
      { type: "tierChosen", tier: 2, reason: "webgpu-init-fallback" },
      { type: "ready", tier: 2, particles: PARTICLES.tier2Desktop },
    ]);

    const counted = await startTier2({ particleCount: 5000 });
    counted.runtime.frame();
    await settle();
    expect(counted.events.at(-1)).toEqual({
      type: "ready",
      tier: 2,
      particles: 5000,
    });

    // The phone count on a coarse pointer.
    const phone = await startWith({
      environment: facts({ coarsePointer: true }),
    });
    nth(phone.stubs.built, 0).frame();
    await settle();
    expect(phone.events.at(-1)).toEqual({
      type: "ready",
      tier: 2,
      particles: PARTICLES.tier2Phone,
    });
  });

  test("REQ-TIER-01 a passing probe gives tier 1 on the canvas it ran on, shown and ready with tier 1's first frame", async () => {
    const { events, stubs, canvas } = await startWith({
      environment: facts(),
    });
    const runtime = nth(stubs.built, 0);
    const probeCanvas = canvas();

    expect(nth(stubs.requests, 0).backend).toBe("webgpu");
    expect(runtime.running).toBe(true);
    expect(probeCanvas?.style.visibility).toBe("hidden");
    expect(events).toEqual([]);

    await playProbe(runtime, 10);

    expect(events).toEqual([
      { type: "tierChosen", tier: 1, reason: "probe-pass" },
    ]);
    expect(stubs.requests).toHaveLength(1);
    expect(canvas()).toBe(probeCanvas);
    // The probe's last frame is still on the canvas, so it stays hidden.
    expect(probeCanvas?.style.visibility).toBe("hidden");
    expect(runtime.running).toBe(true);
    expect(runtime.isDisposed).toBe(false);

    runtime.frame();

    expect(probeCanvas?.style.visibility).toBe("");
    expect(events).toEqual([
      { type: "tierChosen", tier: 1, reason: "probe-pass" },
      { type: "ready", tier: 1, particles: PARTICLES.tier1 },
    ]);
  });

  test("REQ-TIER-01 the probe measures the ambient field: the story and pointer reach its runtime only when its tier is adopted, and once", async () => {
    const stubs = stubRuntimes();
    const { engine, events, canvas } = mount({
      environment: facts(),
      loadRuntime: stubs.loadRuntime,
    });
    const stories = (log: readonly string[]) =>
      log.filter((line) => line.startsWith("story "));

    engine.setStory("hero", 0);
    engine.setPointer(0.5, -0.5, true);
    void engine.start();
    await settle();
    const runtime = nth(stubs.built, 0);

    expect(runtime.log).toEqual(["run"]);

    // A scroll during the probe is kept, not sent.
    engine.setStory("bloom", 0.2);
    engine.setPointer(-0.25, 0.25, true);
    await vi.advanceTimersByTimeAsync(PROBE.warmupMs);
    for (let index = 0; index < 30; index += 1) runtime.frame(10);
    expect(runtime.log).toEqual(["run"]);

    await vi.advanceTimersByTimeAsync(PROBE.durationMs - PROBE.warmupMs);
    await settle();

    expect(events).toEqual([
      { type: "tierChosen", tier: 1, reason: "probe-pass" },
    ]);
    expect(runtime.log).toEqual([
      "run",
      "story bloom 0.2",
      "pointer -0.25 0.25 true",
    ]);
    expect(canvas()?.style.visibility).toBe("hidden");

    runtime.frame();
    expect(canvas()?.style.visibility).toBe("");
    expect(stories(runtime.log)).toEqual(["story bloom 0.2"]);

    engine.setStory("bloom", 0.4);
    expect(stories(runtime.log)).toEqual([
      "story bloom 0.2",
      "story bloom 0.4",
    ]);
  });

  test("REQ-TIER-01 a slow probe's runtime never hears the story; the WebGL2 runtime after it hears it before it runs", async () => {
    const stubs = stubRuntimes();
    const { engine } = mount({
      environment: facts(),
      loadRuntime: stubs.loadRuntime,
    });

    engine.setStory("work", 0.4);
    void engine.start();
    await settle();
    const probed = nth(stubs.built, 0);
    await playProbe(probed, 40);

    expect(probed.log).toEqual(["run", "pause", "dispose"]);
    expect(nth(stubs.built, 1).log).toEqual(["story work 0.4", "run"]);
  });

  test("REQ-TIER-01 frames inside the warm-up are not counted", async () => {
    const { events, stubs } = await startWith({ environment: facts() });
    const runtime = nth(stubs.built, 0);

    for (let index = 0; index < 40; index += 1) runtime.frame(50);
    await vi.advanceTimersByTimeAsync(PROBE.warmupMs);
    for (let index = 0; index < PROBE.minFrames; index += 1) runtime.frame(10);
    await vi.advanceTimersByTimeAsync(PROBE.durationMs - PROBE.warmupMs);
    await settle();

    expect(nth(events, 0)).toEqual({
      type: "tierChosen",
      tier: 1,
      reason: "probe-pass",
    });
  });

  test("REQ-TIER-01 a slow probe gives tier 2 on a new canvas", async () => {
    const { events, stubs, host, canvas } = await startWith({
      environment: facts(),
    });
    const probed = nth(stubs.built, 0);
    const probeCanvas = canvas();

    await playProbe(probed, 40);

    expect(probed.isDisposed).toBe(true);
    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "probe-slow" },
    ]);
    const request = nth(stubs.requests, 1);
    expect(request.backend).toBe("webgl2");
    expect(request.particleCount.webgl2).toBe(PARTICLES.tier2Desktop);
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(canvas()).not.toBe(probeCanvas);
    expect(canvas()).toBe(request.canvas);
    expect(canvas()?.style.visibility).toBe("");

    nth(stubs.built, 1).frame();
    expect(nth(events, 1)).toEqual({
      type: "ready",
      tier: 2,
      particles: PARTICLES.tier2Desktop,
    });
  });

  test("REQ-TIER-01 a probe that draws too few frames gives tier 2 with probe-failed", async () => {
    const { events, stubs } = await startWith({ environment: facts() });

    await playProbe(nth(stubs.built, 0), 10, PROBE.minFrames - 1);

    expect(nth(stubs.built, 0).isDisposed).toBe(true);
    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "probe-failed" },
    ]);
  });

  test("REQ-TIER-03 a failed probe gives tier 3 only when WebGL2 fails too", async () => {
    const { events, stubs, canvas } = await startWith(
      { environment: facts() },
      ["webgpu", "reject"],
    );

    await playProbe(nth(stubs.built, 0), 10, 0);

    expect(stubs.requests.map((request) => request.backend)).toEqual([
      "webgpu",
      "webgl2",
    ]);
    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "no-backend" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(canvas()).toBeNull();
  });

  test("REQ-ENG-08 WebGPU that falls back inside init is tier 2 on the same canvas, with no probe", async () => {
    const { events, stubs, canvas } = await startWith(
      { environment: facts() },
      ["webgl2"],
    );
    const runtime = nth(stubs.built, 0);
    const firstCanvas = canvas();

    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "webgpu-init-fallback" },
    ]);
    expect(firstCanvas?.style.visibility).toBe("");

    runtime.frame();
    await vi.advanceTimersByTimeAsync(PROBE.durationMs);

    expect(events.map((event) => event.type)).toEqual([
      "tierChosen",
      "ready",
      "frameRate",
      "frameRate",
    ]);
    expect(stubs.requests).toHaveLength(1);
    expect(canvas()).toBe(firstCanvas);
    expect(runtime.isDisposed).toBe(false);
  });

  test("REQ-TIER-03 REQ-ENG-08 no backend at all gives tier 3 with no-backend", async () => {
    const webgl2 = await startWith({ environment: facts(NO_WEBGPU) }, [
      "reject",
    ]);
    expect(webgl2.events).toEqual([
      { type: "tierChosen", tier: 3, reason: "no-backend" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(webgl2.canvas()).toBeNull();

    const webgpu = await startWith({ environment: facts() }, [
      "reject",
      "reject",
    ]);
    expect(webgpu.stubs.requests.map((request) => request.backend)).toEqual([
      "webgpu",
      "webgl2",
    ]);
    expect(webgpu.events).toEqual([
      { type: "tierChosen", tier: 3, reason: "no-backend" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(webgpu.canvas()).toBeNull();
  });

  test("REQ-ENG-08 outside production the console says why each renderer could not start", async () => {
    await startWith({ environment: facts() }, ["reject", "reject"]);

    expect(warnings.mock.calls).toEqual([
      [
        "engine: the webgpu renderer could not start",
        expect.objectContaining({ message: "no backend can start" }),
      ],
      [
        "engine: the webgl2 renderer could not start",
        expect.objectContaining({ message: "no backend can start" }),
      ],
    ]);
  });

  test("REQ-ENG-08 a field that starts says nothing on the console", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await startTier1();

    expect(warnings).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  test("REQ-ENG-08 a production build stays quiet when no renderer can start", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const { events } = await startWith({ environment: facts() }, [
      "reject",
      "reject",
    ]);

    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "no-backend" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(warnings).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  test("REQ-ENG-08 a WebGPU runtime that cannot be built gives WebGL2 its own try on a new canvas", async () => {
    const { events, stubs, canvas } = await startWith(
      { environment: facts() },
      ["reject"],
    );

    expect(stubs.requests.map((request) => request.backend)).toEqual([
      "webgpu",
      "webgl2",
    ]);
    expect(nth(stubs.requests, 1).canvas).not.toBe(
      nth(stubs.requests, 0).canvas,
    );
    expect(canvas()).toBe(nth(stubs.requests, 1).canvas);
    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "webgpu-init-fallback" },
    ]);

    nth(stubs.built, 0).frame();
    expect(events.at(-1)).toEqual({
      type: "ready",
      tier: 2,
      particles: PARTICLES.tier2Desktop,
    });
  });

  test("REQ-ENG-03 REQ-TIER-04 a tier forced from a tier 3 tierChosen listener still gets its own ready", async () => {
    const stubs = stubRuntimes();
    const { engine, events } = mount({
      environment: facts({ saveData: true }),
      loadRuntime: stubs.loadRuntime,
    });
    let forced = false;
    engine.on((event) => {
      if (event.type === "tierChosen" && event.tier === 3 && !forced) {
        forced = true;
        engine.setTier(2);
      }
    });

    void engine.start();
    await settle();
    nth(stubs.built, 0).frame();

    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "save-data" },
      { type: "tierChosen", tier: 2, reason: "forced" },
      { type: "ready", tier: 2, particles: PARTICLES.tier2Desktop },
    ]);
  });

  test("REQ-TIER-03 a runtime chunk that fails to load gives tier 3 with no-backend", async () => {
    const { engine, events, canvas } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: () => Promise.reject(new Error("chunk failed")),
    });

    await engine.start();

    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "no-backend" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(canvas()).toBeNull();
  });

  test("REQ-TIER-04 a forced tier 1 skips the decision table and the probe", async () => {
    const { events, stubs } = await startWith({
      environment: facts({ coarsePointer: true }),
      forcedTier: 1,
    });
    const runtime = nth(stubs.built, 0);

    expect(nth(stubs.requests, 0).backend).toBe("webgpu");
    expect(events).toEqual([{ type: "tierChosen", tier: 1, reason: "forced" }]);

    runtime.frame();
    expect(nth(events, 1)).toEqual({
      type: "ready",
      tier: 1,
      particles: PARTICLES.tier1,
    });
  });

  test("REQ-TIER-04 a forced tier 1 that comes back on WebGL2 is tier 2 with webgpu-init-fallback", async () => {
    const { events } = await startWith(
      { environment: facts(), forcedTier: 1 },
      ["webgl2"],
    );

    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "webgpu-init-fallback" },
    ]);
  });

  test("REQ-TIER-04 a forced tier 2 takes the WebGL2 path on a device that could probe", async () => {
    const { events, stubs } = await startWith({
      environment: facts(),
      forcedTier: 2,
    });

    expect(nth(stubs.requests, 0).backend).toBe("webgl2");
    expect(events).toEqual([{ type: "tierChosen", tier: 2, reason: "forced" }]);
  });

  test("REQ-TIER-01 the probe waits while the document is hidden", async () => {
    documentHidden = true;
    const { events, stubs } = await startWith({ environment: facts() });
    const runtime = nth(stubs.built, 0);

    expect(runtime.running).toBe(false);
    await vi.advanceTimersByTimeAsync(PROBE.durationMs * 3);
    expect(events).toEqual([]);

    setHidden(false);
    expect(runtime.running).toBe(true);
    await playProbe(runtime, 10);

    expect(nth(events, 0)).toEqual({
      type: "tierChosen",
      tier: 1,
      reason: "probe-pass",
    });
  });

  test("REQ-TIER-01 a probe cut short by a hidden document starts again from nothing", async () => {
    const { events, stubs } = await startWith({ environment: facts() });
    const runtime = nth(stubs.built, 0);

    await vi.advanceTimersByTimeAsync(PROBE.warmupMs);
    for (let index = 0; index < 30; index += 1) runtime.frame(40);
    await vi.advanceTimersByTimeAsync(PROBE.durationMs - PROBE.warmupMs - 1);
    setHidden(true);
    expect(runtime.running).toBe(false);

    await vi.advanceTimersByTimeAsync(PROBE.durationMs * 3);
    expect(events).toEqual([]);

    setHidden(false);
    await playProbe(runtime, 10);

    expect(nth(events, 0)).toEqual({
      type: "tierChosen",
      tier: 1,
      reason: "probe-pass",
    });
  });

  test("REQ-TIER-01 the probe waits while the host is out of view", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const stubs = stubRuntimes();
    const { engine, events } = mount({
      environment: facts(),
      loadRuntime: stubs.loadRuntime,
    });
    void engine.start();
    nth(FakeObserver.instances, 0).report(false);
    await settle();
    const runtime = nth(stubs.built, 0);

    expect(runtime.running).toBe(false);
    await vi.advanceTimersByTimeAsync(PROBE.durationMs * 3);
    expect(events).toEqual([]);

    nth(FakeObserver.instances, 0).report(true);
    await playProbe(runtime, 10);

    expect(nth(events, 0)).toEqual({
      type: "tierChosen",
      tier: 1,
      reason: "probe-pass",
    });
  });

  test("REQ-TIER-04 setTier disposes the runtime and runs the flow again with that tier forced", async () => {
    const { engine, events, stubs, runtime, canvas } = await startTier2();
    runtime.frame();
    const firstCanvas = canvas();

    engine.setTier(1);
    await settle();

    expect(runtime.isDisposed).toBe(true);
    expect(nth(stubs.requests, 1).backend).toBe("webgpu");
    expect(canvas()).not.toBe(firstCanvas);
    expect(canvas()).toBe(nth(stubs.requests, 1).canvas);
    expect(events.slice(2)).toEqual([
      { type: "tierChosen", tier: 1, reason: "forced" },
    ]);
    nth(stubs.built, 1).frame();
    expect(events.slice(3)).toEqual([
      { type: "ready", tier: 1, particles: PARTICLES.tier1 },
    ]);

    engine.setTier(3);
    await settle();

    expect(nth(stubs.built, 1).isDisposed).toBe(true);
    expect(canvas()).toBeNull();
    expect(events.slice(4)).toEqual([
      { type: "tierChosen", tier: 3, reason: "forced" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(stubs.requests).toHaveLength(2);
  });

  test("REQ-TIER-04 setTier from tier 3 loads the runtime for the first time", async () => {
    const { engine, events, stubs, canvas } = await startWith({
      environment: facts({ saveData: true }),
    });
    expect(stubs.loadRuntime).not.toHaveBeenCalled();

    engine.setTier(2);
    await settle();

    expect(stubs.loadRuntime).toHaveBeenCalledTimes(1);
    expect(canvas()).not.toBeNull();
    expect(events.slice(2)).toEqual([
      { type: "tierChosen", tier: 2, reason: "forced" },
    ]);
  });

  test("REQ-TIER-04 setTier before start is remembered and starts nothing", async () => {
    const stubs = stubRuntimes();
    const { engine, events } = mount({
      environment: facts(),
      loadRuntime: stubs.loadRuntime,
    });

    engine.setTier(3);
    await settle();
    expect(events).toEqual([]);

    await engine.start();
    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "forced" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(stubs.loadRuntime).not.toHaveBeenCalled();
  });

  test("REQ-TIER-04 a newer setTier wins over a runtime that resolves late", async () => {
    const stubs = stubRuntimes();
    const gate = deferred<void>();
    const slowFactory: RuntimeFactory = async (options) => {
      await gate.promise;
      return stubs.factory(options);
    };
    const { engine, events, canvas } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: () => Promise.resolve(slowFactory),
    });
    void engine.start();
    await settle();

    engine.setTier(3);
    await settle();
    gate.resolve();
    await settle();

    const late = nth(stubs.built, 0);
    expect(late.isDisposed).toBe(true);
    expect(late.log).not.toContain("run");
    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "forced" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(canvas()).toBeNull();
  });
});

describe("pausing and teardown", () => {
  test("REQ-ENG-07 the field pauses in a hidden document and resumes after", async () => {
    const { runtime } = await startTier2();
    expect(runtime.running).toBe(true);

    setHidden(true);
    expect(runtime.running).toBe(false);

    setHidden(false);
    expect(runtime.running).toBe(true);
    expect(runtime.log).toEqual(["run", "pause", "run"]);
  });

  test("REQ-ENG-07 the field pauses when the host leaves the viewport and resumes after", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const { host, runtime } = await startTier2();
    const observer = nth(FakeObserver.instances, 0);

    expect(FakeObserver.instances).toHaveLength(1);
    expect(observer.observed).toEqual([host]);
    expect(runtime.running).toBe(true);

    observer.report(false);
    expect(runtime.running).toBe(false);

    setHidden(true);
    setHidden(false);
    expect(runtime.running).toBe(false);

    observer.report(true);
    expect(runtime.running).toBe(true);
    expect(runtime.log).toEqual(["run", "pause", "run"]);
  });

  test("REQ-ENG-07 without IntersectionObserver the host counts as in view", async () => {
    expect(typeof IntersectionObserver).toBe("undefined");

    const { runtime } = await startTier2();

    expect(runtime.running).toBe(true);
  });

  test("REQ-ENG-07 REQ-A11Y-04 calm pauses the field and draws one still", async () => {
    const { engine, runtime } = await startTier2();
    runtime.frame();

    engine.setCalm(true);
    engine.setCalm(true);
    expect(runtime.running).toBe(false);
    expect(runtime.log).toEqual(["run", "pause", "drawStill"]);

    setHidden(true);
    setHidden(false);
    expect(runtime.running).toBe(false);
    expect(count(runtime.log, "drawStill")).toBe(1);

    engine.setCalm(false);
    expect(runtime.running).toBe(true);
  });

  test("REQ-ENG-07 REQ-A11Y-03 an engine that starts calm never runs the chosen field and is ready after its still", async () => {
    const { events, runtime } = await startTier2({ calm: true });

    expect(runtime.log).toEqual(["drawStill"]);
    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "no-webgpu" },
      { type: "ready", tier: 2, particles: PARTICLES.tier2Desktop },
    ]);

    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS * 2);
    expect(events).toHaveLength(2);
  });

  test("REQ-ENG-07 REQ-TIER-01 calm still lets the unseen probe run, then freezes tier 1", async () => {
    const { events, runtime } = await startTier1({ calm: true });

    expect(runtime.log).toEqual(["run", "pause", "drawStill"]);
    expect(events).toEqual([
      { type: "tierChosen", tier: 1, reason: "probe-pass" },
      { type: "ready", tier: 1, particles: PARTICLES.tier1 },
    ]);
  });

  test("REQ-ENG-07 dispose awaits the runtime's dispose and removes the canvas and every listener", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const { engine, runtime, canvas } = await startTier2();
    const gate = deferred<void>();
    runtime.dispose = () => {
      runtime.log.push("dispose");
      return gate.promise;
    };

    let done = false;
    const disposal = engine.dispose().then(() => {
      done = true;
    });
    await settle();

    expect(runtime.log.slice(-2)).toEqual(["pause", "dispose"]);
    expect(done).toBe(false);

    gate.resolve();
    await disposal;

    expect(done).toBe(true);
    expect(canvas()).toBeNull();
    expect(nth(FakeObserver.instances, 0).disconnected).toBe(true);
    const listened = added.mock.calls.filter(
      ([type]) => type === "visibilitychange",
    );
    const unlistened = removed.mock.calls.filter(
      ([type]) => type === "visibilitychange",
    );
    expect(listened).toHaveLength(1);
    expect(unlistened).toHaveLength(1);
    expect(nth(unlistened, 0)[1]).toBe(nth(listened, 0)[1]);
    expect(vi.getTimerCount()).toBe(0);

    const logged = runtime.log.length;
    setHidden(true);
    setHidden(false);
    nth(FakeObserver.instances, 0).report(false);
    expect(runtime.log).toHaveLength(logged);
  });

  test("REQ-ENG-07 dispose twice disposes the runtime once", async () => {
    const { engine, runtime } = await startTier2();

    const first = engine.dispose();
    const second = engine.dispose();
    await Promise.all([first, second]);
    await engine.dispose();

    expect(second).toBe(first);
    expect(count(runtime.log, "dispose")).toBe(1);
  });

  test("REQ-ENG-07 dispose during start disposes the runtime that resolves late and lets start resolve", async () => {
    const stubs = stubRuntimes();
    const gate = deferred<void>();
    const slowFactory: RuntimeFactory = async (options) => {
      await gate.promise;
      return stubs.factory(options);
    };
    const { engine, events, canvas } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: () => Promise.resolve(slowFactory),
    });
    const started = engine.start();
    await settle();
    expect(canvas()).not.toBeNull();

    const disposal = engine.dispose();
    expect(canvas()).toBeNull();
    await started;

    gate.resolve();
    await disposal;

    const late = nth(stubs.built, 0);
    expect(late.isDisposed).toBe(true);
    expect(late.log).not.toContain("run");
    expect(events).toEqual([]);
    expect(canvas()).toBeNull();
  });

  test("REQ-ENG-07 dispose during the probe stops its timer and sends nothing", async () => {
    const { engine, events, stubs, canvas } = await startWith({
      environment: facts(),
    });
    const runtime = nth(stubs.built, 0);
    expect(vi.getTimerCount()).toBe(1);

    await engine.dispose();
    await vi.advanceTimersByTimeAsync(PROBE.durationMs * 2);

    expect(vi.getTimerCount()).toBe(0);
    expect(runtime.isDisposed).toBe(true);
    expect(stubs.requests).toHaveLength(1);
    expect(events).toEqual([]);
    expect(canvas()).toBeNull();
  });
});

describe("lost device", () => {
  test("REQ-ENG-08 a device lost on tier 1 gives one rebuild as tier 2 on a new canvas, then tier 3", async () => {
    const { events, stubs, runtime, host, canvas } = await startTier1();
    const firstCanvas = canvas();
    events.length = 0;

    runtime.lose();
    await settle();

    expect(runtime.isDisposed).toBe(true);
    expect(stubs.requests.map((request) => request.backend)).toEqual([
      "webgpu",
      "webgl2",
    ]);
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(canvas()).not.toBe(firstCanvas);
    expect(canvas()).toBe(nth(stubs.requests, 1).canvas);
    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "device-lost" },
    ]);

    const rebuilt = nth(stubs.built, 1);
    rebuilt.frame();
    expect(nth(events, 1)).toEqual({
      type: "ready",
      tier: 2,
      particles: PARTICLES.tier2Desktop,
    });

    rebuilt.lose();
    await settle();

    expect(rebuilt.isDisposed).toBe(true);
    expect(stubs.requests).toHaveLength(2);
    expect(canvas()).toBeNull();
    expect(events.slice(2)).toEqual([
      { type: "tierChosen", tier: 3, reason: "device-lost" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
  });

  test("REQ-ENG-08 a context lost on tier 2 gives tier 3 and removes the canvas", async () => {
    const { events, stubs, runtime, canvas } = await startTier2();
    runtime.frame();

    runtime.lose();
    await settle();

    expect(runtime.isDisposed).toBe(true);
    expect(stubs.requests).toHaveLength(1);
    expect(canvas()).toBeNull();
    expect(events.slice(2)).toEqual([
      { type: "tierChosen", tier: 3, reason: "device-lost" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
  });

  test("REQ-ENG-08 a device lost during the probe gives tier 2 with device-lost", async () => {
    const { events, stubs } = await startWith({ environment: facts() });

    nth(stubs.built, 0).lose();
    await settle();
    await vi.advanceTimersByTimeAsync(PROBE.durationMs);

    expect(events.filter((event) => event.type === "tierChosen")).toEqual([
      { type: "tierChosen", tier: 2, reason: "device-lost" },
    ]);
    expect(nth(stubs.built, 0).isDisposed).toBe(true);
  });

  test("REQ-ENG-08 a device lost on tier 1 gives tier 3 when WebGL2 cannot start", async () => {
    const { events, stubs, canvas } = await startWith(
      { environment: facts(), forcedTier: 1 },
      ["webgpu", "reject"],
    );
    events.length = 0;

    nth(stubs.built, 0).lose();
    await settle();

    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "no-backend" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(canvas()).toBeNull();
  });

  test("REQ-ENG-08 a device lost before the runtime is handed over gives tier 2 on a new canvas", async () => {
    const stubs = stubRuntimes();
    const factory: RuntimeFactory = (options) => {
      const isFirst = stubs.requests.length === 0;
      const pending = stubs.factory(options);
      if (isFirst) options.onLost("lost while it was built");
      return pending;
    };
    const { engine, events, host, canvas } = mount({
      environment: facts(),
      loadRuntime: () => Promise.resolve(factory),
    });

    void engine.start();
    await settle();

    expect(nth(stubs.built, 0).isDisposed).toBe(true);
    expect(stubs.requests.map((request) => request.backend)).toEqual([
      "webgpu",
      "webgl2",
    ]);
    expect(nth(stubs.requests, 1).canvas).not.toBe(
      nth(stubs.requests, 0).canvas,
    );
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(canvas()).toBe(nth(stubs.requests, 1).canvas);
    expect(nth(stubs.built, 1).isDisposed).toBe(false);
    expect(events).toEqual([
      { type: "tierChosen", tier: 2, reason: "webgpu-init-fallback" },
    ]);
  });

  test("REQ-ENG-08 a runtime that throws when its adopted tier is handed the story drops one tier with device-lost", async () => {
    const stubs = stubRuntimes();
    const factory: RuntimeFactory = async (options) => {
      const runtime = await stubs.factory(options);
      runtime.setStory = () => {
        throw new Error("the renderer broke");
      };
      return runtime;
    };
    const { engine, events, canvas } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: () => Promise.resolve(factory),
    });

    engine.setStory("hero", 0);
    await engine.start();

    expect(nth(stubs.built, 0).isDisposed).toBe(true);
    expect(nth(stubs.built, 0).log).not.toContain("run");
    expect(events).toEqual([
      { type: "tierChosen", tier: 3, reason: "device-lost" },
      { type: "ready", tier: 3, particles: 0 },
    ]);
    expect(canvas()).toBeNull();
  });

  test("REQ-ENG-08 a loss reported by a runtime that was already replaced is ignored", async () => {
    const { events, stubs } = await startWith({ environment: facts() });
    const probed = nth(stubs.built, 0);
    await playProbe(probed, 40);
    const before = events.length;

    probed.lose();
    probed.frame();
    await settle();

    expect(events).toHaveLength(before);
    expect(stubs.requests).toHaveLength(2);
    expect(nth(stubs.built, 1).isDisposed).toBe(false);
  });
});

describe("frame rate", () => {
  const rates = (events: readonly EngineEvent[]) =>
    events.flatMap((event) => (event.type === "frameRate" ? [event.fps] : []));

  test("REQ-ENG-03 frameRate goes out once per interval with the frames drawn in it", async () => {
    const { events, runtime } = await startTier2();

    for (let index = 0; index < 60; index += 1) runtime.frame();
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS);
    for (let index = 0; index < 30; index += 1) runtime.frame();
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS);

    expect(rates(events)).toEqual([60, 30, 0]);
  });

  test("REQ-ENG-03 REQ-TIER-01 frameRate is silent during the probe and starts after it", async () => {
    const { events, stubs } = await startWith({ environment: facts() });
    const runtime = nth(stubs.built, 0);

    await playProbe(runtime, 10);
    expect(rates(events)).toEqual([]);

    for (let index = 0; index < 120; index += 1) runtime.frame();
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS);
    expect(rates(events)).toEqual([120]);
  });

  test("REQ-ENG-03 REQ-ENG-07 frameRate is silent while the field is paused", async () => {
    const { engine, events, runtime } = await startTier2();
    for (let index = 0; index < 20; index += 1) runtime.frame();
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS / 2);

    setHidden(true);
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS * 3);
    expect(rates(events)).toEqual([]);

    setHidden(false);
    for (let index = 0; index < 30; index += 1) runtime.frame();
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS);
    expect(rates(events)).toEqual([30]);

    engine.setCalm(true);
    await vi.advanceTimersByTimeAsync(FRAME_RATE_INTERVAL_MS * 3);
    expect(rates(events)).toEqual([30]);
  });
});

describe("the canvas", () => {
  test("REQ-ENG-01 the engine puts one canvas in the host, styled to fill it", async () => {
    const { host, stubs, canvas } = await startTier2();
    const element = canvas();

    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild).toBe(element);
    expect(element?.style.display).toBe("block");
    expect(element?.style.width).toBe("100%");
    expect(element?.style.height).toBe("100%");
    expect(nth(stubs.requests, 0).canvas).toBe(element);
  });

  test("REQ-ENG-01 the canvas element is kept through pause, resume, calm and a second start", async () => {
    const { engine, host, stubs, runtime, canvas } = await startTier2();
    const element = canvas();
    runtime.frame();

    setHidden(true);
    setHidden(false);
    engine.setCalm(true);
    engine.setCalm(false);
    engine.setStory("bloom", 0.5);
    await engine.start();
    await settle();

    expect(canvas()).toBe(element);
    expect(host.children).toHaveLength(1);
    expect(stubs.requests).toHaveLength(1);
    expect(runtime.isDisposed).toBe(false);
  });

  test("REQ-ENG-01 only the engine's canvas is touched: other children of the host stay", async () => {
    const stubs = stubRuntimes();
    const { engine, host } = mount({
      environment: facts(NO_WEBGPU),
      loadRuntime: stubs.loadRuntime,
    });
    const neighbour = document.createElement("span");
    host.append(neighbour);

    void engine.start();
    await settle();
    engine.setTier(1);
    await settle();
    await engine.dispose();

    expect([...host.children]).toEqual([neighbour]);
  });
});
