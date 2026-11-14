import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { colors } from "@/tokens/colors";

import {
  createLoaderScene,
  ENTRANCE_MS,
  RIPPLE_MS,
  sceneLayout,
} from "./index";
import type { SceneOptions } from "./types";

// jsdom has no canvas, so the scene draws into a stub that counts its calls.
function stubContext() {
  const calls = new Map<string, number>();
  const fills: string[] = [];
  const modes: string[] = [];
  const state = {
    fillStyle: "" as unknown,
    strokeStyle: "" as unknown,
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    shadowBlur: 0,
    shadowColor: "",
  };
  const count = (name: string) => () => {
    calls.set(name, (calls.get(name) ?? 0) + 1);
  };
  const ctx = {
    ...state,
    fillRect() {
      count("fillRect")();
      fills.push(String(this.fillStyle));
    },
    fill() {
      count("fill")();
      modes.push(this.globalCompositeOperation);
    },
    clearRect: count("clearRect"),
    setTransform: count("setTransform"),
    beginPath: count("beginPath"),
    moveTo: count("moveTo"),
    lineTo: count("lineTo"),
    arc: count("arc"),
    ellipse: count("ellipse"),
    stroke: count("stroke"),
    save: count("save"),
    restore: count("restore"),
    translate: count("translate"),
    scale: count("scale"),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  const reset = () => {
    calls.clear();
    fills.length = 0;
    modes.length = 0;
  };
  return {
    ctx,
    calls,
    fills,
    modes,
    reset,
    n: (name: string) => calls.get(name) ?? 0,
  };
}

function stubCanvas(ctx: unknown) {
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

let queue: FrameRequestCallback[] = [];
let requested = 0;
function frame(time: number) {
  const due = queue;
  queue = [];
  for (const cb of due) cb(time);
}

beforeEach(() => {
  queue = [];
  requested = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return ++requested;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    queue = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const desktop = (extra: Partial<SceneOptions> = {}): SceneOptions => ({
  width: 1280,
  height: 800,
  pixelRatio: 2,
  phone: false,
  ...extra,
});

const ready = { done: 4, test: null, ready: true };

describe("the loader's scene", () => {
  test("REQ-LOAD-01 the first frame paints the void over the whole canvas, then says so once", () => {
    const s = stubContext();
    const canvas = stubCanvas(s.ctx);
    const onFirstFrame = vi.fn();
    createLoaderScene(canvas, desktop({ onFirstFrame }));
    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1600);
    expect(onFirstFrame).not.toHaveBeenCalled();
    frame(100);
    expect(s.fills[0]).toBe("rgba(7,7,10,1.000)");
    expect(colors.void).toBe("#07070A");
    expect(onFirstFrame).toHaveBeenCalledTimes(1);
    // Before the entrance only the void is drawn.
    expect(s.n("stroke")).toBe(0);
    frame(116);
    expect(onFirstFrame).toHaveBeenCalledTimes(1);
  });

  test("REQ-LOAD-01 the entrance brings the stars, the grid and the hole in", () => {
    const s = stubContext();
    const scene = createLoaderScene(stubCanvas(s.ctx), desktop());
    frame(0);
    scene.enter();
    frame(16);
    s.reset();
    frame(16 + ENTRANCE_MS);
    expect(s.n("lineTo")).toBeGreaterThan(1000);
    expect(s.n("arc")).toBeGreaterThan(100);
    expect(s.n("stroke")).toBeGreaterThan(5);
  });

  test("REQ-LOAD-01 frames repeat: the same reports at the same times draw the same", () => {
    const run = () => {
      const s = stubContext();
      const scene = createLoaderScene(stubCanvas(s.ctx), desktop());
      frame(0);
      scene.enter();
      scene.setProgress({ done: 2, test: 0.4, ready: false });
      frame(800);
      s.reset();
      frame(1300);
      return [...s.calls.entries()].sort();
    };
    expect(run()).toEqual(run());
  });

  test("REQ-LOAD-01 light effort draws fewer streams and a coarser grid", () => {
    const counts = (effort: "full" | "light") => {
      const s = stubContext();
      const scene = createLoaderScene(stubCanvas(s.ctx), desktop());
      frame(0);
      scene.enter();
      scene.setEffort(effort);
      scene.setProgress({ done: 2, test: 0.5, ready: false });
      frame(1500);
      s.reset();
      frame(1600);
      return s.n("lineTo");
    };
    expect(counts("light")).toBeLessThan(counts("full") / 2);
  });

  test("REQ-LOAD-01 the ripple resolves only once the page is wholly uncovered, then stops drawing", async () => {
    const s = stubContext();
    const scene = createLoaderScene(stubCanvas(s.ctx), desktop());
    frame(0);
    scene.enter();
    scene.setProgress(ready);
    frame(2000);
    const done = vi.fn();
    void scene.exit().then(done);
    frame(2100);
    frame(2100 + RIPPLE_MS * 0.6);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    expect(s.modes).toContain("destination-out");
    s.reset();
    frame(2100 + RIPPLE_MS);
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
    expect(s.n("clearRect")).toBe(1);
    expect(s.n("fillRect")).toBe(0);
    expect(queue).toHaveLength(0);
  });

  test("REQ-LOAD-01 a second exit call shares the ripple already playing", async () => {
    const s = stubContext();
    const scene = createLoaderScene(stubCanvas(s.ctx), desktop());
    frame(0);
    scene.enter();
    scene.setProgress(ready);
    frame(1500);
    const first = scene.exit();
    expect(scene.exit()).toBe(first);
    const done = vi.fn();
    void first.then(done);
    frame(1600);
    frame(1600 + RIPPLE_MS * 0.9);
    expect(s.modes).toContain("destination-out");
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    frame(1600 + RIPPLE_MS);
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
  });

  test("REQ-LOAD-01 dispose stops the loop, is safe twice and settles a pending exit", async () => {
    const s = stubContext();
    const scene = createLoaderScene(stubCanvas(s.ctx), desktop());
    frame(0);
    const done = vi.fn();
    void scene.exit().then(done);
    scene.dispose();
    scene.dispose();
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(0);
    s.reset();
    scene.setProgress(ready);
    scene.resize(100, 100, 1);
    frame(500);
    expect(s.calls.size).toBe(0);
    await expect(scene.exit()).resolves.toBeUndefined();
  });

  test("REQ-LOAD-01 a resize sizes the backing store and draws again at once", () => {
    const s = stubContext();
    const canvas = stubCanvas(s.ctx);
    const scene = createLoaderScene(canvas, desktop());
    frame(0);
    s.reset();
    scene.resize(375, 812, 3);
    expect(canvas.width).toBe(1125);
    expect(canvas.height).toBe(2436);
    expect(s.n("fillRect")).toBe(1);
  });

  test("REQ-LOAD-01 without a 2D context the scene does nothing and its exit settles at once", async () => {
    const scene = createLoaderScene(stubCanvas(null), desktop());
    expect(queue).toHaveLength(0);
    scene.enter();
    scene.setProgress(ready);
    await expect(scene.exit()).resolves.toBeUndefined();
    scene.dispose();
  });

  test("REQ-LOAD-01 the phone sizing: a 15 px hole, a 22 px grid, the label below the hole", () => {
    const phone = sceneLayout(375, 812, true);
    const wide = sceneLayout(1280, 800, false);
    expect(phone).toMatchObject({ hole: 15, spacing: 22, cx: 187.5, cy: 366 });
    expect(wide).toMatchObject({ hole: 19, spacing: 28, cx: 640, cy: 354 });
    expect(phone.labelTop - phone.cy).toBe(150);
    expect(wide.labelTop - wide.cy).toBe(178);
  });
});
