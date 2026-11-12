import type { ShapeId } from "../../story";
import type { Layer, Ring } from "./draw";
import { EDGE_GRID, GRID_EXTENT, fillGrid } from "./edge";
import { MARKS } from "./marks";

/**
 * How wide the band a layer's outline points spread over, in the sampler's
 * space, where a shape's longer side is 2: about one halftone cell where a
 * study frame draws its shape at 1280 px (half its 520 px is 1, so 0.03 is
 * 8 px).
 */
export const EDGE_BAND = 0.03;

/**
 * A shape's layers as the sampler uses them: every layer moved and scaled
 * together, so the whole shape is centred on the origin with its longer side
 * running from -1 to 1 and the other keeping its proportion, with y up.
 */
export function layers(id: ShapeId): Layer[] {
  const source = MARKS[id];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layer of source) {
    for (const ring of layer.rings) {
      for (let index = 0; index < ring.length; index += 2) {
        const x = ring[index] ?? 0;
        const y = ring[index + 1] ?? 0;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const scale = 2 / Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return source.map((layer) => ({
    weight: layer.weight,
    fill: layer.fill ?? 1,
    edge: layer.edge ?? 0,
    rings: layer.rings.map((ring) =>
      ring.map((value, index) =>
        index % 2 === 0 ? (value - cx) * scale : (cy - value) * scale,
      ),
    ),
  }));
}

/** Every ring of a shape, all its layers together, in the sampler's space. */
export function outline(id: ShapeId): Ring[] {
  return layers(id).flatMap((layer) => layer.rings);
}

/**
 * Cuts the even-odd filled area into trapezoids with level tops and bottoms:
 * between two heights where no edge starts, ends or crosses another, the
 * edges keep their left to right order, so they pair up into strips. Each
 * trapezoid takes six numbers: bottom, top, then the left and right x at the
 * bottom and at the top.
 */
function trapezoids(rings: Ring[]): { strips: number[]; areas: number[] } {
  const edges: number[][] = [];
  const heights: number[] = [];
  for (const ring of rings) {
    const count = ring.length / 2;
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      const x0 = ring[index * 2] ?? 0;
      const y0 = ring[index * 2 + 1] ?? 0;
      const x1 = ring[next * 2] ?? 0;
      const y1 = ring[next * 2 + 1] ?? 0;
      heights.push(y0);
      if (y0 < y1) edges.push([x0, y0, x1, y1]);
      else if (y1 < y0) edges.push([x1, y1, x0, y0]);
    }
  }
  edges.sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));

  // Rings drawn by hand may cross; each crossing height becomes a cut too.
  for (let i = 0; i < edges.length; i += 1) {
    const [ax = 0, ay = 0, bx = 0, by = 0] = edges[i] ?? [];
    for (let j = i + 1; j < edges.length; j += 1) {
      const [cx = 0, cy = 0, dx = 0, dy = 0] = edges[j] ?? [];
      if (cy >= by) break;
      const denominator = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
      if (denominator === 0) continue;
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denominator;
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denominator;
      if (t > 0 && t < 1 && u > 0 && u < 1) heights.push(ay + t * (by - ay));
    }
  }

  const levels = [...new Set(heights)].sort((a, b) => a - b);
  const strips: number[] = [];
  const areas: number[] = [];
  let active: number[][] = [];
  let next = 0;
  for (let level = 0; level < levels.length - 1; level += 1) {
    const bottom = levels[level] ?? 0;
    const top = levels[level + 1] ?? 0;
    const middle = (bottom + top) / 2;
    while (next < edges.length && (edges[next]?.[1] ?? 0) < middle) {
      active.push(edges[next] ?? []);
      next += 1;
    }
    active = active.filter((edge) => (edge[3] ?? 0) > middle);
    const crossings = active
      .map(([x0 = 0, y0 = 0, x1 = 0, y1 = 0]) => {
        const at = (y: number) => x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
        return [at(bottom), at(top), at(middle)];
      })
      .sort((a, b) => (a[2] ?? 0) - (b[2] ?? 0));
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const [left0 = 0, left1 = 0] = crossings[index] ?? [];
      const [right0 = 0, right1 = 0] = crossings[index + 1] ?? [];
      const area = ((right0 - left0 + right1 - left1) * (top - bottom)) / 2;
      if (area <= 0) continue;
      strips.push(bottom, top, left0, right0, left1, right1);
      areas.push(area);
    }
  }
  return { strips, areas };
}

