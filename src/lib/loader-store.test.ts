import { describe, expect, it, vi } from "vitest";

import type { EngineEvent } from "@/engine/types";

import {
  createLoaderStore,
  LIFT_LIMIT_MS,
  type LoaderClock,
  MIN_COVER_MS,
  READY_HOLD_MS,
  testShare,
} from "./loader-store";

/** A clock the test moves by hand, with its timers. */
function fakeClock(start = 0) {
  let time = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const clock: LoaderClock = {
    now: () => time,
    setTimeout(run, ms) {
      const id = nextId++;
      timers.set(id, { at: time + ms, run });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
  };
  return {
    clock,
    timers,
    /** Moves the time on, running each timer that falls due on the way. */
    advance(ms: number) {
      const end = time + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        time = Math.max(time, due[1].at);
        due[1].run();
      }
      time = end;
    },
  };
}

const RENDERER: EngineEvent = { type: "rendererStarted", backend: "webgpu" };
const PROBE: EngineEvent = { type: "probeStarted", durationMs: 2000 };
const TIER_1: EngineEvent = {
  type: "tierChosen",
  tier: 1,
  reason: "probe-pass",
};
const TIER_2: EngineEvent = { type: "tierChosen", tier: 2, reason: "phone" };
const READY_1: EngineEvent = {
  type: "ready",
  tier: 1,
  particles: 1_000_000,
  look: "halftone",
};

function setUp(start = 0) {
  const time = fakeClock(start);
  const store = createLoaderStore(time.clock);
  return { ...time, store };
}

