import { describe, expect, it } from "vitest";

import { colors } from "@/tokens/colors";

import {
  PLATE_ALPHA,
  PLATE_PAD,
  PLATE_REACH,
  PLATE_SOFT,
  VEIL_OPEN,
  VEIL_TEXT,
  clearAreas,
  plateClip,
  plateColour,
  plates,
} from "./story-veil";

describe("the veil over the field", () => {
  it("REQ-A11Y-06 a plate over the open veil lets through exactly what the text veil does", () => {
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

describe("the study frames stay open", () => {
  // A 1280 px page: a study frame at the inline start, its details beside it.
  const frame = { top: 3000, bottom: 3440, left: 88, right: 700, radius: 16 };
  const details = { top: 3100, bottom: 3340, left: 756, right: 1192 };

  it("REQ-A11Y-06 a frame holds no text, so it gets no plate of its own", () => {
    const blocks = plates([details], 1280);
    expect(blocks).toHaveLength(1);
    for (const block of blocks) expect(block.left).toBeGreaterThan(frame.right);
  });

  it("REQ-SCR-01 REQ-A11Y-06 a plate whose soft edge reaches a frame is cut there, along the frame's rounded border", () => {
    const [plate] = plates([details], 1280);
    if (plate === undefined) throw new Error("no plate");
    // The plate's soft edge reaches past its box, over the 56 px gap.
    expect(PLATE_REACH).toBeGreaterThanOrEqual(PLATE_SOFT * 1.5);
    expect(plate.left - frame.right).toBeLessThan(PLATE_REACH);

    const clip = plateClip(plate, [frame]);
    const width = plate.right - plate.left;
    const height = plate.bottom - plate.top;
    // Everything the plate paints, then the frame as a hole, in the
    // plate's own coordinates.
    expect(clip).toBe(
      `path(evenodd, "M -160 -160 H ${width + 160} V ${height + 160} H -160 Z ` +
        "M -636 -84 H -56 A 16 16 0 0 1 -40 -68 V 340 A 16 16 0 0 1 -56 356 " +
        'H -636 A 16 16 0 0 1 -652 340 V -68 A 16 16 0 0 1 -636 -84 Z")',
    );
  });

  it("REQ-A11Y-06 a plate far from every frame keeps its whole soft edge", () => {
    const [plate] = plates([{ top: 100, bottom: 140, left: 88, right: 400 }]);
    if (plate === undefined) throw new Error("no plate");
    expect(plateClip(plate, [frame])).toBeNull();
    expect(plateClip(plate, [])).toBeNull();
  });

  it("REQ-A11Y-06 a square frame is cut square, and a broken radius counts as none", () => {
    const [plate] = plates([details], 1280);
    if (plate === undefined) throw new Error("no plate");
    const square = plateClip(plate, [{ ...frame, radius: 0 }]);
    const broken = plateClip(plate, [{ ...frame, radius: Number.NaN }]);
    expect(square).toContain("M -652 -84 H -40 V 356 H -652 Z");
    expect(broken).toBe(square);
    expect(square).not.toContain("A ");
  });

  it("REQ-A11Y-06 a frame that a line of text reaches into is not kept clear, so no plate is ever cut where text sits", () => {
    const caption = { top: 3400, bottom: 3430, left: 120, right: 400 };
    expect(clearAreas([frame], [details])).toEqual([frame]);
    expect(clearAreas([frame], [details, caption])).toEqual([]);
  });
});
