import { describe, expect, test } from "vitest";

import { LIVE_PASSES, PASSES } from "../story";
import type { PassCard, PassId } from "../types";
import { FILL_TONE, GLOW_FROM, GLOW_TO, TONE_FULL } from "./halftone-rules";
import {
  DENSITY_VIOLET_AT,
  DIRECTIONS,
  FINAL_SAMPLES,
  POINTS_FULL,
  VELOCITY_FLOOR,
  VELOCITY_FULL,
  centreCrop,
  cornerRadii,
  copyCards,
  densityShares,
  directionWeights,
  finalSpread,
  glowShares,
  layoutCards,
  onRoundedFace,
  pointLight,
  sameCards,
  sheetCrop,
  tierOf,
  velocityLight,
  velocityPresence,
} from "./pass-rules";
import { SHEET_FIT } from "./story";

/** A flat card, CSS pixels on a 1280 by 800 frame, y down. */
function cardAt(
  pass: PassId,
  left: number,
  top: number,
  width = 200,
  height = 270,
): PassCard {
  const x = (px: number) => (px / 1280) * 2 - 1;
  const y = (px: number) => 1 - (px / 800) * 2;
  return {
    pass,
    corners: [
      { x: x(left), y: y(top) },
      { x: x(left + width), y: y(top) },
      { x: x(left + width), y: y(top + height) },
      { x: x(left), y: y(top + height) },
    ],
  };
}

const ROW = PASSES.map((pass, index) => cardAt(pass, 100 + index * 220, 300));

describe("which cards a tier draws", () => {
  test("REQ-ENG-09 WebGPU is tier 1 and WebGL2 tier 2", () => {
    expect(tierOf("webgpu")).toBe(1);
    expect(tierOf("webgl2")).toBe(2);
  });

  test("REQ-ENG-09 tier 1 draws every pass, in the order the page sends them", () => {
    expect(layoutCards(ROW, 1, 1280, 800, 1).map((card) => card.pass)).toEqual([
      ...PASSES,
    ]);
  });

  test("REQ-ENG-09 REQ-ENG-05 tier 2 draws every pass but velocity, and ignores the velocity card", () => {
    expect(layoutCards(ROW, 2, 1280, 800, 1).map((card) => card.pass)).toEqual([
      "points",
      "density",
      "glow",
      "final",
    ]);
    expect(LIVE_PASSES[2]).not.toContain("velocity");
  });

  test("REQ-ENG-09 no cards, or only cards with no face, draw nothing", () => {
    expect(layoutCards(null, 1, 1280, 800, 1)).toEqual([]);
    const flat: PassCard = {
      pass: "glow",
      corners: [
        { x: 0, y: 0 },
        { x: 0.1, y: 0 },
        { x: 0.2, y: 0 },
        { x: 0.3, y: 0 },
      ],
    };
    expect(layoutCards([flat], 1, 1280, 800, 1)).toEqual([]);
  });

  test("REQ-ENG-09 a second card of a pass already drawn is not drawn", () => {
    const laid = layoutCards(
      [cardAt("glow", 100, 100), cardAt("glow", 600, 100)],
      1,
      1280,
      800,
      1,
    );
    expect(laid).toHaveLength(1);
    expect(laid[0]?.corners[0]).toEqual(cardAt("glow", 100, 100).corners[0]);
  });
});

/** Each number of a crop to nine places. */
function expectCrop(
  actual: { x: number; y: number; width: number; height: number } | undefined,
  expected: { x: number; y: number; width: number; height: number },
) {
  expect(actual).toBeDefined();
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(actual?.[key]).toBeCloseTo(expected[key], 9);
  }
}

