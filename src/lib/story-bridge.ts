import type {
  ChapterId,
  Engine,
  PassCard,
  Point,
  SkyView,
  Stages,
} from "@/engine/types";

/**
 * What the page drives: the engine's story, stage, passes, sky and pointer
 * commands, and the veil, which the engine session lays over the field (it
 * never reaches the engine). A veil of null is the session's own default.
 */
export type StoryTarget = Pick<
  Engine,
  "setStory" | "setStage" | "setPasses" | "setSky" | "setPointer"
> & {
  setVeil(veil: number | null): void;
};

export type StoryState = { chapter: ChapterId; progress: number };
export type PointerState = { x: number; y: number; active: boolean };

export type StoryBridge = {
  /** The chapter in view and how far through it, clamped to 0 to 1. */
  setStory(chapter: ChapterId, progress: number): void;
  /** Where the dot and the work chapter's shapes sit, from the layout. */
  setStage(stages: Stages): void;
  /**
   * The making-of cards the field draws a pass in, null when there are
   * none. A card with a corner that is not a finite number is left out.
   */
  setPasses(cards: readonly PassCard[] | null): void;
  /**
   * The contact sky as the page sees it (D-147), null when the chapter is
   * away. A view whose moment or turn is not a finite number is dropped.
   */
  setSky(view: SkyView | null): void;
  /** Normalised device coordinates, -1 to 1 on both axes, y up. */
  setPointer(x: number, y: number, active: boolean): void;
  /** The veil's strength over the field, 0 to 1; null for the default. */
  setVeil(veil: number | null): void;
  /** The latest story sent, null before any. */
  getStory(): StoryState | null;
  /**
   * Hands every later value to the target, after the latest ones sent so
   * far. One target at a time; connecting another replaces it. Returns the
   * disconnect, which leaves a newer target alone.
   */
  connect(target: StoryTarget): () => void;
  /** Forgets the values and the target. */
  reset(): void;
};

function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

function signedUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, -1), 1) : 0;
}

function isFinitePoint({ x, y }: Point): boolean {
  return Number.isFinite(x) && Number.isFinite(y);
}

// A card may sit partly off the screen, so its corners keep any finite
// value; none left means no card.
function cleanCards(
  cards: readonly PassCard[] | null,
): readonly PassCard[] | null {
  if (cards === null) return null;
  const kept = cards.filter((card) => card.corners.every(isFinitePoint));
  return kept.length > 0 ? kept : null;
}

// The page's scroll and pointer code and the engine session start at
// different times and never import each other. This plain object sits
// between them and keeps only the latest values, the way the engine itself
// keeps them (engine-webgpu-tsl.md section 7).
// A sky view with a moment, turn and tilt that are numbers, its reveals
// clamped to 0 to 1; null for anything else.
function cleanTrace(trace: SkyView["trace"]): SkyView["trace"] {
  if (trace === null) return null;
  const { constellation, done, partial, flash } = trace;
  if (!Number.isInteger(constellation) || constellation < 0) return null;
  if (!Number.isFinite(done) || !Number.isFinite(flash)) return null;
  return {
    constellation,
    done: Math.max(0, Math.floor(done)),
    partial: unit(partial),
    flash: Math.max(0, flash),
  };
}

function cleanSky(view: SkyView | null): SkyView | null {
  if (view === null) return null;
  if (![view.at, view.turn, view.tilt].every(Number.isFinite)) return null;
  return {
    at: view.at,
    turn: view.turn,
    tilt: view.tilt,
    horizon:
      view.horizon !== null && Number.isFinite(view.horizon)
        ? view.horizon
        : null,
    reveal: view.reveal.map(unit),
    trace: cleanTrace(view.trace),
  };
}

export function createStoryBridge(): StoryBridge {
  let story: StoryState | null = null;
  let stages: Stages | null = null;
  // Undefined until the page sends cards; null once it says there are none.
  let passes: readonly PassCard[] | null | undefined;
  // Undefined until the page sends a sky; null once it says it is away.
  let sky: SkyView | null | undefined;
  let pointer: PointerState | null = null;
  // Undefined until the page sends one; null is a sent default.
  let veil: number | null | undefined;
  let target: StoryTarget | null = null;

  return {
    setStory(chapter, progress) {
      story = { chapter, progress: unit(progress) };
      target?.setStory(story.chapter, story.progress);
    },

    setStage(next) {
      stages = next;
      target?.setStage(next);
    },

    setPasses(next) {
      passes = cleanCards(next);
      target?.setPasses(passes);
    },

    setSky(next) {
      sky = cleanSky(next);
      target?.setSky(sky);
    },

    setPointer(x, y, active) {
      pointer = { x: signedUnit(x), y: signedUnit(y), active };
      target?.setPointer(pointer.x, pointer.y, pointer.active);
    },

    setVeil(next) {
      veil = next === null ? null : unit(next);
      target?.setVeil(veil);
    },

    getStory: () => story,

    connect(next) {
      target = next;
      // The stage first, so the first story already seats the field in it.
      if (stages !== null) next.setStage(stages);
      if (passes !== undefined) next.setPasses(passes);
      if (sky !== undefined) next.setSky(sky);
      if (story !== null) next.setStory(story.chapter, story.progress);
      if (pointer !== null)
        next.setPointer(pointer.x, pointer.y, pointer.active);
      if (veil !== undefined) next.setVeil(veil);
      return () => {
        if (target === next) target = null;
      };
    },

    reset() {
      story = null;
      stages = null;
      passes = undefined;
      sky = undefined;
      pointer = null;
      veil = undefined;
      target = null;
    },
  };
}

export const storyBridge = createStoryBridge();
