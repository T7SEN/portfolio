// The shapes the work chapter forms, one per study, in the order the page
// lists the studies. The engine cannot read the content (REQ-ENG-02), so a
// test on the app side checks this list against the study index.
//
// This file imports nothing, so app code may read it without pulling three.js
// into the first load.
export const WORK_SHAPES = [
  "making-of",
  "coup-online",
  "archelab",
  "t7sen-url",
  "systemseven",
] as const;

export type WorkShape = (typeof WORK_SHAPES)[number];

/** Every shape the field can form from a sampled outline. */
export type ShapeId = "logo" | WorkShape;

/**
 * The work chapter's progress covers the studies in equal steps: from i / N
 * to (i + 1) / N the field forms WORK_SHAPES[i], N being WORK_SHAPES.length.
 * The page sends progress in those steps, taken from the study card in view,
 * so the shape on screen always belongs to the card beside it.
 */
export function workStep(progress: number): { index: number; local: number } {
  const count = WORK_SHAPES.length;
  const clamped = Number.isFinite(progress)
    ? Math.min(Math.max(progress, 0), 1)
    : 0;
  const index = Math.min(Math.floor(clamped * count), count - 1);
  return { index, local: clamped * count - index };
}
