import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { WORK_SHAPES } from "../../story";
import type { ShapeId } from "../../story";
import type { Ring } from "./draw";
import { outline, sampleShape } from "./index";
import { MARKS } from "./marks";

const IDS: ShapeId[] = ["logo", ...WORK_SHAPES];
// Vitest runs from the repository root.
const SVG_PATH = "public/brand/t7sen-purple.svg";

function point(ring: Ring, index: number): [number, number] {
  const count = ring.length / 2;
  const at = ((index + count) % count) * 2;
  return [ring[at] ?? 0, ring[at + 1] ?? 0];
}

/** Even-odd ray cast, written apart from the sampler so it checks it. */
function crossings(ring: Ring, x: number, y: number): number {
  let count = 0;
  for (let index = 0; index < ring.length / 2; index += 1) {
    const [x0, y0] = point(ring, index);
    const [x1, y1] = point(ring, index + 1);
    if (y0 > y !== y1 > y && x < x0 + ((x1 - x0) * (y - y0)) / (y1 - y0)) {
      count += 1;
    }
  }
  return count;
}

function inside(rings: Ring[], x: number, y: number): boolean {
  return rings.reduce((sum, ring) => sum + crossings(ring, x, y), 0) % 2 === 1;
}

function distanceToEdges(rings: Ring[], x: number, y: number): number {
  let nearest = Infinity;
  for (const ring of rings) {
    for (let index = 0; index < ring.length / 2; index += 1) {
      const [x0, y0] = point(ring, index);
      const [x1, y1] = point(ring, index + 1);
      const length = (x1 - x0) ** 2 + (y1 - y0) ** 2;
      const t =
        length === 0
          ? 0
          : Math.min(
              Math.max(
                ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / length,
                0,
              ),
              1,
            );
      nearest = Math.min(
        nearest,
        Math.hypot(x - x0 - t * (x1 - x0), y - y0 - t * (y1 - y0)),
      );
    }
  }
  return nearest;
}

function bounds(values: ArrayLike<number>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < values.length; index += 2) {
    const x = values[index] ?? 0;
    const y = values[index + 1] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The filled area by the shoelace formula, each ring counted with the sign
 * its nesting depth gives under the even-odd rule. Holds while no two rings
 * cross, which the inside test below would show.
 */
function area(rings: Ring[]): number {
  return rings.reduce((sum, ring, index) => {
    let twice = 0;
    for (let at = 0; at < ring.length / 2; at += 1) {
      const [x0, y0] = point(ring, at);
      const [x1, y1] = point(ring, at + 1);
      twice += x0 * y1 - x1 * y0;
    }
    const [x, y] = point(ring, 0);
    const depth = rings.filter(
      (other, at) => at !== index && crossings(other, x, y) % 2 === 1,
    ).length;
    return sum + (depth % 2 === 0 ? 1 : -1) * Math.abs(twice / 2);
  }, 0);
}

/**
 * Counts points in the cells of a grid over the shape's bounds that lie
 * wholly inside the shape, at the coarsest grid giving at least eight such
 * cells, with the count each should hold if the density is even.
 */
function filledCells(id: ShapeId, points: Float32Array) {
  const rings = outline(id);
  const { minX, minY, maxX, maxY } = bounds(rings.flat());
  for (const size of [8, 12, 16, 24, 32, 48]) {
    const width = (maxX - minX) / size;
    const height = (maxY - minY) / size;
    const filled: number[] = [];
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        let whole = true;
        for (let probe = 0; probe <= 80 && whole; probe += 1) {
          whole = inside(
            rings,
            minX + (column + (probe % 9) / 8) * width,
            minY + (row + Math.floor(probe / 9) / 8) * height,
          );
        }
        if (whole) filled.push(row * size + column);
      }
    }
    if (filled.length < 8) continue;

    const counts = new Map(filled.map((cell) => [cell, 0]));
    for (let index = 0; index < points.length; index += 2) {
      const column = Math.floor(((points[index] ?? 0) - minX) / width);
      const row = Math.floor(((points[index + 1] ?? 0) - minY) / height);
      const cell = row * size + column;
      const count = counts.get(cell);
      if (count !== undefined) counts.set(cell, count + 1);
    }
    const expected = ((points.length / 2) * width * height) / area(rings);
    return { counts: [...counts.values()], expected };
  }
  throw new Error(`no grid has eight whole cells inside ${id}`);
}

