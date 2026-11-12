import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WORK_SHAPES } from "../story";
import type { Backend, ChapterId, FieldLook, RuntimeOptions } from "../types";
import { sprinkle } from "./halftone-rules";
import { FLOW_SHARE } from "./story";

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
      strandsWeight: { value: 0 },
      ringsWeight: { value: 0 },
      keep: { value: 0 },
      noiseLevel: { value: 1 },
      pulse: { value: 0 },
      dotCentre: { value: vector() },
      dotSeed: { value: vector() },
      rankScale: { value: Math.SQRT1_2 },
      shapeCentre: { value: vector() },
    },
    /** Each advanceFlow call: the step's seconds and the release it ran with. */
    flows: [] as Array<[number, number]>,
    resetFlows: 0,
    /** Every targets object applyTargets was handed. */
    applied: [] as unknown[],
    /** Every depth the field's focus plane was moved to. */
    focus: [] as number[],
    light: { value: 1 },
    /** The field's draw offset, swirl, sprinkle and grids, as last set. */
    drawOffset: [0, 0] as [number, number],
    swirl: 0,
    sprinkle: [0, 0] as [number, number],
    grids: [] as Array<Record<string, number>>,
    /** What the start check reports, and the halftone each runtime made. */
    halftoneWorks: true,
    halftones: [] as Array<{
      resizes: Array<[number, number, number]>;
      hero: Record<string, number> | null;
      frame: Record<string, number> | null;
      formed: number;
    }>,
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

  function vector() {
    return {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };
  }

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

  /** A halftone that records what the runtime sets and draws through it. */
  function createHalftone(count: number) {
    state.log.push(`halftone for ${count}`);
    const record = {
      resizes: [] as Array<[number, number, number]>,
      hero: null as Record<string, number> | null,
      frame: null as Record<string, number> | null,
      formed: 0,
    };
    state.halftones.push(record);
    return {
      resize(
        grid: { columns: number; rows: number },
        width: number,
        height: number,
        ratio: number,
      ) {
        void width;
        void height;
        record.resizes.push([grid.columns, grid.rows, ratio]);
      },
      setHero(hero: Record<string, number>) {
        record.hero = { ...hero };
      },
      setFrame(frame: Record<string, number>) {
        record.frame = { ...frame };
      },
      setFormed(value: number) {
        record.formed = value;
      },
      // The splat goes through the renderer, so a draw still logs "render".
      render(renderer: { render: () => void }) {
        state.log.push("halftone render");
        renderer.render();
      },
      dispose() {
        if (state.throwingPart === "halftone") {
          throw new Error("halftone is stuck");
        }
        state.log.push("halftone dispose");
      },
    };
  }

  function halftoneWorks() {
    state.log.push("halftone check");
    return Promise.resolve(state.halftoneWorks);
  }

  return {
    state,
    part,
    PUSH,
    DataTexture,
    Timer,
    WebGPURenderer,
    ResizeObserver,
    createHalftone,
    halftoneWorks,
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

vi.mock("./halftone", () => ({
  createHalftone: fakes.createHalftone,
  halftoneWorks: fakes.halftoneWorks,
}));

// Every shape gets the same square box, so its fit is easy to predict.
vi.mock("./atlas", async () => {
  const { WORK_SHAPES: shapes } = await import("../story");
  const ids = ["logo", "wordmark", ...shapes];
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
  FIELD_MARGIN: 1.1,
  FORM_PULL: 9,
  FORM_DRAG: 5.5,
  createSimulation: (count: number, view: unknown, atlas: unknown) => {
    void view;
    fakes.state.simulationAtlas.push(atlas);
    const { story: uniforms } = fakes.state;
    return {
      count,
      positions: { value: fakes.part("positions") },
      velocities: { value: fakes.part("velocities") },
      seeds: { value: fakes.part("seeds") },
      stepSeconds: fakes.state.stepSeconds,
      elapsedSeconds: { value: 0 },
      reseat: fakes.state.reseat,
      ...uniforms,
      update: fakes.part("update"),
      // As simulation.ts does: every target uniform from the targets.
      applyTargets(
        targets: {
          shapeFrom: string;
          shapeTo: string;
          shapeMix: number;
          shape: number;
          sheet: number;
          strands: number;
          rings: number;
          keep: number;
          noise: number;
        },
        index: Record<string, number>,
      ) {
        fakes.state.applied.push(targets);
        uniforms.shapeFrom.value = index[targets.shapeFrom] ?? -1;
        uniforms.shapeTo.value = index[targets.shapeTo] ?? -1;
        uniforms.shapeMix.value = targets.shapeMix;
        uniforms.shapeWeight.value = targets.shape;
        uniforms.sheetWeight.value = targets.sheet;
        uniforms.strandsWeight.value = targets.strands;
        uniforms.ringsWeight.value = targets.rings;
        uniforms.keep.value = targets.keep;
        uniforms.noiseLevel.value = targets.noise;
      },
      advanceFlow(seconds: number, release: number) {
        fakes.state.flows.push([seconds, release]);
      },
      resetFlow() {
        fakes.state.resetFlows += 1;
      },
    };
  },
}));

