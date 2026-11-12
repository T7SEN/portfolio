import { describe, expect, test } from "vitest";

import type { Point } from "../types";
import {
  faceSize,
  invert,
  isConvexFace,
  project,
  squareToQuad,
  type Corners,
} from "./homography";

const WIDTH = 1280;
const HEIGHT = 800;

/** CSS pixels, y down, to normalised device coordinates, y up. */
function ndc(x: number, y: number): Point {
  return { x: (x / WIDTH) * 2 - 1, y: 1 - (y / HEIGHT) * 2 };
}

/**
 * A card as CSS draws it with transform: perspective(p) rotateY(angle) and
 * its origin at its centre: the point u, v of its face (0 to 1, from its top
 * left corner) on the screen, in normalised device coordinates.
 */
function cssCard(
  left: number,
  top: number,
  width: number,
  height: number,
  degrees: number,
  perspective: number,
) {
  const angle = (degrees * Math.PI) / 180;
  return (u: number, v: number): Point => {
    const x = (u - 0.5) * width;
    const y = (v - 0.5) * height;
    const turnedX = x * Math.cos(angle);
    const depth = -x * Math.sin(angle);
    const scale = perspective / (perspective - depth);
    return ndc(
      left + width / 2 + turnedX * scale,
      top + height / 2 + y * scale,
    );
  };
}

function cornersOf(at: (u: number, v: number) => Point): Corners {
  return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
}

function expectNear(actual: Point | null, expected: Point, digits = 9) {
  expect(actual).not.toBeNull();
  expect(actual?.x).toBeCloseTo(expected.x, digits);
  expect(actual?.y).toBeCloseTo(expected.y, digits);
}

const SQUARE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

describe("the face's projective map", () => {
  test.each([
    ["a flat card", cssCard(300, 200, 200, 270, 0, 1600)],
    ["a card turned -34 degrees", cssCard(300, 200, 200, 270, -34, 1600)],
    ["a card turned 34 degrees", cssCard(700, 260, 200, 270, 34, 1600)],
    ["a card turned 60 degrees close up", cssCard(500, 100, 300, 400, 60, 700)],
  ])(
    "REQ-ENG-09 %s: the map takes the face's square onto its corners, and every point of the face to where CSS draws it",
    (_name, card) => {
      const corners = cornersOf(card);
      const forward = squareToQuad(corners);
      expect(forward).not.toBeNull();
      if (forward === null) return;

      SQUARE.forEach(([u, v], index) => {
        expectNear(project(forward, u, v), corners[index] ?? { x: 0, y: 0 });
      });
      // Inside the face the map is projective, not a blend of the corners:
      // the centre of a turned card is not the mean of its corners.
      for (const [u, v] of [
        [0.5, 0.5],
        [0.25, 0.75],
        [0.9, 0.1],
      ] as const) {
        expectNear(project(forward, u, v), card(u, v));
      }
    },
  );

  test("REQ-ENG-09 the inverse takes each pixel back to its place on the face", () => {
    const card = cssCard(400, 150, 200, 270, -34, 1600);
    const forward = squareToQuad(cornersOf(card));
    const inverse = forward === null ? null : invert(forward);
    expect(inverse).not.toBeNull();
    if (inverse === null) return;

    for (const [u, v] of [...SQUARE, [0.5, 0.5], [0.3, 0.8]] as const) {
      const onScreen = card(u, v);
      expectNear(project(inverse, onScreen.x, onScreen.y), { x: u, y: v });
    }
    // A point outside the face lands outside the square.
    const outside = project(inverse, ndc(100, 100).x, ndc(100, 100).y);
    expect(outside === null || outside.x < 0 || outside.y < 0).toBe(true);
  });

  test("REQ-ENG-09 a parallelogram takes the affine map, with no depth terms", () => {
    const corners: Corners = [
      { x: -0.5, y: 0.5 },
      { x: 0.3, y: 0.6 },
      { x: 0.4, y: -0.2 },
      { x: -0.4, y: -0.3 },
    ];
    const forward = squareToQuad(corners);
    expect(forward?.[6]).toBe(0);
    expect(forward?.[7]).toBe(0);
    expectNear(forward === null ? null : project(forward, 0.5, 0.5), {
      x: -0.05,
      y: 0.15,
    });
  });

  test("REQ-ENG-09 a card seen from behind is still a face, drawn mirrored as CSS draws it", () => {
    const front = cornersOf(cssCard(300, 200, 200, 270, 0, 1600));
    const back: Corners = [front[1], front[0], front[3], front[2]];
    expect(isConvexFace(back)).toBe(true);
    const forward = squareToQuad(back);
    expectNear(forward === null ? null : project(forward, 0, 0), front[1]);
  });

  test.each([
    [
      "a point",
      [
        { x: 0.2, y: 0.2 },
        { x: 0.2, y: 0.2 },
        { x: 0.2, y: 0.2 },
        { x: 0.2, y: 0.2 },
      ],
    ],
    [
      "a line",
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 1, y: 0 },
        { x: 0.25, y: 0 },
      ],
    ],
    [
      "crossed corners",
      [
        { x: -0.2, y: 0.4 },
        { x: 0.2, y: -0.4 },
        { x: 0.2, y: 0.4 },
        { x: -0.2, y: -0.4 },
      ],
    ],
    [
      "a dent",
      [
        { x: -0.4, y: 0.4 },
        { x: 0.4, y: 0.4 },
        { x: 0, y: 0.2 },
        { x: -0.4, y: -0.4 },
      ],
    ],
    [
      "a corner that is not a number",
      [
        { x: Number.NaN, y: 0.4 },
        { x: 0.4, y: 0.4 },
        { x: 0.4, y: -0.4 },
        { x: -0.4, y: -0.4 },
      ],
    ],
    [
      "a corner at infinity",
      [
        { x: -0.4, y: Number.POSITIVE_INFINITY },
        { x: 0.4, y: 0.4 },
        { x: 0.4, y: -0.4 },
        { x: -0.4, y: -0.4 },
      ],
    ],
  ] as Array<[string, Corners]>)(
    "REQ-ENG-09 %s is no face: no map, so no card is drawn",
    (_name, corners) => {
      expect(isConvexFace(corners)).toBe(false);
      expect(squareToQuad(corners)).toBeNull();
    },
  );

  test("REQ-ENG-09 a matrix with no inverse gives none", () => {
    expect(invert([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBeNull();
    expect(project([1, 0, 0, 0, 1, 0, 0, 0, 0], 1, 1)).toBeNull();
  });
});

describe("the face's size", () => {
  test("REQ-ENG-09 a flat card measures exactly its CSS size", () => {
    const size = faceSize(
      cornersOf(cssCard(300, 200, 200, 270, 0, 1600)),
      WIDTH,
      HEIGHT,
    );
    expect(size.width).toBeCloseTo(200, 9);
    expect(size.height).toBeCloseTo(270, 9);
  });

  test("REQ-ENG-09 a turned card measures its turned side as the screen shows it, shorter than it stands", () => {
    const size = faceSize(
      cornersOf(cssCard(300, 200, 200, 270, -34, 1600)),
      WIDTH,
      HEIGHT,
    );
    // cos 34 degrees is 0.829; the perspective adds a little.
    expect(size.width / 200).toBeGreaterThan(0.82);
    expect(size.width / 200).toBeLessThan(0.84);
    expect(size.height / 270).toBeGreaterThan(1);
    expect(size.height / 270).toBeLessThan(1.002);
  });
});
