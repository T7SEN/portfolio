/**
 * The phone test of the engine's tier choice (src/engine/tier/environment.ts),
 * repeated here because app code reaches the engine only through its loader.
 * The pointer media feature describes the primary pointing device.
 */
export const COARSE_POINTER_QUERY = "(pointer: coarse)";

export type SmoothScrollInput = {
  /** The primary pointer is coarse: a phone or a tablet. */
  coarsePointer: boolean;
  /** Calm mode or OS reduced motion, as the calm store reports it. */
  calm: boolean;
};

/**
 * Lenis runs only on a fine primary pointer with calm off (REQ-SCR-03).
 * Touch keeps the platform's own momentum, and calm keeps native scroll
 * (REQ-A11Y-03, REQ-A11Y-04).
 */
export function shouldSmoothScroll({
  coarsePointer,
  calm,
}: SmoothScrollInput): boolean {
  return !coarsePointer && !calm;
}
