// Adaptive resolution (REQ-PERF-06): the drawing buffer's pixel ratio follows
// the frame times. This file holds the rule alone, with no three.js, so it is
// unit tested without a GPU.

export const MIN_PIXEL_RATIO = 0.75;
export const MAX_PIXEL_RATIO = 2;

// Every change reallocates the canvas buffer and the renderer's own targets,
// so the ratio moves through a few fixed steps and never slides.
const STEPS: readonly number[] = [
  MIN_PIXEL_RATIO,
  1,
  1.25,
  1.5,
  MAX_PIXEL_RATIO,
];

// Below 45 fps the ratio drops; at 55 fps or better it may rise. Frame times
// between the two change nothing, which keeps a field near the line from
// flipping back and forth.
export const SLOW_FRAME_MS = 1000 / 45;
export const FAST_FRAME_MS = 1000 / 55;

// How long a ratio is held before the next change. Dropping protects the
// frame rate, so it is quick; sharpening can wait.
export const LOWER_AFTER_MS = 750;
export const RAISE_AFTER_MS = 4000;

export interface Resolution {
  pixelRatio: number;
  /**
   * The lowest ratio that turned out too slow right after a rise. Rises stop
   * below it. Infinity until a rise has failed.
   */
  failedAt: number;
  /** Time spent at this ratio, in ms. */
  heldMs: number;
  /** The last change was a rise that has not lasted RAISE_AFTER_MS yet. */
  onTrial: boolean;
}

export interface FrameSample {
  /** Median time between drawn frames since the last change, in ms. */
  medianFrameMs: number;
  /** Time covered by this sample, in ms. */
  elapsedMs: number;
  devicePixelRatio: number;
}

/**
 * The ratios open to a device, lowest first. The top one is the device's own
 * ratio, capped at MAX_PIXEL_RATIO.
 */
export function pixelRatioSteps(devicePixelRatio: number): number[] {
  const deviceRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const cap = Math.min(deviceRatio, MAX_PIXEL_RATIO);

  // A zoomed-out page reports less than the floor. More pixels than the
  // device shows would be wasted, so the device's ratio is the only step.
  if (cap <= MIN_PIXEL_RATIO) return [cap];

  return [...STEPS.filter((step) => step < cap), cap];
}

/** The field starts at its sharpest and gives ground only when frames slow. */
export function startResolution(devicePixelRatio: number): Resolution {
  const steps = pixelRatioSteps(devicePixelRatio);

  return {
    pixelRatio: steps[steps.length - 1] ?? 1,
    failedAt: Number.POSITIVE_INFINITY,
    heldMs: 0,
    onTrial: false,
  };
}

/**
 * The resolution after one more sample of frame times. A pure function: the
 * runtime keeps the state and applies the ratio.
 */
export function nextResolution(
  state: Resolution,
  { medianFrameMs, elapsedMs, devicePixelRatio }: FrameSample,
): Resolution {
  const steps = pixelRatioSteps(devicePixelRatio);
  const index = Math.max(
    0,
    steps.findLastIndex((step) => step <= state.pixelRatio),
  );
  const current = steps[index] ?? state.pixelRatio;

  // The device's ratio changed under the field: a zoom, or another screen.
  if (current !== state.pixelRatio) {
    return { ...state, pixelRatio: current, heldMs: 0, onTrial: false };
  }

  const heldMs = state.heldMs + Math.max(0, elapsedMs);
  const lower = steps[index - 1];
  const higher = steps[index + 1];

  if (
    medianFrameMs > SLOW_FRAME_MS &&
    heldMs >= LOWER_AFTER_MS &&
    lower !== undefined
  ) {
    return {
      pixelRatio: lower,
      // A ratio that fails straight after a rise is not tried again, so a
      // display that hides its spare time (60 Hz) cannot make the field
      // swing between two ratios for the whole visit.
      failedAt: state.onTrial
        ? Math.min(state.failedAt, state.pixelRatio)
        : state.failedAt,
      heldMs: 0,
      onTrial: false,
    };
  }

  if (
    medianFrameMs < FAST_FRAME_MS &&
    heldMs >= RAISE_AFTER_MS &&
    higher !== undefined &&
    higher < state.failedAt
  ) {
    return { ...state, pixelRatio: higher, heldMs: 0, onTrial: true };
  }

  return {
    ...state,
    heldMs,
    onTrial: state.onTrial && heldMs < RAISE_AFTER_MS,
  };
}
