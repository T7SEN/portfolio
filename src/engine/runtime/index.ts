import { Timer, WebGPURenderer } from "three/webgpu";

import { colors } from "@/tokens/colors";

import { median } from "../tier/probe";
import type {
  ChapterId,
  Runtime,
  RuntimeFactory,
  RuntimeOptions,
} from "../types";
import { nextResolution, startResolution } from "./adaptive";
import { liveBackend } from "./backend";
import { createField, viewFor } from "./field";
import { createSimulation } from "./simulation";

// A long pause (a hidden tab, a slow first frame) must not fling the field.
const MAX_STEP_SECONDS = 1 / 30;
// A still frame shows a field that has found its flow, not the even haze it
// starts as. Each step is MAX_STEP_SECONDS long, so this is three seconds.
const SETTLE_STEPS = 90;
// How many frame times the adaptive resolution looks back over, and how
// often it looks.
const FRAME_WINDOW = 90;
const ADAPT_EVERY_MS = 250;
// Homes reach a tenth past the frame (simulation.ts), so a still frame fits
// until the frame's shape has changed by more than that.
const RESEAT_BEYOND = 0.1;

interface Loss {
  message: string | null;
  report: (() => void) | null;
}

// The hero is the field at rest. P3 replaces this rule with the chapters'
// own choreography; until then every other chapter gathers the field into
// the built-in shape as it scrolls.
function formationFor(chapter: ChapterId, progress: number): number {
  if (chapter === "hero" || !(progress > 0)) return 0;
  return Math.min(progress, 1);
}

