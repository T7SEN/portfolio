// The making-of pass viewer as plain numbers (REQ-ENG-09): which cards a
// tier draws, where each card's picture comes from in the frame, and how
// each pass turns its buffer into colour. No three.js here, so every rule is
// unit tested in Node; passes.ts and field.ts build the same formulas in TSL
// from these constants, and each TSL line names the rule it mirrors.

import { LIVE_PASSES, type PassId } from "../story";
import type { Backend, GpuTier, PassCard, Point } from "../types";
import {
  AMBIENT_TONE,
  FILL_TONE,
  GLOW_FROM,
  GLOW_TO,
  SPEED_FOR_GLOW,
  TONE_FULL,
  smoothstep,
} from "./halftone-rules";
import {
  faceSize,
  invert,
  squareToQuad,
  type Corners,
  type Matrix3,
} from "./homography";

/** The GPU tier a live backend draws: WebGPU is tier 1, WebGL2 tier 2. */
export function tierOf(backend: Backend): GpuTier {
  return backend === "webgpu" ? 1 : 2;
}

/**
 * The velocity pass draws every particle a second time, one texel each,
 * into a target this many texels a side per cell: a quarter of the splat's
 * texels, since it only has to show which way the field moves.
 */
export const VELOCITY_SUB = 2;

/** A part of the frame in CSS pixels, from its top left corner, y down. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The part of the frame a card shows: the box round its face's four
 * corners, in CSS pixels of the frame. For a flat face, as the page lays
 * every card, that is the face's own rectangle, so each pixel of the card
 * reads the frame at its own place, one to one, and the card shows its pass
 * of whatever sits right behind it: the T7 mark in the middle card, the
 * flow behind the others.
 */
export function faceCrop(
  corners: Corners,
  cssWidth: number,
  cssHeight: number,
): Crop {
  const xs = corners.map((corner) => ((corner.x + 1) / 2) * cssWidth);
  const ys = corners.map((corner) => ((1 - corner.y) / 2) * cssHeight);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The radius of a face's corners on its own square, u across and v down
 * from 0 to 1: the radius in CSS pixels over the face's own width and
 * height, each at most half. Without the face's own size the corners are
 * square.
 */
export function cornerRadii(
  radius: number | undefined,
  size: { width: number; height: number } | undefined,
): { u: number; v: number } {
  if (
    size === undefined ||
    radius === undefined ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !(size.width > 0) ||
    !(size.height > 0)
  ) {
    return { u: 0, v: 0 };
  }
  return {
    u: Math.min(radius / size.width, 0.5),
    v: Math.min(radius / size.height, 0.5),
  };
}

/**
 * Whether a point of the face's own square, u and v from 0 to 1, lies on
 * the face with its corners rounded by these radii (cornerRadii). Outside a
 * corner's quarter ellipse the field draws nothing, as the face clips its
 * contents; passes.ts discards by the same rule.
 */
export function onRoundedFace(
  u: number,
  v: number,
  radii: { u: number; v: number },
): boolean {
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  const past = (value: number, radius: number) =>
    Math.max(Math.abs(value - 0.5) - (0.5 - radius), 0) /
    Math.max(radius, 1e-6);
  return Math.hypot(past(u, radii.u), past(v, radii.v)) <= 1;
}

export interface CardLayout {
  pass: PassId;
  /** The face's corners as the page sent them, the card's drawn outline. */
  corners: Corners;
  /**
   * From normalised device coordinates back to the face's own square, u
   * across and v down from its top left corner, row by row (homography.ts).
   */
  inverse: Matrix3;
  /** The part of the frame the face shows. */
  crop: Crop;
  /** Its corners' radius on its own square (cornerRadii). */
  radii: { u: number; v: number };
  /**
   * Device pixels the card draws for each CSS pixel of the frame it shows,
   * along its blurrier side: how finely its picture is drawn, so a dot's
   * edge is smoothed over one of the card's pixels and no more.
   */
  sharpness: number;
}

function copyPoint(point: Point): Point {
  return { x: Number(point.x), y: Number(point.y) };
}

/**
 * The runtime's own copy of the cards: the page may reuse its objects, and
 * the cards are drawn on later frames. An empty list is no cards at all.
 */
export function copyCards(
  cards: readonly PassCard[] | null,
): PassCard[] | null {
  if (cards === null || cards.length === 0) return null;
  return cards.map((card) => ({
    pass: card.pass,
    corners: [
      copyPoint(card.corners[0]),
      copyPoint(card.corners[1]),
      copyPoint(card.corners[2]),
      copyPoint(card.corners[3]),
    ],
    ...(card.size === undefined
      ? {}
      : {
          size: {
            width: Number(card.size.width),
            height: Number(card.size.height),
          },
        }),
    ...(card.radius === undefined ? {} : { radius: Number(card.radius) }),
  }));
}

/** True when both hold the same cards, corner for corner. */
export function sameCards(
  a: readonly PassCard[] | null,
  b: readonly PassCard[] | null,
): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  return a.every((card, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      card.pass === other.pass &&
      card.radius === other.radius &&
      card.size?.width === other.size?.width &&
      card.size?.height === other.size?.height &&
      card.corners.every(
        (corner, at) =>
          corner.x === other.corners[at]?.x &&
          corner.y === other.corners[at]?.y,
      )
    );
  });
}

