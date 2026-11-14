import type { EngineEvent, Tier } from "@/engine/types";

/**
 * The cover never lifts sooner than this after its first paint: the page's
 * on a full load, the cover's own first frame after a move from inside the
 * site [T7SEN, 13 Nov 2026].
 */
export const MIN_COVER_MS = 2000;

/**
 * How long "Field ready" holds once the field has drawn. It also covers the
 * field wrapper's own 0.7 s fade in (engine-host.tsx), so the cover lifts
 * onto a field already drawn and faded in, never an empty canvas.
 */
export const READY_HOLD_MS = 700;

/**
 * The longest the cover waits for the field, from its first paint; then it
 * lifts onto the page as it is. Kept by T7SEN [14 Nov 2026] from the
 * measured times to ready on this PC and on the phone profile (phase P4.5):
 * the phone profile began its lift 7.8 s after the first paint.
 */
export const LIFT_LIMIT_MS = 10_000;

/** The four loading steps, in order. */
export type LoaderStep = 1 | 2 | 3 | 4;

/**
 * The GPU test, step 3. pending: not reached yet. running: the probe's
 * window is open. done: a test ran and has ended. skipped: the step passed
 * with no test on this device, so its label never showed (A14).
 */
export type LoaderTest = "pending" | "running" | "done" | "skipped";

/**
 * How the loading ended. field: tier 1 or 2 has drawn. still: tier 3, for
 * any reason, the engine that never loaded included. lost: the device was
 * lost before the field drew. limit: the time limit came first.
 */
export type LoaderOutcome = "field" | "still" | "lost" | "limit";

export type LoaderSnapshot = {
  /** Steps finished, 0 to 4. A step passed with nothing to do counts. */
  done: number;
  /** The step the label names, or null once the loading has ended. */
  step: LoaderStep | null;
  test: LoaderTest;
  /** When the running test's window opened (performance.now()); else null. */
  testStartedAt: number | null;
  /** The running test's known length, ms; else null. */
  testDurationMs: number | null;
  /** The tier the engine chose; null until it has. */
  tier: Tier | null;
  /** Particles the live field draws, from its ready event; else null. */
  particles: number | null;
  outcome: LoaderOutcome | null;
  /** The cover may go now: every rule for its lift has been met. */
  lift: boolean;
};

