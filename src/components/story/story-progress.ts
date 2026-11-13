import { STEP_EDGE, WORK_SHAPES } from "@/engine/story";
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
 * How far up the screen the first study's row comes, as a share of the way
 * from the screen's bottom to its middle, while its shape forms (decision
 * D-130): whole once the row's top is three quarters of the way down.
 */
export const FIRST_RISE = 0.5;

// The first step's place. Its shape forms as its row comes up the screen,
// from the moment the row's top shows at the bottom, and is whole before
// the row reaches the middle, so wherever a jump lands (Skip intro) a row in
// view holds its shape whole. The row's own span then holds it whole until
// the turn to the next study, which starts where it always did.
function firstPlace(
  position: number,
  first: Span,
  local: number,
  height: number,
): number {
  if (position < first.start) {
    const reach = (height / 2) * FIRST_RISE;
    if (!(reach > 0)) return 0;
    return STEP_EDGE * unit((position - (first.start - height / 2)) / reach);
  }
  const turn = 1 - STEP_EDGE;
  if (local >= turn) return local;
  return STEP_EDGE + (local / turn) * (turn - STEP_EDGE);
}

/**
 * The work chapter's progress in workStep's equal steps (src/engine/story.ts):
 * the study row at the middle of the viewport gives the step, and how far
 * that row is through the middle gives the place inside it. The first row's
 * shape forms as the row comes up a screen height tall (firstPlace); without
 * one, above the first row the first step has not begun. Between rows the
 * next one is at its start.
 */
export function workProgress(
  position: number,
  steps: readonly Span[],
  count: number = WORK_SHAPES.length,
  height = 0,
): number {
  const { index, local } = workPlace(position, steps, count);
  const first = steps[0];
  const place =
    index === 0 && first !== undefined && count > 0
      ? firstPlace(position, first, local, height)
      : local;
  return unit((index + place) / count);
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
 * is. Chapters come in page order. The first, which fills the first screen,
 * starts at the page's top instead: its progress runs from the first pixel
 * of scroll to where its bottom reaches the middle, which is where the hero's
 * dot glides to the middle of the screen (runtime/story.ts, dotTravel). A
 * gap between two chapters belongs to the chapter above it at 1. In the work
 * chapter the study rows set the progress, when there are any, with the
 * viewport's height for the first row's rise (workProgress).
 */
export function resolveStory(
  position: number,
  chapters: readonly ChapterSpan[],
  steps: readonly Span[] = [],
  height = 0,
): StoryState | null {
  let current: ChapterSpan | undefined;
  for (const span of chapters) {
    if (current === undefined || position >= span.start) current = span;
  }
  if (current === undefined) return null;

  const span = current === chapters[0] ? { ...current, start: 0 } : current;
  const progress =
    current.chapter === "work" && steps.length > 0
      ? workProgress(position, steps, WORK_SHAPES.length, height)
      : spanProgress(position, span);
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
