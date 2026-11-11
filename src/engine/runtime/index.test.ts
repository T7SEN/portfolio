import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WORK_SHAPES } from "../story";
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
    /** The pointer's push each compute call ran with. */
    pushes: [] as number[],
    pointerStrength: { value: 0 },
    /** Where the field was last told the pointer is. */
    pointerAt: [0, 0] as [number, number],
    reseat: { value: 0 },
    stepSeconds: { value: 0 },
    /** The story's uniforms, as the fake simulation hands them out. */
    story: {
      release: { value: 1 },
      shapeFrom: { value: 0 },
      shapeTo: { value: 0 },
      shapeMix: { value: 0 },
      shapeScaleFrom: { value: 1 },
      shapeScaleTo: { value: 1 },
      shapeWeight: { value: 0 },
      sheetWeight: { value: 0 },
      waveWeight: { value: 0 },
      noiseLevel: { value: 1 },
      pulse: { value: 0 },
    },
    /** Every depth the field's focus plane was moved to. */
    focus: [] as number[],
    light: { value: 1 },
    /** Every atlas texture made, and the texture each simulation was given. */
    textures: [] as Array<Record<string, unknown>>,
    simulationAtlas: [] as unknown[],
    packs: 0,
    /** What the fake Timer hands out as the time since the last frame. */
    delta: 1 / 60,
    /** The options each renderer was built with. */
    rendererOptions: [] as Array<Record<string, unknown>>,
    isWebGL: false,
    lostDuringInit: false,
    renderThrows: false,
    computeThrows: false,
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

  class DataTexture {
    minFilter = "";
    magFilter = "";
    generateMipmaps = true;
    needsUpdate = false;

    constructor(
      data: Float32Array,
      width: number,
      height: number,
      format: string,
      type: string,
    ) {
      state.textures.push({ data, width, height, format, type, texture: this });
    }

    dispose() {
      if (state.throwingPart === "atlas") throw new Error("atlas is stuck");
      state.log.push("atlas dispose");
    }
  }

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
      if (state.computeThrows) throw new Error("compute broke");
      state.computes.push(state.reseat.value);
      state.pushes.push(state.pointerStrength.value);
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

  /** The push of an active pointer, standing in for field.ts's force. */
  const PUSH = 0.15;

  return {
    state,
    part,
    PUSH,
    DataTexture,
    Timer,
    WebGPURenderer,
    ResizeObserver,
  };
});

vi.mock("three/webgpu", () => ({
  DataTexture: fakes.DataTexture,
  FloatType: "float type",
  NearestFilter: "nearest",
  RGBAFormat: "rgba",
  Timer: fakes.Timer,
  WebGPURenderer: fakes.WebGPURenderer,
}));

// Every shape gets the same square box, so its fit is easy to predict.
vi.mock("./atlas", async () => {
  const { WORK_SHAPES: shapes } = await import("../story");
  const ids = ["logo", ...shapes];
  return {
    packAtlas: () => {
      fakes.state.packs += 1;
      return {
        data: new Float32Array(16),
        width: 2,
        height: 2,
        extents: Object.fromEntries(
          ids.map((id) => [id, { halfWidth: 1, halfHeight: 1, area: 2 }]),
        ),
        index: Object.fromEntries(ids.map((id, index) => [id, index])),
      };
    },
  };
});

vi.mock("./simulation", () => ({
  createSimulation: (count: number, view: unknown, atlas: unknown) => {
    void view;
    fakes.state.simulationAtlas.push(atlas);
    return {
      count,
      positions: { value: fakes.part("positions") },
      velocities: { value: fakes.part("velocities") },
      seeds: { value: fakes.part("seeds") },
      stepSeconds: fakes.state.stepSeconds,
      elapsedSeconds: { value: 0 },
      reseat: fakes.state.reseat,
      ...fakes.state.story,
      update: fakes.part("update"),
    };
  },
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
    light: fakes.state.light,
    setAspect(aspect: number) {
      fakes.state.log.push(`aspect ${aspect}`);
      return { halfWidth: aspect, halfHeight: 1, cameraDistance: 5 };
    },
    setFocus(depth: number) {
      fakes.state.focus.push(depth);
    },
    // As field.ts does: an inactive pointer has no push.
    setPointer(x: number, y: number, active: boolean) {
      fakes.state.pointerAt = [x, y];
      fakes.state.pointerStrength.value = active ? fakes.PUSH : 0;
    },
  }),
}));

