// The wheel's own steps (decision D-132). The making-of slide turns each
// wheel notch into one glide to the next card: while its row slides it sets
// a step here, and the smooth scroll asks the step where each wheel input
// sends the page before Lenis moves it, so Lenis's own glide carries the
// page there. Plain state, no DOM.

/**
 * Where a wheel input sends the page, from Lenis's target and the input's
 * delta, both in page pixels: null to scroll as ever; otherwise the new
 * target, which is the target itself to hold the page still.
 */
export type WheelStep = (target: number, delta: number) => number | null;

let current: WheelStep | null = null;

export const wheelSteps = {
  /** Sets the step; the teardown it returns clears that step only. */
  set(step: WheelStep): () => void {
    current = step;
    return () => {
      if (current === step) current = null;
    };
  },
  /** The target a wheel input sends the page to, or null to scroll as ever. */
  target(target: number, delta: number): number | null {
    return current === null ? null : current(target, delta);
  },
  /** For tests: no step. */
  reset(): void {
    current = null;
  },
};
