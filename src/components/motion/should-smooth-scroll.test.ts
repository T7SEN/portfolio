import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COARSE_POINTER_QUERY,
  shouldSmoothScroll,
} from "./should-smooth-scroll";

describe("shouldSmoothScroll", () => {
  it("REQ-SCR-03 smooths the wheel on a fine pointer with calm off", () => {
    expect(shouldSmoothScroll({ coarsePointer: false, calm: false })).toBe(
      true,
    );
  });

  it("REQ-SCR-03 never on a coarse primary pointer: touch keeps its own momentum", () => {
    expect(shouldSmoothScroll({ coarsePointer: true, calm: false })).toBe(
      false,
    );
  });

  it("REQ-A11Y-03 never in calm mode or under reduced motion", () => {
    expect(shouldSmoothScroll({ coarsePointer: false, calm: true })).toBe(
      false,
    );
    expect(shouldSmoothScroll({ coarsePointer: true, calm: true })).toBe(false);
  });

  it("REQ-SCR-03 reads the same media query as the engine's phone test", () => {
    // Vitest runs from the repository root.
    const engineSource = readFileSync(
      join(process.cwd(), "src", "engine", "tier", "environment.ts"),
      "utf8",
    );
    expect(COARSE_POINTER_QUERY).toBe("(pointer: coarse)");
    expect(engineSource).toContain(`"${COARSE_POINTER_QUERY}"`);
  });
});
