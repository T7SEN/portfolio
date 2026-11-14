// The scene's plain numbers: colours from the tokens, easing, the seeded
// generator, and the shapes of the black hole's motion. No drawing here, so
// every rule is testable in Node.

import { colors, type Hex } from "@/tokens/colors";

export type Rgb = readonly [number, number, number];

export function rgbOf(hex: Hex): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function rgba(c: Rgb, alpha: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp01(alpha).toFixed(3)})`;
}

export const VOID = rgbOf(colors.void);
/**
 * The hole itself: the void with all its light gone, as the mockup draws it,
 * so the disc reads against the void before its ring has drawn. Black needs
 * no token: black and dark greys carry everything that is not marked
 * (references/visual-system.md).
 */
export const HOLE = mix(VOID, [0, 0, 0], 1);
export const VIOLET = rgbOf(colors.violet);
export const GLOW = rgbOf(colors.glow);
export const MUTED = rgbOf(colors.muted);
export const PAPER = rgbOf(colors.paper);
/** The stars' cool white: muted with a little of the logo blue. */
export const COOL = mix(MUTED, rgbOf(colors["logo-blue"]), 0.2);

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smooth(from: number, to: number, x: number): number {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
}

export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
export const easeIn = (t: number): number => t ** 3;

/** A linear congruential generator, so every frame repeats for screenshots and tests. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The well's depth, as a share of the radius pulled in at the hole, for 0 to 4 steps. */
export function wellDepth(level: number): number {
  return 0.12 + 0.5 * easeOut(clamp01(level / 4));
}

export const TURN_MAX = 1.8;
export const TURN_MS = 8200;

/**
 * The grid's slow turn round the hole, in radians, after t ms. It starts at
 * the mockup's 0.22 rad a second and levels off, so a long load never winds
 * the grid into a tight spiral.
 */
export function gridTurn(t: number): number {
  return TURN_MAX * (1 - Math.exp(-Math.max(0, t) / TURN_MS));
}

/** Where one piece of matter is on its path, 0 to 1, as its wave flies: pieces leave staggered. */
export function matterAt(flight: number, stagger: number): number {
  return clamp01(flight * 1.35 - stagger * 0.35);
}

/**
 * The spiral path in, written into out as x and y from the hole's centre.
 * The radius falls from start to end, the turn tightens and speeds up near
 * the hole, and the orbit flattens into the disk's tilted plane. Returns the
 * share of the radius still to fall, 1 at the start and 0 at the disk.
 */
export function spiral(
  out: Float64Array,
  t: number,
  angle: number,
  start: number,
  end: number,
  twist: number,
  tilt: number,
): number {
  const u = (1 - clamp01(t)) ** 1.5;
  const r = end + (start - end) * u;
  const th = angle + twist * (1 / (u + 0.12) - 1 / 1.12) * 3.2;
  out[0] = Math.cos(th) * r;
  out[1] = Math.sin(th) * r * (tilt + (1 - tilt) * u);
  return u;
}

/** A star's distance from the hole after the light bends round it (an Einstein ring's push outward). */
export function bend(r: number, ring: number): number {
  return (r + Math.sqrt(r * r + 4 * ring * ring)) / 2;
}

export function farthestCorner(
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
}
