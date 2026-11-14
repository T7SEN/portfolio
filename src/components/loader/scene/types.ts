// The contract between the loader's cover (the client island that owns the
// markup, the label, focus and the lift) and its scene (the 2D canvas that
// draws the black hole). The scene knows nothing of the engine or React; the
// cover tells it how far loading has come and when to leave.

/**
 * Where loading stands. Each finished step sends its wave of matter in and
 * deepens the well; nothing moves between steps except during the GPU test,
 * the only step with a known length (pillar 6, rule A14).
 */
export interface SceneProgress {
  /** Steps finished, 0 to 4. A step skipped on this device counts once passed. */
  done: number;
  /**
   * The GPU test's share of its known length, 0 to 1, while it runs: matter
   * streams in and the well deepens steadily with it. Null when no test runs.
   */
  test: number | null;
  /** The field has drawn under the cover: a full disk and the deepest well. */
  ready: boolean;
}

export interface SceneOptions {
  /** CSS pixels. */
  width: number;
  height: number;
  /** The canvas backing store scale, already capped by the cover. */
  pixelRatio: number;
  /** The phone sizing: a narrow screen, as the mockup's phone frame. */
  phone: boolean;
  /** Called once, after the scene's first frame has painted the void. */
  onFirstFrame?: () => void;
}

/**
 * How much the scene draws. light: fewer streams and a coarser grid, used
 * while the GPU test runs if the measurement shows the full scene changes
 * the test's verdict or its median frame time.
 */
export type SceneEffort = "full" | "light";

export interface LoaderScene {
  /**
   * Plays the entrance over about 1 s: the stars fade in, the grid ripples
   * out from the centre, the hole's ring draws itself round. The scene paints
   * the void itself from its first frame, so the cover's own background can
   * go once onFirstFrame has run.
   */
  enter(): void;
  setProgress(progress: SceneProgress): void;
  setEffort(effort: SceneEffort): void;
  /**
   * Plays the ripple and resolves when the page is wholly uncovered: the
   * hole closes with a soft flash, the grid springs flat and a wave runs out
   * from the hole, the page showing behind it. From the call on, the scene
   * cuts its reveal out of the void it paints. A second call shares the
   * first.
   */
  exit(): Promise<void>;
  resize(width: number, height: number, pixelRatio: number): void;
  /** Stops the frame loop and lets go of everything. Safe to call twice. */
  dispose(): void;
}

export type CreateLoaderScene = (
  canvas: HTMLCanvasElement,
  options: SceneOptions,
) => LoaderScene;
