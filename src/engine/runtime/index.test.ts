import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Backend, RuntimeOptions } from "../types";

// The runtime with three.js, the simulation and the field replaced by
// recorders: jsdom has no GPU, and what is checked here is the order of the
// runtime's own calls, not what the renderer draws.
const fakes = vi.hoisted(() => {
  interface LostInfo {
    api: string;
    message: string;
    reason: string | null;
    originalEvent: unknown;
  }

  const state = {
    log: [] as string[],
    /** The reseat value each compute call ran with. */
    computes: [] as number[],
    reseat: { value: 0 },
    stepSeconds: { value: 0 },
    formation: { value: 0 },
    /** What the fake Timer hands out as the time since the last frame. */
    delta: 1 / 60,
    /** The options each renderer was built with. */
    rendererOptions: [] as Array<Record<string, unknown>>,
    isWebGL: false,
    lostDuringInit: false,
    renderThrows: false,
    throwingPart: "",
    loop: null as ((time: number) => void) | null,
    lose: (message: string): void => {
      void message;
    },
    resize: (): void => undefined,
  };

  const part = (name: string) => ({
    dispose() {
      if (state.throwingPart === name) throw new Error(`${name} is stuck`);
      state.log.push(`${name} dispose`);
    },
  });

  class Timer {
    connect() {
      state.log.push("timer connect");
    }
    update() {}
    reset() {}
    getDelta() {
      return state.delta;
    }
    dispose() {
      state.log.push("timer dispose");
    }
  }

  class WebGPURenderer {
    readonly backend: object;

    constructor(options: Record<string, unknown>) {
      state.rendererOptions.push(options);
      this.backend = state.isWebGL ? { isWebGLBackend: true } : {};
      state.lose = (message) =>
        this.onDeviceLost({
          api: "WebGPU",
          message,
          reason: null,
          originalEvent: null,
        });
    }

    onDeviceLost(info: LostInfo) {
      state.log.push(`three marks lost: ${info.message}`);
    }

    init() {
      if (state.lostDuringInit) state.lose("lost while starting");
      return Promise.resolve(this);
    }

    setClearColor() {}

    setDrawingBufferSize(width: number, height: number, ratio: number) {
      state.log.push(`size ${width} ${height} ${ratio}`);
    }

    compute() {
      state.computes.push(state.reseat.value);
    }

    render() {
      if (state.renderThrows) throw new Error("render broke");
      state.log.push("render");
    }

    setAnimationLoop(callback: ((time: number) => void) | null) {
      state.loop = callback;
      state.log.push(callback === null ? "loop off" : "loop on");
    }

    dispose() {
      state.log.push("renderer dispose");
      return Promise.resolve();
    }
  }

  class ResizeObserver {
    constructor(callback: () => void) {
      state.resize = callback;
    }
    observe() {
      state.log.push("observer observe");
    }
    disconnect() {
      state.log.push("observer disconnect");
    }
  }

  return { state, part, Timer, WebGPURenderer, ResizeObserver };
});

vi.mock("three/webgpu", () => ({
  Timer: fakes.Timer,
  WebGPURenderer: fakes.WebGPURenderer,
}));

vi.mock("./simulation", () => ({
  createSimulation: (count: number) => ({
    count,
    positions: { value: fakes.part("positions") },
    velocities: { value: fakes.part("velocities") },
    seeds: { value: fakes.part("seeds") },
    stepSeconds: fakes.state.stepSeconds,
    elapsedSeconds: { value: 0 },
    formation: fakes.state.formation,
    reseat: fakes.state.reseat,
    update: fakes.part("update"),
  }),
}));

vi.mock("./field", () => ({
  viewFor: (aspect: number) => ({
    halfWidth: aspect,
    halfHeight: 1,
    cameraDistance: 5,
  }),
  createField: () => ({
    scene: {},
    camera: {},
    material: fakes.part("material"),
    setAspect(aspect: number) {
      fakes.state.log.push(`aspect ${aspect}`);
    },
    setPointer() {},
  }),
}));

const { createRuntime } = await import("./index");

const { state } = fakes;
const SETTLE_STEPS = 90;

function mount(backend: Backend = "webgpu", width = 1000, height = 500) {
  const size = { width, height };
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { get: () => size.width });
  Object.defineProperty(canvas, "clientHeight", { get: () => size.height });

  const onFrame = vi.fn<RuntimeOptions["onFrame"]>();
  const onLost = vi.fn<RuntimeOptions["onLost"]>();
  const options: RuntimeOptions = {
    canvas,
    backend,
    particleCount: { webgpu: 1000, webgl2: 250 },
    onFrame,
    onLost,
  };

  const resizeTo = (nextWidth: number, nextHeight: number) => {
    size.width = nextWidth;
    size.height = nextHeight;
    state.resize();
  };

  return { options, onFrame, onLost, resizeTo };
}

