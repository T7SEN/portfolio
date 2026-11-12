// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { WORK_SHAPES, type ShapeId } from "../../story";

// The sampler's speed from a cold start, by the clock (REQ-SCR-01). A clock
// measures the machine as well as the code, so this file runs in a Vitest
// project of its own that starts once every other test file has finished,
// one file at a time (vitest.config.mts): no other test competes for the
// processor while it times. A busy machine can still stall one run, so the
// best of three cold starts counts; the limit is the same 20 ms.

const IDS: ShapeId[] = ["logo", "wordmark", ...WORK_SHAPES];
const LIMIT_MS = 20;
const ATTEMPTS = 3;

describe("sampleShape from a cold start", () => {
  it("REQ-SCR-01 gives 16,384 points of any shape in under 20 ms from a cold start", async () => {
    // Each start imports the module afresh.
    const slowest: number[] = [];
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
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

    expect(
      Math.min(...slowest),
      `the slowest shape of each start: ${slowest.map((ms) => ms.toFixed(1)).join(", ")} ms`,
    ).toBeLessThan(LIMIT_MS);
  });
});
