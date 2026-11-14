import { describe, expect, it } from "vitest";

import { loaderCopy, loaderLabel, loaderStepNumber } from "./loader";
import { story } from "./story";

// An en dash, an em dash, an exclamation mark or a spaced hyphen.
const DASH_OR_BANG = /[\u2013\u2014!]|\x20-\x20/;

const loading = { outcome: null, tier: null, particles: null } as const;

describe("loader words", () => {
  it("REQ-LOAD-01 names each step in the mono label form, numbered out of four", () => {
    expect(loaderStepNumber(1)).toBe("01 / 04");
    expect(loaderStepNumber(4)).toBe("04 / 04");
    expect(loaderLabel({ ...loading, step: 1 })).toEqual({
      number: "01 / 04",
      words: "Loading the engine",
      detail: null,
      isReady: false,
    });
    expect(loaderLabel({ ...loading, step: 2 }).words).toBe(
      "Starting the renderer",
    );
    expect(loaderLabel({ ...loading, step: 3 })).toMatchObject({
      number: "03 / 04",
      words: "Testing your GPU",
    });
    expect(loaderLabel({ ...loading, step: 4 }).words).toBe(
      "Drawing the field",
    );
  });

  it("REQ-LOAD-01 A14 says Field ready over the readout of the count the field draws", () => {
    expect(
      loaderLabel({
        step: null,
        outcome: "field",
        tier: 1,
        particles: 1_000_000,
      }),
    ).toEqual({
      number: "04 / 04",
      words: "Field ready",
      detail: "Tier 1 · WebGPU · 1M particles",
      isReady: true,
    });
    expect(
      loaderLabel({
        step: null,
        outcome: "field",
        tier: 2,
        particles: 100_000,
      }).detail,
    ).toBe("Tier 2 · WebGL2 · 100K particles");
  });

  it("REQ-LOAD-01 A14 REQ-TIER-03 never says Field ready on tier 3: it states the still", () => {
    const still = loaderLabel({
      step: null,
      outcome: "still",
      tier: 3,
      particles: 0,
    });
    expect(still).toEqual({
      number: null,
      words: "Still frame on this device",
      detail: null,
      isReady: false,
    });
    expect(loaderCopy.still).toBe(story.field.notes.still);
    // A ready field that reported no count claims nothing.
    expect(
      loaderLabel({ step: null, outcome: "field", tier: 1, particles: 0 })
        .isReady,
    ).toBe(false);
  });

  it("REQ-LOAD-01 the time limit and a lost device open the page without claiming a field", () => {
    for (const outcome of ["limit", "lost"] as const) {
      expect(
        loaderLabel({ step: null, outcome, tier: 2, particles: null }),
      ).toEqual({
        number: null,
        words: "Opening the page",
        detail: null,
        isReady: false,
      });
    }
  });

  it("REQ-HYG-06 the words carry no dash as punctuation and no exclamation mark", () => {
    const words = [
      loaderCopy.name,
      ...Object.values(loaderCopy.steps),
      loaderCopy.ready,
      loaderCopy.still,
      loaderCopy.open,
    ];
    for (const line of words) {
      expect(line).not.toMatch(DASH_OR_BANG);
    }
  });
});