const count = (entry: string) =>
  state.log.filter((line) => line === entry).length;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", fakes.ResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  state.log.length = 0;
  state.computes.length = 0;
  state.reseat.value = 0;
  state.stepSeconds.value = 0;
  state.formation.value = 0;
  state.delta = 1 / 60;
  state.rendererOptions.length = 0;
  state.isWebGL = false;
  state.lostDuringInit = false;
  state.renderThrows = false;
  state.throwingPart = "";
  state.loop = null;
});

describe("the backend that is live", () => {
  test("REQ-ENG-08 a renderer that came back on WebGL2 is reported as webgl2, with that count", async () => {
    state.isWebGL = true;
    const { options } = mount("webgpu");

    const runtime = await createRuntime(options);

    expect(runtime.backend).toBe("webgl2");
    expect(runtime.particleCount).toBe(250);
  });

  test.each([
    ["webgl2", true],
    ["webgpu", false],
  ] satisfies [Backend, boolean][])(
    "REQ-ENG-05 a request for %s builds the renderer with forceWebGL %s",
    async (backend, forced) => {
      const { options } = mount(backend);

      await createRuntime(options);

      expect(state.rendererOptions).toHaveLength(1);
      expect(state.rendererOptions[0]?.forceWebGL).toBe(forced);
    },
  );

  test("REQ-ENG-08 a device lost while the renderer starts rejects and disposes the renderer", async () => {
    state.lostDuringInit = true;
    const { options, onLost } = mount();

    await expect(createRuntime(options)).rejects.toThrow("lost while starting");

    expect(count("renderer dispose")).toBe(1);
    expect(onLost).not.toHaveBeenCalled();
  });
});

describe("loss and failure", () => {
  test("REQ-ENG-08 a lost device stops the loop and is reported once, after three's own handler", async () => {
    const { options, onLost } = mount();
    const runtime = await createRuntime(options);
    runtime.run();

    state.lose("the device is gone");
    state.lose("the device is gone again");

    expect(state.log).toContain("three marks lost: the device is gone");
    expect(state.loop).toBeNull();
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledWith("the device is gone");

    runtime.run();
    expect(state.loop).toBeNull();
  });

  test("REQ-ENG-08 a throw inside the frame loop stops the loop and is reported once as a loss", async () => {
    const { options, onFrame, onLost } = mount();
    const runtime = await createRuntime(options);
    runtime.run();
    const loop = state.loop;
    expect(loop).not.toBeNull();

    state.renderThrows = true;
    expect(() => loop?.(16)).not.toThrow();
    // three may still hold the callback for one more frame.
    expect(() => loop?.(32)).not.toThrow();

    expect(state.loop).toBeNull();
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledWith("render broke");
    expect(onFrame).not.toHaveBeenCalled();
  });

  test("REQ-ENG-03 onFrame reports the time between drawn frames, never the first one after run", async () => {
    const { options, onFrame } = mount();
    const runtime = await createRuntime(options);

    runtime.run();
    state.loop?.(100);
    expect(onFrame).not.toHaveBeenCalled();
    state.loop?.(116);
    expect(onFrame).toHaveBeenLastCalledWith(16);

    runtime.pause();
    runtime.run();
    state.loop?.(5000);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });
});

describe("the step and the story", () => {
  test("REQ-ENG-07 a step is never longer than a thirtieth of a second and never negative", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.run();

    state.delta = 5;
    state.loop?.(16);
    expect(state.stepSeconds.value).toBe(1 / 30);

    state.delta = -1;
    state.loop?.(32);
    expect(state.stepSeconds.value).toBe(0);

    state.delta = 1 / 120;
    state.loop?.(48);
    expect(state.stepSeconds.value).toBe(1 / 120);
  });

  test("REQ-ENG-03 the hero keeps the field at rest and a later chapter gathers it, up to 1", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);

    runtime.setStory("work", 0.5);
    expect(state.formation.value).toBe(0.5);

    runtime.setStory("hero", 1);
    expect(state.formation.value).toBe(0);

    runtime.setStory("work", 2);
    expect(state.formation.value).toBe(1);
  });
});

