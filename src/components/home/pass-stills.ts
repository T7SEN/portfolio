import type { PassId } from "@/engine/story";

/**
 * A still of each making-of pass, for every card the field does not draw
 * live: on tier 3, before the tier is ready, on the soft look, and for a
 * pass the tier leaves out (LIVE_PASSES). Captured from the live field with its
 * other stills (public/still). One map, so the capture and the page agree on
 * the names.
 */
export const PASS_STILLS = {
  points: "/still/pass-points.webp",
  velocity: "/still/pass-velocity.webp",
  density: "/still/pass-density.webp",
  glow: "/still/pass-glow.webp",
  final: "/still/pass-final.webp",
} as const satisfies Record<PassId, `/still/${string}`>;
