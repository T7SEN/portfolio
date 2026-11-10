import { describe, expect, it } from "vitest";

import {
  FAST_FRAME_MS,
  LOWER_AFTER_MS,
  MAX_PIXEL_RATIO,
  MIN_PIXEL_RATIO,
  RAISE_AFTER_MS,
  SLOW_FRAME_MS,
  nextResolution,
  pixelRatioSteps,
  startResolution,
} from "./adaptive";
import type { Resolution } from "./adaptive";

const SLOW = SLOW_FRAME_MS + 5;
const FAST = FAST_FRAME_MS - 5;
const BETWEEN = (SLOW_FRAME_MS + FAST_FRAME_MS) / 2;

function held(pixelRatio: number, heldMs = 0): Resolution {
  return {
    pixelRatio,
    failedAt: Number.POSITIVE_INFINITY,
    heldMs,
    onTrial: false,
  };
}

/** Feeds the same frame time in 250 ms samples and lists each ratio change. */
function run(
  start: Resolution,
  medianFrameMs: number,
  totalMs: number,
  devicePixelRatio: number,
) {
  let state = start;
  const changes: number[] = [];
  for (let elapsed = 0; elapsed < totalMs; elapsed += 250) {
    const next = nextResolution(state, {
      medianFrameMs,
      elapsedMs: 250,
      devicePixelRatio,
    });
    if (next.pixelRatio !== state.pixelRatio) changes.push(next.pixelRatio);
    state = next;
  }
  return { state, changes };
}

describe("pixelRatioSteps", () => {
  it("REQ-PERF-06 caps the steps at the device's ratio and at 2", () => {
    expect(pixelRatioSteps(1)).toEqual([0.75, 1]);
    expect(pixelRatioSteps(2)).toEqual([0.75, 1, 1.25, 1.5, 2]);
    expect(pixelRatioSteps(3)).toEqual([0.75, 1, 1.25, 1.5, 2]);
    expect(pixelRatioSteps(1.1)).toEqual([0.75, 1, 1.1]);
  });

  it("REQ-PERF-06 never draws more pixels than a zoomed-out device shows", () => {
    expect(pixelRatioSteps(0.5)).toEqual([0.5]);
    expect(pixelRatioSteps(MIN_PIXEL_RATIO)).toEqual([MIN_PIXEL_RATIO]);
  });

  it("REQ-PERF-06 reads a missing or broken device ratio as 1", () => {
    expect(pixelRatioSteps(Number.NaN)).toEqual([0.75, 1]);
    expect(pixelRatioSteps(0)).toEqual([0.75, 1]);
    expect(pixelRatioSteps(-2)).toEqual([0.75, 1]);
  });
});

describe("startResolution", () => {
  it("REQ-PERF-06 starts at the device's ratio, capped at 2", () => {
    expect(startResolution(1).pixelRatio).toBe(1);
    expect(startResolution(1.5).pixelRatio).toBe(1.5);
    expect(startResolution(3).pixelRatio).toBe(MAX_PIXEL_RATIO);
    expect(startResolution(3)).toMatchObject({ heldMs: 0, onTrial: false });
  });
});