/** A small seeded generator (mulberry32), giving numbers strictly between 0 and 1. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (((value ^ (value >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
}

function seedFor(id: string, count: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193);
  }
  return hash ^ Math.imul(count, 0x9e3779b1);
}

/**
 * Splits a count into whole shares in proportion to the weights, the
 * remainders going to the largest fractions, so the parts add up exactly.
 */
function apportion(count: number, weights: readonly number[]): number[] {
  const whole = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(whole > 0)) return weights.map((_, index) => (index === 0 ? count : 0));
  const exact = weights.map((weight) => (count * weight) / whole);
  const parts = exact.map(Math.floor);
  let left = count - parts.reduce((sum, part) => sum + part, 0);
  const order = exact
    .map((value, index) => [value - Math.floor(value), index] as const)
    .sort((a, b) => b[0] - a[0]);
  for (const [, index] of order) {
    if (left <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    left -= 1;
  }
  return parts;
}

/** A shape's points, the layer each one belongs to, and its outline points. */
export interface ShapeSample {
  /** Two numbers per point, x then y, each from -1 to 1 with y up. */
  points: Float32Array;
  /** One per point: its index in layers(id). */
  layer: Uint8Array;
  /** One per point: 1 when it lies on its layer's outline, 0 in its fill. */
  edge: Uint8Array;
}

/** What a layer gives its shape's sample, in the sampler's space. */
export interface LayerBudget {
  /** The layer's filled area. */
  area: number;
  /** The length of its rings. */
  perimeter: number;
  /** The share of its area no layer with a greater weight covers. */
  visible: number;
  /**
   * Its share of the shape's points, before they are counted out: its fill
   * where it shows, and its outline's band, each at its density and weight.
   */
  fillUnits: number;
  edgeUnits: number;
}

interface Plan {
  shape: Layer[];
  pieces: Array<{ strips: number[]; areas: number[] }>;
  budgets: LayerBudget[];
  /** For each layer, the grid cells a layer in front of it covers, or null. */
  hidden: Array<Uint8Array | null>;
  /** The area all the layers cover together. */
  union: number;
}

const plans = new Map<ShapeId, Plan>();

function perimeterOf(rings: readonly Ring[]): number {
  let length = 0;
  for (const ring of rings) {
    const count = ring.length / 2;
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      length += Math.hypot(
        (ring[next * 2] ?? 0) - (ring[index * 2] ?? 0),
        (ring[next * 2 + 1] ?? 0) - (ring[index * 2 + 1] ?? 0),
      );
    }
  }
  return length;
}

/**
 * Each layer's budget, the cells the layers in front of it cover, and the
 * area the whole shape covers: exact for one layer, counted on the edge
 * grid (2.04 / 256 a cell) for several, whose rings overlap.
 */
function planFor(id: ShapeId): Plan {
  const cached = plans.get(id);
  if (cached !== undefined) return cached;
  const shape = layers(id);
  const pieces = shape.map((layer) => trapezoids(layer.rings));
  const cells = EDGE_GRID * EDGE_GRID;
  const cellArea = ((2 * GRID_EXTENT) / EDGE_GRID) ** 2;
  const grids =
    shape.length > 1 ? shape.map((layer) => fillGrid(layer.rings)) : [];
  const hidden = shape.map((layer) => {
    if (!shape.some((other) => other.weight > layer.weight)) return null;
    const cover = new Uint8Array(cells);
    shape.forEach((other, at) => {
      const grid = grids[at];
      if (other.weight <= layer.weight || grid === undefined) return;
      for (let cell = 0; cell < cells; cell += 1) {
        if (grid[cell] === 1) cover[cell] = 1;
      }
    });
    return cover;
  });
  const budgets = shape.map((layer, index) => {
    const area = (pieces[index]?.areas ?? []).reduce(
      (sum, piece) => sum + piece,
      0,
    );
    const own = grids[index];
    const cover = hidden[index];
    let visible = 1;
    if (own !== undefined && cover !== null && cover !== undefined) {
      let inside = 0;
      let shown = 0;
      for (let cell = 0; cell < cells; cell += 1) {
        if (own[cell] !== 1) continue;
        inside += 1;
        if (cover[cell] !== 1) shown += 1;
      }
      visible = inside > 0 ? shown / inside : 1;
    }
    const weight = Math.max(layer.weight, 0);
    const perimeter = perimeterOf(layer.rings);
    return {
      area,
      perimeter,
      visible,
      fillUnits: weight * Math.max(layer.fill ?? 1, 0) * area * visible,
      edgeUnits: weight * Math.max(layer.edge ?? 0, 0) * perimeter * EDGE_BAND,
    };
  });
  let union = budgets[0]?.area ?? 0;
  if (shape.length > 1) {
    let covered = 0;
    for (let cell = 0; cell < cells; cell += 1) {
      if (grids.some((grid) => grid[cell] === 1)) covered += 1;
    }
    union = covered * cellArea;
  }
  const plan = { shape, pieces, budgets, hidden, union };
  plans.set(id, plan);
  return plan;
}

