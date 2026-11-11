// The engine's contract. React sends the commands on Engine and hears back
// only the three events (REQ-ENG-03). This file imports nothing, so app code
// can read these types without pulling three.js into the first load.

export type Tier = 1 | 2 | 3;

/** The tiers that draw a live field. */
export type GpuTier = 1 | 2;

export type Backend = "webgpu" | "webgl2";

export type ChapterId =
  "hero" | "bloom" | "work" | "making-of" | "about" | "contact";

/** Why the engine settled on a tier. Sent with every tierChosen event. */
export type TierReason =
  // Decided before any renderer exists.
  | "forced"
  | "save-data"
  | "phone"
  | "no-webgpu"
  | "no-adapter"
  | "fallback-adapter"
  | "adapter-limits"
  // Decided by the tier 1 probe.
  | "probe-pass"
  | "probe-slow"
  | "probe-failed"
  // Decided by a failure.
  | "webgpu-init-fallback"
  | "no-backend"
  | "device-lost";

export type EngineEvent =
  | { type: "ready"; tier: Tier }
  | { type: "tierChosen"; tier: Tier; reason: TierReason }
  | { type: "frameRate"; fps: number };

export type EngineListener = (event: EngineEvent) => void;

/**
 * A part of the screen a chapter's focus sits in, in normalised device
 * coordinates: x and y are its centre, -1 to 1 with y up, and the halves are
 * its half width and height on the same scale (the whole screen is 1 and 1).
 * The page measures it from its own layout, so it follows the text in either
 * reading direction.
 */
export interface Stage {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

/**
 * The stages the page has measured. hero places the dot at the stage's
 * centre and grows the bloom from there; work fits each study's shape inside
 * its stage. A chapter with no stage uses the whole screen.
 */
export type Stages = Partial<Record<ChapterId, Stage>>;

export interface Engine {
  /**
   * Picks the tier and starts the field inside the host. Resolves once
   * `ready` has been sent. It never rejects: a failure becomes a lower tier
   * and a tierChosen event that says why (REQ-ENG-08).
   */
  start(): Promise<void>;
  /** Forces a tier for the rest of the visit (REQ-TIER-04). */
  setTier(tier: Tier): void;
  /** Scroll position: the chapter in view and how far through it, 0 to 1. */
  setStory(chapter: ChapterId, progress: number): void;
  /**
   * Where the hero's dot sits and where the work chapter's shapes form, from
   * the page's layout. Sent again when the layout changes; each call
   * replaces the last.
   */
  setStage(stages: Stages): void;
  /** Pointer in normalised device coordinates: -1 to 1 on both axes, y up. */
  setPointer(x: number, y: number, active: boolean): void;
  /** Calm mode and reduced motion: the field freezes to one still frame. */
  setCalm(on: boolean): void;
  /** Subscribes to the three events. Returns the unsubscribe function. */
  on(listener: EngineListener): () => void;
  /** Teardown, not a feature command. Awaits the renderer's own dispose. */
  dispose(): Promise<void>;
}

/** What the tier decision reads from the device. Faked in unit tests. */
export interface Environment {
  /** navigator.connection.saveData or the prefers-reduced-data query. */
  saveData: boolean;
  /** The primary pointer is coarse: a phone or a tablet (REQ-TIER-02). */
  coarsePointer: boolean;
  /** navigator.gpu exists. */
  hasWebGpu: boolean;
  /** Null when requestAdapter returned null or was never asked. */
  adapter: AdapterFacts | null;
}

export interface AdapterFacts {
  isFallbackAdapter: boolean;
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
}

/** The first step of the tier decision, taken before three.js is loaded. */
export type TierDecision =
  | { kind: "still"; reason: TierReason }
  | { kind: "webgl2"; reason: TierReason }
  | { kind: "probe" }
  | { kind: "webgpu"; reason: TierReason };

export type ProbeVerdict = "pass" | "slow" | "failed";

export interface EngineOptions {
  /** Starts frozen when the visitor asked for reduced motion. */
  calm?: boolean;
  /** Skips the decision table. The development page uses it. */
  forcedTier?: Tier;
  /** Replaces a tier's particle count. The development page uses it. */
  particleCount?: number;
  /** Replaced by fakes in unit tests. */
  environment?: () => Promise<Environment>;
  loadRuntime?: () => Promise<RuntimeFactory>;
}

// Below: the seam between the controller, which holds no three.js, and the
// runtime, which holds all of it and loads after first content (REQ-PERF-04).

export interface RuntimeOptions {
  canvas: HTMLCanvasElement;
  /**
   * The backend asked for. Asking for webgpu can still give webgl2, because
   * the renderer falls back by itself when WebGPU fails to start; read
   * Runtime.backend for the one that is live.
   */
  backend: Backend;
  /** Particles for whichever backend is live after the renderer starts. */
  particleCount: Record<Backend, number>;
  /** Called after each drawn frame with the time since the one before, in ms. */
  onFrame(frameMs: number): void;
  /** The device or context is gone for good; the runtime must be disposed. */
  onLost(message: string): void;
}

export interface Runtime {
  readonly backend: Backend;
  readonly particleCount: number;
  /** Starts or resumes the frame loop. Safe to call twice. */
  run(): void;
  /** Stops simulating and drawing. Safe to call twice. */
  pause(): void;
  /** Settles the field without drawing it, then draws exactly one frame. */
  drawStill(): Promise<void>;
  setPointer(x: number, y: number, active: boolean): void;
  setStory(chapter: ChapterId, progress: number): void;
  setStage(stages: Stages): void;
  dispose(): Promise<void>;
}

/** Rejects when neither backend can start on the canvas. */
export type RuntimeFactory = (options: RuntimeOptions) => Promise<Runtime>;
