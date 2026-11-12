import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { WORK_SHAPES } from "../../story";
import type { ShapeId } from "../../story";
import type { Ring } from "./draw";
import {
  EDGE_BAND,
  fillShare,
  layerBudgets,
  layers,
  outline,
  sampleLayers,
  sampleShape,
} from "./index";
import { MARKS } from "./marks";

const IDS: ShapeId[] = ["logo", "wordmark", ...WORK_SHAPES];
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
 * The points of one layer of a sample: its fill points, its outline points,
 * or both.
 */
function layerPoints(
  id: ShapeId,
  count: number,
  layer: number,
  part: "fill" | "edge" | "all" = "fill",
) {
  const sample = sampleLayers(id, count);
  const own: number[] = [];
  for (let index = 0; index < sample.layer.length; index += 1) {
    const isEdge = sample.edge[index] === 1;
    if (sample.layer[index] !== layer) continue;
    if ((part === "fill" && isEdge) || (part === "edge" && !isEdge)) continue;
    own.push(sample.points[index * 2] ?? 0, sample.points[index * 2 + 1] ?? 0);
  }
  return new Float32Array(own);
}

/** Whether a point is inside any layer of a shape that sits in front of one. */
function underFront(id: ShapeId, layer: number, x: number, y: number) {
  const shape = layers(id);
  const weight = shape[layer]?.weight ?? 0;
  return shape.some(
    (other) => other.weight > weight && inside(other.rings, x, y),
  );
}

/**
 * Counts points in the cells of a grid over the rings' bounds that lie
 * wholly inside them, at the coarsest grid giving at least eight such
 * cells, with the count each should hold if the density is even.
 */
function filledCells(rings: Ring[], points: Float32Array) {
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
  throw new Error("no grid has eight whole cells inside the rings");
}

const LAYERS = IDS.flatMap((id) =>
  layers(id).map((_, index) => [id, index] as const),
);

