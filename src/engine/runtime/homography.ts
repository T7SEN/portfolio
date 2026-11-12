// The projective map between a pass card's face and the screen, as plain
// numbers: no three.js here, so it is tested in Node. The page sends each
// card as the four corners of its face in normalised device coordinates
// (types.ts, PassCard); a card it turns in 3D is a projective image of a
// rectangle, so one 3 by 3 matrix maps the face's own square onto it and
// its inverse takes every pixel of the screen back to its place on the face.

import type { Point } from "../types";

/** A 3 by 3 matrix, row by row. */
export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Top left, top right, bottom right and bottom left of the face. */
export type Corners = readonly [Point, Point, Point, Point];

// Below this area, in squared normalised units, a face is a line or a point.
const MIN_AREA = 1e-9;
// A projective image of a rectangle seen from in front has every corner in
// front of the eye: the map's own depth stays above this at each corner.
const MIN_DEPTH = 1e-6;

function finite(corners: Corners): boolean {
  return corners.every(
    (corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y),
  );
}

/** The z of the cross product of the edges a to b and b to c. */
function turn(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

/**
 * True when the four corners, in order, bound a convex face with some area:
 * every turn has the same sign. Either sign is a face: one is its front, the
 * other its back, which CSS shows mirrored by default, and so does the map.
 */
export function isConvexFace(corners: Corners): boolean {
  if (!finite(corners)) return false;
  const turns = corners.map((corner, index) =>
    turn(
      corner,
      corners[(index + 1) % 4] ?? corner,
      corners[(index + 2) % 4] ?? corner,
    ),
  );
  const positive = turns.every((value) => value > 0);
  const negative = turns.every((value) => value < 0);
  if (!positive && !negative) return false;
  const [a, b, c, d] = corners;
  // The shoelace formula: twice the signed area.
  const area =
    a.x * b.y -
    b.x * a.y +
    b.x * c.y -
    c.x * b.y +
    (c.x * d.y - d.x * c.y + d.x * a.y - a.x * d.y);
  return Math.abs(area) / 2 > MIN_AREA;
}

/**
 * The map that takes the face's own square, u and v from 0 to 1 with u
 * across and v down from the top left corner, onto the four corners:
 * x = (a u + b v + c) / w and y = (d u + e v + f) / w, w = g u + h v + 1
 * (Heckbert's square to quad). Null when the corners are not a convex face.
 */
export function squareToQuad(corners: Corners): Matrix3 | null {
  if (!isConvexFace(corners)) return null;
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let g = 0;
  let h = 0;
  // A parallelogram is an affine map: the depth terms are zero.
  if (dx3 !== 0 || dy3 !== 0) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (den === 0) return null;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }

  const matrix: Matrix3 = [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ];
  // The depth at the four corners: u and v at 0 or 1.
  const depths = [1, 1 + g, 1 + g + h, 1 + h];
  if (depths.some((depth) => !(depth > MIN_DEPTH))) return null;
  return matrix.every(Number.isFinite) ? matrix : null;
}

/** The inverse of a 3 by 3 matrix, scaled to any convenient factor, or null. */
export function invert(m: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inverse: Matrix3 = [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
  return inverse.every(Number.isFinite) ? inverse : null;
}

/**
 * The point a matrix takes x and y to, after the divide by its depth; null
 * where the depth is zero (a point at infinity).
 */
export function project(m: Matrix3, x: number, y: number): Point | null {
  const w = m[6] * x + m[7] * y + m[8];
  if (w === 0 || !Number.isFinite(w)) return null;
  return {
    x: (m[0] * x + m[1] * y + m[2]) / w,
    y: (m[3] * x + m[4] * y + m[5]) / w,
  };
}

/**
 * The face's size on screen in CSS pixels, each side the mean of its two
 * opposite edges: exact for a card that lies flat. A card turned in depth
 * shows its turned side shorter than it stands, and the four corners alone
 * cannot say by how much, since that also depends on the page's perspective.
 */
export function faceSize(
  corners: Corners,
  cssWidth: number,
  cssHeight: number,
): { width: number; height: number } {
  const [p0, p1, p2, p3] = corners;
  const length = (a: Point, b: Point) =>
    Math.hypot(((b.x - a.x) * cssWidth) / 2, ((b.y - a.y) * cssHeight) / 2);
  return {
    width: (length(p0, p1) + length(p3, p2)) / 2,
    height: (length(p0, p3) + length(p1, p2)) / 2,
  };
}