const { createRuntime } = await import("./index");

const { state, PUSH } = fakes;
const { story } = state;
const SETTLE_STEPS = 90;
const settle = (reseat: number[] = []) => [
  ...reseat,
  ...Array<number>(SETTLE_STEPS).fill(0),
];

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
  state.pushes.length = 0;
  state.pointerStrength.value = 0;
  state.pointerAt = [0, 0];
  state.reseat.value = 0;
  state.stepSeconds.value = 0;
  for (const entry of Object.values(story)) entry.value = 0;
  story.release.value = 1;
  story.noiseLevel.value = 1;
  story.shapeScaleFrom.value = 1;
  story.shapeScaleTo.value = 1;
  state.focus.length = 0;
  state.light.value = 1;
  state.textures.length = 0;
  state.simulationAtlas.length = 0;
  state.packs = 0;
  state.delta = 1 / 60;
  state.rendererOptions.length = 0;
  state.isWebGL = false;
  state.lostDuringInit = false;
  state.renderThrows = false;
  state.computeThrows = false;
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

describe("the step", () => {
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
});

describe("the story", () => {
  test("REQ-SCR-01 REQ-SCR-07 setStory aims the field at each chapter's own targets", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);

    runtime.setStory("bloom", 0.6);
    expect(story.shapeWeight.value).toBe(1);
    expect(story.shapeFrom.value).toBe(0);
    expect(story.shapeTo.value).toBe(0);

    runtime.setStory("work", 2.5 / WORK_SHAPES.length);
    expect(story.shapeWeight.value).toBe(1);
    expect(story.shapeFrom.value).toBe(1 + 2);
    expect(story.shapeMix.value).toBe(0);

    runtime.setStory("making-of", 0.5);
    expect(story.shapeWeight.value).toBe(0);
    expect(story.sheetWeight.value).toBe(1);

    runtime.setStory("about", 0.5);
    expect(story.sheetWeight.value).toBe(0);
    expect(story.waveWeight.value).toBe(1);

    runtime.setStory("contact", 0.5);
    expect(story.waveWeight.value).toBe(0);
    expect(story.noiseLevel.value).toBeLessThan(1);
  });

  test("REQ-SCR-01 shapes are sized for the frame they are in, and again when it changes shape", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStory("bloom", 0.6);

    // Half frame 2 by 1 and a square box of half side 1: the height binds.
    expect(story.shapeScaleFrom.value).toBeCloseTo(0.8);
    resizeTo(400, 800);
    // Half frame 0.5 by 1: now the width binds.
    expect(story.shapeScaleFrom.value).toBeCloseTo(0.4);
    expect(story.shapeScaleTo.value).toBeCloseTo(0.4);
  });

  test("REQ-SCR-05 a story sent before the field has stepped starts the field on its targets, with no glide", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);

    runtime.setStory("hero", 0);
    expect(story.release.value).toBe(0);

    runtime.run();
    state.loop?.(16);
    // The first step seats every particle on its target, then steps on.
    expect(state.computes).toEqual([1, 0]);
    expect(state.reseat.value).toBe(0);
  });

  test("REQ-TIER-01 REQ-SCR-05 a field that ran with no story, as the probe runs it, starts on the first story it hears with one reseat step", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.run();
    for (let frame = 0; frame < 5; frame += 1) state.loop?.(16 * frame);
    // The probe's load: the ambient field, every particle released.
    expect(story.release.value).toBe(1);
    expect(state.computes).not.toContain(1);
    state.computes.length = 0;

    runtime.setStory("hero", 0);
    expect(story.release.value).toBe(0);
    state.loop?.(96);
    expect(state.computes).toEqual([1, 0]);
    expect(state.reseat.value).toBe(0);

    // The chapters after the first glide as before.
    runtime.setStory("work", 1);
    state.loop?.(112);
    expect(state.computes).toEqual([1, 0, 0]);
    expect(story.release.value).toBeGreaterThan(0);
    expect(story.release.value).toBeLessThan(1);
  });

  test("REQ-SCR-05 a later chapter glides there: the release and the camera follow over time, never in one jump", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("hero", 0);
    runtime.run();
    state.loop?.(16);

    runtime.setStory("work", 1);
    expect(story.release.value).toBe(0);
    const pushed = state.focus.length;

    state.loop?.(32);
    const release = story.release.value;
    expect(release).toBeGreaterThan(0);
    expect(release).toBeLessThan(1);
    const depth = state.focus.at(-1) ?? 0;
    expect(state.focus.length).toBeGreaterThan(pushed);
    expect(depth).toBeLessThan(0);
    expect(depth).toBeGreaterThan(-1.6);

    for (let frame = 0; frame < 600; frame += 1) state.loop?.(48 + frame);
    expect(story.release.value).toBeCloseTo(1, 3);
    expect(state.focus.at(-1)).toBeCloseTo(-1.6, 3);
    // No new seat: the particles fly there with their own inertia.
    expect(state.computes.filter((value) => value === 1)).toHaveLength(1);
  });

  test("REQ-A11Y-06 a formation dims each sprite toward the share of the frame it packs into, over time", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStory("contact", 0.5);
    runtime.run();
    state.loop?.(16);
    expect(state.light.value).toBe(1);

    runtime.setStory("bloom", 0.6);
    state.loop?.(32);
    const dimming = state.light.value;
    expect(dimming).toBeLessThan(1);
    for (let frame = 0; frame < 600; frame += 1) state.loop?.(48 + frame);
    expect(state.light.value).toBeLessThan(dimming);
    expect(state.light.value).toBeGreaterThan(0);
  });

  test("REQ-A11Y-03 the hero's dot breathes while the field runs and is at rest in a still", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("hero", 0);

    await runtime.drawStill();
    expect(story.pulse.value).toBe(0);

    runtime.run();
    for (let frame = 0; frame < 40; frame += 1) state.loop?.(16 * frame);
    expect(story.pulse.value).not.toBe(0);
    expect(Math.abs(story.pulse.value)).toBeLessThanOrEqual(1);
  });
});

