import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  Timer,
  WebGPURenderer,
} from "three/webgpu";

import { colors } from "@/tokens/colors";

import { median } from "../tier/probe";
import type {
  ChapterId,
  Runtime,
  RuntimeFactory,
  RuntimeOptions,
} from "../types";
import { nextResolution, startResolution } from "./adaptive";
import { packAtlas, type Atlas } from "./atlas";
import { liveBackend } from "./backend";
import { createField, viewFor } from "./field";
import { createSimulation } from "./simulation";
import {
  AMBIENT,
  calmKey,
  calmProgress,
  chapterTargets,
  fitScale,
  follow,
  formedLight,
  type StoryTargets,
} from "./story";

// A long pause (a hidden tab, a slow first frame) must not fling the field.
const MAX_STEP_SECONDS = 1 / 30;
// A still frame shows a field that has found its flow, not the even haze it
// starts as, or a formation that has gathered. Each step is MAX_STEP_SECONDS
// long, so this is three seconds.
const SETTLE_STEPS = 90;
// How many frame times the adaptive resolution looks back over, and how
// often it looks.
const FRAME_WINDOW = 90;
const ADAPT_EVERY_MS = 250;
// Homes reach a tenth past the frame (simulation.ts), so a still frame fits
// until the frame's shape has changed by more than that.
const RESEAT_BEYOND = 0.1;

// How far the camera pushes into the field across the work chapter, in
// world units (the camera stands 5 from the focus plane).
const PUSH_DEPTH = 1.6;
// The values the particles cannot smooth by their own inertia follow the
// story over these times: the release decides what is seen, the push moves
// the camera and the light changes every sprite at once. A jump to another
// chapter then glides instead of flashing.
const RELEASE_FOLLOW_SECONDS = 0.45;
const PUSH_FOLLOW_SECONDS = 0.6;
const LIGHT_FOLLOW_SECONDS = 0.5;
// The hero's dot breathes once in this time.
const PULSE_SECONDS = 2.8;

interface Loss {
  message: string | null;
  report: (() => void) | null;
}

interface Story {
  chapter: ChapterId;
  progress: number;
}

function sameTargets(a: StoryTargets, b: StoryTargets): boolean {
  return (Object.keys(a) as Array<keyof StoryTargets>).every(
    (key) => a[key] === b[key],
  );
}