vi.mock("./field", () => ({
  viewFor: (aspect: number) => ({
    halfWidth: aspect,
    halfHeight: 1,
    cameraDistance: 5,
  }),
  createField: (simulation: unknown, look: string) => {
    void simulation;
    fakes.state.log.push(`field ${look}`);
    return {
      scene: {},
      camera: {},
      material: fakes.part("material"),
      light: fakes.state.light,
      setAspect(aspect: number) {
        fakes.state.log.push(`aspect ${aspect}`);
        return { halfWidth: aspect, halfHeight: 1, cameraDistance: 5 };
      },
      setGrid(grid: Record<string, number>) {
        fakes.state.grids.push({ ...grid });
      },
      setFocus(depth: number) {
        fakes.state.focus.push(depth);
      },
      // As field.ts does: an inactive pointer has no push.
      setPointer(x: number, y: number, active: boolean) {
        fakes.state.pointerAt = [x, y];
        fakes.state.pointerStrength.value = active ? fakes.PUSH : 0;
      },
      setDrawOffset(x: number, y: number) {
        fakes.state.drawOffset = [x, y];
      },
      setSwirl(amount: number) {
        fakes.state.swirl = amount;
      },
      setSprinkle(share: number, gain: number) {
        fakes.state.sprinkle = [share, gain];
      },
    };
  },
}));

const { createRuntime } = await import("./index");

const { state, PUSH } = fakes;
const { story } = state;
const SETTLE_STEPS = 90;
const settle = (reseat: number[] = []) => [
  ...reseat,
  ...Array<number>(SETTLE_STEPS).fill(0),
];