describe("the calm story", () => {
  test("REQ-A11Y-03 a calm field is settled and drawn again for a new chapter or a new study only, never for a scroll inside one", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("work", 0.1);
    await runtime.drawStill();
    expect(state.computes).toEqual(settle([1]));
    expect(count("render")).toBe(1);
    state.computes.length = 0;

    runtime.setStory("work", 0.15);
    expect(state.computes).toEqual([]);
    expect(count("render")).toBe(1);

    runtime.setStory("work", 0.3);
    expect(state.computes).toEqual(settle());
    expect(count("render")).toBe(2);
    expect(story.shapeFrom.value).toBe(1 + 1);

    runtime.setStory("about", 0.1);
    expect(state.computes).toEqual(settle(settle()));
    expect(count("render")).toBe(3);
    expect(story.waveWeight.value).toBe(1);

    runtime.setStory("about", 0.95);
    expect(state.computes).toHaveLength(SETTLE_STEPS * 2);
    expect(count("render")).toBe(3);
    expect(state.loop).toBeNull();
  });

  test("REQ-A11Y-03 the calm still is the chapter at its fullest, not where the scroll stood", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("bloom", 0.05);
    await runtime.drawStill();

    expect(story.release.value).toBe(1);
    expect(story.shapeWeight.value).toBe(1);
  });

  test("REQ-A11Y-03 a running field turned calm is settled toward its chapter's still before the frame is drawn", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("bloom", 0.2);
    runtime.run();
    for (let frame = 0; frame < 5; frame += 1) state.loop?.(16 * frame);
    runtime.pause();
    state.computes.length = 0;
    state.log.length = 0;

    await runtime.drawStill();

    expect(state.computes).toEqual(settle());
    expect(count("render")).toBe(1);
    expect(story.shapeWeight.value).toBe(1);
  });

  test("REQ-A11Y-04 leaving calm aims the field back at where the page is, and it glides there", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("work", 0.02);
    await runtime.drawStill();
    expect(story.shapeWeight.value).toBe(1);

    runtime.run();
    // The very edge of the chapter: the formation lets go.
    expect(story.shapeWeight.value).toBeLessThan(0.5);
    expect(state.computes.filter((value) => value === 1)).toHaveLength(1);
  });

  test("REQ-A11Y-03 REQ-A11Y-04 a still is settled with no pointer push, even while the page still holds the pointer, and the kept pointer pushes again when the field runs", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("bloom", 0.2);
    runtime.run();
    runtime.setPointer(0.25, -0.5, true);
    for (let frame = 0; frame < 5; frame += 1) state.loop?.(16 * frame);
    expect(state.pushes.at(-1)).toBe(PUSH);
    runtime.pause();
    state.pushes.length = 0;

    // Calm freezes the field before the page lets go of the pointer.
    await runtime.drawStill();

    expect(state.pushes).toEqual(Array<number>(SETTLE_STEPS).fill(0));
    expect(state.pointerStrength.value).toBe(0);

    runtime.run();
    expect(state.pointerStrength.value).toBe(PUSH);
    expect(state.pointerAt).toEqual([0.25, -0.5]);
    state.pushes.length = 0;
    state.loop?.(200);
    expect(state.pushes).toEqual([PUSH]);
  });

  test("REQ-A11Y-03 a calm field settled again for a new chapter or a new frame shape feels no pointer push", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStory("hero", 0);
    await runtime.drawStill();

    runtime.setPointer(0.25, -0.5, true);
    expect(state.pointerStrength.value).toBe(0);
    state.pushes.length = 0;

    runtime.setStory("about", 0.5);
    resizeTo(500, 1000);

    // A new chapter's settle, then a seat and a settle for the new shape.
    expect(state.pushes).toEqual(Array<number>(SETTLE_STEPS * 2 + 1).fill(0));
    expect(count("render")).toBe(3);

    runtime.run();
    expect(state.pointerStrength.value).toBe(PUSH);
  });

  test("REQ-ENG-07 a calm field whose canvas is hidden is settled for a new chapter and drawn when it is shown again", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStory("hero", 0);
    await runtime.drawStill();
    resizeTo(0, 0);
    state.computes.length = 0;

    runtime.setStory("contact", 0.5);
    expect(state.computes).toEqual(settle());
    expect(count("render")).toBe(1);

    resizeTo(1000, 500);
    expect(state.computes).toHaveLength(SETTLE_STEPS);
    expect(count("render")).toBe(2);
  });

  test("REQ-ENG-08 a throw while a calm field is drawn again for a new chapter is reported once as a loss, and nothing throws to the caller", async () => {
    const { options, onLost } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("hero", 0);
    await runtime.drawStill();

    state.computeThrows = true;
    expect(() => runtime.setStory("about", 0.5)).not.toThrow();
    expect(() => runtime.setStory("contact", 0.5)).not.toThrow();

    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledWith("compute broke");
  });
});

