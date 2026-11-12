import type { Layer, Ring } from "./draw";

// How near each sampled point lies to its shape's outline, for the rim light
// (field.ts). Measuring every point against every segment of a drawn mark
// costs millions of steps per shape, so the shape is filled into a grid once
// and an exact distance transform gives every cell its distance to the
// outside; each point then reads its own cell. Linear in the grid's cells,
// on the CPU, once per runtime.

/** Cells along each side of the grid. */
export const EDGE_GRID = 256;
// The grid reaches a little past the sample square of -1 to 1: every fitted
// shape touches that square on two sides, and the cells beyond them must be
// outside, or those sides would have no rim.
export const GRID_EXTENT = 1.02;
const EXTENT = GRID_EXTENT;

const FAR = 1e20;

/** Even-odd fill of the rings at each cell's centre: 1 inside, 0 outside. */
export function fillGrid(rings: readonly Ring[], grid = EDGE_GRID): Uint8Array {
  const inside = new Uint8Array(grid * grid);
  const cell = (2 * EXTENT) / grid;
  const crossings: number[] = [];
  for (let row = 0; row < grid; row += 1) {
    const y = -EXTENT + (row + 0.5) * cell;
    crossings.length = 0;
    for (const ring of rings) {
      const points = ring.length / 2;
      for (let index = 0; index < points; index += 1) {
        const x0 = ring[index * 2] ?? 0;
        const y0 = ring[index * 2 + 1] ?? 0;
        const next = (index + 1) % points;
        const x1 = ring[next * 2] ?? 0;
        const y1 = ring[next * 2 + 1] ?? 0;
        // Half open, so a vertex on the row counts once.
        if (y0 <= y !== y1 <= y) {
          crossings.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
    }
    crossings.sort((a, b) => a - b);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const from = crossings[pair] ?? 0;
      const to = crossings[pair + 1] ?? 0;
      const first = Math.max(Math.ceil((from + EXTENT) / cell - 0.5), 0);
      const last = Math.min(Math.floor((to + EXTENT) / cell - 0.5), grid - 1);
      for (let column = first; column <= last; column += 1) {
        inside[row * grid + column] = 1;
      }
    }
  }
  return inside;
}

// The squared distance transform of one line (Felzenszwalb and Huttenlocher,
// "Distance Transforms of Sampled Functions", 2012): the lower envelope of
// the parabolas rooted at each sample.
function transformLine(
  values: Float64Array,
  length: number,
  out: Float64Array,
  roots: Int32Array,
  bounds: Float64Array,
): void {
  const meet = (q: number, root: number) =>
    ((values[q] ?? FAR) + q * q - ((values[root] ?? FAR) + root * root)) /
    (2 * q - 2 * root);
  let hull = 0;
  roots[0] = 0;
  bounds[0] = -FAR;
  bounds[1] = FAR;
  for (let q = 1; q < length; q += 1) {
    let crossing = meet(q, roots[hull] ?? 0);
    // bounds[0] is -FAR, so this stops at the first parabola at the latest.
    while (crossing <= (bounds[hull] ?? -FAR)) {
      hull -= 1;
      crossing = meet(q, roots[hull] ?? 0);
    }
    hull += 1;
    roots[hull] = q;
    bounds[hull] = crossing;
    bounds[hull + 1] = FAR;
  }
  hull = 0;
  for (let q = 0; q < length; q += 1) {
    while ((bounds[hull + 1] ?? FAR) < q) hull += 1;
    const root = roots[hull] ?? 0;
    out[q] = (q - root) * (q - root) + (values[root] ?? FAR);
  }
}

/**
 * Each cell's distance, in cells, from its centre to the nearest outside
 * cell's centre; 0 outside the shape.
 */
export function distanceInside(
  inside: Uint8Array,
  grid = EDGE_GRID,
): Float64Array {
  const squared = new Float64Array(grid * grid);
  for (let index = 0; index < squared.length; index += 1) {
    squared[index] = inside[index] === 1 ? FAR : 0;
  }
  const line = new Float64Array(grid);
  const out = new Float64Array(grid);
  const roots = new Int32Array(grid);
  const bounds = new Float64Array(grid + 1);
  for (let column = 0; column < grid; column += 1) {
    for (let row = 0; row < grid; row += 1) {
      line[row] = squared[row * grid + column] ?? 0;
    }
    transformLine(line, grid, out, roots, bounds);
    for (let row = 0; row < grid; row += 1) {
      squared[row * grid + column] = out[row] ?? 0;
    }
  }
  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      line[column] = squared[row * grid + column] ?? 0;
    }
    transformLine(line, grid, out, roots, bounds);
    for (let column = 0; column < grid; column += 1) {
      squared[row * grid + column] = Math.sqrt(out[column] ?? 0);
    }
  }
  return squared;
}

/**
 * One weight per point: 1 on the shape's outline, falling smoothly to 0 at
 * `depth` inside it, in the sample space of -1 to 1. Points come as x, y
 * pairs in that same space, as sampleShape gives them.
 */
export function edgeWeights(
  rings: readonly Ring[],
  points: Float32Array,
  depth: number,
  grid = EDGE_GRID,
): Float32Array {
  const distances = distanceInside(fillGrid(rings, grid), grid);
  const cell = (2 * EXTENT) / grid;
  const weights = new Float32Array(Math.floor(points.length / 2));
  for (let point = 0; point < weights.length; point += 1) {
    const column = Math.min(
      Math.max(Math.floor(((points[point * 2] ?? 0) + EXTENT) / cell), 0),
      grid - 1,
    );
    const row = Math.min(
      Math.max(Math.floor(((points[point * 2 + 1] ?? 0) + EXTENT) / cell), 0),
      grid - 1,
    );
    // The outline runs half a cell outside the last inside centre.
    const inward = Math.max(
      ((distances[row * grid + column] ?? 0) - 0.5) * cell,
      0,
    );
    const t = Math.min(inward / depth, 1);
    weights[point] = 1 - t * t * (3 - 2 * t);
  }
  return weights;
}

/**
 * Edge weights for a layered shape: each point is measured against its own
 * layer's outline, so every sheet of a stack keeps its rim where another
 * sheet lies over it. layerOf gives each point's index in `layers`; a point
 * whose layer is missing weighs 0.
 */
export function layerEdgeWeights(
  layers: readonly Layer[],
  points: Float32Array,
  layerOf: Uint8Array,
  depth: number,
  grid = EDGE_GRID,
): Float32Array {
  const count = Math.floor(points.length / 2);
  const weights = new Float32Array(count);
  layers.forEach((layer, index) => {
    const members: number[] = [];
    for (let point = 0; point < count; point += 1) {
      if (layerOf[point] === index) members.push(point);
    }
    if (members.length === 0) return;
    const own = new Float32Array(members.length * 2);
    members.forEach((point, at) => {
      own[at * 2] = points[point * 2] ?? 0;
      own[at * 2 + 1] = points[point * 2 + 1] ?? 0;
    });
    const measured = edgeWeights(layer.rings, own, depth, grid);
    members.forEach((point, at) => {
      weights[point] = measured[at] ?? 0;
    });
  });
  return weights;
}
