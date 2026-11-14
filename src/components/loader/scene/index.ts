// The loader's scene: a black hole on its own 2D canvas, drawn every
// animation frame (which the browser pauses in a hidden tab). It paints the
// void from its first frame, so the page under the cover never shows until
// the ripple cuts its opening.

import { Painter } from "./draw";
import { clamp01, farthestCorner } from "./math";
import { ProgressTrack, WAVES } from "./progress";
import { RIPPLE_MS, rippleFrame, type RippleFrame } from "./ripple";
import type { CreateLoaderScene, LoaderScene, SceneProgress } from "./types";
import { buildWorld, sceneLayout } from "./world";

export { RIPPLE_MS } from "./ripple";
export { sceneLayout, type SceneLayout } from "./world";

export const ENTRANCE_MS = 1000;

interface Leaving {
  /** ms on the scene's clock, set by the first frame after the call. */
  start: number;
  done: () => void;
  promise: Promise<void>;
}

const IDLE: LoaderScene = {
  enter() {},
  setProgress() {},
  setEffort() {},
  exit: () => Promise.resolve(),
  resize() {},
  dispose() {},
};

export const createLoaderScene: CreateLoaderScene = (canvas, options) => {
  // Without a 2D context the cover keeps its own background and lifts as it would.
  let ctx = canvas.getContext("2d");
  if (!ctx) return IDLE;
  let target: HTMLCanvasElement | null = canvas;
  let painter: Painter | null = new Painter(buildWorld(options.phone));
  let layout = sceneLayout(options.width, options.height, options.phone);
  let ratio = options.pixelRatio;
  let onFirstFrame = options.onFirstFrame;
  const track = new ProgressTrack();
  const flights = Array.from({ length: WAVES }, () => 0);
  let report: SceneProgress | null = null;
  let light = false;
  let origin = -1;
  let now = 0;
  let entering = false;
  let enteredAt = -1;
  let leaving: Leaving | null = null;
  let raf = 0;

  const size = (): void => {
    if (!target) return;
    target.width = Math.max(1, Math.round(layout.width * ratio));
    target.height = Math.max(1, Math.round(layout.height * ratio));
  };

  /** Draws the frame at now; true once the exit has uncovered the whole page. */
  const paint = (): boolean => {
    if (!ctx || !painter) return true;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    let exit: RippleFrame | null = null;
    if (leaving && leaving.start >= 0) {
      const { cx, cy, width, height } = layout;
      const l = (now - leaving.start) / RIPPLE_MS;
      if (l >= 1) {
        ctx.clearRect(0, 0, width, height);
        return true;
      }
      exit = rippleFrame(clamp01(l), farthestCorner(cx, cy, width, height));
    }
    for (let k = 0; k < WAVES; k++) flights[k] = track.flight(k, now);
    painter.draw(ctx, layout, {
      time: now,
      enter: enteredAt < 0 ? 0 : clamp01((now - enteredAt) / ENTRANCE_MS),
      level: track.level(now),
      flights,
      light,
      exit,
    });
    return false;
  };

  const tick = (stamp: number): void => {
    raf = 0;
    if (!painter) return;
    if (origin < 0) origin = stamp;
    now = Math.max(now, stamp - origin);
    if (report) {
      track.update(report, now);
      report = null;
    }
    if (entering && enteredAt < 0) enteredAt = now;
    if (leaving && leaving.start < 0) leaving.start = now;
    const over = paint();
    if (onFirstFrame) {
      const first = onFirstFrame;
      onFirstFrame = undefined;
      first();
    }
    if (over && leaving) {
      leaving.done();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  size();
  raf = requestAnimationFrame(tick);

  return {
    enter() {
      entering = true;
    },
    setProgress(progress) {
      if (painter) report = { ...progress };
    },
    setEffort(effort) {
      light = effort === "light";
    },
    exit() {
      if (!painter) return Promise.resolve();
      if (leaving) return leaving.promise;
      let done = (): void => {};
      const promise = new Promise<void>((resolve) => {
        done = resolve;
      });
      leaving = { start: -1, done, promise };
      return promise;
    },
    resize(width, height, pixelRatio) {
      if (!painter) return;
      layout = sceneLayout(width, height, options.phone);
      ratio = pixelRatio;
      size();
      // Setting the size clears the canvas, so draw again now rather than show the page for a frame.
      if (origin >= 0) paint();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      const out = leaving;
      leaving = null;
      painter = null;
      ctx = null;
      target = null;
      report = null;
      onFirstFrame = undefined;
      out?.done();
    },
  };
};