describe("the shapes atlas", () => {
  test("REQ-ENG-05 the shapes are packed once into one float texture, read without filtering or mipmaps, and handed to the simulation", async () => {
    const { options } = mount();
    await createRuntime(options);

    expect(state.packs).toBe(1);
    expect(state.textures).toHaveLength(1);
    const made = state.textures[0];
    expect(made).toMatchObject({
      width: 2,
      height: 2,
      format: "rgba",
      type: "float type",
    });
    expect(made?.texture).toMatchObject({
      minFilter: "nearest",
      magFilter: "nearest",
      generateMipmaps: false,
      needsUpdate: true,
    });
    expect(state.simulationAtlas).toEqual([made?.texture]);
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
      "atlas dispose",
      "timer dispose",
      "observer disconnect",
      "renderer dispose",
    ]);

    runtime.run();
    await runtime.drawStill();
    runtime.setStory("about", 0.5);
    expect(state.log).not.toContain("loop on");
    expect(state.log).not.toContain("render");
  });

  test.each(["material", "atlas"])(
    "REQ-ENG-07 a part that cannot be freed (%s) does not keep the rest or the renderer alive",
    async (stuck) => {
      const { options } = mount();
      const runtime = await createRuntime(options);
      state.throwingPart = stuck;
      state.log.length = 0;

      await expect(runtime.dispose()).resolves.toBeUndefined();

      expect(state.log).toEqual(
        [
          "update dispose",
          "material dispose",
          "positions dispose",
          "velocities dispose",
          "seeds dispose",
          "atlas dispose",
          "timer dispose",
          "observer disconnect",
          "renderer dispose",
        ].filter((line) => line !== `${stuck} dispose`),
      );
    },
  );
});

describe("the still frame", () => {
  test("REQ-A11Y-03 a still settles the field, draws one frame and starts no loop", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);

    await runtime.drawStill();

    expect(state.computes).toEqual(settle());
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

  test("REQ-A11Y-03 a still whose frame changes shape is seated on its targets and settled again", async () => {
    const { options, resizeTo } = mount("webgpu", 500, 1000);
    const runtime = await createRuntime(options);
    await runtime.drawStill();
    state.computes.length = 0;

    resizeTo(1000, 500);

    expect(state.log).toContain("aspect 2");
    expect(state.computes).toEqual(settle([1]));
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
    expect(state.computes).toEqual(settle());
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
