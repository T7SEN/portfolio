import type { ShapeId } from "../../story";
import type { Ring } from "./draw";
import { MARKS } from "./marks";

/**
 * A shape's rings as the sampler uses them: centred on the origin, scaled so
 * the longer side runs from -1 to 1 and the other keeps its proportion, with
 * y up. Filled by the even-odd rule.
 */
export function outline(id: ShapeId): Ring[] {
  const rings = MARKS[id];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 2) {
      const x = ring[index] ?? 0;
      const y = ring[index + 1] ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const scale = 2 / Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return rings.map((ring) =>
    ring.map((value, index) =>
      index % 2 === 0 ? (value - cx) * scale : (cy - value) * scale,
    ),
  );
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
 * Points spread evenly over a shape's filled area: two numbers per point, x
 * then y, each from -1 to 1 with y up, fitted inside that square around the
 * origin and kept to the shape's own proportions. The same id and count
 * always give the same points.
 *
 * Each point falls in its own equal share of the area, taken in order through
 * the trapezoids, so no part of a thin stroke is left bare. The order is then
 * shuffled, so a point's index says nothing about where it sits.
 */
export function sampleShape(id: ShapeId, count: number): Float32Array {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const points = new Float32Array(total * 2);
  const { strips, areas } = trapezoids(outline(id));
  const random = generator(seedFor(id, total));
  const whole = areas.reduce((sum, area) => sum + area, 0);

  let strip = 0;
  let before = 0;
  for (let index = 0; index < total; index += 1) {
    const target = ((index + random()) / total) * whole;
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
    // `share` of the area below it solves a quadratic; this form of the root
    // stays exact when the two widths are equal or one is zero.
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
    points[index * 2] = Math.min(
      Math.max(left + (right - left) * across, -1),
      1,
    );
    points[index * 2 + 1] = Math.min(
      Math.max(bottom + (top - bottom) * height, -1),
      1,
    );
  }

  for (let index = total - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const x = points[index * 2] ?? 0;
    const y = points[index * 2 + 1] ?? 0;
    points[index * 2] = points[other * 2] ?? 0;
    points[index * 2 + 1] = points[other * 2 + 1] ?? 0;
    points[other * 2] = x;
    points[other * 2 + 1] = y;
  }
  return points;
}