/**
 * The cards a tier draws, laid out on the frame: only the passes LIVE_PASSES
 * lists for the tier, the first card of each pass (one drawer each), and
 * only cards whose corners make a convex face with some area. Each shows its
 * pass of the part of the frame behind its own face (faceCrop), so a flat
 * face draws at the frame's own size. How finely the card draws comes from
 * its size as drawn against that part; the face's own size sets only the
 * radius of its corners.
 */
export function layoutCards(
  cards: readonly PassCard[] | null,
  tier: GpuTier,
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): CardLayout[] {
  if (cards === null) return [];
  const live = new Set<PassId>(LIVE_PASSES[tier]);
  const taken = new Set<PassId>();
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const laid: CardLayout[] = [];

  for (const card of cards) {
    if (!live.has(card.pass) || taken.has(card.pass)) continue;
    const corners: Corners = card.corners;
    const forward = squareToQuad(corners);
    const inverse = forward === null ? null : invert(forward);
    if (inverse === null) continue;

    const face = faceSize(corners, cssWidth, cssHeight);
    const crop = faceCrop(corners, cssWidth, cssHeight);
    const sharpness = Math.min(
      (face.width * ratio) / crop.width,
      (face.height * ratio) / crop.height,
    );
    const radii = cornerRadii(card.radius, card.size);
    taken.add(card.pass);
    laid.push({ pass: card.pass, corners, inverse, crop, radii, sharpness });
  }
  return laid;
}

// How each pass turns its buffer into colour. A texel's tone is the tone a
// cell would have were every texel of the cell like it: its summed weight
// times the halftone's density scale, times the texels in a cell.

/**
 * Points: a splat texel of this tone or more shows at full light. Twice a
 * formation's fill, so a filled area shows its grain, the texels that drew
 * more particles brighter than the rest, and never one flat block.
 */
export const POINTS_FULL = 2 * FILL_TONE;

/** A splat texel's light in the points pass, 0 to 1, from its tone. */
export function pointLight(tone: number): number {
  return smoothstep(0, POINTS_FULL, tone);
}

/**
 * Velocity: a particle at rest still shows at this share of its light, so
 * the pass shows where the field is as well as how fast it moves; from
 * SPEED_FOR_GLOW (the speed at which the final frame's dots turn to glow)
 * it is at full light.
 */
export const VELOCITY_FLOOR = 0.25;

