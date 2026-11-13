import { afterEach, describe, expect, it } from "vitest";

import { wheelSteps } from "./wheel-steps";

afterEach(() => {
  wheelSteps.reset();
});

describe("wheelSteps", () => {
  it("REQ-SCR-02 with no step set, every wheel input scrolls as ever", () => {
    expect(wheelSteps.target(500, 100)).toBeNull();
  });

  it("REQ-SCR-02 a step set decides where a wheel input sends the page, and its teardown clears it", () => {
    const clear = wheelSteps.set((target, delta) => target + delta * 2);
    expect(wheelSteps.target(500, 100)).toBe(700);
    clear();
    expect(wheelSteps.target(500, 100)).toBeNull();
  });

  it("REQ-SCR-02 an old step's teardown leaves a newer step in place", () => {
    const clearOld = wheelSteps.set(() => 1);
    wheelSteps.set(() => 2);
    clearOld();
    expect(wheelSteps.target(0, 100)).toBe(2);
  });
});
