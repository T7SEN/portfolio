import { describe, expect, test } from "vitest";

import { distanceInside, edgeWeights, fillGrid } from "./edge";
import { outline, sampleShape } from "./index";

// A square from -0.5 to 0.5, and the same square with a square hole.
const square = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
const hole = [-0.25, -0.25, 0.25, -0.25, 0.25, 0.25, -0.25, 0.25];

describe("edge weights for the rim light", () => {
  test("REQ-SCR-07 the fill follows the even-odd rule, a ring inside a ring is a hole", () => {
    const grid = 8;
    const solid = fillGrid([square], grid);
    // Cells 2 to 5 have their centres inside -0.5 to 0.5.
    expect(solid.reduce((sum, cell) => sum + cell, 0)).toBe(16);
    const framed = fillGrid([square, hole], grid);
    expect(framed.reduce((sum, cell) => sum + cell, 0)).toBe(12);
    expect(framed[3 * grid + 3]).toBe(0);
  });

  test("REQ-SCR-07 the distance transform is exact: the centre of a square is farthest from the outside", () => {
    const grid = 16;
    const distances = distanceInside(fillGrid([square], grid), grid);
    // Inside cells run 4 to 11; the outside starts at 3 and 12.
    expect(distances[0]).toBe(0);
    expect(distances[4 * grid + 4]).toBe(1);
    expect(distances[4 * grid + 8]).toBe(1);
    expect(distances[7 * grid + 7]).toBe(4);
    expect(distances[6 * grid + 5]).toBe(2);
  });

  test("REQ-SCR-07 points on the outline weigh 1, deep points 0, and the weight only falls inward", () => {
    const points = new Float32Array(
      [
        [0.499, 0], // on the right edge
        [0, -0.499], // on the bottom edge
        [0, 0], // the middle
        [0.45, 0], // just inside
        [0.4, 0], // further in
      ].flat(),
    );
    const weights = edgeWeights([square], points, 0.1);
    expect(weights[0]).toBeGreaterThan(0.95);
    expect(weights[1]).toBeGreaterThan(0.95);
    expect(weights[2]).toBe(0);
    expect(weights[3]).toBeLessThan(weights[0] ?? 0);
    expect(weights[4]).toBeLessThan(weights[3] ?? 0);
  });

  test("REQ-SCR-07 every shape's samples get weights from 0 to 1, with a lit rim and a darker inside", () => {
    for (const id of ["logo", "coup-online", "archelab"] as const) {
      const points = sampleShape(id, 4096);
      const weights = edgeWeights(outline(id), points, 0.06);
      expect(weights).toHaveLength(4096);
      const lit = weights.filter((weight) => weight > 0.5).length;
      expect(Math.min(...weights)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...weights)).toBeLessThanOrEqual(1);
      // A rim, not the whole shape and not nothing.
      expect(lit / weights.length).toBeGreaterThan(0.05);
      expect(lit / weights.length).toBeLessThan(0.9);
    }
  });
});
