import { describe, expect, it } from "vitest";

import { colors } from "@/tokens/colors";

import {
  PLATE_ALPHA,
  PLATE_PAD,
  VEIL_OPEN,
  VEIL_TEXT,
  plateColour,
  plates,
} from "./story-veil";

describe("the veil over the field", () => {
  it("REQ-A11Y-06 a plate over the open veil lets through exactly what the measured 0.7 veil does", () => {
    expect(VEIL_OPEN).toBeLessThan(VEIL_TEXT);
    expect((1 - VEIL_OPEN) * (1 - PLATE_ALPHA)).toBeCloseTo(1 - VEIL_TEXT, 12);
  });

  it("REQ-A11Y-06 each line of text gets a plate PLATE_PAD larger on every side", () => {
    expect(plates([{ top: 100, bottom: 140, left: 88, right: 400 }])).toEqual([
      {
        top: 100 - PLATE_PAD,
        bottom: 140 + PLATE_PAD,
        left: 88 - PLATE_PAD,
        right: 400 + PLATE_PAD,
      },
    ]);
  });

  it("REQ-A11Y-06 lines whose plates touch become one block, in any order; blocks apart stay apart", () => {
    const blocks = plates([
      { top: 100, bottom: 140, left: 88, right: 400 },
      { top: 900, bottom: 940, left: 88, right: 300 },
      // A second line under the first, then a word beside it.
      { top: 150, bottom: 190, left: 88, right: 500 },
      { top: 150, bottom: 190, left: 520, right: 600 },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks).toContainEqual({
      top: 100 - PLATE_PAD,
      bottom: 190 + PLATE_PAD,
      left: 88 - PLATE_PAD,
      right: 600 + PLATE_PAD,
    });
    expect(blocks).toContainEqual({
      top: 900 - PLATE_PAD,
      bottom: 940 + PLATE_PAD,
      left: 88 - PLATE_PAD,
      right: 300 + PLATE_PAD,
    });
    // A chain merges whole, even when its middle link comes last.
    expect(
      plates([
        { top: 0, bottom: 10, left: 0, right: 10 },
        { top: 100, bottom: 110, left: 0, right: 10 },
        { top: 40, bottom: 70, left: 0, right: 10 },
      ]),
    ).toHaveLength(1);
    expect(plates([])).toEqual([]);
  });

  it("REQ-A11Y-06 plates are the void token at the plate's own opacity", () => {
    const [r, g, b] = [1, 3, 5].map((index) =>
      parseInt(colors.void.slice(index, index + 2), 16),
    );
    expect(plateColour()).toBe(
      `rgb(${r} ${g} ${b} / ${PLATE_ALPHA.toFixed(4)})`,
    );
  });
});

describe("plates at the page's edges", () => {
  it("REQ-A11Y-01 REQ-I18N-01 a plate never reaches past the page's sides or above its top, so the page never scrolls sideways", () => {
    // A 375 px phone: a line from the start gutter to the end gutter, and
    // one at the very top.
    const [wide, top] = plates(
      [
        { top: 500, bottom: 540, left: 16, right: 362 },
        { top: 4, bottom: 40, left: 16, right: 100 },
      ],
      375,
    );
    expect(wide).toEqual({ top: 484, bottom: 556, left: 0, right: 375 });
    expect(top?.top).toBe(0);
  });
});