/** Each layer's budget for a shape (layerBudgets(id)[i] is layers(id)[i]'s). */
export function layerBudgets(id: ShapeId): LayerBudget[] {
  return planFor(id).budgets;
}

/**
 * How a shape's light is set (story.ts, ShapeExtent fillArea): the area its
 * points would cover at a front layer's fill density, as a share of the
 * area the whole shape covers. 1 for a shape of one plain layer, so the
 * mark and the wordmark keep the light their area gives them; more where
 * outlines and layers behind add points beyond the front's fill.
 */
export function fillShare(id: ShapeId): number {
  const { budgets, union } = planFor(id);
  const units = budgets.reduce(
    (sum, budget) => sum + budget.fillUnits + budget.edgeUnits,
    0,
  );
  return union > 0 ? units / union : 1;
}

/** True where a point lies in a cell the given cover marks. */
function isCovered(cover: Uint8Array, x: number, y: number): boolean {
  const cell = (2 * GRID_EXTENT) / EDGE_GRID;
  const column = Math.floor((x + GRID_EXTENT) / cell);
  const row = Math.floor((y + GRID_EXTENT) / cell);
  if (column < 0 || row < 0 || column >= EDGE_GRID || row >= EDGE_GRID) {
    return false;
  }
  return cover[row * EDGE_GRID + column] === 1;
}

/**
 * Points spread over a layer's filled area: each in its own equal share of
 * the area, taken in order through the trapezoids, so no part of a thin
 * stroke is left bare.
 */
function spreadOver(
  { strips, areas }: { strips: number[]; areas: number[] },
  count: number,
  random: () => number,
  emit: (x: number, y: number) => void,
) {
  const whole = areas.reduce((sum, area) => sum + area, 0);
  let strip = 0;
  let before = 0;
  for (let index = 0; index < count; index += 1) {
    const target = ((index + random()) / count) * whole;
    while (strip < areas.length - 1 && before + (areas[strip] ?? 0) < target) {
      before += areas[strip] ?? 0;
      strip += 1;
    }
    const share = Math.min(
      Math.max((target - before) / (areas[strip] ?? 1), 0),
      1,
    );
    const at = strip * 6;
    const bottom = strips[at] ?? 0;
    const top = strips[at + 1] ?? 0;
    const left0 = strips[at + 2] ?? 0;
    const right0 = strips[at + 3] ?? 0;
    const left1 = strips[at + 4] ?? 0;
    const right1 = strips[at + 5] ?? 0;
    // The width changes linearly with height, so the height that leaves
    // `share` of the area below it solves a quadratic; this form of the
    // root stays exact when the two widths are equal or one is zero.
    const width0 = right0 - left0;
    const width1 = right1 - left1;
    const root = Math.sqrt(
      (1 - share) * width0 * width0 + share * width1 * width1,
    );
    const height =
      root + width0 > 0 ? (share * (width0 + width1)) / (width0 + root) : 0;
    const across = random();
    const left = left0 + (left1 - left0) * height;
    const right = right0 + (right1 - right0) * height;
    emit(left + (right - left) * across, bottom + (top - bottom) * height);
  }
}

/**
 * Points along a layer's rings, evenly by length, each moved across the
 * outline by up to half of EDGE_BAND either way.
 */
function spreadAlong(
  rings: readonly Ring[],
  count: number,
  random: () => number,
  emit: (x: number, y: number) => void,
) {
  const segments: number[][] = [];
  let length = 0;
  for (const ring of rings) {
    const points = ring.length / 2;
    for (let index = 0; index < points; index += 1) {
      const next = (index + 1) % points;
      const x0 = ring[index * 2] ?? 0;
      const y0 = ring[index * 2 + 1] ?? 0;
      const x1 = ring[next * 2] ?? 0;
      const y1 = ring[next * 2 + 1] ?? 0;
      const span = Math.hypot(x1 - x0, y1 - y0);
      if (span === 0) continue;
      segments.push([x0, y0, x1, y1, length, span]);
      length += span;
    }
  }
  let segment = 0;
  for (let index = 0; index < count && segments.length > 0; index += 1) {
    const target = ((index + random()) / count) * length;
    while (
      segment < segments.length - 1 &&
      (segments[segment]?.[4] ?? 0) + (segments[segment]?.[5] ?? 0) < target
    ) {
      segment += 1;
    }
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0, start = 0, span = 1] =
      segments[segment] ?? [];
    const along = Math.min(Math.max((target - start) / span, 0), 1);
    const offset = (random() - 0.5) * EDGE_BAND;
    emit(
      x0 + (x1 - x0) * along - ((y1 - y0) / span) * offset,
      y0 + (y1 - y0) * along + ((x1 - x0) / span) * offset,
    );
  }
}