describe("teardown", () => {
  test("REQ-ENG-07 dispose stops the loop, frees every part and disposes the renderer last, once", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.run();
    state.log.length = 0;

    const first = runtime.dispose();
    const second = runtime.dispose();
    await Promise.all([first, second]);

    expect(second).toBe(first);
    expect(state.log).toEqual([
      "loop off",
      "update dispose",
      "material dispose",
      "positions dispose",
      "velocities dispose",
      "seeds dispose",
      "timer dispose",
      "observer disconnect",
      "renderer dispose",
    ]);

    runtime.run();
    await runtime.drawStill();
    expect(state.log).not.toContain("loop on");
    expect(state.log).not.toContain("render");
  });

  test("REQ-ENG-07 a part that cannot be freed does not keep the rest or the renderer alive", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    state.throwingPart = "material";
    state.log.length = 0;

    await expect(runtime.dispose()).resolves.toBeUndefined();

    expect(state.log).toEqual([
      "update dispose",
      "positions dispose",
      "velocities dispose",
      "seeds dispose",
      "timer dispose",
      "observer disconnect",
      "renderer dispose",
    ]);
  });
});

describe("the still frame", () => {
  test("REQ-A11Y-03 a still settles the field, draws one frame and starts no loop", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);

    await runtime.drawStill();

    expect(state.computes).toEqual(Array<number>(SETTLE_STEPS).fill(0));
    expect(count("render")).toBe(1);
    expect(state.loop).toBeNull();

    await runtime.drawStill();
    expect(state.computes).toHaveLength(SETTLE_STEPS);
    expect(count("render")).toBe(2);
  });

  test("REQ-A11Y-03 a still keeps its particles through a small change of shape and is redrawn", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    await runtime.drawStill();

    resizeTo(1000, 520);

    expect(state.computes).toHaveLength(SETTLE_STEPS);
    expect(count("render")).toBe(2);
  });

  test("REQ-A11Y-03 a still whose frame changes shape is seated on its homes and settled again", async () => {
    const { options, resizeTo } = mount("webgpu", 500, 1000);
    const runtime = await createRuntime(options);
    await runtime.drawStill();
    state.computes.length = 0;

    resizeTo(1000, 500);

    expect(state.log).toContain("aspect 2");
    expect(state.computes).toEqual([1, ...Array<number>(SETTLE_STEPS).fill(0)]);
    expect(state.reseat.value).toBe(0);
    expect(count("render")).toBe(2);
  });

  test("REQ-ENG-07 a running field is redrawn after a resize and is never reseated", async () => {
    const { options, resizeTo } = mount("webgpu", 500, 1000);
    const runtime = await createRuntime(options);
    runtime.run();
    state.loop?.(16);
    state.computes.length = 0;

    resizeTo(1000, 500);

    expect(state.computes).toEqual([]);
    expect(count("render")).toBe(2);

    // The loop has followed the new shape, so freezing it now keeps it.
    state.loop?.(32);
    runtime.pause();
    await runtime.drawStill();
    expect(state.computes).not.toContain(1);
  });

  test("REQ-ENG-07 an unchanged size is not applied twice", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    await runtime.drawStill();

    resizeTo(1000, 500);

    expect(count("size 1000 500 1")).toBe(1);
    expect(count("render")).toBe(1);
  });
});

describe("a canvas with no size", () => {
  const sizeCalls = () => state.log.filter((line) => line.startsWith("size "));

  test("REQ-ENG-07 a calm field whose canvas is hidden keeps its buffer and its seat, and is drawn once when it is shown again", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    await runtime.drawStill();

    resizeTo(0, 0);

    expect(sizeCalls()).toEqual(["size 1000 500 1"]);
    expect(count("render")).toBe(1);

    resizeTo(1000, 500);

    expect(sizeCalls()).toEqual(["size 1000 500 1"]);
    expect(state.computes).toEqual(Array<number>(SETTLE_STEPS).fill(0));
    expect(count("render")).toBe(2);
  });

  test("REQ-ENG-07 a paused field is drawn once when its canvas is shown again, and a running one is left to its loop", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.run();
    state.loop?.(16);

    resizeTo(0, 500);
    resizeTo(1000, 500);
    expect(count("render")).toBe(1);

    runtime.pause();
    resizeTo(1000, 0);
    resizeTo(1000, 500);

    expect(sizeCalls()).toEqual(["size 1000 500 1"]);
    expect(state.computes).toEqual([0]);
    expect(count("render")).toBe(2);
  });

  test("REQ-ENG-07 a runtime built on a hidden canvas starts with a buffer of one pixel and takes the real size later", async () => {
    const { options, resizeTo } = mount("webgpu", 0, 0);
    await createRuntime(options);

    resizeTo(0, 0);
    expect(sizeCalls()).toEqual(["size 1 1 1"]);

    resizeTo(1000, 500);
    expect(sizeCalls()).toEqual(["size 1 1 1", "size 1000 500 1"]);
    expect(count("render")).toBe(0);
  });
});