export type LoaderClock = {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type LoaderStore = {
  getSnapshot(): LoaderSnapshot;
  getServerSnapshot(): LoaderSnapshot;
  subscribe(listener: () => void): () => void;
  /** Step 1 has ended: the engine module has loaded. */
  engineLoaded(): void;
  /** Every engine event; frame rates are ignored. */
  apply(event: EngineEvent): void;
  /**
   * A cover is going up: the snapshot starts again from what the engine has
   * reported so far, with no lift due and no start, whatever an earlier
   * cover left. A move to "/" from inside the site can bring a cover while
   * the engine is part way through its steps.
   */
  begin(): void;
  /**
   * The cover is up, first painted at this time (performance.now()). The
   * lift is timed from here. A later call can only move the start later,
   * when the browser reports a paint after the time first given.
   */
  start(paintedAt: number): void;
  /** The engine session has ended: nothing it reported counts any more. */
  reset(): void;
};

// What the static HTML shows: step 1, nothing finished.
const INITIAL: LoaderSnapshot = Object.freeze({
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

const browserClock: LoaderClock = {
  now: () => performance.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The test's share of its known length at now, 0 to 1; null when none runs. */
export function testShare(
  snapshot: LoaderSnapshot,
  now: number,
): number | null {
  const { test, testStartedAt, testDurationMs } = snapshot;
  if (test !== "running" || testStartedAt === null || testDurationMs === null) {
    return null;
  }
  if (!(testDurationMs > 0)) return 1;
  return Math.min(Math.max((now - testStartedAt) / testDurationMs, 0), 1);
}

// The test has ended: it ran, or the step passed with no test.
function endedTest(test: LoaderTest): LoaderTest {
  return test === "running" || test === "done" ? "done" : "skipped";
}

/** What moves the steps: the engine module loading, and the engine's events. */
type Signal = EngineEvent | { type: "engineLoaded" };

function afterTierChosen(
  snapshot: LoaderSnapshot,
  tier: Tier,
  reason: string,
): LoaderSnapshot {
  const ended = {
    tier,
    test: endedTest(snapshot.test),
    testStartedAt: null,
    testDurationMs: null,
  };
  if (tier === 3) {
    return { ...snapshot, ...ended, step: null, outcome: "still" };
  }
  if (reason === "device-lost") {
    return { ...snapshot, ...ended, step: null, outcome: "lost" };
  }
  if (snapshot.done >= 3) return snapshot;
  // Step 3 ends here, whether or not a test ran; step 4 draws the field.
  return { ...snapshot, ...ended, done: 3, step: 4 };
}

/**
 * The snapshot after one signal that arrived at the given time, or the same
 * snapshot when it moves nothing. Steps only move forward, and once the
 * loading has ended or the lift is due nothing changes.
 */
function afterSignal(
  snapshot: LoaderSnapshot,
  signal: Signal,
  at: number,
): LoaderSnapshot {
  if (snapshot.lift || snapshot.outcome !== null) return snapshot;
  switch (signal.type) {
    case "engineLoaded":
      return snapshot.done >= 1 ? snapshot : { ...snapshot, done: 1, step: 2 };
    case "rendererStarted":
      // The label keeps naming step 2 until it is known whether a test
      // runs, so step 3's words never show where none does.
      return snapshot.done < 2 ? { ...snapshot, done: 2, step: 2 } : snapshot;
    case "probeStarted":
      if (snapshot.done >= 3) return snapshot;
      // A window opened again, after a hidden tab, starts from nothing.
      return {
        ...snapshot,
        done: 2,
        step: 3,
        test: "running",
        testStartedAt: at,
        testDurationMs: signal.durationMs,
      };
    case "tierChosen":
      return afterTierChosen(snapshot, signal.tier, signal.reason);
    case "ready":
      if (signal.tier === 3) return afterTierChosen(snapshot, 3, "ready");
      return {
        ...snapshot,
        tier: signal.tier,
        done: 4,
        step: null,
        test: endedTest(snapshot.test),
        testStartedAt: null,
        testDurationMs: null,
        particles: signal.particles,
        outcome: "field",
      };
    case "frameRate":
      return snapshot;
  }
}

type Heard = { signal: Signal; at: number };

/**
 * What the engine has reported since its session began, kept whatever the
 * snapshot shows, so a cover that goes up later starts from it: the first
 * module load and renderer, the latest GPU test window, the latest tier
 * choice and the ready that followed it.
 */
type Reported = {
  loaded?: Heard;
  renderer?: Heard;
  probe?: Heard;
  chosen?: Heard;
  ready?: Heard;
};

function remember(reported: Reported, heard: Heard) {
  switch (heard.signal.type) {
    case "engineLoaded":
      reported.loaded ??= heard;
      return;
    case "rendererStarted":
      reported.renderer ??= heard;
      return;
    case "probeStarted":
      reported.probe = heard;
      return;
    case "tierChosen":
      // A new tier has not drawn until its own ready arrives.
      reported.chosen = heard;
      delete reported.ready;
      return;
    case "ready":
      reported.ready ??= heard;
      return;
    case "frameRate":
      return;
  }
}

/**
 * The loader's progress, fed by the engine session, and the rule for when
 * the cover may lift (phase P4.5, REQ-LOAD-01). Plain logic with no React,
 * read through useSyncExternalStore like the tier store. Steps only move
 * forward: a repeated signal, such as the second rendererStarted after a
 * slow probe, changes nothing. Once the lift is due the snapshot holds
 * still, so the words on the leaving cover never change; what the engine
 * reports after that is still kept for the next cover (begin).
 */
export function createLoaderStore(
  clock: LoaderClock = browserClock,
): LoaderStore {
  let snapshot = INITIAL;
  let reported: Reported = {};
  let startedAt: number | null = null;
  let readyAt: number | null = null;
  let timer: unknown = null;
  const listeners = new Set<() => void>();

  function publish(next: LoaderSnapshot) {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }

  function clearTimer() {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
  }

  // Never before the minimum. Then: on ready plus the hold; on tier 3, a
  // lost device or a failure, at the minimum; else at the time limit.
  function dueAt(start: number): number {
    const { outcome } = snapshot;
    const earliest = start + MIN_COVER_MS;
    if (outcome === "field") {
      return Math.max(earliest, (readyAt ?? start) + READY_HOLD_MS);
    }
    if (outcome === "still" || outcome === "lost") return earliest;
    return start + LIFT_LIMIT_MS;
  }

  function lift() {
    timer = null;
    if (snapshot.lift) return;
    publish(
      snapshot.outcome === null
        ? { ...snapshot, outcome: "limit", step: null, lift: true }
        : { ...snapshot, lift: true },
    );
  }

  function schedule() {
    clearTimer();
    if (startedAt === null || snapshot.lift) return;
    const wait = dueAt(startedAt) - clock.now();
    if (wait <= 0) lift();
    else timer = clock.setTimeout(lift, wait);
  }

  // The snapshot after a signal; readyAt is when the field outcome came.
  function follow(from: LoaderSnapshot, { signal, at }: Heard) {
    const next = afterSignal(from, signal, at);
    if (next.outcome === "field" && from.outcome !== "field") readyAt = at;
    return next;
  }

  function hear(signal: Signal) {
    const heard = { signal, at: clock.now() };
    remember(reported, heard);
    const next = follow(snapshot, heard);
    if (next === snapshot) return;
    publish(next);
    schedule();
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => INITIAL,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    engineLoaded() {
      hear({ type: "engineLoaded" });
    },

    apply(event) {
      if (event.type === "frameRate") return;
      hear(event);
    },

    begin() {
      clearTimer();
      startedAt = null;
      readyAt = null;
      // In the order the engine reports them, each at the time it came.
      let next = INITIAL;
      for (const heard of [
        reported.loaded,
        reported.renderer,
        reported.probe,
        reported.chosen,
        reported.ready,
      ]) {
        if (heard !== undefined) next = follow(next, heard);
      }
      if (next !== snapshot) publish(next);
    },

    start(paintedAt) {
      if (snapshot.lift) return;
      startedAt =
        startedAt === null ? paintedAt : Math.max(startedAt, paintedAt);
      schedule();
    },

    reset() {
      clearTimer();
      reported = {};
      startedAt = null;
      readyAt = null;
      if (snapshot !== INITIAL) publish(INITIAL);
    },
  };
}

export const loaderStore = createLoaderStore();
