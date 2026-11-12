import { describe, expect, test } from "vitest";

import { WORK_SHAPES, workStep } from "./story";

describe("the work chapter's steps", () => {
  test("REQ-SCR-01 the work chapter has one shape per full study, in study order", () => {
    expect(WORK_SHAPES).toEqual(["making-of", "coup-online", "archelab"]);
  });

  test("REQ-SCR-01 progress covers the studies in equal steps, each with its own local progress", () => {
    const count = WORK_SHAPES.length;
    for (let index = 0; index < count; index += 1) {
      const start = workStep(index / count);
      expect(start.index).toBe(index);
      expect(start.local).toBeCloseTo(0, 9);
      const middle = workStep((index + 0.5) / count);
      expect(middle.index).toBe(index);
      expect(middle.local).toBeCloseTo(0.5, 9);
    }
    // The end of the chapter stays in the last step, at its end.
    expect(workStep(1)).toEqual({ index: count - 1, local: 1 });
  });

  test("REQ-SCR-01 progress outside 0 to 1, or not a number, is clamped", () => {
    expect(workStep(-0.5)).toEqual(workStep(0));
    expect(workStep(3)).toEqual(workStep(1));
    expect(workStep(Number.NaN)).toEqual(workStep(0));
    expect(workStep(Infinity)).toEqual(workStep(0));
  });
});