/**
 * Points for every layer of a shape, fitted inside the square of -1 to 1
 * around the origin and kept to the shape's proportions. Each layer's fill
 * is spread evenly over the part of its area no layer in front of it
 * covers, at its fill density times its weight, so a back layer is drawn
 * sparser than the front and never piles up under it; its outline takes
 * points evenly along its rings at its edge density times its weight. The
 * same id and count always give the same points.
 *
 * The order is then shuffled, so a point's index says nothing about where
 * it sits or which layer it belongs to.
 */
export function sampleLayers(id: ShapeId, count: number): ShapeSample {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const points = new Float32Array(total * 2);
  const layerOf = new Uint8Array(total);
  const edgeOf = new Uint8Array(total);
  const { shape, pieces, budgets, hidden } = planFor(id);
  const counts = apportion(
    total,
    budgets.flatMap((budget) => [budget.fillUnits, budget.edgeUnits]),
  );
  const random = generator(seedFor(id, total));

  let written = 0;
  const put = (x: number, y: number, layer: number, isEdge: boolean) => {
    points[written * 2] = Math.min(Math.max(x, -1), 1);
    points[written * 2 + 1] = Math.min(Math.max(y, -1), 1);
    layerOf[written] = layer;
    edgeOf[written] = isEdge ? 1 : 0;
    written += 1;
  };

  shape.forEach((layer, index) => {
    const piece = pieces[index] ?? { strips: [], areas: [] };
    const fillCount = counts[index * 2] ?? 0;
    const edgeCount = counts[index * 2 + 1] ?? 0;
    const cover = hidden[index] ?? null;

    if (cover === null) {
      spreadOver(piece, fillCount, random, (x, y) => put(x, y, index, false));
    } else if (fillCount > 0) {
      // More candidates than needed, evenly over the whole area; those a
      // layer in front covers are dropped, and the rest thinned evenly to
      // the count, so the part that shows is filled as evenly. The grid's
      // share of the area that shows is close, not exact, so a fifth more
      // are drawn, and a shortfall is made up one point at a time.
      const visible = Math.max(budgets[index]?.visible ?? 1, 1 / 64);
      const kept: number[] = [];
      const keep = (x: number, y: number) => {
        if (!isCovered(cover, x, y)) kept.push(x, y);
      };
      spreadOver(
        piece,
        Math.ceil((fillCount * 1.2) / visible) + 8,
        random,
        keep,
      );
      for (
        let tries = 0;
        kept.length / 2 < fillCount && tries < 64;
        tries += 1
      ) {
        spreadOver(piece, Math.ceil(1 / visible) + 1, random, keep);
      }
      const shown = kept.length / 2;
      for (let at = 0; at < fillCount; at += 1) {
        const from = shown > 0 ? Math.floor((at * shown) / fillCount) : 0;
        put(kept[from * 2] ?? 0, kept[from * 2 + 1] ?? 0, index, false);
      }
    }
    spreadAlong(layer.rings, edgeCount, random, (x, y) =>
      put(x, y, index, true),
    );
  });

  for (let index = total - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const x = points[index * 2] ?? 0;
    const y = points[index * 2 + 1] ?? 0;
    const layer = layerOf[index] ?? 0;
    const edge = edgeOf[index] ?? 0;
    points[index * 2] = points[other * 2] ?? 0;
    points[index * 2 + 1] = points[other * 2 + 1] ?? 0;
    layerOf[index] = layerOf[other] ?? 0;
    edgeOf[index] = edgeOf[other] ?? 0;
    points[other * 2] = x;
    points[other * 2 + 1] = y;
    layerOf[other] = layer;
    edgeOf[other] = edge;
  }
  return { points, layer: layerOf, edge: edgeOf };
}

/** The points of sampleLayers alone: two numbers per point, x then y. */
export function sampleShape(id: ShapeId, count: number): Float32Array {
  return sampleLayers(id, count).points;
}