function startRuntime(
  renderer: WebGPURenderer,
  options: RuntimeOptions,
  loss: Loss,
): Runtime {
  const { canvas } = options;
  const backend = liveBackend(renderer);
  const particleCount = Math.max(1, Math.floor(options.particleCount[backend]));

  const cssSize = () => ({
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
  });

  const firstSize = cssSize();
  const simulation = createSimulation(
    particleCount,
    viewFor(firstSize.width / firstSize.height),
  );
  const field = createField(simulation);
  renderer.setClearColor(colors.void, 1);

  // The step comes from three's Timer, not the TSL deltaTime node, which
  // would hand the whole length of a pause to the first frame after it.
  const timer = new Timer();
  timer.connect(canvas.ownerDocument);

  let running = false;
  let disposal: Promise<void> | null = null;
  let frames = 0;
  let steps = 0;
  let elapsedSeconds = 0;
  let previousFrameTime: number | null = null;
  // True while the frame on screen is a settled still and not a paused loop.
  let still = false;
  // The aspect the particles were last seated for.
  let seatedAspect = firstSize.width / firstSize.height;

  let resolution = startResolution(window.devicePixelRatio);
  let bufferWidth = 0;
  let bufferHeight = 0;
  let bufferRatio = 0;
  const frameTimes: number[] = [];
  let sinceAdaptMs = 0;

  // Sizing the drawing buffer clears the canvas and makes WebGPU configure
  // its context again, even when nothing changed (three r187, CanvasTarget),
  // so unchanged values stop here. The canvas is sized by CSS; this call
  // never writes its style.
  const applySize = (): boolean => {
    const { width, height } = cssSize();
    const ratio = resolution.pixelRatio;
    if (
      width === bufferWidth &&
      height === bufferHeight &&
      ratio === bufferRatio
    ) {
      return false;
    }

    bufferWidth = width;
    bufferHeight = height;
    bufferRatio = ratio;
    renderer.setDrawingBufferSize(width, height, ratio);
    field.setAspect(width / height);
    return true;
  };

  const step = (seconds: number) => {
    elapsedSeconds += seconds;
    simulation.stepSeconds.value = seconds;
    simulation.elapsedSeconds.value = elapsedSeconds;
    void renderer.compute(simulation.update);
    steps += 1;
  };

  const draw = () => {
    renderer.render(field.scene, field.camera);
    frames += 1;
  };

  const bufferAspect = () => bufferWidth / bufferHeight;

  // A frozen field cannot flow to the homes of a new frame shape, so it is
  // put on them and settled again, the way a fresh load at that shape starts.
  const fitStill = () => {
    const aspect = bufferAspect();
    if (Math.abs(aspect / seatedAspect - 1) > RESEAT_BEYOND) {
      elapsedSeconds = 0;
      simulation.reseat.value = 1;
      step(0);
      simulation.reseat.value = 0;
      steps = 0;
      seatedAspect = aspect;
    }
    while (steps < SETTLE_STEPS) step(MAX_STEP_SECONDS);
  };

  // A throw from the renderer ends this runtime the way a lost device does:
  // the loop would otherwise throw again on every frame with nobody told.
  const fail = (error: unknown) => {
    if (loss.message !== null) return;
    loss.message = error instanceof Error ? error.message : String(error);
    loss.report?.();
  };

  const adapt = (frameMs: number) => {
    frameTimes.push(frameMs);
    if (frameTimes.length > FRAME_WINDOW) frameTimes.shift();

    sinceAdaptMs += frameMs;
    if (sinceAdaptMs < ADAPT_EVERY_MS) return;

    const next = nextResolution(resolution, {
      medianFrameMs: median(frameTimes),
      elapsedMs: sinceAdaptMs,
      devicePixelRatio: window.devicePixelRatio,
    });
    sinceAdaptMs = 0;
    // Frame times from the old ratio say nothing about the new one.
    if (next.pixelRatio !== resolution.pixelRatio) frameTimes.length = 0;
    resolution = next;
  };

  const frame = (time: number) => {
    try {
      // A new ratio waits for the next frame, so the buffer is never cleared
      // between a draw and the browser showing it.
      if (resolution.pixelRatio !== bufferRatio) applySize();

      timer.update(time);
      step(Math.min(Math.max(timer.getDelta(), 0), MAX_STEP_SECONDS));
      draw();
    } catch (error) {
      fail(error);
      return;
    }
    // A running field follows its homes by itself.
    seatedAspect = bufferAspect();

    // Read before onFrame runs: the caller may pause, run or dispose in it.
    const previous = previousFrameTime;
    previousFrameTime = time;
    if (previous === null) return;

    const frameMs = time - previous;
    adapt(frameMs);
    options.onFrame(frameMs);
  };

  const pause = () => {
    if (!running) return;
    running = false;
    // Clears the callback only: three keeps its own idle frame loop until
    // the renderer is disposed (r187, Animation).
    void renderer.setAnimationLoop(null);
  };

  const observer = new ResizeObserver(() => {
    try {
      // A frame that was on screen is drawn again at once, because the new
      // buffer is blank: a paused or calm field would otherwise stay empty.
      if (!applySize() || frames === 0 || loss.message !== null) return;
      if (still) fitStill();
      draw();
    } catch (error) {
      fail(error);
    }
  });

  // Each part is freed even when the one before it throws, and the renderer
  // goes last, because the parts above belong to it.
  const releaseParts = () => {
    const parts: Array<() => void> = [
      pause,
      () => simulation.update.dispose(),
      () => field.material.dispose(),
      () => simulation.positions.value.dispose(),
      () => simulation.velocities.value.dispose(),
      () => simulation.seeds.value.dispose(),
      () => timer.dispose(),
      () => observer.disconnect(),
    ];
    for (const free of parts) {
      try {
        free();
      } catch {
        // A part that cannot be freed must not keep the rest alive.
      }
    }
  };

  try {
    observer.observe(canvas);
    applySize();
  } catch (error) {
    releaseParts();
    throw error;
  }

  const release = async () => {
    releaseParts();
    await renderer.dispose();
  };

  loss.report = () => {
    if (disposal !== null) return;
    pause();
    options.onLost(loss.message ?? "");
  };

  return {
    backend,
    particleCount,
    run() {
      if (running || disposal !== null || loss.message !== null) return;
      running = true;
      still = false;
      previousFrameTime = null;
      // The time spent paused is not simulated.
      timer.reset();
      void renderer.setAnimationLoop(frame);
    },
    pause,
    drawStill() {
      if (disposal === null && loss.message === null) {
        applySize();
        still = true;
        fitStill();
        draw();
      }
      // Nothing above waits, so the frame is drawn in the caller's own task.
      return Promise.resolve();
    },
    setPointer(x, y, active) {
      field.setPointer(x, y, active);
    },
    setStory(chapter, progress) {
      simulation.formation.value = formationFor(chapter, progress);
    },
    dispose() {
      disposal ??= release();
      return disposal;
    },
  };
}

export const createRuntime: RuntimeFactory = async (options) => {
  // A fresh options object for every renderer: the constructor writes its
  // WebGL2 fallback into the object it is given. powerPreference reaches the
  // WebGPU adapter request only.
  const renderer = new WebGPURenderer({
    canvas: options.canvas,
    antialias: false,
    forceWebGL: options.backend === "webgl2",
    powerPreference: "high-performance",
  });

  const loss: Loss = { message: null, report: null };

  // A lost device or context ends this renderer for good: r187 has no way
  // back. The default handler sets the flag that stops its render and
  // compute calls, so it still runs, as a method of the renderer.
  const markLost = renderer.onDeviceLost;
  renderer.onDeviceLost = (info) => {
    markLost.call(renderer, info);
    if (loss.message !== null) return;
    loss.message = info.message;
    loss.report?.();
  };

  // init() falls back to WebGL2 by itself when WebGPU fails to start and
  // rejects only when WebGL2 fails too. Nothing of ours exists yet, and
  // dispose() would only wait on the same rejected promise, so a rejection
  // passes straight to the caller.
  await renderer.init();

  try {
    if (loss.message !== null) throw new Error(loss.message);
    return startRuntime(renderer, options, loss);
  } catch (error) {
    await renderer.dispose();
    throw error;
  }
};
