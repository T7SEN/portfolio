// The exit as a timeline: for a share of the ripple's length, what each part
// of the scene does. The drawing reads this and nothing else, so the timing
// is tested without a canvas.

import { clamp01, easeIn, easeOut, smooth } from "./math";

/** The ripple's length: the cover lifts with it on every outcome. */
export const RIPPLE_MS = 1800;

/** The soft edge behind the ripple's wave, where the site fades in, in CSS pixels. */
export const RIPPLE_EDGE = 46;

export interface RippleFrame {
  /** The label's dark patch. */
  plate: number;
  /** How far the stars, grid, disk and matter have faded out. */
  fade: number;
  /** The hole and its disk, as a share of their size. */
  hole: number;
  /** How far the grid has sprung back flat. */
  flat: number;
  /** The flash as the hole closes. */
  flash: number;
  /** The wave's radius from the hole, or -1 before it sets off. */
  wave: number;
  /** How far the wave lifts the grid lines it passes, in CSS pixels. */
  bump: number;
  /** The wave's ring opacity. */
  ring: number;
  /** The radius of the opening that shows the page, 0 before it starts; its soft edge is RIPPLE_EDGE wide, inside it. */
  cut: number;
}

/**
 * The wave sets off fast and slows, never stopping before the corners: the
 * mockup's cubic ease out, so most of the page shows within the first half
 * of the wave's run, as it does there.
 */
export function waveTravel(t: number): number {
  return easeOut(clamp01(t));
}

/**
 * The hole closes with a short soft flash, the grid springs flat, and a wave
 * runs out from the centre, the page showing behind it with a soft edge.
 * reach is the hole centre's distance to the farthest corner, so at the end
 * the opening's inner edge has passed every corner.
 */
export function rippleFrame(l: number, reach: number): RippleFrame {
  const t = clamp01((l - 0.26) / 0.74);
  const wave = l > 0.26 ? (reach + RIPPLE_EDGE) * waveTravel(t) : -1;
  const fa = clamp01((l - 0.22) / 0.12);
  return {
    plate: 1 - clamp01(l / 0.15),
    fade: smooth(0.7, 1, l),
    hole: 1 - easeIn(clamp01(l / 0.28)),
    flat: smooth(0.25, 0.75, l),
    flash: fa > 0 && fa < 1 ? Math.sin(fa * Math.PI) : 0,
    wave,
    bump: 9 * (1 - t),
    ring: wave > 0 ? 0.7 * (1 - t) : 0,
    cut: Math.max(0, wave),
  };
}
