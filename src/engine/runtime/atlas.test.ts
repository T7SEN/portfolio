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
import { fillShare, layers } from "./shapes";
import type { Layer } from "./shapes/draw";

/**
 * A sampler of a box from (x0, y0) to (x1, y1), its points on an even grid,
 * every point in layer 0.
 */
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
    return { points, layer: new Uint8Array(count) };
  };
}

/** One layer of one ring, weight 1. */
function one(ring: number[]): (id: ShapeId) => Layer[] {
  return () => [{ weight: 1, rings: [ring] }];
}

function pointOf(data: Float32Array, shape: number, point: number) {
  const at = (shape * POINTS_PER_SHAPE + point) * 4;
  return [
    data[at] ?? NaN,
    data[at + 1] ?? NaN,
    data[at + 2] ?? NaN,
    data[at + 3] ?? NaN,
  ] as const;
}

const IDS: ShapeId[] = ["logo", "wordmark", ...WORK_SHAPES];
// The real atlas is made once: it samples every shape and measures its rims.
const real = packAtlas();

describe("the shape atlas", () => {
  test("REQ-SCR-07 REQ-SCR-01 holds exactly the mark, the wordmark and the three full studies' shapes, each in its own band of rows, at a size every WebGL2 device reads", () => {
    expect(ATLAS_SHAPES).toEqual(IDS);
    expect(ATLAS_SHAPES).not.toContain("t7sen-url");
    expect(ATLAS_SHAPES).not.toContain("systemseven");
    expect(real.width).toBe(ATLAS_WIDTH);
    expect(real.width).toBeLessThanOrEqual(2048);
    expect(real.height).toBe(ROWS_PER_SHAPE * ATLAS_SHAPES.length);
    expect(real.height).toBe(80);
    expect(real.height).toBeLessThanOrEqual(2048);
    expect(Number.isInteger(ROWS_PER_SHAPE)).toBe(true);
    expect(real.data).toHaveLength(real.width * real.height * 4);
    ATLAS_SHAPES.forEach((id, index) => {
      expect(real.index[id]).toBe(index);
    });
    expect(Object.keys(real.extents).sort()).toEqual([...IDS].sort());
  });

  test("REQ-SCR-01 REQ-ENG-05 every shape's band holds POINTS_PER_SHAPE points of its own, all finite", () => {
    for (const [index, id] of ATLAS_SHAPES.entries()) {
      const seen = new Set<string>();
      for (let point = 0; point < POINTS_PER_SHAPE; point += 1) {
        const [x, y, edge, layer] = pointOf(real.data, index, point);
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(edge).toBeGreaterThanOrEqual(0);
        expect(edge).toBeLessThanOrEqual(1);
        expect(layer).toBeGreaterThan(0);
        expect(layer).toBeLessThanOrEqual(1);
        seen.add(`${x},${y}`);
      }
      // The sampler gave the full count, so no point is repeated.
      expect(seen.size, id).toBe(POINTS_PER_SHAPE);
    }
  });

  test("REQ-SCR-01 centres each shape on its own box and measures its size and area", () => {
    // A box off to one side, a quarter of the square.
    const atlas = packAtlas(square(0, 0, 1, 1), one([0, 0, 1, 0, 1, 1, 0, 1]));

    for (const [index, id] of ATLAS_SHAPES.entries()) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let point = 0; point < POINTS_PER_SHAPE; point += 1) {
        const [x, y, edge, layer] = pointOf(atlas.data, index, point);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        expect(edge).toBeGreaterThanOrEqual(0);
        expect(edge).toBeLessThanOrEqual(1);
        expect(layer).toBe(1);
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
      // The real fill share of each shape scales the area that sets its
      // light (story.ts, lightArea).
      expect(extent.fillArea).toBeCloseTo(extent.area * fillShare(id), 9);
    }
  });

  test("REQ-SCR-07 REQ-A11Y-06 the mark and the wordmark keep the light their area gives them; a study shape's light follows its front layer's fill", () => {
    for (const id of ["logo", "wordmark"] as const) {
      expect(real.extents[id].fillArea).toBe(real.extents[id].area);
    }
    // The layers behind the front show a faint fill, only where nothing in
    // front covers them, so the front's fill is denser than the shape's
    // points spread over its whole area would be: each counts over less
    // area than it covers, and the front's fill gets the light to reach the
    // glow tone.
    for (const id of WORK_SHAPES) {
      const extent = real.extents[id];
      expect(extent.fillArea ?? 0).toBeLessThan(extent.area);
      expect(extent.fillArea ?? 0).toBeGreaterThan(0);
    }
  });

  test("REQ-SCR-07 the third channel lights each shape's rim: 1 at the outline, 0 from its RIM_DEPTH inward", () => {
    const atlas = packAtlas(
      square(-1, -1, 1, 1),
      one([-1, -1, 1, -1, 1, 1, -1, 1]),
    );
    for (const [index, id] of ATLAS_SHAPES.entries()) {
      const depth = RIM_DEPTH[id];
      let rim = 0;
      for (let point = 0; point < POINTS_PER_SHAPE; point += 1) {
        const [x, y, edge] = pointOf(atlas.data, index, point);
        const inward = 1 - Math.max(Math.abs(x), Math.abs(y));
        if (inward > depth + 0.02) expect(edge).toBe(0);
        if (inward < 0.005) expect(edge).toBeGreaterThan(0.9);
        if (edge > 0.5) rim += 1;
      }
      // Half the rim depth, along the four sides of a square of area 4, is
      // about the depth's own share of the square.
      expect(rim / POINTS_PER_SHAPE).toBeGreaterThan(depth * 0.5);
      expect(rim / POINTS_PER_SHAPE).toBeLessThan(depth * 2.5);
    }
  });

  test("REQ-SCR-01 REQ-ENG-05 the fourth channel carries each point's layer weight, 1 for the front layer", () => {
    // Two layers: the even points in a back layer of weight 0.4, the odd
    // ones in the front layer.
    const stacked = (id: ShapeId, count: number) => {
      const { points } = square(-1, -1, 1, 1)(id, count);
      const layer = new Uint8Array(count);
      for (let index = 1; index < count; index += 2) layer[index] = 1;
      return { points, layer };
    };
    const ring = [-1, -1, 1, -1, 1, 1, -1, 1];
    const atlas = packAtlas(stacked, () => [
      { weight: 0.4, rings: [ring] },
      { weight: 1, rings: [ring] },
    ]);
    for (const point of [0, 1, 2, 3, 100, 101]) {
      const [, , , layer] = pointOf(atlas.data, 0, point);
      expect(layer).toBeCloseTo(point % 2 === 0 ? 0.4 : 1, 6);
    }
  });

  test("REQ-SCR-01 the real atlas gives each shape exactly its layers' weights, and every shape a front layer", () => {
    for (const [index, id] of ATLAS_SHAPES.entries()) {
      const weights = new Set<number>();
      let front = 0;
      for (let point = 0; point < POINTS_PER_SHAPE; point += 1) {
        const [, , , layer] = pointOf(real.data, index, point);
        weights.add(Math.round(layer * 1000) / 1000);
        if (layer === 1) front += 1;
      }
      const expected = new Set(layers(id).map((layer) => layer.weight));
      expect([...weights].sort(), id).toEqual([...expected].sort());
      // ArcheLab's front layer is its middle line, a twentieth of its points.
      expect(front, id).toBeGreaterThan(POINTS_PER_SHAPE * 0.05);
    }
    // The mark and the wordmark are one layer each, all in front.
    for (const id of ["logo", "wordmark"] as const) {
      const index = real.index[id];
      for (let point = 0; point < POINTS_PER_SHAPE; point += 97) {
        expect(pointOf(real.data, index, point)[3]).toBe(1);
      }
    }
  });

  test("REQ-SCR-01 a sampler that gives too few points has them repeated, never left at the origin", () => {
    const few = (id: ShapeId, count: number) => {
      void count;
      void id;
      return {
        points: new Float32Array([0.5, 0.5, -0.5, -0.5]),
        layer: new Uint8Array(2),
      };
    };
    const atlas = packAtlas(few, one([-1, -1, 1, -1, 1, 1, -1, 1]));
    const [x0, y0] = pointOf(atlas.data, 0, 0);
    const [x1, y1] = pointOf(atlas.data, 0, 1);
    const [x2, y2] = pointOf(atlas.data, 0, 2);
    expect([x0, y0]).toEqual([0.5, 0.5]);
    expect([x1, y1]).toEqual([-0.5, -0.5]);
    expect([x2, y2]).toEqual([0.5, 0.5]);

    // A stray number past the last whole point is left out, never read as
    // half a point.
    const odd = packAtlas(
      () => ({
        points: new Float32Array([0.25, 0.25, 0.75]),
        layer: new Uint8Array(1),
      }),
      one([-1, -1, 1, -1, 1, 1, -1, 1]),
    );
    for (const point of [0, 1, 2]) {
      const [x, y] = pointOf(odd.data, 0, point);
      expect([x, y]).toEqual([0, 0]);
    }
  });

  test("REQ-SCR-01 the drawn shapes fit the sample square and fill part of it", () => {
    for (const id of ATLAS_SHAPES) {
      const extent = real.extents[id];
      expect(extent.halfWidth).toBeGreaterThan(0);
      expect(extent.halfWidth).toBeLessThanOrEqual(1);
      expect(extent.halfHeight).toBeGreaterThan(0);
      expect(extent.halfHeight).toBeLessThanOrEqual(1);
      expect(extent.area).toBeGreaterThan(0);
      expect(extent.area).toBeLessThanOrEqual(
        4 * extent.halfWidth * extent.halfHeight + 0.2,
      );
    }
    expect(Array.from(real.data).every(Number.isFinite)).toBe(true);
  });

  test("REQ-SCR-07 the wordmark spans the sample square's width at its own proportions, the mark its own", () => {
    const wordmark = real.extents.wordmark;
    expect(wordmark.halfWidth).toBeGreaterThan(0.99);
    // Unbounded Bold sets T7SEN 4,176 font units wide and 782 tall,
    // overshoot included; the points reach a little short of the outline.
    expect(wordmark.halfWidth / wordmark.halfHeight).toBeGreaterThan(5.2);
    expect(wordmark.halfWidth / wordmark.halfHeight).toBeLessThan(5.5);
    const logo = real.extents.logo;
    expect(logo.halfWidth / logo.halfHeight).toBeCloseTo(464.22 / 442.36, 1);
  });

  test("REQ-SCR-07 each shape's rim is a band along its outline, never the whole shape", () => {
    for (const [index, id] of ATLAS_SHAPES.entries()) {
      let lit = 0;
      for (let point = 0; point < POINTS_PER_SHAPE; point += 1) {
        if (pointOf(real.data, index, point)[2] > 0.5) lit += 1;
      }
      const share = lit / POINTS_PER_SHAPE;
      expect(share, id).toBeGreaterThan(0.02);
      expect(share, id).toBeLessThan(0.6);
    }
  });
});