function mount(
  backend: Backend = "webgpu",
  width = 1000,
  height = 500,
  look: FieldLook = "halftone",
) {
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
    look,
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

/**
 * Lets the microtask run that settles a calm field once for the commands of
 * the task before it (runtime/index.ts, payStill).
 */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  for (const entry of Object.values(story)) {
    if (typeof entry.value === "number") entry.value = 0;
    else entry.value.set(0, 0);
  }
  story.release.value = 1;
  story.rankScale.value = Math.SQRT1_2;
  story.noiseLevel.value = 1;
  story.shapeScaleFrom.value = 1;
  story.shapeScaleTo.value = 1;
  state.flows.length = 0;
  state.resetFlows = 0;
  state.applied.length = 0;
  state.drawOffset = [0, 0];
  state.swirl = 0;
  state.sprinkle = [0, 0];
  state.grids.length = 0;
  state.halftoneWorks = true;
  state.halftones.length = 0;
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

    // The field chapter: the mark morphing into the wordmark (atlas rows 0
    // and 1).
    runtime.setStory("bloom", 0.6);
    expect(story.shapeWeight.value).toBe(1);
    expect(story.shapeFrom.value).toBe(0);
    expect(story.shapeTo.value).toBe(1);

    // The work shapes follow the mark and the wordmark in the atlas.
    runtime.setStory("work", 2.5 / WORK_SHAPES.length);
    expect(story.shapeWeight.value).toBe(1);
    expect(story.shapeFrom.value).toBe(2 + 2);
    expect(story.shapeMix.value).toBe(0);

    runtime.setStory("making-of", 0.5);
    expect(story.shapeWeight.value).toBe(0);
    expect(story.sheetWeight.value).toBe(1);

    runtime.setStory("about", 0.5);
    expect(story.sheetWeight.value).toBe(0);
    expect(story.strandsWeight.value).toBe(1);

    runtime.setStory("contact", 0.5);
    expect(story.strandsWeight.value).toBe(0);
    expect(story.ringsWeight.value).toBe(1);
    expect(story.noiseLevel.value).toBeLessThan(1);
  });

  test("REQ-SCR-07 every chapter's targets reach the simulation through applyTargets, with the atlas's own rows", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);

    runtime.setStory("bloom", 0.6);
    runtime.setStory("about", 0.5);

    expect(state.applied).toHaveLength(2);
    expect(state.applied[0]).toMatchObject({
      shapeFrom: "logo",
      shapeTo: "wordmark",
    });
    expect(state.applied[1]).toMatchObject({ strands: 1, shape: 0 });
  });

  test("REQ-SCR-01 shapes are sized for the frame they are in, and again when it changes shape", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStory("bloom", 0.6);

    // The field chapter forms in the middle 0.8 of the frame (story.ts,
    // BLOOM_STAGE). Half frame 2 by 1, so a stage of 1.6 by 0.8, and a
    // square box of half side 1: the height binds.
    expect(story.shapeScaleFrom.value).toBeCloseTo(0.8 * 0.8);
    resizeTo(800, 1000);
    // Half frame 0.8 by 1, not narrow: now the width binds, a stage of
    // 0.64 by 0.8.
    expect(story.shapeScaleFrom.value).toBeCloseTo(0.64 * 0.8);
    expect(story.shapeScaleTo.value).toBeCloseTo(0.64 * 0.8);
    // A narrow frame forms across the whole width (story.ts,
    // NARROW_BLOOM_STAGE): half frame 0.5 by 1.
    resizeTo(400, 800);
    expect(story.shapeScaleFrom.value).toBeCloseTo(0.5 * 0.8);
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

  test.each(["soft", "halftone"] satisfies FieldLook[])(
    "REQ-A11Y-06 a formation dims each particle toward the share of the frame it packs into, over time (%s)",
    async (look) => {
      const { options } = mount("webgpu", 1000, 500, look);
      const runtime = await createRuntime(options);
      // The hero forms nothing: every particle at its full light.
      runtime.setStory("hero", 0);
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
    },
  );

  test("REQ-A11Y-06 the halftone's formed light brings a formation's fill to the glow token's tone, not the soft look's", async () => {
    const lights: number[] = [];
    for (const look of ["soft", "halftone"] satisfies FieldLook[]) {
      const { options } = mount("webgpu", 1000, 500, look);
      const runtime = await createRuntime(options);
      runtime.setStory("bloom", 0.6);
      lights.push(state.light.value);
      await runtime.dispose();
    }
    const [soft, halftone] = lights;
    expect(soft).toBeLessThan(1);
    expect(halftone).toBeLessThan(1);
    // Two rules, two values: soft formedLight, halftone halftoneLight.
    expect(halftone).not.toBeCloseTo(soft ?? 0, 3);
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
    await settled();
    expect(state.computes).toEqual([]);
    expect(count("render")).toBe(1);

    // The second of the three studies: its shape follows the mark and the
    // wordmark in the atlas.
    runtime.setStory("work", 0.4);
    // Aimed at once, settled and drawn once the task's commands are in.
    expect(story.shapeFrom.value).toBe(2 + 1);
    expect(state.computes).toEqual([]);
    await settled();
    expect(state.computes).toEqual(settle());
    expect(count("render")).toBe(2);

    runtime.setStory("about", 0.1);
    await settled();
    expect(state.computes).toEqual(settle(settle()));
    expect(count("render")).toBe(3);
    expect(story.strandsWeight.value).toBe(1);

    runtime.setStory("about", 0.95);
    await settled();
    expect(state.computes).toHaveLength(SETTLE_STEPS * 2);
    expect(count("render")).toBe(3);
    expect(state.loop).toBeNull();
  });

  test("REQ-A11Y-03 a stage and a story sent together to a calm field settle it once and draw it once", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    const work = { x: 0.5, y: 0, halfWidth: 0.5, halfHeight: 0.5 };
    runtime.setStage({ work });
    runtime.setStory("work", 0.1);
    await runtime.drawStill();
    state.computes.length = 0;
    const renders = count("render");

    // The page sends the next row's frame, then the story that names it.
    runtime.setStage({ work: { ...work, y: 0.4 } });
    runtime.setStory("work", 0.5);
    expect(state.computes).toEqual([]);
    await settled();

    // One seat on the new stage and one settle toward the new study's
    // still: not a settle for the stage and another for the story.
    expect(state.computes).toEqual(settle([1]));
    expect(count("render")).toBe(renders + 1);
    expect(story.shapeCentre.value.y).toBeCloseTo(0.4);
    expect(story.shapeFrom.value).toBe(2 + 1);

    // Nothing more is owed.
    await settled();
    expect(state.computes).toEqual(settle([1]));
    expect(count("render")).toBe(renders + 1);
  });

  test("REQ-A11Y-03 a still drawn in the same task pays what the field owes, so it is not drawn twice", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStory("work", 0.1);
    await runtime.drawStill();
    state.computes.length = 0;
    const renders = count("render");

    runtime.setStory("about", 0.5);
    await runtime.drawStill();
    expect(count("render")).toBe(renders + 1);
    await settled();
    expect(count("render")).toBe(renders + 1);
    expect(state.computes).toEqual(settle());
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
    await settled();
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
    await settled();
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
    await settled();
    expect(() => runtime.setStory("contact", 0.5)).not.toThrow();
    await settled();

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
      "halftone dispose",
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

  test.each(["material", "halftone", "atlas"])(
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
          "halftone dispose",
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

describe("the stage", () => {
  // At 1000 by 500 the fake view is a half frame of 2 by 1.
  const stages = {
    hero: { x: 0, y: -0.5, halfWidth: 0, halfHeight: 0 },
    work: { x: 0.5, y: 0, halfWidth: 0.5, halfHeight: 0.5 },
  };

  test("REQ-SCR-01 REQ-SCR-07 the dot sits at the hero's stage and study shapes form inside the work stage, from the first story", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStage(stages);
    runtime.setStory("work", 0.1);

    expect(story.dotCentre.value.x).toBeCloseTo(0);
    expect(story.dotCentre.value.y).toBeCloseTo(-0.5);
    expect(story.shapeCentre.value.x).toBeCloseTo(1);
    expect(story.shapeCentre.value.y).toBeCloseTo(0);
    // A stage of half 1 by 0.5 and a square box of half side 1.
    expect(story.shapeScaleFrom.value).toBeCloseTo(0.4);
    // The bloom ranks homes from the dot in the seeds' square.
    expect(story.dotSeed.value.y).toBeCloseTo(-0.5 / 1.1);
    expect(story.rankScale.value).toBeCloseTo(1 / Math.hypot(1, 1 + 0.5 / 1.1));

    // The field chapter forms in its own middle stage, 0.8 of the frame.
    runtime.setStory("bloom", 0.6);
    expect(story.shapeScaleFrom.value).toBeCloseTo(0.8 * 0.8);
  });

  test("REQ-SCR-05 a new stage on a running field glides there over a few frames", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStage(stages);
    runtime.setStory("work", 0.5);
    runtime.run();
    state.loop?.(0);
    state.loop?.(16);
    expect(story.shapeCentre.value.x).toBeCloseTo(1);

    runtime.setStage({ ...stages, work: { ...stages.work, x: -0.5 } });
    state.loop?.(32);
    const moved = story.shapeCentre.value.x;
    expect(moved).toBeLessThan(1);
    expect(moved).toBeGreaterThan(-1);
    for (let frame = 3; frame < 300; frame += 1) state.loop?.(16 * frame);
    expect(story.shapeCentre.value.x).toBeCloseTo(-1, 2);
  });

  test("REQ-A11Y-03 a calm field is put on its new stage and drawn again once", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStory("work", 0.5);
    await runtime.drawStill();
    const renders = count("render");
    state.computes.length = 0;

    runtime.setStage(stages);
    await settled();
    expect(count("render")).toBe(renders + 1);
    expect(state.computes).toEqual(settle([1]));
    expect(story.shapeCentre.value.x).toBeCloseTo(1);
  });

  test("REQ-SCR-07 on a narrow frame the field chapter forms across the whole width", async () => {
    // 400 by 800: half a frame of 0.5 by 1, under NARROW_ASPECT.
    const { options } = mount("webgpu", 400, 800);
    const runtime = await createRuntime(options);
    runtime.setStory("bloom", 0.6);
    // The whole width (0.5) at SHAPE_FIT, against 0.8 of it on a wide frame.
    expect(story.shapeScaleFrom.value).toBeCloseTo(0.5 * 0.8);
  });
});