describe("where a card's picture comes from", () => {
  test("REQ-ENG-09 a portrait card on a landscape box shows the box's full height round its centre", () => {
    expect(centreCrop(200 / 270, 1280, 800)).toEqual({
      x: (1280 - (800 * 200) / 270) / 2,
      y: 0,
      width: (800 * 200) / 270,
      height: 800,
    });
  });

  test("REQ-ENG-09 a card wider than a portrait box shows the box's full width round its centre", () => {
    const crop = centreCrop(1, 375, 812);
    expect(crop).toEqual({ x: 0, y: (812 - 375) / 2, width: 375, height: 375 });
  });

  test("REQ-ENG-09 every card shows the sheet: its crop lies inside the middle SHEET_FIT of the frame, as tall or as wide as the sheet", () => {
    expect(SHEET_FIT).toBe(0.7);
    // The desktop face, 198 by 268 inside its border, on a 1280 by 800
    // frame, where the sheet is 896 by 560 from (192, 120).
    const sheet = { x: 192, y: 120, width: 896, height: 560 };
    const portrait = sheetCrop(198 / 268, 1280, 800);
    expectCrop(portrait, {
      x: 640 - (560 * 198) / 268 / 2,
      y: sheet.y,
      width: (560 * 198) / 268,
      height: sheet.height,
    });
    expect(portrait.x).toBeGreaterThanOrEqual(sheet.x);
    expect(portrait.x + portrait.width).toBeLessThanOrEqual(
      sheet.x + sheet.width,
    );
    // A wide phone face on a 375 by 812 frame takes the sheet's width.
    const sheetWidth = 375 * SHEET_FIT;
    const wideHeight = (sheetWidth * 138) / 160;
    expectCrop(sheetCrop(160 / 138, 375, 812), {
      x: (375 - sheetWidth) / 2,
      y: (812 - wideHeight) / 2,
      width: sheetWidth,
      height: wideHeight,
    });
  });

  test("REQ-ENG-09 a card over the sheet's own box shows the whole sheet, drawn as finely as the frame itself", () => {
    const sheetCard: PassCard = {
      pass: "final",
      corners: [
        { x: -SHEET_FIT, y: SHEET_FIT },
        { x: SHEET_FIT, y: SHEET_FIT },
        { x: SHEET_FIT, y: -SHEET_FIT },
        { x: -SHEET_FIT, y: -SHEET_FIT },
      ],
    };
    const [laid] = layoutCards([sheetCard], 1, 1280, 800, 1.5);
    expectCrop(laid?.crop, { x: 192, y: 120, width: 896, height: 560 });
    expect(laid?.sharpness).toBeCloseTo(1.5, 9);
  });

  test("REQ-ENG-09 a thumbnail draws the frame smaller: its sharpness is its own pixels over the frame's", () => {
    const [laid] = layoutCards([cardAt("final", 100, 100)], 1, 1280, 800, 2);
    // 270 px tall showing the sheet's 560: 0.482 of a CSS px, 0.964 drawn.
    expect(laid?.sharpness).toBeCloseTo((270 * 2) / 560, 9);
  });

  test("REQ-ENG-09 a face turned in depth crops its picture to its own width over height, not the narrower one it is drawn at", () => {
    // Turned by rotateY(-34deg) with no perspective: drawn 166 px wide.
    const drawn = cardAt("glow", 100, 100, 166, 270);
    const [asDrawn] = layoutCards([drawn], 1, 1280, 800, 1);
    const [own] = layoutCards(
      [{ ...drawn, size: { width: 200, height: 270 } }],
      1,
      1280,
      800,
      1,
    );
    expect(asDrawn?.crop.width).toBeCloseTo((560 * 166) / 270, 9);
    expect(own?.crop.width).toBeCloseTo((560 * 200) / 270, 9);
    expect(own?.crop.height).toBeCloseTo(560, 9);
    // How finely it draws still comes from the face as drawn, along its
    // blurrier side: 166 px across the crop's 415.
    expect(own?.sharpness).toBeCloseTo(166 / ((560 * 200) / 270), 9);
    // A size that cannot be a face falls back to the face as drawn.
    const [broken] = layoutCards(
      [{ ...drawn, size: { width: 0, height: Number.NaN } }],
      1,
      1280,
      800,
      1,
    );
    expect(broken?.crop.width).toBeCloseTo((560 * 166) / 270, 9);
  });

  test("REQ-ENG-09 the corners' radius on the face's own square, at most half a side, and square without a size", () => {
    expect(cornerRadii(11, { width: 198, height: 268 })).toEqual({
      u: 11 / 198,
      v: 11 / 268,
    });
    expect(cornerRadii(200, { width: 100, height: 500 })).toEqual({
      u: 0.5,
      v: 0.4,
    });
    expect(cornerRadii(11, undefined)).toEqual({ u: 0, v: 0 });
    expect(cornerRadii(undefined, { width: 198, height: 268 })).toEqual({
      u: 0,
      v: 0,
    });
    expect(cornerRadii(-4, { width: 198, height: 268 })).toEqual({
      u: 0,
      v: 0,
    });
    const [laid] = layoutCards(
      [
        {
          ...cardAt("points", 100, 100),
          size: { width: 198, height: 268 },
          radius: 11,
        },
      ],
      1,
      1280,
      800,
      1,
    );
    expect(laid?.radii).toEqual({ u: 11 / 198, v: 11 / 268 });
  });

  test("REQ-ENG-09 nothing is drawn past a rounded corner, and all of the face inside the corners is", () => {
    const radii = cornerRadii(11, { width: 198, height: 268 });
    // The very corners are cut; the middle and the middle of each edge stay.
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      expect(onRoundedFace(u, v, radii)).toBe(false);
    }
    for (const [u, v] of [
      [0.5, 0.5],
      [0.5, 0.001],
      [0.999, 0.5],
      [0.5, 0.999],
      [0.001, 0.5],
    ] as const) {
      expect(onRoundedFace(u, v, radii)).toBe(true);
    }
    // Either side of the arc of the top left corner, halfway round it.
    const near = (scale: number) =>
      onRoundedFace(
        radii.u - Math.SQRT1_2 * radii.u * scale,
        radii.v - Math.SQRT1_2 * radii.v * scale,
        radii,
      );
    expect(near(0.99)).toBe(true);
    expect(near(1.01)).toBe(false);
    // Square corners keep the whole face, and nothing outside it.
    expect(onRoundedFace(0, 0, { u: 0, v: 0 })).toBe(true);
    expect(onRoundedFace(1.01, 0.5, { u: 0, v: 0 })).toBe(false);
  });

  test("REQ-ENG-09 the inverse map takes the card's corners to the corners of its face", () => {
    const card = cardAt("density", 100, 100);
    const [laid] = layoutCards([card], 1, 1280, 800, 1);
    const m = laid?.inverse;
    expect(m).toBeDefined();
    if (m === undefined) return;
    const face = card.corners.map(({ x, y }) => {
      const w = m[6] * x + m[7] * y + m[8];
      return [
        (m[0] * x + m[1] * y + m[2]) / w,
        (m[3] * x + m[4] * y + m[5]) / w,
      ];
    });
    const expected = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    face.forEach(([u = 0, v = 0], index) => {
      expect(u).toBeCloseTo(expected[index]?.[0] ?? -1, 9);
      expect(v).toBeCloseTo(expected[index]?.[1] ?? -1, 9);
    });
  });
});

