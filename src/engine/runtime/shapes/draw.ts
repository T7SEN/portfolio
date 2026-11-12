/**
 * A closed polygon as x, y pairs in drawing units with y down, the order an
 * SVG polygon's points attribute uses. The last point joins the first.
 */
export type Ring = number[];

/**
 * One layer of a shape: rings filled by the even-odd rule, and how far
 * forward the layer sits, 1 for the front. A layer's fill hides behind any
 * layer with a greater weight, as the preview's sheets and cards cover the
 * ones behind them; its outline shows through, so the overlap of two
 * outlines, or of an outline and the fill in front, reads brighter.
 */
export interface Layer {
  rings: Ring[];
  weight: number;
  /**
   * How dense the layer's fill is against a front layer's fill of 1, before
   * its weight: low for the faint dotted fill of a sheet or card behind.
   * 1 when left out.
   */
  fill?: number;
  /**
   * How dense its outline is, in the same terms, along a band EDGE_BAND
   * wide (shapes/index.ts): the dotted border the preview draws round each
   * sheet, card and the bubble. 0 when left out.
   */
  edge?: number;
}

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