describe("the look", () => {
  test("REQ-ENG-08 a device that cannot draw and blend a half-float target gets the soft field, never an empty one", async () => {
    state.halftoneWorks = false;
    const { options } = mount();
    const runtime = await createRuntime(options);

    expect(runtime.look).toBe("soft");
    expect(state.log).toContain("halftone check");
    expect(state.log).toContain("field soft");
    expect(state.halftones).toHaveLength(0);
    await runtime.drawStill();
    expect(count("render")).toBe(1);
    expect(state.log).not.toContain("halftone render");
  });

  test.each(["webgpu", "webgl2"] satisfies Backend[])(
    "REQ-ENG-05 REQ-ENG-08 where the start check passes on %s, the field is drawn through the halftone's passes",
    async (backend) => {
      state.isWebGL = backend === "webgl2";
      const { options } = mount(backend);
      const runtime = await createRuntime(options);

      expect(runtime.look).toBe("halftone");
      expect(state.log).toContain("field halftone");
      expect(state.log).toContain(`halftone for ${runtime.particleCount}`);
      // The check runs once the renderer has started, before the field.
      expect(state.log.indexOf("halftone check")).toBeLessThan(
        state.log.indexOf("field halftone"),
      );
      await runtime.drawStill();
      expect(count("halftone render")).toBe(1);
      expect(count("render")).toBe(1);
    },
  );

  test("REQ-ENG-08 a runtime asked for the soft look draws it without the check", async () => {
    const { options } = mount("webgpu", 1000, 500, "soft");
    const runtime = await createRuntime(options);

    expect(runtime.look).toBe("soft");
    expect(state.log).not.toContain("halftone check");
    expect(state.halftones).toHaveLength(0);
  });
});

