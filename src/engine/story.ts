// The shapes the work chapter forms, one per full study, in the order the
// page lists them. Each forms inside its study row's frame (phase P3.5); the
// short studies have no shape. The engine cannot read the content
// (REQ-ENG-02), so a test on the app side checks this list against the full
// studies in the study index.
//
// This file imports nothing, so app code may read it without pulling three.js
// into the first load.
export const WORK_SHAPES = ["making-of", "coup-online", "archelab"] as const;

/**
 * The making-of chapter's passes in the order the page shows them
 * (REQ-ENG-09). Each is a real step of the halftone frame (runtime/halftone.ts):
 * points, every particle splatted at one texel; velocity, each particle's
 * speed and direction from the simulation; density, the cells' summed tents;
 * glow, the blurred density; final, the halftone screen itself.
 */
export const PASSES = [
  "points",
  "velocity",
  "density",
  "glow",
  "final",
] as const;

export type PassId = (typeof PASSES)[number];

/**
 * The passes each GPU tier draws live in their cards; the page shows a still
 * of every other pass, and tier 3 shows only stills (REQ-ENG-09: tier 2 shows
 * fewer buffers). Tier 2 leaves out velocity, which costs a second draw of
 * every particle.
 */
export const LIVE_PASSES: Readonly<Record<1 | 2, readonly PassId[]>> = {
  1: PASSES,
  2: ["points", "density", "glow", "final"],
};

export type WorkShape = (typeof WORK_SHAPES)[number];

/**
 * Every shape the field can form from a sampled outline: the T7 mark and the
 * T7SEN wordmark of the field chapter, then the work shapes.
 */
export type ShapeId = "logo" | "wordmark" | WorkShape;

/**
 * The share at each end of a work step over which its shape forms or turns
 * into the next: a shape is whole across the middle of its step, from
 * STEP_EDGE to 1 - STEP_EDGE (runtime/story.ts, the work chapter; the page's
 * first step, story-progress.ts).
 */
export const STEP_EDGE = 0.25;

/**
 * The work chapter's progress covers the studies in equal steps: from i / N
 * to (i + 1) / N the field forms WORK_SHAPES[i], N being WORK_SHAPES.length.
 * The page sends progress in those steps, taken from the study row in view,
 * so the shape on screen always belongs to the row it sits in.
 */
export function workStep(progress: number): { index: number; local: number } {
  const count = WORK_SHAPES.length;
  const clamped = Number.isFinite(progress)
    ? Math.min(Math.max(progress, 0), 1)
    : 0;
  const index = Math.min(Math.floor(clamped * count), count - 1);
  return { index, local: clamped * count - index };
}