describe("the cards the runtime keeps", () => {
  test("REQ-ENG-09 an empty list is no cards, and a copy shares nothing with the page's objects", () => {
    expect(copyCards(null)).toBeNull();
    expect(copyCards([])).toBeNull();
    const sent = [cardAt("points", 0, 0)];
    const kept = copyCards(sent);
    expect(kept).toEqual(sent);
    expect(kept?.[0]).not.toBe(sent[0]);
    expect(kept?.[0]?.corners[0]).not.toBe(sent[0]?.corners[0]);
  });

  test("REQ-ENG-09 the same cards are the same corner for corner; any moved corner is a change", () => {
    const a = [cardAt("points", 10, 10)];
    expect(sameCards(a, copyCards(a))).toBe(true);
    expect(sameCards(null, null)).toBe(true);
    expect(sameCards(a, null)).toBe(false);
    expect(sameCards(a, [cardAt("points", 11, 10)])).toBe(false);
    expect(sameCards(a, [cardAt("glow", 10, 10)])).toBe(false);
    expect(sameCards(a, [...a, ...a])).toBe(false);
  });

  test("REQ-ENG-09 the face's own size and radius are kept with the copy, and a change to either is a change", () => {
    const sized = [
      {
        ...cardAt("points", 10, 10),
        size: { width: 198, height: 268 },
        radius: 11,
      },
    ];
    const kept = copyCards(sized);
    expect(kept).toEqual(sized);
    expect(kept?.[0]?.size).not.toBe(sized[0]?.size);
    expect(sameCards(sized, kept)).toBe(true);
    expect(sameCards(sized, [{ ...sized[0]!, radius: 9 }])).toBe(false);
    expect(
      sameCards(sized, [{ ...sized[0]!, size: { width: 160, height: 138 } }]),
    ).toBe(false);
    expect(sameCards(sized, [cardAt("points", 10, 10)])).toBe(false);
  });
});