describe("the halftone's grid", () => {
  test("REQ-PERF-06 the halftone is sized in 8 px cells from the CSS size, and keeps the same cells across the adaptive resolution's steps", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    const halftone = state.halftones[0];
    expect(halftone?.resizes).toEqual([[125, 63, 1]]);
    expect(state.grids.at(-1)).toMatchObject({ columns: 125, rows: 63 });

    // Frames of 30 ms, slower than the adaptive rule allows: the ratio
    // steps down, the buffer is sized again, and the cells stay.
    runtime.run();
    for (let frame = 0; frame < 60; frame += 1) state.loop?.(frame * 30);

    expect(state.log).toContain("size 1000 500 0.75");
    expect(halftone?.resizes.at(-1)).toEqual([125, 63, 0.75]);
    expect(state.grids.at(-1)).toMatchObject({ columns: 125, rows: 63 });
  });

  test("REQ-PERF-06 the lit share of the backdrop is set from the particle count and the CSS size, and again on a resize", async () => {
    const { options, resizeTo } = mount("webgpu", 1000, 500);
    await createRuntime(options);
    const first = sprinkle(1000, 1000, 500, FLOW_SHARE);
    expect(state.sprinkle).toEqual([first.share, first.gain]);

    resizeTo(400, 800);
    const second = sprinkle(1000, 400, 800, FLOW_SHARE);
    expect(state.sprinkle).toEqual([second.share, second.gain]);
  });
});

