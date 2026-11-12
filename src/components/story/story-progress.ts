import { WORK_SHAPES } from "@/engine/story";
import type { ChapterId } from "@/engine/types";
import type { StoryState } from "@/lib/story-bridge";

/**
 * Scroll positions, in pixels, over which an element crosses the middle of
 * the viewport: start when its top reaches the middle, end when its bottom
 * does. ScrollTrigger's "top center" and "bottom center" give the same pair.
 */
export type Span = { start: number; end: number };

export type ChapterSpan = Span & { chapter: ChapterId };

// Smaller changes than this are the same story; one pixel of a tall chapter
// is still several times larger.
const PROGRESS_EPSILON = 1e-4;

function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/** How far a position is through a span: 0 at its start, 1 at its end. */
export function spanProgress(position: number, span: Span): number {
  const length = span.end - span.start;
  if (!(length > 0)) return position >= span.start ? 1 : 0;
  return unit((position - span.start) / length);
}

// The last row whose span the position has passed, and how far through it.
function workPlace(position: number, steps: readonly Span[], count: number) {
  let index = 0;
  let local = 0;
  steps.slice(0, count).forEach((step, stepIndex) => {
    if (position >= step.start) {
      index = stepIndex;
      local = spanProgress(position, step);
    }
  });
  return { index, local };
}

/**
 * The work chapter's progress in workStep's equal steps (src/engine/story.ts):
 * the study row at the middle of the viewport gives the step, and how far
 * that row is through the middle gives the place inside it. Above the first
 * row the first step has not begun; between rows the next one is at its
 * start.
 */
export function workProgress(
  position: number,
  steps: readonly Span[],
  count: number = WORK_SHAPES.length,
): number {
  const { index, local } = workPlace(position, steps, count);
  return unit((index + local) / count);
}

/**
 * The study row whose frame the field forms its shape in: the row of the
 * step workProgress gives, so the frame and the shape always belong to the
 * same study. Above the first row the first; between rows the next one;
 * past the last the last. 0 when there are no rows.
 */
export function rowInView(
  position: number,
  steps: readonly Span[],
  count: number = WORK_SHAPES.length,
): number {
  const rows = Math.min(steps.length, count);
  const { index, local } = workPlace(position, steps, count);
  // A row passed in full hands over to the next, as workStep does.
  const row = local >= 1 ? index + 1 : index;
  return Math.max(0, Math.min(row, rows - 1));
}

/**
 * The chapter at the middle of the viewport and how far through it the page
 * is. Chapters come in page order. A gap between two chapters belongs to the
 * chapter above it at 1. In the work chapter the study rows set the
 * progress, when there are any.
 */
export function resolveStory(
  position: number,
  chapters: readonly ChapterSpan[],
  steps: readonly Span[] = [],
): StoryState | null {
  let current: ChapterSpan | undefined;
  for (const span of chapters) {
    if (current === undefined || position >= span.start) current = span;
  }
  if (current === undefined) return null;

  const progress =
    current.chapter === "work" && steps.length > 0
      ? workProgress(position, steps)
      : spanProgress(position, current);
  return { chapter: current.chapter, progress };
}

export function sameStory(
  previous: StoryState | null,
  next: StoryState,
): boolean {
  return (
    previous !== null &&
    previous.chapter === next.chapter &&
    Math.abs(previous.progress - next.progress) < PROGRESS_EPSILON
  );
}

/**
 * A title whose top is already inside the viewport, or above it, when the
 * story starts is left as it is, so nothing the visitor can see blinks out.
 */
export function isReached(top: number, viewportHeight: number): boolean {
  return top < viewportHeight;
}
