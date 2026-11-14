import { describe, expect, test } from "vitest";

import { RIPPLE_EDGE, RIPPLE_MS, rippleFrame, waveTravel } from "./ripple";

const sweep = Array.from({ length: 501 }, (_, i) => i / 500);
const reach = Math.hypot(640, 446);

describe("the loader's exit", () => {
  test("REQ-LOAD-01 the ripple takes about 1.8 s", () => {
    expect(RIPPLE_MS).toBe(1800);
  });

  test("REQ-LOAD-01 the label's patch fades first", () => {
    expect(rippleFrame(0, reach).plate).toBe(1);
    expect(rippleFrame(0.15, reach).plate).toBe(0);
    expect(rippleFrame(0.15, reach).cut).toBe(0);
  });

  test("REQ-LOAD-01 the hole closes with a short flash, then the grid springs flat", () => {
    expect(rippleFrame(0, reach).hole).toBe(1);
    expect(rippleFrame(0.28, reach).hole).toBe(0);
    expect(rippleFrame(0.2, reach).flash).toBe(0);
    expect(rippleFrame(0.28, reach).flash).toBeGreaterThan(0.9);
    expect(rippleFrame(0.36, reach).flash).toBe(0);
    expect(rippleFrame(0.2, reach).flat).toBe(0);
    expect(rippleFrame(0.75, reach).flat).toBe(1);
  });

  test("REQ-LOAD-01 the wave runs out from the hole, and the page shows behind it until every corner is passed", () => {
    expect(rippleFrame(0.25, reach).wave).toBe(-1);
    let last = 0;
    for (const l of sweep.filter((v) => v > 0.27)) {
      const f = rippleFrame(l, reach);
      expect(f.wave).toBeGreaterThan(last);
      expect(f.cut).toBe(f.wave);
      last = f.wave;
    }
    const end = rippleFrame(1, reach);
    expect(end.cut - RIPPLE_EDGE).toBeGreaterThanOrEqual(reach);
    expect(end.ring).toBe(0);
    expect(rippleFrame(0.99, reach).cut - RIPPLE_EDGE).toBeLessThan(reach);
    expect(waveTravel(0)).toBe(0);
    expect(waveTravel(1)).toBe(1);
    // The mockup's pace: seven eighths of the way at half the run.
    expect(waveTravel(0.5)).toBeCloseTo(0.875, 9);
  });
});
