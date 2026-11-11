// The shape targets, packed for one small read-only texture. The compute
// node reads a particle's point with textureLoad at an index taken from the
// particle's own index, on both backends, so the shapes need no storage
// buffer of their own (REQ-ENG-05). No three.js here: the runtime makes the
// texture from this data.

import { WORK_SHAPES, type ShapeId } from "../story";
import { outline, sampleShape } from "./shapes";
import type { Ring } from "./shapes/draw";
import { edgeWeights } from "./shapes/edge";
import type { ShapeExtent } from "./story";

/** Every shape in the atlas, in row order. */
export const ATLAS_SHAPES: readonly ShapeId[] = ["logo", ...WORK_SHAPES];

// Sixteen thousand points per shape; a small jitter from each particle's
// seed fills the area between them for a million particles. At 4,096 the
// gaps between random points showed as clumps. 1,024 texels a row stays
// inside the 2,048 that every WebGL2 device must allow, and the whole atlas
// is 1,024 x 96 float texels, about 1.5 MB on the GPU, made on the CPU.
export const POINTS_PER_SHAPE = 16_384;
export const ATLAS_WIDTH = 1024;
export const ROWS_PER_SHAPE = POINTS_PER_SHAPE / ATLAS_WIDTH;

// The area estimate counts the cells of this grid over the sample square
// that hold a point. At 16,384 points most cells inside a shape hold several.
const AREA_GRID = 64;

// The rim light (field.ts) lifts points within this distance of a shape's
// outline, in the sample space of -1 to 1, where the shape's longer side is
// 2: a band about 3% of the shape deep.
export const RIM_DEPTH = 0.06;

export interface Atlas {
  /**
   * RGBA floats, one point a texel: x and y, centred on its own box; the
   * point's edge weight, 1 on the outline and 0 from RIM_DEPTH inward; 0.
   */
  data: Float32Array;
  width: number;
  height: number;
  extents: Record<ShapeId, ShapeExtent>;
  /** The atlas row band of each shape, as the index the compute node reads. */
  index: Record<ShapeId, number>;
}

function extentOf(points: Float32Array): {
  centreX: number;
  centreY: number;
  extent: ShapeExtent;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let point = 0; point + 1 < points.length; point += 2) {
    const x = points[point] ?? 0;
    const y = points[point + 1] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!(maxX >= minX) || !(maxY >= minY)) {
    return {
      centreX: 0,
      centreY: 0,
      extent: { halfWidth: 1, halfHeight: 1, area: 4 },
    };
  }

  const cell = 2 / AREA_GRID;
  const filled = new Set<number>();
  for (let point = 0; point + 1 < points.length; point += 2) {
    const column = Math.min(
      Math.floor(((points[point] ?? 0) + 1) / cell),
      AREA_GRID - 1,
    );
    const row = Math.min(
      Math.floor(((points[point + 1] ?? 0) + 1) / cell),
      AREA_GRID - 1,
    );
    filled.add(Math.max(row, 0) * AREA_GRID + Math.max(column, 0));
  }

  return {
    centreX: (minX + maxX) / 2,
    centreY: (minY + maxY) / 2,
    extent: {
      halfWidth: (maxX - minX) / 2,
      halfHeight: (maxY - minY) / 2,
      area: filled.size * cell * cell,
    },
  };
}

/**
 * Samples every shape once and lays the points out for the texture. Each
 * shape is centred on its own box, so a fitted shape sits in the middle of
 * the frame whatever margin its outline left in the sample square.
 */
export function packAtlas(
  sample: (id: ShapeId, count: number) => Float32Array = sampleShape,
  rings: (id: ShapeId) => Ring[] = outline,
): Atlas {
  const height = ROWS_PER_SHAPE * ATLAS_SHAPES.length;
  const data = new Float32Array(ATLAS_WIDTH * height * 4);
  const extents = {} as Record<ShapeId, ShapeExtent>;
  const index = {} as Record<ShapeId, number>;

  ATLAS_SHAPES.forEach((id, shape) => {
    const points = sample(id, POINTS_PER_SHAPE);
    const { centreX, centreY, extent } = extentOf(points);
    const edges = edgeWeights(rings(id), points, RIM_DEPTH);
    extents[id] = extent;
    index[id] = shape;

    const start = shape * POINTS_PER_SHAPE * 4;
    for (let point = 0; point < POINTS_PER_SHAPE; point += 1) {
      // A short sample list repeats its points rather than leaving holes
      // at the origin.
      const source = (point % Math.max(Math.floor(points.length / 2), 1)) * 2;
      data[start + point * 4] = (points[source] ?? 0) - centreX;
      data[start + point * 4 + 1] = (points[source + 1] ?? 0) - centreY;
      data[start + point * 4 + 2] = edges[source / 2] ?? 0;
    }
  });

  return { data, width: ATLAS_WIDTH, height, extents, index };
}
