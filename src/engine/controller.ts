import { FRAME_RATE_INTERVAL_MS, PARTICLES, PROBE } from "./config";
import { decideTier, tier2ParticleCount } from "./tier/decide";
import { readEnvironment } from "./tier/environment";
import { classifyProbe } from "./tier/probe";
import type {
  Backend,
  ChapterId,
  Engine,
  EngineEvent,
  EngineListener,
  EngineOptions,
  Environment,
  GpuTier,
  ProbeVerdict,
  Runtime,
  RuntimeFactory,
  Stages,
  Tier,
  TierReason,
} from "./types";

// The only way to three.js from here. A dynamic import keeps it out of the
// first load and off tier 3 altogether (REQ-PERF-04, REQ-PERF-07).
const loadDefaultRuntime = (): Promise<RuntimeFactory> =>
  import("./runtime").then((module) => module.createRuntime);

// Written on every canvas the engine makes. The budget check also finds the
// built chunk that holds this file by this string, because that chunk has no
// three.js in it to be found by (REQ-PERF-05, scripts/budget-lib.mjs).
const CANVAS_MARK = "portfolio-field";

/** One runtime and the canvas it draws on. A canvas never serves two. */
interface Field {
  readonly runtime: Runtime;
  readonly canvas: HTMLCanvasElement;
  /** The settled tier has drawn here. The probe's frames do not count. */
  drawn: boolean;
}

interface Probe {
  samples: number[];
  startedAt: number;
  /** Null while the probe waits for the field to be in view. */
  timer: ReturnType<typeof setTimeout> | null;
  /** A null verdict means the probe was abandoned. */
  end(verdict: ProbeVerdict | null): void;
}

/**
 * The engine without three.js: it chooses the tier, owns the canvas inside
 * the host, loads the runtime only when a GPU tier is possible and pauses the
 * field whenever nobody can see it.
 */