export function velocityLight(speed: number): number {
  const share = smoothstep(
    0,
    SPEED_FOR_GLOW,
    Number.isFinite(speed) ? speed : 0,
  );
  return VELOCITY_FLOOR + (1 - VELOCITY_FLOOR) * share;
}

/**
 * The direction wheel: a particle moving along one of these screen
 * directions takes that token, glow for motion to the right of the screen
 * and the other two a third of a turn round, and one moving between two
 * blends them.
 */
export const DIRECTIONS = [
  { token: "glow", x: 1, y: 0 },
  { token: "violet", x: -0.5, y: Math.sqrt(3) / 2 },
  { token: "text", x: -0.5, y: -Math.sqrt(3) / 2 },
] as const;

/**
 * Each direction token's share of a particle's colour, from its velocity on
 * the screen's plane, x across and y up; they add up to 1. A particle at
 * rest takes the three equally.
 */
export function directionWeights(
  x: number,
  y: number,
): [number, number, number] {
  const length = Math.hypot(x, y);
  const nx = length > 1e-6 ? x / length : 0;
  const ny = length > 1e-6 ? y / length : 0;
  const raw = DIRECTIONS.map((direction) => {
    const lean = (1 + nx * direction.x + ny * direction.y) / 2;
    return lean * lean;
  });
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  const [a = 0, b = 0, c = 0] = raw.map((weight) => weight / total);
  return [a, b, c];
}

/** Velocity: a texel of this tone or more shows its colour at full strength. */
export const VELOCITY_FULL = 0.3;

export function velocityPresence(tone: number): number {
  return smoothstep(0, VELOCITY_FULL, tone);
}

/**
 * Density: each cell drawn flat, from the void through violet to the glow
 * at a formation's fill and the near white text token at a full cell, so
 * the grid of cells the dots are drawn from is seen as it is.
 */
export const DENSITY_VIOLET_AT = 2 * AMBIENT_TONE;

export function densityShares(tone: number): {
  violet: number;
  glow: number;
  white: number;
} {
  return {
    violet: smoothstep(0, DENSITY_VIOLET_AT, tone),
    glow: smoothstep(DENSITY_VIOLET_AT, FILL_TONE, tone),
    white: smoothstep(FILL_TONE, TONE_FULL, tone),
  };
}

/**
 * Cells a card draws this many device pixels or more across show a dark
 * hairline between them, so the grid reads; smaller cells, as in a
 * thumbnail, show none, since a line under a pixel would shimmer.
 */
export const DENSITY_GAP_FROM_PX = 4;
export const DENSITY_GAP_TO_PX = 7;

/**
 * Final: four points on a rotated grid inside one of the card's pixels, in
 * shares of the pixel's side from its centre, averaged where the card draws
 * the frame smaller than it is.
 */
export const FINAL_SAMPLES = [
  [-0.125, -0.375],
  [0.375, -0.125],
  [0.125, 0.375],
  [-0.375, 0.125],
] as const;

/**
 * How far the four points spread across a pixel, 0 to 1, from the card's
 * sharpness (device pixels per CSS pixel of the frame): none where it draws
 * the frame at its own size or larger, so a card over the whole canvas is
 * the frame itself, and the whole pixel from half size down. Each point's
 * dot edge is then smoothed over its own share of the pixel.
 */
export function finalSpread(sharpness: number): number {
  if (!Number.isFinite(sharpness) || sharpness <= 0) return 1;
  return Math.min(Math.max(1 / sharpness - 1, 0), 1);
}

/**
 * Glow: the blurred density on its own, from the void through violet to the
 * glow token over the same range the final frame lays its glow over
 * (halftone-rules glowLight), at full strength instead of GLOW_GAIN, since
 * the pass alone would be too faint to see.
 */
export function glowShares(blurredTone: number): {
  violet: number;
  glow: number;
} {
  const light = smoothstep(GLOW_FROM, GLOW_TO, blurredTone);
  return { violet: light, glow: light * light };
}