describe("how each pass is coloured", () => {
  test("REQ-ENG-09 points: dark where no particle landed, full at POINTS_FULL", () => {
    expect(pointLight(0)).toBe(0);
    expect(pointLight(POINTS_FULL)).toBe(1);
    expect(pointLight(POINTS_FULL / 2)).toBeCloseTo(0.5, 9);
  });

  test("REQ-ENG-09 velocity: a particle at rest keeps the floor, a fast one is at full light", () => {
    expect(velocityLight(0)).toBe(VELOCITY_FLOOR);
    expect(velocityLight(10)).toBe(1);
    expect(velocityLight(Number.NaN)).toBe(VELOCITY_FLOOR);
    expect(velocityPresence(0)).toBe(0);
    expect(velocityPresence(VELOCITY_FULL)).toBe(1);
  });

  test("REQ-ENG-09 velocity: each direction of the wheel takes most of its own token, the weights add up to 1, and at rest all three share", () => {
    DIRECTIONS.forEach((direction, index) => {
      const weights = directionWeights(direction.x * 2, direction.y * 2);
      expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(
        1,
        12,
      );
      expect(Math.max(...weights)).toBe(weights[index]);
      expect(weights[index]).toBeGreaterThan(0.85);
    });
    const between = directionWeights(0.5, Math.sqrt(3) / 2);
    expect(between[0]).toBeCloseTo(between[1], 12);
    expect(directionWeights(0, 0)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  test("REQ-ENG-09 velocity: the wheel uses three colour tokens only", () => {
    expect(DIRECTIONS.map((direction) => direction.token)).toEqual([
      "glow",
      "violet",
      "text",
    ]);
  });

  test("REQ-ENG-09 density: void, then violet, glow at a formation's fill and white at a full cell", () => {
    expect(densityShares(0)).toEqual({ violet: 0, glow: 0, white: 0 });
    expect(densityShares(DENSITY_VIOLET_AT)).toEqual({
      violet: 1,
      glow: 0,
      white: 0,
    });
    expect(densityShares(FILL_TONE)).toEqual({ violet: 1, glow: 1, white: 0 });
    expect(densityShares(TONE_FULL)).toEqual({ violet: 1, glow: 1, white: 1 });
  });

  test("REQ-ENG-09 glow: nothing below the final frame's glow range, full at its top", () => {
    expect(glowShares(GLOW_FROM)).toEqual({ violet: 0, glow: 0 });
    expect(glowShares(GLOW_TO)).toEqual({ violet: 1, glow: 1 });
    const middle = glowShares((GLOW_FROM + GLOW_TO) / 2);
    expect(middle.glow).toBeLessThan(middle.violet);
  });

  test("REQ-ENG-09 final: four points inside one pixel, centred on it, that spread only where the card draws the frame smaller than it is", () => {
    expect(FINAL_SAMPLES).toHaveLength(4);
    for (const [across, down] of FINAL_SAMPLES) {
      expect(Math.abs(across)).toBeLessThan(0.5);
      expect(Math.abs(down)).toBeLessThan(0.5);
    }
    const sum = FINAL_SAMPLES.reduce(
      (total, [across, down]) => ({
        x: total.x + across,
        y: total.y + down,
      }),
      { x: 0, y: 0 },
    );
    expect(sum).toEqual({ x: 0, y: 0 });

    expect(finalSpread(1)).toBe(0);
    expect(finalSpread(2)).toBe(0);
    expect(finalSpread(0.75)).toBeCloseTo(1 / 3, 12);
    expect(finalSpread(0.5)).toBe(1);
    expect(finalSpread(0.34)).toBe(1);
    expect(finalSpread(0)).toBe(1);
  });
});