describe("shape outlines", () => {
  it("REQ-SCR-07 the logo is the polygon of public/brand/t7sen-purple.svg", () => {
    const svg = readFileSync(SVG_PATH, "utf8");
    const listed = /<polygon[^>]*\spoints="([^"]+)"/.exec(svg)?.[1] ?? "";
    const values = listed.trim().split(/\s+/).map(Number);

    expect(values).toHaveLength(30);
    expect(MARKS.logo).toEqual([values]);
  });

  it("REQ-SCR-01 every shape id has an outline of closed rings", () => {
    expect(Object.keys(MARKS).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      expect(MARKS[id].length).toBeGreaterThan(0);
      for (const ring of MARKS[id]) {
        expect(ring.length % 2).toBe(0);
        expect(ring.length).toBeGreaterThanOrEqual(6);
        expect(ring.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it.each(IDS)("REQ-SCR-01 %s is centred and fitted to -1 to 1", (id) => {
    const { minX, minY, maxX, maxY } = bounds(outline(id).flat());

    expect(minX + maxX).toBeCloseTo(0, 9);
    expect(minY + maxY).toBeCloseTo(0, 9);
    expect(Math.max(maxX - minX, maxY - minY)).toBeCloseTo(2, 9);
  });

  it("REQ-SCR-07 the logo keeps the mark's proportions and stands upright", () => {
    const rings = outline("logo");
    const { minX, minY, maxX, maxY } = bounds(rings.flat());
    const ratio = 464.22 / 442.36;

    expect((maxX - minX) / (maxY - minY)).toBeCloseTo(ratio, 9);
    // The SVG's first corner is its top right, (464.22, 0), with y down.
    expect(point(rings[0] ?? [], 0)).toEqual([
      expect.closeTo(1, 9),
      expect.closeTo(1 / ratio, 9),
    ]);
  });
});

describe("sampleShape", () => {
  it("REQ-SCR-01 gives 16,384 points of any shape in under 20 ms from a cold start", async () => {
    // A busy machine can stall one run, so the best of three cold starts
    // counts. Each start imports the module afresh.
    const slowest: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      vi.resetModules();
      const fresh = await import("./index");
      let worst = 0;
      for (const id of IDS) {
        const start = performance.now();
        fresh.sampleShape(id, 16_384);
        worst = Math.max(worst, performance.now() - start);
      }
      slowest.push(worst);
    }

    expect(Math.min(...slowest)).toBeLessThan(20);
  });

  it("REQ-SCR-01 gives two numbers per point, and none for a count below one", () => {
    expect(sampleShape("archelab", 300)).toHaveLength(600);
    expect(sampleShape("archelab", 2.7)).toHaveLength(4);
    expect(sampleShape("archelab", 0)).toHaveLength(0);
    expect(sampleShape("archelab", -4)).toHaveLength(0);
    expect(sampleShape("archelab", Number.NaN)).toHaveLength(0);
  });

  it.each(IDS)(
    "REQ-SCR-01 REQ-SCR-07 %s gives the same points for the same count",
    (id) => {
      expect(sampleShape(id, 2048)).toEqual(sampleShape(id, 2048));
    },
  );

  it("REQ-SCR-01 REQ-SCR-07 each shape gives its own points", () => {
    const firsts = IDS.map((id) => sampleShape(id, 64).join(","));

    expect(new Set(firsts).size).toBe(IDS.length);
  });

  it.each(IDS)(
    "REQ-SCR-01 REQ-SCR-07 every point of %s lies inside its outline and within -1 to 1",
    (id) => {
      const rings = outline(id);
      const points = sampleShape(id, 4096);
      const outside: number[] = [];
      for (let index = 0; index < points.length; index += 2) {
        const x = points[index] ?? 0;
        const y = points[index + 1] ?? 0;
        const isNearEdge = distanceToEdges(rings, x, y) < 1e-5;
        if (Math.abs(x) > 1 || Math.abs(y) > 1) outside.push(index / 2);
        else if (!inside(rings, x, y) && !isNearEdge) outside.push(index / 2);
      }

      expect(outside).toEqual([]);
    },
  );

  it("REQ-SCR-07 the logo's points span the mark's proportions within 1%", () => {
    const { minX, minY, maxX, maxY } = bounds(sampleShape("logo", 16_384));
    const aspect = (maxX - minX) / (maxY - minY);

    expect(Math.abs(aspect / (464.22 / 442.36) - 1)).toBeLessThan(0.01);
  });

  it.each(IDS)(
    "REQ-SCR-01 REQ-SCR-07 %s spreads its points evenly over its area",
    (id) => {
      const { counts, expected } = filledCells(id, sampleShape(id, 16_384));
      const mean =
        counts.reduce((sum, count) => sum + count, 0) / counts.length;
      const worst = Math.max(
        ...counts.map((count) => Math.abs(count - expected)),
      );

      // The density inside matches the whole shape's, and no cell strays
      // further than chance allows.
      expect(Math.abs(mean / expected - 1)).toBeLessThan(0.05);
      expect(worst).toBeLessThan(4 * Math.sqrt(expected));
    },
  );
});
