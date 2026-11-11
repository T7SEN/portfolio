import type { ChapterId, Engine } from "@/engine/types";

/** The two engine commands the page drives. */
export type StoryTarget = Pick<Engine, "setStory" | "setPointer">;

export type StoryState = { chapter: ChapterId; progress: number };
export type PointerState = { x: number; y: number; active: boolean };

export type StoryBridge = {
  /** The chapter in view and how far through it, clamped to 0 to 1. */
  setStory(chapter: ChapterId, progress: number): void;
  /** Normalised device coordinates, -1 to 1 on both axes, y up. */
  setPointer(x: number, y: number, active: boolean): void;
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

// The page's scroll and pointer code and the engine session start at
// different times and never import each other. This plain object sits
// between them and keeps only the latest values, the way the engine itself
// keeps them (engine-webgpu-tsl.md section 7).
export function createStoryBridge(): StoryBridge {
  let story: StoryState | null = null;
  let pointer: PointerState | null = null;
  let target: StoryTarget | null = null;

  return {
    setStory(chapter, progress) {
      story = { chapter, progress: unit(progress) };
      target?.setStory(story.chapter, story.progress);
    },

    setPointer(x, y, active) {
      pointer = { x: signedUnit(x), y: signedUnit(y), active };
      target?.setPointer(pointer.x, pointer.y, pointer.active);
    },

    getStory: () => story,

    connect(next) {
      target = next;
      if (story !== null) next.setStory(story.chapter, story.progress);
      if (pointer !== null)
        next.setPointer(pointer.x, pointer.y, pointer.active);
      return () => {
        if (target === next) target = null;
      };
    },

    reset() {
      story = null;
      pointer = null;
      target = null;
    },
  };
}

export const storyBridge = createStoryBridge();
