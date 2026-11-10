// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PROBE } from "../config";
import { classifyProbe, median, percentile } from "./probe";

function frames(count: number, frameMs: number): number[] {
  return Array.from({ length: count }, () => frameMs);
}

describe("median", () => {
  it("REQ-TIER-01 an odd count gives the middle value, whatever the order", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("REQ-TIER-01 an even count gives the mean of the middle two", () => {
    expect(median([40, 10, 30, 20])).toBe(25);
  });

  it("REQ-TIER-01 one value is its own median", () => {
    expect(median([16.7])).toBe(16.7);
  });

  it("REQ-TIER-01 an empty list has no median", () => {
    expect(median([])).toBeNaN();
  });

  it("REQ-TIER-01 the list passed in keeps its order", () => {
    const values = [30, 10, 20];

    median(values);

    expect(values).toEqual([30, 10, 20]);
  });
});

describe("percentile", () => {
  const values = [50, 10, 40, 20, 30];

  it("REQ-TIER-01 fraction 0 is the smallest value and 1 the largest", () => {
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 1)).toBe(50);
  });

  it("REQ-TIER-01 fraction 0.5 equals the median", () => {
    expect(percentile(values, 0.5)).toBe(median(values));
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(25);
  });

  it("REQ-TIER-01 a fraction between two values interpolates", () => {
    expect(percentile(values, 0.25)).toBe(20);
    expect(percentile(values, 0.875)).toBe(45);
    expect(percentile([0, 100], 0.95)).toBeCloseTo(95, 10);
  });

  it("REQ-TIER-01 a fraction outside 0 to 1 is clamped", () => {
    expect(percentile(values, -1)).toBe(10);
    expect(percentile(values, 2)).toBe(50);
  });

  it("REQ-TIER-01 an empty list has no percentile", () => {
    expect(percentile([], 0.95)).toBeNaN();
  });

  it("REQ-TIER-01 the list passed in keeps its order", () => {
    const unsorted = [50, 10, 40];

    percentile(unsorted, 0.95);

    expect(unsorted).toEqual([50, 10, 40]);
  });
});

describe("classifyProbe", () => {
  it("REQ-TIER-01 the thresholds are a 20 ms median over at least 10 frames", () => {
    expect(PROBE.passMedianMs).toBe(20);
    expect(PROBE.minFrames).toBe(10);
  });

  it("REQ-TIER-01 an empty list is a failed probe", () => {
    expect(classifyProbe([])).toBe("failed");
  });

  it("REQ-TIER-01 one frame short of the minimum is a failed probe, however fast", () => {
    expect(classifyProbe(frames(PROBE.minFrames - 1, 4))).toBe("failed");
  });

  it("REQ-TIER-01 exactly the minimum number of fast frames passes", () => {
    expect(classifyProbe(frames(PROBE.minFrames, 4))).toBe("pass");
  });

  it("REQ-TIER-01 exactly the minimum number of slow frames is slow, not failed", () => {
    expect(classifyProbe(frames(PROBE.minFrames, 40))).toBe("slow");
  });

  it("REQ-TIER-01 a median exactly at the threshold passes", () => {
    expect(classifyProbe(frames(60, PROBE.passMedianMs))).toBe("pass");
  });

  it("REQ-TIER-01 a median just above the threshold is slow", () => {
    expect(classifyProbe(frames(60, PROBE.passMedianMs + 0.01))).toBe("slow");
  });

  it("REQ-TIER-01 an even count whose middle two average to the threshold passes", () => {
    const times = [
      ...frames(5, PROBE.passMedianMs - 1),
      ...frames(5, PROBE.passMedianMs + 1),
    ];

    expect(median(times)).toBe(PROBE.passMedianMs);
    expect(classifyProbe(times)).toBe("pass");
  });

  it("REQ-TIER-01 a few long frames do not fail a fast run", () => {
    const times = [...frames(50, 8), ...frames(10, 120)];

    expect(classifyProbe(times)).toBe("pass");
  });

  it("REQ-TIER-01 a few fast frames do not pass a slow run", () => {
    const times = [...frames(10, 8), ...frames(50, 33)];

    expect(classifyProbe(times)).toBe("slow");
  });
});