describe("loader store", () => {
  it("REQ-LOAD-01 starts on step 1 with nothing finished, the same on the server", () => {
    const { store } = setUp();
    expect(store.getSnapshot()).toEqual({
      done: 0,
      step: 1,
      test: "pending",
      testStartedAt: null,
      testDurationMs: null,
      tier: null,
      particles: null,
      outcome: null,
      lift: false,
    });
    expect(store.getServerSnapshot()).toBe(store.getSnapshot());
  });

  it("REQ-LOAD-01 walks the four steps of a tier 1 load with its GPU test", () => {
    const { store, advance } = setUp();
    store.engineLoaded();
    expect(store.getSnapshot()).toMatchObject({ done: 1, step: 2 });

    store.apply(RENDERER);
    expect(store.getSnapshot()).toMatchObject({ done: 2, step: 2 });

    advance(100);
    store.apply(PROBE);
    expect(store.getSnapshot()).toMatchObject({
      done: 2,
      step: 3,
      test: "running",
      testStartedAt: 100,
      testDurationMs: 2000,
    });

    store.apply(TIER_1);
    expect(store.getSnapshot()).toMatchObject({
      done: 3,
      step: 4,
      test: "done",
      tier: 1,
      testStartedAt: null,
    });

    store.apply(READY_1);
    expect(store.getSnapshot()).toMatchObject({
      done: 4,
      step: null,
      test: "done",
      tier: 1,
      particles: 1_000_000,
      outcome: "field",
    });
  });

  it("REQ-LOAD-01 A14 where no test runs, step 3 passes with tierChosen and its label never shows", () => {
    const { store } = setUp();
    const steps: Array<number | null> = [];
    store.subscribe(() => steps.push(store.getSnapshot().step));

    store.engineLoaded();
    store.apply({ type: "rendererStarted", backend: "webgl2" });
    store.apply(TIER_2);
    store.apply({ type: "ready", tier: 2, particles: 100_000 });

    expect(steps).toEqual([2, 2, 4, null]);
    expect(store.getSnapshot()).toMatchObject({
      done: 4,
      test: "skipped",
      outcome: "field",
    });
  });

  it("REQ-LOAD-01 the test's share grows with its known length and a restart starts it again", () => {
    const { store, advance } = setUp();
    store.engineLoaded();
    store.apply(RENDERER);
    store.apply(PROBE);
    expect(testShare(store.getSnapshot(), 0)).toBe(0);
    expect(testShare(store.getSnapshot(), 500)).toBe(0.25);
    expect(testShare(store.getSnapshot(), 5000)).toBe(1);

    // A hidden tab threw the window away; the probe opens it again.
    advance(1500);
    store.apply(PROBE);
    expect(store.getSnapshot()).toMatchObject({
      step: 3,
      test: "running",
      testStartedAt: 1500,
    });
    expect(testShare(store.getSnapshot(), 2000)).toBe(0.25);

    store.apply(TIER_1);
    expect(testShare(store.getSnapshot(), 2500)).toBeNull();
  });

  it("REQ-LOAD-01 has no share before or after a test", () => {
    const { store } = setUp();
    expect(testShare(store.getSnapshot(), 100)).toBeNull();
  });

  it("REQ-LOAD-01 steps only move forward: the second rendererStarted after a slow probe changes nothing", () => {
    const { store } = setUp();
    store.engineLoaded();
    store.apply(RENDERER);
    store.apply(PROBE);
    const during = store.getSnapshot();

    // The probe was slow: WebGL2 starts on its own canvas, then tier 2.
    store.apply({ type: "rendererStarted", backend: "webgl2" });
    expect(store.getSnapshot()).toBe(during);
    store.engineLoaded();
    expect(store.getSnapshot()).toBe(during);

    store.apply({ type: "tierChosen", tier: 2, reason: "probe-slow" });
    store.apply(PROBE);
    store.apply(RENDERER);
    expect(store.getSnapshot()).toMatchObject({
      done: 3,
      step: 4,
      test: "done",
      tier: 2,
    });
  });

  it("REQ-LOAD-01 a signal that arrives early still moves the steps forward only", () => {
    const { store } = setUp();
    store.apply(PROBE);
    expect(store.getSnapshot()).toMatchObject({ done: 2, step: 3 });
    store.engineLoaded();
    expect(store.getSnapshot()).toMatchObject({ done: 2, step: 3 });
  });

  it("REQ-LOAD-01 frame rates change nothing and wake no listener", () => {
    const { store } = setUp();
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply({ type: "frameRate", fps: 60 });
    expect(listener).not.toHaveBeenCalled();
  });

  describe("the lift", () => {
    it("REQ-LOAD-01 never comes before 2 s from the first paint, however early the field is ready", () => {
      const { store, advance } = setUp(1000);
      store.start(1000);
      store.engineLoaded();
      store.apply(RENDERER);
      store.apply(TIER_2);
      store.apply({ type: "ready", tier: 2, particles: 250_000 });

      advance(MIN_COVER_MS - 1);
      expect(store.getSnapshot().lift).toBe(false);
      advance(1);
      expect(store.getSnapshot()).toMatchObject({
        lift: true,
        outcome: "field",
      });
    });

    it("REQ-LOAD-01 holds Field ready for its hold after a late ready", () => {
      const { store, advance } = setUp();
      store.start(0);
      store.engineLoaded();
      store.apply(RENDERER);
      store.apply(PROBE);
      advance(2900);
      store.apply(TIER_1);
      advance(100);
      store.apply(READY_1);

      advance(READY_HOLD_MS - 1);
      expect(store.getSnapshot().lift).toBe(false);
      advance(1);
      expect(store.getSnapshot().lift).toBe(true);
    });

    it("REQ-LOAD-01 lifts at the time limit onto the page as it is, and says so", () => {
      const { store, advance } = setUp();
      store.start(0);
      store.engineLoaded();
      store.apply(RENDERER);

      advance(LIFT_LIMIT_MS - 1);
      expect(store.getSnapshot().lift).toBe(false);
      advance(1);
      expect(store.getSnapshot()).toMatchObject({
        lift: true,
        outcome: "limit",
        step: null,
        done: 2,
      });

      // Nothing after the lift changes the words on the leaving cover.
      const leaving = store.getSnapshot();
      store.apply(TIER_1);
      store.apply(READY_1);
      expect(store.getSnapshot()).toBe(leaving);
    });

    it("REQ-LOAD-01 REQ-ENG-08 the engine that never loaded ends on the still and lifts at the minimum", () => {
      const { store, advance } = setUp();
      store.start(0);
      store.apply({ type: "tierChosen", tier: 3, reason: "no-backend" });
      store.apply({ type: "ready", tier: 3, particles: 0 });
      expect(store.getSnapshot()).toMatchObject({
        outcome: "still",
        tier: 3,
        step: null,
        done: 0,
        test: "skipped",
      });

      advance(MIN_COVER_MS - 1);
      expect(store.getSnapshot().lift).toBe(false);
      advance(1);
      expect(store.getSnapshot().lift).toBe(true);
    });

    it("REQ-LOAD-01 REQ-TIER-03 tier 3 for any reason lifts at the minimum, even once the minimum has passed", () => {
      const { store, advance } = setUp();
      store.start(0);
      store.engineLoaded();
      store.apply(RENDERER);
      store.apply(PROBE);
      advance(2600);
      store.apply({ type: "tierChosen", tier: 3, reason: "no-backend" });
      expect(store.getSnapshot()).toMatchObject({
        outcome: "still",
        test: "done",
        lift: true,
      });
    });

    it("REQ-LOAD-01 REQ-ENG-08 a device lost before the field drew lifts at the minimum, and its new tier's ready changes nothing", () => {
      const { store, advance } = setUp();
      store.start(0);
      store.engineLoaded();
      store.apply(RENDERER);
      store.apply(PROBE);
      advance(800);
      store.apply({ type: "tierChosen", tier: 2, reason: "device-lost" });
      expect(store.getSnapshot()).toMatchObject({
        outcome: "lost",
        step: null,
        tier: 2,
      });
      store.apply({ type: "ready", tier: 2, particles: 250_000 });
      expect(store.getSnapshot().outcome).toBe("lost");

      advance(MIN_COVER_MS - 801);
      expect(store.getSnapshot().lift).toBe(false);
      advance(1);
      expect(store.getSnapshot().lift).toBe(true);
    });

    it("REQ-LOAD-01 a device lost into tier 3 ends on the still", () => {
      const { store } = setUp();
      store.apply({ type: "tierChosen", tier: 3, reason: "device-lost" });
      expect(store.getSnapshot().outcome).toBe("still");
    });

    it("REQ-LOAD-01 nothing lifts before the cover has started its clock", () => {
      const { store, advance, timers } = setUp();
      store.apply({ type: "tierChosen", tier: 3, reason: "save-data" });
      advance(LIFT_LIMIT_MS * 2);
      expect(store.getSnapshot().lift).toBe(false);
      expect(timers.size).toBe(0);

      // A cover that starts after the outcome lifts at its own minimum.
      store.start(LIFT_LIMIT_MS * 2);
      advance(MIN_COVER_MS);
      expect(store.getSnapshot().lift).toBe(true);
    });

    it("REQ-LOAD-01 a paint reported later moves the start later, never earlier", () => {
      const { store, advance } = setUp();
      store.start(0);
      store.start(300);
      store.start(100);
      store.apply({ type: "tierChosen", tier: 3, reason: "phone" });
      advance(MIN_COVER_MS + 299);
      expect(store.getSnapshot().lift).toBe(false);
      advance(1);
      expect(store.getSnapshot().lift).toBe(true);
    });

    it("REQ-LOAD-01 a cover started past the time limit lifts at once", () => {
      const { store } = setUp(LIFT_LIMIT_MS + 50);
      store.start(0);
      expect(store.getSnapshot()).toMatchObject({
        lift: true,
        outcome: "limit",
      });
    });

    it("REQ-LOAD-01 reset clears the timer and goes back to step 1", () => {
      const { store, advance, timers } = setUp();
      store.start(0);
      store.engineLoaded();
      expect(timers.size).toBe(1);
      store.reset();
      expect(timers.size).toBe(0);
      expect(store.getSnapshot()).toBe(store.getServerSnapshot());
      advance(LIFT_LIMIT_MS);
      expect(store.getSnapshot().lift).toBe(false);
    });

    it("REQ-LOAD-01 listeners hear each change and stop when unsubscribed", () => {
      const { store } = setUp();
      const listener = vi.fn();
      const stop = store.subscribe(listener);
      store.engineLoaded();
      expect(listener).toHaveBeenCalledTimes(1);
      stop();
      store.apply(RENDERER);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("a new cover", () => {
    it("REQ-LOAD-01 with nothing reported, begin is step 1 with no lift due", () => {
      const { store, timers } = setUp();
      store.begin();
      expect(store.getSnapshot()).toBe(store.getServerSnapshot());
      expect(timers.size).toBe(0);
    });

    it("REQ-LOAD-01 A14 begin starts from what the engine has reported, whatever the cover before it left", () => {
      const { store, advance, timers } = setUp();
      store.start(0);
      store.engineLoaded();
      store.apply(RENDERER);
      advance(LIFT_LIMIT_MS);
      expect(store.getSnapshot()).toMatchObject({
        lift: true,
        outcome: "limit",
      });

      // The engine goes on under the page after that lift.
      store.apply(TIER_2);
      expect(store.getSnapshot().outcome).toBe("limit");

      // A move back to the home page brings a cover while the field draws.
      store.begin();
      expect(store.getSnapshot()).toMatchObject({
        done: 3,
        step: 4,
        test: "skipped",
        tier: 2,
        outcome: null,
        lift: false,
      });
      expect(timers.size).toBe(0);

      const start = LIFT_LIMIT_MS + 500;
      advance(500);
      store.start(start);
      advance(100);
      store.apply({ type: "ready", tier: 2, particles: 250_000 });
      advance(MIN_COVER_MS - 101);
      expect(store.getSnapshot().lift).toBe(false);
      advance(1);
      expect(store.getSnapshot()).toMatchObject({
        lift: true,
        outcome: "field",
      });
    });

    it("REQ-LOAD-01 a GPU test running when a cover begins keeps its window, so its share goes on", () => {
      const { store, advance } = setUp();
      store.engineLoaded();
      store.apply(RENDERER);
      advance(100);
      store.apply(PROBE);
      advance(1000);
      store.begin();
      expect(store.getSnapshot()).toMatchObject({
        done: 2,
        step: 3,
        test: "running",
        testStartedAt: 100,
      });
      expect(testShare(store.getSnapshot(), 1100)).toBe(0.5);

      store.apply(TIER_1);
      store.begin();
      expect(store.getSnapshot()).toMatchObject({
        done: 3,
        step: 4,
        test: "done",
      });
    });

    it("REQ-LOAD-01 REQ-ENG-08 a device lost after the field drew begins as lost, never Field ready", () => {
      const { store, advance } = setUp();
      store.engineLoaded();
      store.apply(RENDERER);
      store.apply(TIER_1);
      store.apply(READY_1);
      store.apply({ type: "tierChosen", tier: 2, reason: "device-lost" });
      store.begin();
      expect(store.getSnapshot()).toMatchObject({
        outcome: "lost",
        tier: 2,
        step: null,
      });

      store.start(0);
      advance(MIN_COVER_MS);
      expect(store.getSnapshot().lift).toBe(true);
    });

    it("REQ-LOAD-01 a field already drawn begins on Field ready and holds it from its own ready", () => {
      const { store, advance } = setUp();
      store.engineLoaded();
      store.apply(RENDERER);
      store.apply(TIER_2);
      store.apply({ type: "ready", tier: 2, particles: 100_000 });
      advance(5000);
      store.begin();
      expect(store.getSnapshot()).toMatchObject({
        outcome: "field",
        done: 4,
        particles: 100_000,
      });
      store.start(5000);
      advance(MIN_COVER_MS - 1);
      expect(store.getSnapshot().lift).toBe(false);
      advance(1);
      expect(store.getSnapshot().lift).toBe(true);
    });

    it("REQ-LOAD-01 REQ-ENG-07 reset forgets what the engine reported", () => {
      const { store } = setUp();
      store.engineLoaded();
      store.apply(RENDERER);
      store.apply(TIER_2);
      store.reset();
      store.begin();
      expect(store.getSnapshot()).toBe(store.getServerSnapshot());
    });
  });
});
