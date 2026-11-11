import { describe, expect, test } from "vitest";

import { WORK_SHAPES, type ShapeId } from "../story";
import {
  ATLAS_SHAPES,
  ATLAS_WIDTH,
  POINTS_PER_SHAPE,
  RIM_DEPTH,
  ROWS_PER_SHAPE,
  packAtlas,
} from "./atlas";

/** A square from (x0, y0) to (x1, y1), its points on an even grid. */
function square(x0: number, y0: number, x1: number, y1: number) {
  return (id: ShapeId, count: number) => {
    void id;
    const side = Math.ceil(Math.sqrt(count));
    const points = new Float32Array(count * 2);
    for (let index = 0; index < count; index += 1) {
      points[index * 2] = x0 + ((index % side) + 0.5) * ((x1 - x0) / side);
      points[index * 2 + 1] =
        y0 + (Math.floor(index / side) + 0.5) * ((y1 - y0) / side);
    }
    return points;
  };
}

function pointOf(data: Float32Array, shape: number, point: number) {
  const at = (shape * POINTS_PER_SHAPE + point) * 4;
  return [data[at] ?? NaN, data[at + 1] ?? NaN, data[at + 2], data[at + 3]];
}

describe("the shape atlas", () => {
  test("REQ-SCR-01 holds the mark and every study's shape, each in its own band of rows, at a size every WebGL2 device reads", () => {
    const atlas = packAtlas(square(-1, -1, 1, 1));

    expect(ATLAS_SHAPES).toEqual(["logo", ...WORK_SHAPES]);
    expect(atlas.width).toBe(ATLAS_WIDTH);
    expect(atlas.width).toBeLessThanOrEqual(2048);
    expect(atlas.height).toBe(ROWS_PER_SHAPE * ATLAS_SHAPES.length);
    expect(atlas.height).toBeLessThanOrEqual(2048);
    expect(Number.isInteger(ROWS_PER_SHAPE)).toBe(true);
    expect(atlas.data).toHaveLength(atlas.width * atlas.height * 4);
    ATLAS_SHAPES.forEach((id, index) => {
      expect(atlas.index[id]).toBe(index);
    });
  });

  test("REQ-SCR-01 centres each shape on its own box and measures its size and area", () => {
    // A box off to one side, a quarter of the square.
    const atlas = packAtlas(square(0, 0, 1, 1), () => [
      [0, 0, 1, 0, 1, 1, 0, 1],
    ]);

    for (const [index, id] of ATLAS_SHAPES.entries()) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let point = 0; point < POINTS_PER_SHAPE; point += 1) {
        const [x = 0, y = 0, z, w] = pointOf(atlas.data, index, point);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        expect(z).toBeGreaterThanOrEqual(0);
        expect(z).toBeLessThanOrEqual(1);
        expect(w).toBe(0);
      }
      expect(minX + maxX).toBeCloseTo(0, 5);
      expect(minY + maxY).toBeCloseTo(0, 5);

      const extent = atlas.extents[id];
      expect(extent.halfWidth).toBeCloseTo((maxX - minX) / 2, 5);
      expect(extent.halfHeight).toBeCloseTo((maxY - minY) / 2, 5);
      // The quarter square's area is 1; the count of filled cells may run
      // over by one cell row on two of its edges.
      expect(extent.area).toBeGreaterThan(0.95);
      expect(extent.area).toBeLessThan(1.1);
    }
  });

  test("REQ-SCR-07 the third channel lights each shape's rim: 1 at the outline, 0 from RIM_DEPTH inward", () => {
    const atlas = packAtlas(square(-1, -1, 1, 1), () => [
      [-1, -1, 1, -1, 1, 1, -1, 1],
    ]);
    let rim = 0;
    for (let point = 0; point < POINTS_PER_SHAPE; point += 1) {
      const [x = 0, y = 0, edge = NaN] = pointOf(atlas.data, 0, point);
      const inward = 1 - Math.max(Math.abs(x), Math.abs(y));
      if (inward > RIM_DEPTH + 0.02) expect(edge).toBe(0);
      if (inward < 0.005) expect(edge).toBeGreaterThan(0.9);
      if (edge > 0.5) rim += 1;
    }
    // The rim of a square of side 2, RIM_DEPTH deep, is about a sixteenth of it.
    expect(rim / POINTS_PER_SHAPE).toBeGreaterThan(0.02);
    expect(rim / POINTS_PER_SHAPE).toBeLessThan(0.12);
  });

  test("REQ-SCR-01 a sampler that gives too few points has them repeated, never left at the origin", () => {
    const few = (id: ShapeId, count: number) => {
      void count;
      void id;
      return new Float32Array([0.5, 0.5, -0.5, -0.5]);
    };
    const atlas = packAtlas(few);
    const [x0, y0] = pointOf(atlas.data, 0, 0);
    const [x1, y1] = pointOf(atlas.data, 0, 1);
    const [x2, y2] = pointOf(atlas.data, 0, 2);
    expect([x0, y0]).toEqual([0.5, 0.5]);
    expect([x1, y1]).toEqual([-0.5, -0.5]);
    expect([x2, y2]).toEqual([0.5, 0.5]);

    // A stray number past the last whole point is left out, never read as
    // half a point.
    const odd = packAtlas(() => new Float32Array([0.25, 0.25, 0.75]));
    for (const point of [0, 1, 2]) {
      const [x, y] = pointOf(odd.data, 0, point);
      expect([x, y]).toEqual([0, 0]);
    }
  });

  test("REQ-SCR-01 the drawn shapes fit the sample square and fill part of it", () => {
    const atlas = packAtlas();
    for (const id of ATLAS_SHAPES) {
      const extent = atlas.extents[id];
      expect(extent.halfWidth).toBeGreaterThan(0);
      expect(extent.halfWidth).toBeLessThanOrEqual(1);
      expect(extent.halfHeight).toBeGreaterThan(0);
      expect(extent.halfHeight).toBeLessThanOrEqual(1);
      expect(extent.area).toBeGreaterThan(0);
      expect(extent.area).toBeLessThanOrEqual(
        4 * extent.halfWidth * extent.halfHeight + 0.2,
      );
    }
    expect(Array.from(atlas.data).every(Number.isFinite)).toBe(true);
  });
});
