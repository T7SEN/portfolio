/**
 * A closed polygon as x, y pairs in drawing units with y down, the order an
 * SVG polygon's points attribute uses. The last point joins the first.
 */
export type Ring = number[];

const DEGREE = Math.PI / 180;

function push(out: Ring, x: number, y: number) {
  const count = out.length;
  if (
    count >= 2 &&
    Math.abs((out[count - 2] ?? 0) - x) < 1e-9 &&
    Math.abs((out[count - 1] ?? 0) - y) < 1e-9
  ) {
    return;
  }
  out.push(x, y);
}

/**
 * Appends points along a circular arc. Angles are in degrees, and with y down
 * a growing angle turns clockwise on screen. Chords stay near 1.5 units, so a
 * small dot and a large corner both stay round.
 */
export function arc(
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
  out: Ring = [],
): Ring {
  const span = (to - from) * DEGREE;
  const step = Math.min(Math.max(1.5 / radius, 4 * DEGREE), 30 * DEGREE);
  const segments = Math.max(1, Math.ceil(Math.abs(span) / step));
  for (let index = 0; index <= segments; index += 1) {
    const angle = from * DEGREE + (span * index) / segments;
    push(out, cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
  return out;
}

export function circle(cx: number, cy: number, radius: number): Ring {
  const ring = arc(cx, cy, radius, 0, 360);
  ring.length -= 2;
  return ring;
}

/**
 * The path with each corner replaced by an arc of the given radius, shrunk
 * where the sides beside a corner are too short for it. An open path keeps
 * its two ends.
 */
export function round(path: Ring, radius: number, closed = true): Ring {
  const count = path.length / 2;
  const out: Ring = [];
  const x = (index: number) => path[((index + count) % count) * 2] ?? 0;
  const y = (index: number) => path[((index + count) % count) * 2 + 1] ?? 0;

  for (let index = 0; index < count; index += 1) {
    const isEnd = !closed && (index === 0 || index === count - 1);
    const px = x(index);
    const py = y(index);
    const ax = x(index - 1) - px;
    const ay = y(index - 1) - py;
    const bx = x(index + 1) - px;
    const by = y(index + 1) - py;
    const lengthA = Math.hypot(ax, ay);
    const lengthB = Math.hypot(bx, by);
    const cosine = (ax * bx + ay * by) / (lengthA * lengthB);
    if (isEnd || !(Math.abs(cosine) < 0.9999)) {
      push(out, px, py);
      continue;
    }

    const half = Math.acos(cosine) / 2;
    const fitted = Math.min(
      radius,
      (Math.min(lengthA, lengthB) / 2) * Math.tan(half),
    );
    const tangent = fitted / Math.tan(half);
    const ux = ax / lengthA;
    const uy = ay / lengthA;
    const vx = bx / lengthB;
    const vy = by / lengthB;
    const bisector = Math.hypot(ux + vx, uy + vy);
    const reach = fitted / Math.sin(half);
    const cx = px + ((ux + vx) / bisector) * reach;
    const cy = py + ((uy + vy) / bisector) * reach;
    const from = Math.atan2(py + uy * tangent - cy, px + ux * tangent - cx);
    let to = Math.atan2(py + vy * tangent - cy, px + vx * tangent - cx);
    if (to - from > Math.PI) to -= Math.PI * 2;
    if (from - to > Math.PI) to += Math.PI * 2;
    arc(cx, cy, fitted, from / DEGREE, to / DEGREE, out);
  }
  return out;
}

export function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): Ring {
  return round(
    [x, y, x + width, y, x + width, y + height, x, y + height],
    radius,
  );
}

/** The ring turned by the given degrees (clockwise on screen) about a point. */
export function turn(ring: Ring, degrees: number, cx = 0, cy = 0): Ring {
  const cos = Math.cos(degrees * DEGREE);
  const sin = Math.sin(degrees * DEGREE);
  const out: Ring = [];
  for (let index = 0; index < ring.length; index += 2) {
    const dx = (ring[index] ?? 0) - cx;
    const dy = (ring[index + 1] ?? 0) - cy;
    out.push(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
  }
  return out;
}

/**
 * The part of a convex ring on the left of the line from (ax, ay) to (bx, by)
 * as drawn on screen, cut along that line.
 */
export function clip(
  ring: Ring,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Ring {
  const side = (px: number, py: number) =>
    (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const out: Ring = [];
  const count = ring.length / 2;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const px = ring[index * 2] ?? 0;
    const py = ring[index * 2 + 1] ?? 0;
    const qx = ring[next * 2] ?? 0;
    const qy = ring[next * 2 + 1] ?? 0;
    const sideP = side(px, py);
    const sideQ = side(qx, qy);
    if (sideP <= 0) push(out, px, py);
    if (sideP < 0 !== sideQ < 0 && sideP !== 0 && sideQ !== 0) {
      const t = sideP / (sideP - sideQ);
      push(out, px + (qx - px) * t, py + (qy - py) * t);
    }
  }
  return out;
}

/**
 * An open path made from a closed one by leaving out the points within
 * `size` of (x, y), so another stroke can pass through the gap. The points
 * near the gap must be close together, as they are along an arc.
 */
export function gap(path: Ring, x: number, y: number, size: number): Ring {
  const count = path.length / 2;
  const kept = (index: number) =>
    Math.hypot(
      (path[(index % count) * 2] ?? 0) - x,
      (path[(index % count) * 2 + 1] ?? 0) - y,
    ) > size;
  let start = 0;
  while (start < count && kept(start)) start += 1;
  while (start < count * 2 && !kept(start)) start += 1;
  const out: Ring = [];
  for (let index = start; index < start + count && kept(index); index += 1) {
    out.push(
      path[(index % count) * 2] ?? 0,
      path[(index % count) * 2 + 1] ?? 0,
    );
  }
  return out;
}

/**
 * The band of `width` along a path, as rings. A closed path gives an outer
 * and an inner ring, and the even-odd rule fills the band between them. An
 * open path gives one ring with square ends. Corners are mitred, so a path
 * should turn by less than about 120 degrees at any one point.
 */
export function stroke(path: Ring, width: number, closed = false): Ring[] {
  const left = offset(path, width / 2, closed);
  const right = offset(path, -width / 2, closed);
  if (closed) return [left, right];
  for (let index = right.length - 2; index >= 0; index -= 2) {
    left.push(right[index] ?? 0, right[index + 1] ?? 0);
  }
  return [left];
}

function offset(path: Ring, distance: number, closed: boolean): Ring {
  const count = path.length / 2;
  const out: Ring = [];
  const normal = (from: number, to: number): [number, number] => {
    const dx = (path[to * 2] ?? 0) - (path[from * 2] ?? 0);
    const dy = (path[to * 2 + 1] ?? 0) - (path[from * 2 + 1] ?? 0);
    const length = Math.hypot(dx, dy);
    return [-dy / length, dx / length];
  };

  for (let index = 0; index < count; index += 1) {
    const hasBefore = closed || index > 0;
    const hasAfter = closed || index < count - 1;
    const [ix, iy] = normal(
      hasBefore ? (index + count - 1) % count : index,
      hasBefore ? index : index + 1,
    );
    const [ox, oy] = normal(
      hasAfter ? index : index - 1,
      hasAfter ? (index + 1) % count : index,
    );
    const mx = ix + ox;
    const my = iy + oy;
    const length = Math.hypot(mx, my);
    const scale = distance / ((mx / length) * ix + (my / length) * iy);
    out.push(
      (path[index * 2] ?? 0) + (mx / length) * scale,
      (path[index * 2 + 1] ?? 0) + (my / length) * scale,
    );
  }
  return out;
}