// Float RGBA, read only with textureLoad: nearest filtering and no mipmaps,
// so WebGPU binds it as an unfilterable texture without a sampler and WebGL2
// reads it with texelFetch inside the transform feedback pass.
function atlasTexture(atlas: Atlas): DataTexture {
  const texture = new DataTexture(
    atlas.data,
    atlas.width,
    atlas.height,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
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
  let view = viewFor(firstSize.width / firstSize.height);
  const atlas = packAtlas();
  const shapes = atlasTexture(atlas);
  const simulation = createSimulation(particleCount, view, shapes);
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

  // The latest story the page sent, and the targets the field is pulled to.
  // Null story: the ambient field, as before any chapter is known.
  let story: Story | null = null;
  let targets: StoryTargets = AMBIENT;
  // The still frame's own name (story.ts, calmKey); null while it runs.
  let stillKey: string | null = null;
  // True from the first story the field hears until its next step, which
  // puts every particle straight on its target, so the page never shows the
  // ambient field gathering into, say, the hero's dot.
  let seatPending = false;
  const followed = { release: 1, push: 0, light: 1 };
  let lightTarget = 1;

  let resolution = startResolution(window.devicePixelRatio);
  let bufferWidth = 0;
  let bufferHeight = 0;
  let bufferRatio = 0;
  const frameTimes: number[] = [];
  let sinceAdaptMs = 0;
  // True while the canvas has no CSS size.
  let unseen = false;

  // Shapes are sized for the frame they are in, so a new frame or new
  // targets size them again.
  const refit = () => {
    simulation.shapeScaleFrom.value = fitScale(
      atlas.extents[targets.shapeFrom],
      view,
    );
    simulation.shapeScaleTo.value = fitScale(
      atlas.extents[targets.shapeTo],
      view,
    );
    lightTarget = formedLight(targets, atlas.extents, view);
  };

  const showFollowed = () => {
    simulation.release.value = followed.release;
    field.light.value = followed.light;
    field.setFocus(-followed.push * PUSH_DEPTH);
  };

  /** Points the field at new targets; `now` skips the follow. */
  const aim = (next: StoryTargets, now: boolean) => {
    targets = next;
    simulation.shapeFrom.value = atlas.index[next.shapeFrom];
    simulation.shapeTo.value = atlas.index[next.shapeTo];
    simulation.shapeMix.value = next.shapeMix;
    simulation.shapeWeight.value = next.shape;
    simulation.sheetWeight.value = next.sheet;
    simulation.waveWeight.value = next.wave;
    simulation.noiseLevel.value = next.noise;
    refit();
    if (now) {
      followed.release = next.release;
      followed.push = next.push;
      followed.light = lightTarget;
      showFollowed();
    }
  };

  const liveTargets = () =>
    story === null ? AMBIENT : chapterTargets(story.chapter, story.progress);

  const calmTargets = () =>
    story === null
      ? AMBIENT
      : chapterTargets(
          story.chapter,
          calmProgress(story.chapter, story.progress),
        );

  const currentCalmKey = () =>
    story === null ? "ambient" : calmKey(story.chapter, story.progress);

  // Sizing the drawing buffer clears the canvas and makes WebGPU configure
  // its context again, even when nothing changed (three r187, CanvasTarget),
  // so unchanged values stop here. The canvas is sized by CSS; this call
  // never writes its style.
  const applySize = (): boolean => {
    // A canvas with no CSS size is hidden, not small: its wrapper is display
    // none on every route but the home page. It keeps its buffer and its
    // seat. Only the first sizing takes the clamped size, so a runtime built
    // on a hidden host still starts.
    unseen = canvas.clientWidth === 0 || canvas.clientHeight === 0;
    if (unseen && bufferWidth > 0) return false;

    const { width, height } = cssSize();
    // An unseen first buffer is one pixel at a ratio of 1: a ratio under 1
    // would floor it to no pixels at all. The frame loop puts the real ratio
    // back once the canvas is shown.
    const ratio = unseen ? 1 : resolution.pixelRatio;
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
    view = field.setAspect(width / height);
    refit();
    return true;
  };

  const step = (seconds: number) => {
    elapsedSeconds += seconds;
    followed.release = follow(
      followed.release,
      targets.release,
      seconds,
      RELEASE_FOLLOW_SECONDS,
    );
    followed.push = follow(
      followed.push,
      targets.push,
      seconds,
      PUSH_FOLLOW_SECONDS,
    );
    followed.light = follow(
      followed.light,
      lightTarget,
      seconds,
      LIGHT_FOLLOW_SECONDS,
    );
    showFollowed();
    // A still holds the dot at rest (REQ-A11Y-03).
    simulation.pulse.value = still
      ? 0
      : Math.sin((2 * Math.PI * elapsedSeconds) / PULSE_SECONDS);
    simulation.stepSeconds.value = seconds;
    simulation.elapsedSeconds.value = elapsedSeconds;
    void renderer.compute(simulation.update);
    steps += 1;
  };

  // One step of no length with reseat on puts every particle on its target
  // with no speed; the settle steps after it start from there.
  const seat = () => {
    seatPending = false;
    elapsedSeconds = 0;
    simulation.reseat.value = 1;
    step(0);
    simulation.reseat.value = 0;
    steps = 0;
  };

  const draw = () => {
    renderer.render(field.scene, field.camera);
    frames += 1;
  };

  const bufferAspect = () => bufferWidth / bufferHeight;

  // A frozen field cannot flow to the homes of a new frame shape, so it is
  // put on its targets and settled again, the way a fresh load at that shape
  // starts.
  const fitStill = () => {
    const aspect = bufferAspect();
    if (seatPending || Math.abs(aspect / seatedAspect - 1) > RESEAT_BEYOND) {
      seat();
      seatedAspect = aspect;
    }
    while (steps < SETTLE_STEPS) step(MAX_STEP_SECONDS);
  };

  /**
   * Calm shows one still per chapter, and per study in the work chapter.
   * When that still changes, the field is aimed at the new one and settled
   * from where it is; nothing else redraws it.
   */
  const aimStill = () => {
    const key = currentCalmKey();
    if (key === stillKey) return false;
    const next = calmTargets();
    const changed = !sameTargets(next, targets);
    aim(next, true);
    stillKey = key;
    if (changed) steps = 0;
    return changed;
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
      if (seatPending) seat();
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
      const wasUnseen = unseen;
      const resized = applySize();
      // A canvas that is shown again at its old size keeps its buffer, but
      // nothing draws on it while the loop is off.
      const shownAgain = wasUnseen && !unseen && !running;
      // A frame that was on screen is drawn again at once, because the new
      // buffer is blank: a paused or calm field would otherwise stay empty.
      if (!resized && !shownAgain) return;
      if (frames === 0 || loss.message !== null) return;
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
      () => shapes.dispose(),
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
      // Leaving a still: the field glides from the calm frame to wherever
      // the page is now.
      if (still) aim(liveTargets(), false);
      still = false;
      stillKey = null;
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
        aimStill();
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
      if (disposal !== null || loss.message !== null) return;
      // The first chapter a field hears is where it starts: nothing of it is
      // on screen to glide from. The controller sends it before the first
      // frame, or, after the tier 1 probe, while the probe's frames of the
      // ambient field are still on a hidden canvas (controller.ts, adopt).
      const fresh = story === null || seatPending;
      story = { chapter, progress };
      if (!still) {
        aim(liveTargets(), fresh);
        if (fresh) seatPending = true;
        return;
      }
      // A calm field is drawn again only for a new chapter or study, never
      // for a scroll inside one (REQ-A11Y-03).
      try {
        if (!aimStill()) return;
        fitStill();
        // A hidden canvas is drawn when it is shown again (the observer).
        if (!unseen) draw();
      } catch (error) {
        fail(error);
      }
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