describe("nextResolution", () => {
  it("REQ-PERF-06 lowers the ratio one step when frames stay slow", () => {
    const next = nextResolution(held(2, LOWER_AFTER_MS), {
      medianFrameMs: SLOW,
      elapsedMs: 0,
      devicePixelRatio: 2,
    });

    expect(next).toMatchObject({ pixelRatio: 1.5, heldMs: 0, onTrial: false });
  });

  it("REQ-PERF-06 holds a ratio for the cool-down before lowering it", () => {
    const next = nextResolution(held(2), {
      medianFrameMs: SLOW,
      elapsedMs: LOWER_AFTER_MS - 1,
      devicePixelRatio: 2,
    });

    expect(next.pixelRatio).toBe(2);
    expect(next.heldMs).toBe(LOWER_AFTER_MS - 1);
  });

  it("REQ-PERF-06 never changes the ratio on consecutive frames", () => {
    let state = held(2, LOWER_AFTER_MS);
    const ratios: number[] = [];
    for (let frame = 0; frame < 10; frame += 1) {
      state = nextResolution(state, {
        medianFrameMs: SLOW,
        elapsedMs: 16,
        devicePixelRatio: 2,
      });
      ratios.push(state.pixelRatio);
    }

    expect(ratios).toEqual(Array.from({ length: 10 }, () => 1.5));
  });

  it("REQ-PERF-06 steps down to the floor and stops there", () => {
    const { state, changes } = run(held(2), SLOW, 10_000, 2);

    expect(changes).toEqual([1.5, 1.25, 1, MIN_PIXEL_RATIO]);
    expect(state.pixelRatio).toBe(MIN_PIXEL_RATIO);
  });

  it("REQ-PERF-06 raises the ratio one step after a long run of fast frames", () => {
    const early = nextResolution(held(1), {
      medianFrameMs: FAST,
      elapsedMs: RAISE_AFTER_MS - 1,
      devicePixelRatio: 2,
    });
    const late = nextResolution(early, {
      medianFrameMs: FAST,
      elapsedMs: 1,
      devicePixelRatio: 2,
    });

    expect(early.pixelRatio).toBe(1);
    expect(late).toMatchObject({ pixelRatio: 1.25, heldMs: 0, onTrial: true });
  });

  it("REQ-PERF-06 never raises the ratio above the device's own", () => {
    const { state, changes } = run(held(1), FAST, 20_000, 1);

    expect(changes).toEqual([]);
    expect(state.pixelRatio).toBe(1);
  });

  it("REQ-PERF-06 leaves the ratio alone between the two thresholds", () => {
    const { state, changes } = run(held(1.25), BETWEEN, 20_000, 2);

    expect(changes).toEqual([]);
    expect(state.pixelRatio).toBe(1.25);
  });

  it("REQ-PERF-06 does not try again a ratio that failed straight after a rise", () => {
    const raised = nextResolution(held(1.5, RAISE_AFTER_MS), {
      medianFrameMs: FAST,
      elapsedMs: 0,
      devicePixelRatio: 2,
    });
    const failed = nextResolution(raised, {
      medianFrameMs: SLOW,
      elapsedMs: LOWER_AFTER_MS,
      devicePixelRatio: 2,
    });
    const after = run(failed, FAST, 30_000, 2);

    expect(raised.pixelRatio).toBe(2);
    expect(failed).toMatchObject({ pixelRatio: 1.5, failedAt: 2 });
    expect(after.changes).toEqual([]);
  });

  it("REQ-PERF-06 returns to a ratio that had held before a slow spell", () => {
    const settled = run(held(1.5), BETWEEN, RAISE_AFTER_MS, 2).state;
    const lowered = run(settled, SLOW, LOWER_AFTER_MS, 2).state;
    const recovered = run(lowered, FAST, RAISE_AFTER_MS, 2).state;

    expect(lowered).toMatchObject({
      pixelRatio: 1.25,
      failedAt: Number.POSITIVE_INFINITY,
    });
    expect(recovered.pixelRatio).toBe(1.5);
  });

  it("REQ-PERF-06 ends a rise's trial once it has lasted", () => {
    const raised = nextResolution(held(1, RAISE_AFTER_MS), {
      medianFrameMs: FAST,
      elapsedMs: 0,
      devicePixelRatio: 2,
    });
    const lasted = nextResolution(raised, {
      medianFrameMs: BETWEEN,
      elapsedMs: RAISE_AFTER_MS,
      devicePixelRatio: 2,
    });

    expect(raised.onTrial).toBe(true);
    expect(lasted).toMatchObject({ pixelRatio: 1.25, onTrial: false });
  });

  it("REQ-PERF-06 follows the device when its ratio drops", () => {
    const next = nextResolution(held(2, 500), {
      medianFrameMs: FAST,
      elapsedMs: 250,
      devicePixelRatio: 1,
    });

    expect(next).toMatchObject({ pixelRatio: 1, heldMs: 0, onTrial: false });
  });

  it("REQ-PERF-06 changes nothing when there is no frame time to judge", () => {
    const next = nextResolution(held(1.5, 10_000), {
      medianFrameMs: Number.NaN,
      elapsedMs: 250,
      devicePixelRatio: 2,
    });

    expect(next.pixelRatio).toBe(1.5);
  });
});
