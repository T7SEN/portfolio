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
  cornerRadii,
  copyCards,
  densityShares,
  directionWeights,
  faceCrop,
  finalSpread,
  glowShares,
  layoutCards,
  onRoundedFace,
  pointLight,
  sameCards,
  tierOf,
  velocityLight,
  velocityPresence,
} from "./pass-rules";

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
  test("REQ-ENG-09 a flat card shows the part of the frame right behind its face, its own rectangle in CSS pixels", () => {
    // The desktop middle card, 320 by 400, in the middle of 1280 by 800.
    const card = cardAt("final", 480, 200, 320, 400);
    expectCrop(faceCrop(card.corners, 1280, 800), {
      x: 480,
      y: 200,
      width: 320,
      height: 400,
    });
    // A phone card, 208 by 260, low on a 375 by 812 frame.
    const x = (px: number) => (px / 375) * 2 - 1;
    const y = (px: number) => 1 - (px / 812) * 2;
    expectCrop(
      faceCrop(
        [
          { x: x(83.5), y: y(500) },
          { x: x(291.5), y: y(500) },
          { x: x(291.5), y: y(760) },
          { x: x(83.5), y: y(760) },
        ],
        375,
        812,
      ),
      { x: 83.5, y: 500, width: 208, height: 260 },
    );
  });

  test("REQ-ENG-09 a card over the whole canvas shows the whole frame", () => {
    const whole: PassCard = {
      pass: "final",
      corners: [
        { x: -1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: -1 },
      ],
    };
    const [laid] = layoutCards([whole], 1, 1280, 800, 1.5);
    expectCrop(laid?.crop, { x: 0, y: 0, width: 1280, height: 800 });
  });

  test("REQ-ENG-09 a flat card draws the frame one to one: each pixel of the face reads the frame at its own place, as finely as the frame itself", () => {
    const card = cardAt("density", 480, 200, 320, 400);
    for (const ratio of [1, 1.5, 2]) {
      const [laid] = layoutCards([card], 1, 1280, 800, ratio);
      expect(laid?.sharpness).toBeCloseTo(ratio, 9);
      const m = laid?.inverse;
      const crop = laid?.crop;
      expect(m).toBeDefined();
      if (m === undefined || crop === undefined) return;
      // Any point of the face: through the inverse map to the face's own
      // square, then onto the crop, lands on the same CSS pixel.
      for (const [px, py] of [
        [480, 200],
        [640, 400],
        [700.25, 333.5],
        [800, 600],
      ] as const) {
        const nx = (px / 1280) * 2 - 1;
        const ny = 1 - (py / 800) * 2;
        const w = m[6] * nx + m[7] * ny + m[8];
        const u = (m[0] * nx + m[1] * ny + m[2]) / w;
        const v = (m[3] * nx + m[4] * ny + m[5]) / w;
        expect(crop.x + u * crop.width).toBeCloseTo(px, 6);
        expect(crop.y + v * crop.height).toBeCloseTo(py, 6);
      }
    }
  });

  test("REQ-ENG-09 a face turned in depth shows the box round its corners, and its own size sets only its corners' radius", () => {
    // Turned in perspective: its far edge drawn shorter than its near one.
    const x = (px: number) => (px / 1280) * 2 - 1;
    const y = (px: number) => 1 - (px / 800) * 2;
    const turned: PassCard = {
      pass: "glow",
      corners: [
        { x: x(100), y: y(100) },
        { x: x(266), y: y(120) },
        { x: x(266), y: y(350) },
        { x: x(100), y: y(370) },
      ],
    };
    const [asDrawn] = layoutCards([turned], 1, 1280, 800, 1);
    const [own] = layoutCards(
      [{ ...turned, size: { width: 200, height: 270 } }],
      1,
      1280,
      800,
      1,
    );
    expectCrop(asDrawn?.crop, { x: 100, y: 100, width: 166, height: 270 });
    expectCrop(own?.crop, { x: 100, y: 100, width: 166, height: 270 });
    // How finely it draws comes from the face as drawn, along its blurrier
    // side: its side edges, 270 and 230 px, average 250 down the box's 270.
    expect(own?.sharpness).toBeCloseTo(250 / 270, 9);
    expect(own?.radii).toEqual({ u: 0, v: 0 });
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
