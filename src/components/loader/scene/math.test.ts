import { describe, expect, test } from "vitest";

import { colors } from "@/tokens/colors";

import {
  bend,
  clamp01,
  easeOut,
  farthestCorner,
  GLOW,
  gridTurn,
  matterAt,
  PAPER,
  HOLE,
  rgbOf,
  seeded,
  smooth,
  spiral,
  TURN_MAX,
  VIOLET,
  VOID,
  wellDepth,
} from "./math";

const sweep = Array.from({ length: 401 }, (_, i) => i / 400);

describe("the loader scene's numbers", () => {
  test("REQ-LOAD-01 every colour comes from the tokens", () => {
    expect(VOID).toEqual(rgbOf(colors.void));
    expect(VIOLET).toEqual([0xa8, 0x55, 0xf7]);
    expect(GLOW).toEqual(rgbOf(colors.glow));
    expect(PAPER).toEqual(rgbOf(colors.paper));
  });

  test("REQ-LOAD-01 the hole is black, darker than the void, as the mockup draws it", () => {
    expect(HOLE).toEqual([0, 0, 0]);
    expect(Math.max(...HOLE)).toBeLessThan(Math.min(...VOID));
  });

  test("REQ-LOAD-01 the generator is seeded, so frames repeat", () => {
    const a = seeded(23);
    const b = seeded(23);
    const first = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(first);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(Array.from({ length: 50 }, seeded(24))).not.toEqual(first);
  });

  test("REQ-LOAD-01 easing starts at 0, ends at 1 and never runs backwards", () => {
    for (const ease of [easeOut, (t: number) => smooth(0, 1, t)]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBeCloseTo(1, 12);
      for (let i = 1; i < sweep.length; i++) {
        expect(ease(sweep[i] as number)).toBeGreaterThanOrEqual(
          ease(sweep[i - 1] as number),
        );
      }
    }
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(3)).toBe(1);
  });

  test("REQ-LOAD-01 each finished step deepens the well, deepest when ready", () => {
    expect(wellDepth(0)).toBeCloseTo(0.12, 12);
    expect(wellDepth(4)).toBeCloseTo(0.62, 12);
    for (let step = 1; step <= 4; step++) {
      expect(wellDepth(step)).toBeGreaterThan(wellDepth(step - 1));
    }
    expect(wellDepth(9)).toBe(wellDepth(4));
  });

  test("REQ-LOAD-01 the grid turns slowly and never winds past its limit", () => {
    expect(gridTurn(0)).toBe(0);
    // About the mockup's 0.22 rad a second at the start.
    expect(gridTurn(1000)).toBeGreaterThan(0.2);
    expect(gridTurn(1000)).toBeLessThan(0.23);
    expect(gridTurn(10_000)).toBeLessThan(TURN_MAX);
    expect(gridTurn(600_000)).toBeLessThanOrEqual(TURN_MAX);
    expect(gridTurn(5000)).toBeGreaterThan(gridTurn(4000));
  });

  test("REQ-LOAD-01 a wave's pieces wait as dust, leave staggered and all land", () => {
    expect(matterAt(0, 0)).toBe(0);
    expect(matterAt(0, 1)).toBe(0);
    expect(matterAt(0.2, 0)).toBeGreaterThan(0);
    expect(matterAt(0.2, 1)).toBe(0);
    expect(matterAt(1, 0)).toBe(1);
    expect(matterAt(1, 1)).toBe(1);
  });

  test("REQ-LOAD-01 matter spirals in on a path that tightens and speeds up near the hole", () => {
    const at = new Float64Array(2);
    const angle = 0.7;
    const u0 = spiral(at, 0, angle, 300, 100, 0.5, 0.26);
    expect(u0).toBe(1);
    expect(at[0]).toBeCloseTo(Math.cos(angle) * 300, 9);
    expect(at[1]).toBeCloseTo(Math.sin(angle) * 300, 9);

    expect(spiral(at, 1, angle, 300, 100, 0.5, 0.26)).toBe(0);
    // On the disk's tilted plane at its outer edge.
    const end = Math.hypot(at[0] as number, (at[1] as number) / 0.26);
    expect(end).toBeCloseTo(100, 6);

    const turned: number[] = [];
    let last = Infinity;
    let prev = angle;
    for (let i = 1; i <= 20; i++) {
      spiral(at, i / 20, angle, 300, 100, 0.5, 1);
      const r = Math.hypot(at[0] as number, at[1] as number);
      expect(r).toBeLessThan(last);
      last = r;
      let th = Math.atan2(at[1] as number, at[0] as number);
      while (th < prev) th += Math.PI * 2;
      turned.push(th - prev);
      prev = th;
    }
    expect(turned.at(-1) as number).toBeGreaterThan((turned[0] as number) * 5);
  });

  test("REQ-LOAD-01 stars bend outward near the hole and stay put far out", () => {
    expect(bend(0, 50)).toBe(50);
    for (const r of [1, 10, 60, 200]) expect(bend(r, 50)).toBeGreaterThan(r);
    expect(bend(5000, 50) - 5000).toBeLessThan(1);
  });

  test("REQ-LOAD-01 the farthest corner is the distance the opening must pass", () => {
    expect(farthestCorner(0, 0, 300, 400)).toBe(500);
    expect(farthestCorner(150, 200, 300, 400)).toBe(250);
    expect(farthestCorner(290, 390, 300, 400)).toBeCloseTo(
      Math.hypot(290, 390),
      9,
    );
  });
});