export function createEngine(
  host: HTMLElement,
  options: EngineOptions = {},
): Engine {
  const doc = host.ownerDocument;
  const loadRuntime = options.loadRuntime ?? loadDefaultRuntime;
  const readFacts = options.environment ?? readEnvironment;
  const listeners = new Set<EngineListener>();
  const flows = new Set<Promise<void>>();

  // Every start, tier change, lost device and dispose takes a new number.
  // Async work that wakes up under an older number stops and cleans up.
  let generation = 0;
  let started = false;
  let disposed = false;
  let disposal: Promise<void> | null = null;

  let forcedTier = options.forcedTier;
  let calm = options.calm === true;
  let story: readonly [ChapterId, number] | null = null;
  let pointer: readonly [number, number, boolean] | null = null;
  let stages: Stages | null = null;
  let facts: Promise<Environment> | null = null;

  let canvas: HTMLCanvasElement | null = null;
  let field: Field | null = null;
  // Null until a GPU tier is settled, so also during the probe.
  let chosen: GpuTier | null = null;
  let probe: Probe | null = null;
  let running = false;

  let intersecting = true;
  let observer: IntersectionObserver | null = null;

  let readySent = false;
  let readyWaiters: Array<() => void> = [];

  let rateTimer: ReturnType<typeof setInterval> | null = null;
  let rateFrames = 0;
  let rateSince = 0;

  const stale = (gen: number): boolean => gen !== generation;

  function emit(event: EngineEvent): void {
    if (disposed) return;
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener(event);
      } catch (error) {
        // A listener that throws must not stop the engine or the listeners
        // after it.
        console.error(error);
      }
    }
  }

  function releaseWaiters(): void {
    const waiters = readyWaiters;
    readyWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function sendReady(tier: Tier): void {
    readySent = true;
    emit({ type: "ready", tier });
    releaseWaiters();
  }

  function replaceCanvas(): HTMLCanvasElement {
    canvas?.remove();
    const next = doc.createElement("canvas");
    next.dataset.engine = CANVAS_MARK;
    next.style.display = "block";
    next.style.width = "100%";
    next.style.height = "100%";
    host.append(next);
    canvas = next;
    return next;
  }

  function removeCanvas(): void {
    canvas?.remove();
    canvas = null;
  }

  function reportRate(): void {
    const now = performance.now();
    const elapsedMs = now - rateSince;
    if (elapsedMs > 0) {
      emit({ type: "frameRate", fps: (rateFrames * 1000) / elapsedMs });
    }
    rateFrames = 0;
    rateSince = now;
  }

  function stopRate(): void {
    if (rateTimer === null) return;
    clearInterval(rateTimer);
    rateTimer = null;
  }

  function openProbeWindow(state: Probe): void {
    state.samples = [];
    state.startedAt = performance.now();
    state.timer = setTimeout(() => {
      state.timer = null;
      state.end(classifyProbe(state.samples));
    }, PROBE.durationMs);
  }

  /** Runs one runtime call. False when the field is no longer the live one. */
  function attempt(target: Field, action: (runtime: Runtime) => void): boolean {
    try {
      action(target.runtime);
    } catch {
      lose(target);
    }
    return field === target;
  }

  /**
   * The one place that starts and stops the field (REQ-ENG-07). It runs while
   * the document is visible and the host is in view, and then only for the
   * probe or for a settled tier with calm off.
   */
  function sync(): void {
    const target = field;
    if (target === null) return;

    const wanted =
      !doc.hidden &&
      intersecting &&
      (probe !== null || (chosen !== null && !calm));

    if (wanted !== running) {
      running = wanted;
      const alive = attempt(target, (runtime) => {
        if (wanted) runtime.run();
        else runtime.pause();
      });
      if (!alive) return;
    }

    if (probe !== null) {
      if (running && probe.timer === null) {
        openProbeWindow(probe);
      } else if (!running && probe.timer !== null) {
        // Frames from before a hidden tab say nothing about the GPU, so the
        // probe starts again from nothing when the field is back in view.
        clearTimeout(probe.timer);
        probe.timer = null;
      }
    }

    const reporting = running && probe === null;
    if (reporting && rateTimer === null) {
      rateFrames = 0;
      rateSince = performance.now();
      rateTimer = setInterval(reportRate, FRAME_RATE_INTERVAL_MS);
    } else if (!reporting) {
      stopRate();
    }
  }

  /** The field the page's story and pointer reach: none until a tier is settled. */
  function listening(): Field | null {
    return chosen === null ? null : field;
  }

  // The canvas the probe ran on stays hidden until the tier it settled on has
  // drawn there, so the first frame anyone sees is that tier's own, already
  // on the page's chapter.
  function showDrawn(target: Field): void {
    if (target.drawn) return;
    target.drawn = true;
    target.canvas.style.removeProperty("visibility");
  }

  function onFrame(target: Field, frameMs: number): void {
    if (field !== target) return;

    if (probe !== null) {
      const counted =
        probe.timer !== null &&
        performance.now() - probe.startedAt >= PROBE.warmupMs;
      if (counted) probe.samples.push(frameMs);
      return;
    }

    if (chosen === null) return;
    showDrawn(target);
    if (rateTimer !== null) rateFrames += 1;
    if (!readySent) sendReady(chosen);
  }

  async function discard(runtime: Runtime): Promise<void> {
    try {
      runtime.pause();
      await runtime.dispose();
    } catch {
      // A runtime that cannot dispose is already gone; nothing is left to free.
    }
  }

  /** Lets go of the live runtime. Its canvas stays until the next one is built. */
  async function retire(): Promise<void> {
    probe?.end(null);
    stopRate();
    const target = field;
    field = null;
    chosen = null;
    running = false;
    if (target !== null) await discard(target.runtime);
  }

  function settleStill(reason: TierReason): void {
    const gen = generation;
    removeCanvas();
    emit({ type: "tierChosen", tier: 3, reason });
    // A listener may have forced another tier; that flow sends its own ready.
    if (stale(gen)) return;
    sendReady(3);
  }

  /** Calm mode: one settled frame stays on screen (REQ-A11Y-03, REQ-A11Y-04). */
  function drawStill(target: Field): void {
    let pending: Promise<void>;
    try {
      pending = target.runtime.drawStill();
    } catch {
      lose(target);
      return;
    }
    pending.then(
      () => {
        if (field !== target) return;
        showDrawn(target);
        if (chosen !== null && !readySent) sendReady(chosen);
      },
      () => lose(target),
    );
  }

  function adopt(target: Field, tier: GpuTier, reason: TierReason): void {
    chosen = tier;
    // The story and pointer reach a field only from here, so the tier 1
    // probe times the whole ambient field at the real count, whatever
    // chapter the page is on (REQ-TIER-01). A first story is seated at the
    // runtime's next step, before its canvas is shown. The stage goes first,
    // so that seat already puts the dot and the shapes where the page wants
    // them.
    const heard = attempt(target, (live) => {
      if (stages !== null) live.setStage(stages);
      if (story !== null) live.setStory(...story);
      if (pointer !== null) live.setPointer(...pointer);
    });
    if (!heard) return;

    emit({ type: "tierChosen", tier, reason });
    // A listener may have disposed the engine or forced another tier.
    if (field !== target) return;

    sync();
    if (field !== target) return;

    if (calm) drawStill(target);
  }

  async function build(backend: Backend, gen: number): Promise<Field | null> {
    // One canvas holds one context type for life, so each runtime gets its own.
    const surface = replaceCanvas();
    let target: Field | null = null;
    let lostEarly = false;
    let runtime: Runtime;

    try {
      const environment = await (facts ??= readFacts());
      const create = await loadRuntime();
      if (stale(gen)) return null;

      runtime = await create({
        canvas: surface,
        backend,
        particleCount: {
          webgpu: options.particleCount ?? PARTICLES.tier1,
          webgl2:
            options.particleCount ??
            tier2ParticleCount(environment.coarsePointer),
        },
        onFrame: (frameMs) => {
          if (target !== null) onFrame(target, frameMs);
        },
        onLost: () => {
          if (target !== null) lose(target);
          else lostEarly = true;
        },
      });
    } catch {
      return null;
    }

    // Superseded while it was being built, or lost before it could be used.
    if (stale(gen) || lostEarly) {
      await discard(runtime);
      return null;
    }

    target = { runtime, canvas: surface, drawn: false };
    field = target;
    return target;
  }

  async function enterWebgl2(reason: TierReason, gen: number): Promise<void> {
    const target = await build("webgl2", gen);
    if (stale(gen)) return;
    if (target === null) {
      settleStill("no-backend");
      return;
    }
    adopt(target, 2, reason);
  }

  /**
   * Runs the ambient field unseen, with no story, and judges its frame times
   * (REQ-TIER-01).
   */
  function measure(target: Field): Promise<ProbeVerdict | null> {
    return new Promise((resolve) => {
      const state: Probe = {
        samples: [],
        startedAt: 0,
        timer: null,
        end(verdict) {
          if (state.timer !== null) clearTimeout(state.timer);
          state.timer = null;
          if (probe === state) probe = null;
          resolve(verdict);
        },
      };
      probe = state;
      target.canvas.style.visibility = "hidden";
      sync();
    });
  }

  async function choose(gen: number): Promise<void> {
    await retire();
    if (stale(gen)) return;

    const environment = await (facts ??= readFacts());
    if (stale(gen)) return;

    const decision = decideTier(
      environment,
      forcedTier,
      options.particleCount ?? PARTICLES.tier1,
    );
    if (decision.kind === "still") {
      settleStill(decision.reason);
      return;
    }
    if (decision.kind === "webgl2") {
      await enterWebgl2(decision.reason, gen);
      return;
    }

    const target = await build("webgpu", gen);
    if (stale(gen)) return;
    if (target === null) {
      // Not proof that nothing can draw: a device lost as it starts, or a
      // runtime that throws while it is set up, fails here with WebGL2 never
      // tried. WebGL2 gets its own canvas and its own attempt.
      await enterWebgl2("webgpu-init-fallback", gen);
      return;
    }
    // The renderer falls back to WebGL2 by itself when WebGPU fails to start
    // (three r187), and that canvas is still good for WebGL2.
    if (target.runtime.backend === "webgl2") {
      adopt(target, 2, "webgpu-init-fallback");
      return;
    }
    if (decision.kind === "webgpu") {
      adopt(target, 1, decision.reason);
      return;
    }

    const verdict = await measure(target);
    if (verdict === null || stale(gen)) return;
    if (verdict === "pass") {
      adopt(target, 1, "probe-pass");
      return;
    }

    await retire();
    if (stale(gen)) return;
    await enterWebgl2(verdict === "slow" ? "probe-slow" : "probe-failed", gen);
  }

  /** A lost device drops one tier and never comes back up (REQ-ENG-08). */
  async function recover(lost: Backend, gen: number): Promise<void> {
    await retire();
    if (stale(gen)) return;
    if (lost === "webgl2") {
      settleStill("device-lost");
      return;
    }
    await enterWebgl2("device-lost", gen);
  }

  function launch(work: (gen: number) => Promise<void>): void {
    generation += 1;
    readySent = false;
    const gen = generation;

    const flow: Promise<void> = work(gen)
      .catch(async () => {
        // start() never rejects: anything unforeseen ends on the still frame.
        if (stale(gen)) return;
        await retire();
        if (!stale(gen)) settleStill("no-backend");
      })
      .finally(() => {
        flows.delete(flow);
      });
    flows.add(flow);
  }

  function lose(target: Field): void {
    if (disposed || field !== target) return;
    const lost = target.runtime.backend;
    launch((gen) => recover(lost, gen));
  }

  function attach(): void {
    doc.addEventListener("visibilitychange", sync);
    // Without the observer the host counts as in view.
    if (typeof IntersectionObserver !== "function") return;
    observer = new IntersectionObserver((entries) => {
      const latest = entries[entries.length - 1];
      if (latest === undefined) return;
      intersecting = latest.isIntersecting;
      sync();
    });
    observer.observe(host);
  }

  async function teardown(): Promise<void> {
    disposed = true;
    generation += 1;
    doc.removeEventListener("visibilitychange", sync);
    observer?.disconnect();
    observer = null;
    listeners.clear();
    releaseWaiters();

    const retired = retire();
    removeCanvas();
    await retired;
    // A runtime still being built when dispose was called is disposed by its
    // own flow; wait for that too, so nothing of this engine outlives it.
    await Promise.all([...flows]);
  }

  return {
    start() {
      if (disposed) return Promise.resolve();
      if (!started) {
        started = true;
        attach();
        launch(choose);
      }
      if (readySent) return Promise.resolve();
      return new Promise((resolve) => {
        readyWaiters.push(resolve);
      });
    },

    setTier(tier) {
      if (disposed) return;
      forcedTier = tier;
      if (started) launch(choose);
    },

    setStory(chapter, progress) {
      if (disposed) return;
      story = [chapter, progress];
      const target = listening();
      if (target !== null) {
        attempt(target, (runtime) => runtime.setStory(chapter, progress));
      }
    },

    setStage(next) {
      if (disposed) return;
      stages = next;
      const target = listening();
      if (target !== null) {
        attempt(target, (runtime) => runtime.setStage(next));
      }
    },

    setPointer(x, y, active) {
      if (disposed) return;
      pointer = [x, y, active];
      const target = listening();
      if (target !== null) {
        attempt(target, (runtime) => runtime.setPointer(x, y, active));
      }
    },

    setCalm(on) {
      if (disposed || calm === on) return;
      calm = on;
      const target = field;
      if (target === null || chosen === null) return;
      sync();
      if (calm && field === target) drawStill(target);
    },

    on(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      disposal ??= teardown();
      return disposal;
    },
  };
}
