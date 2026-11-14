// The engine's contract. React sends the commands on Engine and hears back
// only the events below (REQ-ENG-03): ready, tier chosen and frame rate, and
// from P4.5 the two loading signals the home page's loader moves on. This
// file imports only types, which compile away, so app code can read it
// without pulling three.js into the first load.

import type { PassId } from "./story";

export type { PassId };

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

/**
 * How the live field is drawn. halftone: particles splat into a coarse
 * density target and one dot is drawn per cell (phase P3.5). soft: each
 * particle drawn as a soft sprite, the look before P3.5, kept as the fallback
 * where a half-float target cannot be rendered.
 */
export type FieldLook = "halftone" | "soft";

export type EngineEvent =
  // particles: how many the live field draws; 0 for the tier 3 still.
  // look: how the live field draws, sent with every live tier and absent
  // for the tier 3 still; the making-of's live passes need the halftone.
  | { type: "ready"; tier: Tier; particles: number; look?: FieldLook }
  | { type: "tierChosen"; tier: Tier; reason: TierReason }
  | { type: "frameRate"; fps: number }
  // A renderer has started on its own canvas and can draw: sent once for
  // each runtime the engine builds, with the backend that is live, so twice
  // when a slow tier 1 probe hands over to WebGL2. Never sent on tier 3.
  | { type: "rendererStarted"; backend: Backend }
  // The tier 1 probe has opened its window, which closes after durationMs
  // of visible time: the only loading step with a known length. Sent again
  // when a hidden tab restarts the window from nothing. Never sent where no
  // probe runs (tier 2 by the decision table, tier 3, a forced tier).
  | { type: "probeStarted"; durationMs: number };

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
 * The stages the page has measured. hero: the dot's place beside the
 * headline, its centre the dot's and its halves the halo's reach; the bloom
 * grows from there. work: the frame of the study row in view, sent again on
 * every scroll frame while the row moves, and each shape forms inside it.
 * making-of: the face of the pass card in the middle of the making-of row,
 * sent again on every scroll frame while the row slides; the T7 mark forms
 * inside it, and that card shows its pass of the mark. Absent when no card
 * is in the middle (the viewer away, calm mode's still grid, tier 3), and
 * then the making-of chapter is the ambient flow. Any other chapter uses
 * the whole screen; the contact sky places its stars on its own band
 * (D-146, SkyView).
 */
export type Stages = Partial<Record<ChapterId, Stage>>;

/** A point in normalised device coordinates: -1 to 1 on both axes, y up. */
export interface Point {
  x: number;
  y: number;
}

/**
 * One card of the making-of pass viewer as the page lays it out: the four
 * corners of its face in normalised device coordinates, in the order top
 * left, top right, bottom right, bottom left of the face. The card shows its
 * pass of the part of the frame right behind its face, one to one: the
 * middle card the T7 mark that forms inside it (Stages, making-of), the
 * others the flow behind them. The page lays every face flat; a face turned
 * in 3D keeps its pass on it the right way round (a projective map) and
 * shows the box round its corners.
 */
export interface PassCard {
  pass: PassId;
  corners: readonly [Point, Point, Point, Point];
  /**
   * The face's own size in CSS pixels, as it stands unturned, for the radius
   * of its corners on its own plane. Without it the corners are square.
   */
  size?: { width: number; height: number };
  /**
   * The radius of the face's corners in CSS pixels, on its own plane: the
   * field draws nothing past it. None or 0 draws square corners.
   */
  radius?: number;
}

/**
 * The contact chapter's sky as the page sees it (D-146, D-147), worked out
 * on the page from src/engine/sky/sky.ts and sent on every frame while the
 * chapter is near. The engine places the stars from it; nothing comes back.
 */
export interface SkyView {
  /** The moment the sky shows, in ms since 1970: frozen while calm. */
  at: number;
  /** The head turn in degrees: right and up are positive (sky.ts headTurn). */
  turn: number;
  tilt: number;
  /**
   * The horizon's height from the screen's top in CSS pixels on this frame;
   * null for the sky band's own (sky.ts skyFrame).
   */
  horizon: number | null;
  /** How far each constellation's lines show, 0 to 1, by catalogue index. */
  reveal: readonly number[];
  /**
   * The constellation the message traces, by catalogue index, how many of
   * its lines are done, how much of the next shows (0 to 1) and the flash
   * after Send (0 to 1); null while nothing is written.
   */
  trace: {
    constellation: number;
    done: number;
    partial: number;
    flash: number;
  } | null;
}

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
   * Where the hero's dot sits, where the work chapter's shapes form and
   * where the making-of's T7 mark forms (the middle pass card's face), from
   * the page's layout. Sent again when the
   * layout changes and on every scroll frame while the work row or the
   * making-of row moves; each call replaces the last. A stage that moves a
   * little between frames is taken at once, so a shape stays inside its
   * frame or card while the page scrolls; a jump, such as the next card
   * reaching the middle, glides (REQ-SCR-05). The making-of forms its mark
   * only while its stage is sent.
   */
  setStage(stages: Stages): void;
  /**
   * The making-of pass viewer (REQ-ENG-09): the cards to draw a live pass
   * in, measured from the page's layout and sent again on every scroll frame
   * while they move; each call replaces the last. null when the viewer is
   * off screen, so the passes cost nothing elsewhere. The engine draws only
   * the passes LIVE_PASSES lists for its tier (story.ts) and ignores the
   * rest; the page shows a still of each pass the engine does not draw.
   */
  setPasses(cards: readonly PassCard[] | null): void;
  /**
   * The contact sky (D-147): the page's view of it, sent on every frame while
   * the contact chapter is near, null when it is away; each call replaces
   * the last. The engine draws the stars and lines it says.
   */
  setSky(view: SkyView | null): void;
  /** Pointer in normalised device coordinates: -1 to 1 on both axes, y up. */
  setPointer(x: number, y: number, active: boolean): void;
  /** Calm mode and reduced motion: the field freezes to one still frame. */
  setCalm(on: boolean): void;
  /** Subscribes to the events. Returns the unsubscribe function. */
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
  /** Asks for the soft field. The development page uses it (?look=soft). */
  look?: FieldLook;
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
  /**
   * The look asked for. Asking for halftone can still give soft, when a
   * half-float target cannot be rendered; read Runtime.look for the one
   * that is live.
   */
  look: FieldLook;
  /** Called after each drawn frame with the time since the one before, in ms. */
  onFrame(frameMs: number): void;
  /** The device or context is gone for good; the runtime must be disposed. */
  onLost(message: string): void;
}

export interface Runtime {
  readonly backend: Backend;
  readonly particleCount: number;
  readonly look: FieldLook;
  /** Starts or resumes the frame loop. Safe to call twice. */
  run(): void;
  /** Stops simulating and drawing. Safe to call twice. */
  pause(): void;
  /** Settles the field without drawing it, then draws exactly one frame. */
  drawStill(): Promise<void>;
  setPointer(x: number, y: number, active: boolean): void;
  setStory(chapter: ChapterId, progress: number): void;
  setStage(stages: Stages): void;
  setPasses(cards: readonly PassCard[] | null): void;
  setSky(view: SkyView | null): void;
  dispose(): Promise<void>;
}

/** Rejects when neither backend can start on the canvas. */
export type RuntimeFactory = (options: RuntimeOptions) => Promise<Runtime>;