describe("the hero dot and the work frame in the halftone", () => {
  const hero = { x: 0.5, y: -0.5, halfWidth: 0.25, halfHeight: 0.5 };

  test("REQ-SCR-07 the dot is drawn at the hero stage in CSS pixels, its halo's reach from the stage's halves, lit in the hero and gone once the bloom lets the field go", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStage({ hero });
    runtime.setStory("hero", 0);
    await runtime.drawStill();

    // Halves of 250 and 125 CSS px: a round halo takes 125.
    expect(state.halftones[0]?.hero).toEqual({
      x: 750,
      y: 375,
      reach: 125,
      light: 1,
      pulse: 0,
    });

    runtime.run();
    runtime.setStory("bloom", 0.6);
    for (let frame = 0; frame < 200; frame += 1) state.loop?.(16 * frame);
    expect(state.halftones[0]?.hero?.light).toBe(0);
  });

  test("REQ-SCR-01 the frame's lattice sits exactly on the work frame the page sends, moves with it at once, and shows only in the work chapter", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    const work = { x: 0.5, y: 0, halfWidth: 0.5, halfHeight: 0.5 };
    runtime.setStage({ work });
    runtime.setStory("work", 0.5);
    runtime.run();
    for (let frame = 0; frame < 200; frame += 1) state.loop?.(16 * frame);

    const record = state.halftones[0];
    expect(record?.frame).toMatchObject({
      x: 750,
      y: 250,
      halfWidth: 250,
      halfHeight: 125,
    });
    expect(record?.frame?.light).toBeGreaterThan(0.99);

    // The row moves up the screen: the lattice is on it in the next frame.
    runtime.setStage({ work: { ...work, y: 0.1 } });
    state.loop?.(3216);
    expect(record?.frame?.y).toBeCloseTo(225);

    runtime.setStory("about", 0.5);
    for (let frame = 0; frame < 200; frame += 1) {
      state.loop?.(3232 + 16 * frame);
    }
    expect(record?.frame?.light).toBeLessThan(0.01);
  });

  test("REQ-A11Y-06 only a study shape or the sheet turns its densest cells white; the about strands and the contact rings never do", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    const record = state.halftones[0];
    runtime.run();
    let time = 0;
    const settleFor = (chapter: ChapterId, progress: number) => {
      runtime.setStory(chapter, progress);
      for (let frame = 0; frame < 200; frame += 1) {
        time += 16;
        state.loop?.(time);
      }
      return record?.formed ?? Number.NaN;
    };

    expect(settleFor("work", 0.5)).toBeGreaterThan(0.99);
    expect(settleFor("making-of", 0.5)).toBeGreaterThan(0.99);
    expect(settleFor("about", 0.5)).toBeLessThan(0.01);
    expect(settleFor("contact", 0.9)).toBeLessThan(0.01);
  });
});

describe("the stage follow", () => {
  const work = { x: 0.5, y: 0, halfWidth: 0.5, halfHeight: 0.5 };

  async function formedOnStage() {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStage({ work });
    runtime.setStory("work", 0.5);
    runtime.run();
    for (let frame = 0; frame < 300; frame += 1) state.loop?.(16 * frame);
    return runtime;
  }

  test("REQ-SCR-05 a work stage that moves a little between frames is taken at once, and the formed particles are drawn ahead by their lag until they catch up", async () => {
    const runtime = await formedOnStage();
    expect(story.shapeCentre.value.y).toBeCloseTo(0, 6);
    expect(state.drawOffset[1]).toBeCloseTo(0, 6);

    // A tenth of the screen's half height: taken at once, no glide.
    runtime.setStage({ work: { ...work, y: 0.1 } });
    state.loop?.(4816);
    expect(story.shapeCentre.value.y).toBeCloseTo(0.1, 6);
    // The particles have barely moved yet, so they are drawn nearly the
    // whole move ahead: the formation is on its frame.
    expect(state.drawOffset[1]).toBeGreaterThan(0.09);
    expect(state.drawOffset[1]).toBeLessThanOrEqual(0.1);

    for (let frame = 0; frame < 300; frame += 1) {
      state.loop?.(4832 + 16 * frame);
    }
    expect(story.shapeCentre.value.y).toBeCloseTo(0.1, 6);
    expect(Math.abs(state.drawOffset[1])).toBeLessThan(1e-3);
  });

  test("REQ-SCR-05 while a row scrolls in small steps the shape's centre is on its frame every frame, and the lag drawn ahead grows and then settles", async () => {
    const runtime = await formedOnStage();
    const offsets: number[] = [];
    for (let frame = 1; frame <= 30; frame += 1) {
      const y = 0.02 * frame;
      runtime.setStage({ work: { ...work, y } });
      state.loop?.(4800 + 16 * frame);
      expect(story.shapeCentre.value.y).toBeCloseTo(y, 6);
      offsets.push(state.drawOffset[1]);
    }
    // The particles trail a moving frame, and the draw makes up for it.
    expect(offsets.at(-1) ?? 0).toBeGreaterThan(offsets[0] ?? 0);
    expect(offsets.every((offset) => offset > 0)).toBe(true);

    for (let frame = 0; frame < 300; frame += 1) {
      state.loop?.(6000 + 16 * frame);
    }
    expect(Math.abs(state.drawOffset[1])).toBeLessThan(1e-3);
  });

  test("REQ-SCR-05 a jump between frames, a new row, still glides there", async () => {
    const runtime = await formedOnStage();
    runtime.setStage({ work: { ...work, y: 0.9 } });
    state.loop?.(4816);
    const moved = story.shapeCentre.value.y;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(0.5);
  });

  test("REQ-SCR-05 the contact rings centre on the contact stage", async () => {
    const { options } = mount("webgpu", 1000, 500);
    const runtime = await createRuntime(options);
    runtime.setStage({
      contact: { x: 0.5, y: 0.2, halfWidth: 0.3, halfHeight: 0.4 },
    });
    runtime.setStory("contact", 0.5);

    expect(story.shapeCentre.value.x).toBeCloseTo(1);
    expect(story.shapeCentre.value.y).toBeCloseTo(0.2);
    expect(story.ringsWeight.value).toBe(1);
  });
});