describe("shape outlines", () => {
  it("REQ-SCR-07 the logo is the polygon of public/brand/t7sen-purple.svg", () => {
    const svg = readFileSync(SVG_PATH, "utf8");
    const listed = /<polygon[^>]*\spoints="([^"]+)"/.exec(svg)?.[1] ?? "";
    const values = listed.trim().split(/\s+/).map(Number);

    expect(values).toHaveLength(30);
    expect(MARKS.logo).toEqual([{ weight: 1, rings: [values] }]);
  });

  it("REQ-SCR-01 every shape id has layers of closed rings with a weight from 0 to 1", () => {
    expect(Object.keys(MARKS).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      expect(MARKS[id].length).toBeGreaterThan(0);
      for (const layer of MARKS[id]) {
        expect(layer.weight).toBeGreaterThan(0);
        expect(layer.weight).toBeLessThanOrEqual(1);
        expect(layer.rings.length).toBeGreaterThan(0);
        for (const ring of layer.rings) {
          expect(ring.length % 2).toBe(0);
          expect(ring.length).toBeGreaterThanOrEqual(6);
          expect(ring.every(Number.isFinite)).toBe(true);
        }
      }
      // Exactly one layer in front.
      const weights = MARKS[id].map((layer) => layer.weight);
      expect(weights.filter((weight) => weight === 1)).toHaveLength(1);
      expect(Math.max(...weights)).toBe(1);
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

describe("the wordmark", () => {
  const rings = MARKS.wordmark[0]?.rings ?? [];

  it("REQ-SCR-07 holds five closed letters, T, 7, S, E and N, from start to end with gaps between them", () => {
    expect(MARKS.wordmark).toHaveLength(1);
    expect(rings).toHaveLength(5);
    const boxes = rings.map((ring) => bounds(ring));
    for (const [index, box] of boxes.entries()) {
      expect(box.maxX - box.minX).toBeGreaterThan(0);
      expect(box.maxY - box.minY).toBeGreaterThan(0);
      // Each letter starts after the one before it ends: set left to right.
      const before = boxes[index - 1];
      if (before !== undefined) expect(box.minX).toBeGreaterThan(before.maxX);
    }
    // Every letter stands the full cap height, the S overshooting a little.
    const capHeights = boxes.map((box) => box.maxY - box.minY);
    for (const height of capHeights) {
      expect(height / Math.max(...capHeights)).toBeGreaterThan(0.94);
    }
  });

  it("REQ-SCR-07 has no crossing rings, so the even-odd fill is the letters themselves", () => {
    const shape = outline("wordmark");
    // The letters have no counters: every ring is a solid letter, and a
    // point inside one letter is inside exactly one ring.
    for (const ring of shape) {
      const box = bounds(ring);
      const midY = (box.minY + box.maxY) / 2;
      let hits = 0;
      for (let step = 1; step < 200; step += 1) {
        const x = box.minX + ((box.maxX - box.minX) * step) / 200;
        if (inside(shape, x, midY)) hits += 1;
      }
      expect(hits).toBeGreaterThan(20);
    }
    expect(area(shape)).toBeGreaterThan(0);
  });

  it("REQ-SCR-07 is about five and a third times as wide as it is tall, as Unbounded Bold sets T7SEN", () => {
    const { minX, minY, maxX, maxY } = bounds(outline("wordmark").flat());
    expect((maxX - minX) / (maxY - minY)).toBeCloseTo(4176 / 778, 2);
    // Its points stay inside their own extents.
    const points = sampleShape("wordmark", 4096);
    const box = bounds(points);
    expect(box.minX).toBeGreaterThanOrEqual(minX - 1e-6);
    expect(box.maxX).toBeLessThanOrEqual(maxX + 1e-6);
    expect(box.minY).toBeGreaterThanOrEqual(minY - 1e-6);
    expect(box.maxY).toBeLessThanOrEqual(maxY + 1e-6);
  });

  it("REQ-SCR-07 fills every letter: each takes points in proportion to its area", () => {
    const shape = outline("wordmark");
    const points = sampleShape("wordmark", 16_384);
    const totalArea = area(shape);
    for (const ring of shape) {
      let own = 0;
      for (let index = 0; index < points.length; index += 2) {
        if (inside([ring], points[index] ?? 0, points[index + 1] ?? 0)) {
          own += 1;
        }
      }
      const expected = (16_384 * area([ring])) / totalArea;
      expect(Math.abs(own - expected)).toBeLessThan(4 * Math.sqrt(expected));
    }
  });
});

describe("the study shapes", () => {
  it("REQ-SCR-01 the making-of is four sheets, coup-online five cards and archelab a bubble with its three lines in front, one layer each", () => {
    expect(MARKS["making-of"]).toHaveLength(4);
    expect(MARKS["coup-online"]).toHaveLength(5);
    expect(MARKS.archelab).toHaveLength(4);
    for (const line of MARKS.archelab.slice(1)) {
      expect(line.rings).toHaveLength(1);
    }
  });

  it("REQ-SCR-01 every layer of a study shape has a dotted outline, and the layers behind the front a fainter fill", () => {
    for (const id of WORK_SHAPES) {
      const shape = layers(id);
      for (const layer of shape) {
        expect(layer.fill).toBeGreaterThan(0);
        if (layer.weight < 1 && id !== "archelab") {
          expect(layer.fill).toBeLessThan(1);
        }
      }
    }
    // The sheets, the cards and the bubble have outlines; the lines are
    // thinner than a cell and are drawn by their fill alone.
    for (const id of ["making-of", "coup-online"] as const) {
      for (const layer of layers(id)) expect(layer.edge).toBeGreaterThan(0);
    }
    const [bubble, ...lines] = layers("archelab");
    expect(bubble?.edge).toBeGreaterThan(0);
    expect(bubble?.fill).toBeLessThan(1);
    for (const line of lines) {
      expect(line.edge).toBe(0);
      expect(line.fill).toBeGreaterThan(1);
    }
    // The mark and the wordmark are plain: one filled layer, no outline.
    for (const id of ["logo", "wordmark"] as const) {
      expect(layers(id)).toEqual([
        expect.objectContaining({ weight: 1, fill: 1, edge: 0 }),
      ]);
    }
  });

  it("REQ-SCR-01 back layers weigh less than the front: the sheets step forward, the cards fan out from the middle", () => {
    const weights = (id: ShapeId) => MARKS[id].map((layer) => layer.weight);
    const sheets = weights("making-of");
    for (let index = 1; index < sheets.length; index += 1) {
      expect(sheets[index]).toBeGreaterThan(sheets[index - 1] ?? 1);
    }
    const cards = weights("coup-online");
    expect(cards[2]).toBe(1);
    expect(cards[0]).toBe(cards[4]);
    expect(cards[1]).toBe(cards[3]);
    expect(cards[0]).toBeLessThan(cards[1] ?? 0);
    // The bubble behind; the middle line in front, so only it turns white;
    // the last line a step behind it and the first further (preview: the
    // accent, the text colour, and between the two).
    expect(weights("archelab")).toEqual([0.7, 0.86, 1, 0.9]);
  });

  it("REQ-SCR-01 each sheet lies over the one behind it, stepping up and toward the end side", () => {
    const sheets = layers("making-of");
    for (let index = 1; index < sheets.length; index += 1) {
      const back = sheets[index - 1]?.rings ?? [];
      const front = sheets[index]?.rings ?? [];
      // Offset by 46 and 36 px on a 260 by 170 sheet, about two thirds of
      // each sheet lies over the one behind it; the perspective changes
      // that a little.
      const points = layerPoints("making-of", 4096, index);
      let over = 0;
      for (let at = 0; at < points.length; at += 2) {
        if (inside(back, points[at] ?? 0, points[at + 1] ?? 0)) over += 1;
      }
      const share = over / (points.length / 2);
      expect(share).toBeGreaterThan(0.5);
      expect(share).toBeLessThan(0.8);
      const backBox = bounds(back.flat());
      const frontBox = bounds(front.flat());
      expect(frontBox.maxX).toBeGreaterThan(backBox.maxX);
      expect(frontBox.maxY).toBeGreaterThan(backBox.maxY);
    }
  });

  it("REQ-SCR-01 the five cards are one card turned about one point below them, by 15 degrees a step", () => {
    const cards = layers("coup-online");
    const middle = cards[2]?.rings[0] ?? [];
    // The pivot sits below the middle card, half its height past its foot
    // (the preview's transform origin, 50% 150%), so in the sampler's space,
    // y up, it is the middle card's bottom centre less half its height.
    const box = bounds(middle);
    const pivotX = (box.minX + box.maxX) / 2;
    const pivotY = box.minY - (box.maxY - box.minY) / 2;
    cards.forEach((card, index) => {
      const ring = card.rings[0] ?? [];
      expect(ring).toHaveLength(middle.length);
      expect(area(card.rings)).toBeCloseTo(area([middle]), 6);
      // Turning the middle card about the pivot gives this card, point for
      // point. On screen, y down, the turn is clockwise for a growing angle;
      // with y up it runs the other way.
      const angle = (-(index - 2) * 15 * Math.PI) / 180;
      for (let at = 0; at < ring.length; at += 2) {
        const dx = (middle[at] ?? 0) - pivotX;
        const dy = (middle[at + 1] ?? 0) - pivotY;
        expect(ring[at]).toBeCloseTo(
          pivotX + dx * Math.cos(angle) - dy * Math.sin(angle),
          9,
        );
        expect(ring[at + 1]).toBeCloseTo(
          pivotY + dx * Math.sin(angle) + dy * Math.cos(angle),
          9,
        );
      }
    });
  });

  it("REQ-SCR-01 the perspective makes the front sheet larger than the back one", () => {
    const sheets = layers("making-of");
    expect(area(sheets[3]?.rings ?? [])).toBeGreaterThan(
      area(sheets[0]?.rings ?? []),
    );
  });

  it("REQ-SCR-01 the bubble's three lines sit inside it, longest first, each a thin line of half the preview's 14 px", () => {
    const [bubble, ...lineLayers] = layers("archelab");
    const lines = lineLayers.flatMap((layer) => layer.rings);
    const widths = lines.map((ring) => {
      const box = bounds(ring);
      return box.maxX - box.minX;
    });
    expect(widths[0]).toBeGreaterThan(widths[1] ?? 0);
    expect(widths[1]).toBeGreaterThan(widths[2] ?? 0);
    // 7 units tall on a 400 unit bubble, which the sampler scales to 2.
    for (const ring of lines) {
      const box = bounds(ring);
      expect(box.maxY - box.minY).toBeCloseTo(7 * (2 / 400), 6);
    }
    for (const ring of lines) {
      for (let index = 0; index < ring.length; index += 2) {
        expect(
          inside(bubble?.rings ?? [], ring[index] ?? 0, ring[index + 1] ?? 0),
        ).toBe(true);
      }
    }
    // The tail points down below the bubble's body at the start side.
    const body = bounds(bubble?.rings.flat() ?? []);
    const tail = (bubble?.rings[0] ?? []).reduce(
      (lowest, value, index) =>
        index % 2 === 1 ? Math.min(lowest, value) : lowest,
      Infinity,
    );
    expect(tail).toBe(body.minY);
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
    expect(sampleLayers("archelab", 300).layer).toHaveLength(300);
  });

  it.each(IDS)(
    "REQ-SCR-01 REQ-SCR-07 %s gives the same points for the same count",
    (id) => {
      expect(sampleLayers(id, 2048)).toEqual(sampleLayers(id, 2048));
    },
  );

  it("REQ-SCR-01 REQ-SCR-07 each shape gives its own points", () => {
    const firsts = IDS.map((id) => sampleShape(id, 64).join(","));

    expect(new Set(firsts).size).toBe(IDS.length);
  });

  it.each(LAYERS)(
    "REQ-SCR-01 REQ-SCR-07 every fill point of %s layer %i lies inside that layer and within -1 to 1, and every outline point on its outline's band",
    (id, layer) => {
      const rings = layers(id)[layer]?.rings ?? [];
      const points = layerPoints(id, 4096, layer, "fill");
      const outside: number[] = [];
      for (let index = 0; index < points.length; index += 2) {
        const x = points[index] ?? 0;
        const y = points[index + 1] ?? 0;
        const isNearEdge = distanceToEdges(rings, x, y) < 1e-5;
        if (Math.abs(x) > 1 || Math.abs(y) > 1) outside.push(index / 2);
        else if (!inside(rings, x, y) && !isNearEdge) outside.push(index / 2);
      }
      expect(points.length).toBeGreaterThan(0);
      expect(outside).toEqual([]);

      const edges = layerPoints(id, 4096, layer, "edge");
      const off: number[] = [];
      for (let index = 0; index < edges.length; index += 2) {
        const x = edges[index] ?? 0;
        const y = edges[index + 1] ?? 0;
        if (Math.abs(x) > 1 || Math.abs(y) > 1) off.push(index / 2);
        // Half the band either side of the outline, a hair for rounding.
        else if (distanceToEdges(rings, x, y) > EDGE_BAND / 2 + 1e-6) {
          off.push(index / 2);
        }
      }
      expect(off).toEqual([]);
      expect(edges.length > 0).toBe((layers(id)[layer]?.edge ?? 0) > 0);
    },
  );

  it.each(IDS)(
    "REQ-SCR-01 %s gives each layer's fill and outline points in proportion to its budget: the fill it shows and its outline, at their densities times its weight",
    (id) => {
      const shape = layers(id);
      const budgets = layerBudgets(id);
      const sample = sampleLayers(id, 16_384);
      const whole = budgets.reduce(
        (sum, budget) => sum + budget.fillUnits + budget.edgeUnits,
        0,
      );
      shape.forEach((layer, index) => {
        const budget = budgets[index];
        expect(budget?.area).toBeCloseTo(area(layer.rings), 9);
        let fills = 0;
        let edges = 0;
        for (let at = 0; at < sample.layer.length; at += 1) {
          if (sample.layer[at] !== index) continue;
          if (sample.edge[at] === 1) edges += 1;
          else fills += 1;
        }
        // Within a point of the exact share: the parts are counted out by
        // largest remainder.
        expect(
          Math.abs(fills - (16_384 * (budget?.fillUnits ?? 0)) / whole),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(edges - (16_384 * (budget?.edgeUnits ?? 0)) / whole),
        ).toBeLessThanOrEqual(1);
      });
    },
  );

  it("REQ-SCR-07 the mark and the wordmark are one plain layer: every point is fill, the light their area gives them", () => {
    for (const id of ["logo", "wordmark"] as const) {
      const sample = sampleLayers(id, 4096);
      expect(sample.edge.every((value) => value === 0)).toBe(true);
      expect(fillShare(id)).toBe(1);
      expect(layerBudgets(id)[0]?.visible).toBe(1);
    }
  });

  it.each(
    LAYERS.filter(([id, layer]) =>
      layers(id).some(
        (other) => other.weight > (layers(id)[layer]?.weight ?? 0),
      ),
    ),
  )(
    "REQ-SCR-01 REQ-SCR-07 the fill of %s layer %i shows only where no layer in front covers it, as the preview's sheets and cards hide the ones behind",
    (id, layer) => {
      const points = layerPoints(id, 16_384, layer, "fill");
      let hidden = 0;
      for (let index = 0; index < points.length; index += 2) {
        const x = points[index] ?? 0;
        const y = points[index + 1] ?? 0;
        if (underFront(id, layer, x, y)) hidden += 1;
      }
      expect(points.length).toBeGreaterThan(0);
      // The cover is read on a 256 cell grid, so a point within a cell of a
      // front layer's outline may fall either side of it.
      expect(hidden / (points.length / 2)).toBeLessThan(0.02);
    },
  );

  it.each(LAYERS.filter(([id]) => id === "making-of" || id === "coup-online"))(
    "REQ-SCR-01 the outline of %s layer %i takes its points evenly along its length",
    (id, layer) => {
      const rings = layers(id)[layer]?.rings ?? [];
      const ring = rings[0] ?? [];
      const edges = layerPoints(id, 16_384, layer, "edge");
      // Bin each point by the ring's corner nearest to it; corners are
      // spread round the rounded rectangle, so bins of equal length hold
      // about the same count.
      const quarters = [0, 0, 0, 0];
      const box = bounds(ring);
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      for (let index = 0; index < edges.length; index += 2) {
        const x = (edges[index] ?? 0) - cx;
        const y = (edges[index + 1] ?? 0) - cy;
        const quarter = (x >= 0 ? 1 : 0) + (y >= 0 ? 2 : 0);
        quarters[quarter] = (quarters[quarter] ?? 0) + 1;
      }
      const total = edges.length / 2;
      expect(total).toBeGreaterThan(100);
      for (const count of quarters) {
        expect(count / total).toBeGreaterThan(0.15);
        expect(count / total).toBeLessThan(0.35);
      }
    },
  );

  it("REQ-SCR-07 the logo's points span the mark's proportions within 1%", () => {
    const { minX, minY, maxX, maxY } = bounds(sampleShape("logo", 16_384));
    const aspect = (maxX - minX) / (maxY - minY);

    expect(Math.abs(aspect / (464.22 / 442.36) - 1)).toBeLessThan(0.01);
  });

  // A layer nothing covers spreads its fill evenly over its whole area.
  it.each(
    LAYERS.filter(
      ([id, layer]) => (layerBudgets(id)[layer]?.visible ?? 0) === 1,
    ),
  )(
    "REQ-SCR-01 REQ-SCR-07 %s layer %i spreads its fill evenly over its area",
    (id, layer) => {
      const rings = layers(id)[layer]?.rings ?? [];
      const { counts, expected } = filledCells(
        rings,
        layerPoints(id, 16_384, layer, "fill"),
      );
      const mean =
        counts.reduce((sum, count) => sum + count, 0) / counts.length;
      const worst = Math.max(
        ...counts.map((count) => Math.abs(count - expected)),
      );

      // The density inside matches the whole layer's, and no cell strays
      // further than chance allows.
      expect(Math.abs(mean / expected - 1)).toBeLessThan(0.05);
      expect(worst).toBeLessThan(4 * Math.sqrt(expected) + 1);
    },
  );
});