describe("the swirl at the pointer, field chapter only", () => {
  test("REQ-SCR-06 outside the field chapter the pointer still pushes the field, with no swirl", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("work", 0.5);
    runtime.run();
    runtime.setPointer(0.2, 0.2, true);
    for (let frame = 0; frame < 120; frame += 1) state.loop?.(16 * frame);

    expect(state.swirl).toBe(0);
    expect(state.pushes.at(-1)).toBe(PUSH);

    // Into the field chapter: the swirl winds up there.
    runtime.setStory("bloom", 0.8);
    for (let frame = 120; frame < 240; frame += 1) state.loop?.(16 * frame);
    expect(state.swirl).toBeGreaterThan(0.9);

    // And lets go on the way out.
    runtime.setStory("making-of", 0.5);
    for (let frame = 240; frame < 360; frame += 1) state.loop?.(16 * frame);
    expect(state.swirl).toBeLessThan(0.05);
    expect(state.pushes.at(-1)).toBe(PUSH);
  });
});

describe("the swirl at the pointer", () => {
  test("REQ-SCR-06 REQ-A11Y-03 the swirl winds up while the pointer stirs a running field, lets go when it stops, and a still has none", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("bloom", 1);
    runtime.run();
    state.loop?.(0);
    expect(state.swirl).toBe(0);

    runtime.setPointer(0.2, 0.2, true);
    for (let frame = 1; frame < 120; frame += 1) state.loop?.(16 * frame);
    expect(state.swirl).toBeGreaterThan(0.9);

    runtime.setPointer(0.2, 0.2, false);
    for (let frame = 120; frame < 240; frame += 1) state.loop?.(16 * frame);
    expect(state.swirl).toBeLessThan(0.05);

    runtime.setPointer(0.2, 0.2, true);
    for (let frame = 240; frame < 300; frame += 1) state.loop?.(16 * frame);
    runtime.pause();
    await runtime.drawStill();
    expect(state.swirl).toBe(0);
  });
});

describe("the flow clock", () => {
  test("REQ-SCR-07 the flow clock steps with each step's own length and the release that step simulates, and starts again with every seat", async () => {
    const { options } = mount();
    const runtime = await createRuntime(options);
    runtime.setStory("hero", 0);
    runtime.run();
    state.loop?.(16);

    expect(state.resetFlows).toBe(1);
    // The seat's step of no length, then the frame's own step.
    expect(state.flows).toEqual([
      [0, 0],
      [1 / 60, 0],
    ]);

    runtime.setStory("bloom", 1);
    state.loop?.(32);
    const [seconds, release] = state.flows.at(-1) ?? [0, 0];
    expect(seconds).toBe(1 / 60);
    // The followed release, gliding up from the hero's 0.
    expect(release).toBeGreaterThan(0);
    expect(release).toBeLessThan(1);
    expect(release).toBe(story.release.value);
  });
});
