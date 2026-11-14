import { describe, expect, test } from "vitest";

import { WORK_SHAPES, type ShapeId } from "../story";
import type { ChapterId } from "../types";
import { outline } from "./shapes";
import {
  AMBIENT,
  BLOOM_KEEP,
  BLOOM_STAGE,
  DOT_SWELL,
  FLOW_FROM,
  FLOW_LINES,
  FLOW_PERIOD,
  FLOW_REACH,
  FLOW_RELEASE_DONE,
  FLOW_SHARE,
  FLOW_WIDTH,
  FORMED_GAIN,
  FULL_STAGE,
  KEPT_SHARE,
  NARROW_ASPECT,
  NARROW_BLOOM_STAGE,
  ORBIT_WIDTH,
  ORBIT_WIDTH_NARROW,
  SKY_AREA,
  SKY_DIM,
  SKY_FORMED_SHARE,
  SKY_NOISE,
  SKY_STAR_SHARE,
  SHAPE_FIT,
  STRANDS,
  STRANDS_LIT,
  STRANDS_REACH,
  STRAND_THICKNESS,
  TRAITS,
  bloomStage,
  calmKey,
  calmProgress,
  chapterTargets,
  cleanStage,
  dotSwell,
  dotTravel,
  fitScale,
  flowAlong,
  flowClockStep,
  flowLineOf,
  flowWrapped,
  follow,
  formationStage,
  formedArea,
  formedLight,
  glideStage,
  isNarrow,
  lightArea,
  openLinePoint,
  orbitAxes,
  orbitPoint,
  releaseRankScale,
  shortHalf,
  stagedFrame,
  stagedTargets,
  strandPoint,
  strandsBand,
  swirlShows,
  trait,
  type Frame,
  type ShapeExtent,
  type StoryTargets,
  meanStreamShare,
  PASS_STREAM,
  PASS_STREAM_SECONDS,
  streamShare,
} from "./story";

const CHAPTERS: ChapterId[] = [
  "hero",
  "bloom",
  "work",
  "making-of",
  "about",
  "contact",
];
const SHAPES: ShapeId[] = ["logo", "wordmark", ...WORK_SHAPES];
const sweep = Array.from({ length: 201 }, (_, index) => index / 200);
// Fine enough that the steepest ease, the first study gathering over a
// twelfth of the chapter, moves less than a tenth between two positions.
const fineSweep = Array.from({ length: 1001 }, (_, index) => index / 1000);
const KEYS = [
  "release",
  "shapeMix",
  "shape",
  "sheet",
  "strands",
  "sky",
  "keep",
  "noise",
  "push",
] as const;

// Half frames at the focus plane: 1280 x 800, 1920 x 1080 and 375 x 812.
const landscape: Frame = { halfWidth: 2.33 * 1.6, halfHeight: 2.33 };
const wide: Frame = { halfWidth: 2.33 * (16 / 9), halfHeight: 2.33 };
const portrait: Frame = { halfWidth: 2.33 * (375 / 812), halfHeight: 2.33 };

/** How much of the formation each shape holds: the morph spread over both. */
function shapeShares(targets: StoryTargets): Record<string, number> {
  const shares: Record<string, number> = {};
  shares[targets.shapeFrom] =
    (shares[targets.shapeFrom] ?? 0) + (1 - targets.shapeMix) * targets.shape;
  shares[targets.shapeTo] =
    (shares[targets.shapeTo] ?? 0) + targets.shapeMix * targets.shape;
  return shares;
}

function expectSameShares(a: StoryTargets, b: StoryTargets) {
  const left = shapeShares(a);
  const right = shapeShares(b);
  for (const id of SHAPES) {
    expect(left[id] ?? 0).toBeCloseTo(right[id] ?? 0, 2);
  }
}

/** The wordmark's box in the sample space, from its outline. */
function wordmarkExtent(): ShapeExtent {
  const values = outline("wordmark").flat();
  let maxX = 0;
  let maxY = 0;
  for (let index = 0; index < values.length; index += 2) {
    maxX = Math.max(maxX, Math.abs(values[index] ?? 0));
    maxY = Math.max(maxY, Math.abs(values[index + 1] ?? 0));
  }
  return { halfWidth: maxX, halfHeight: maxY, area: 1 };
}

/** A small seeded generator for the tests' own particle seeds. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

describe("every chapter", () => {
  test.each(CHAPTERS)(
    "REQ-SCR-01 %s keeps every value in range and at most one formation at a time",
    (chapter) => {
      for (const progress of sweep) {
        const targets = chapterTargets(chapter, progress);
        for (const key of KEYS) {
          expect(targets[key]).toBeGreaterThanOrEqual(0);
          expect(targets[key]).toBeLessThanOrEqual(1);
        }
        const formations = [
          targets.shape,
          targets.sheet,
          targets.strands,
          targets.sky,
        ];
        expect(
          formations.filter((weight) => weight > 0).length,
        ).toBeLessThanOrEqual(1);
      }
    },
  );

  test.each(CHAPTERS)(
    "REQ-SCR-05 %s changes by small amounts between close scroll positions, so nothing snaps inside a chapter",
    (chapter) => {
      for (const [index, progress] of fineSweep.entries()) {
        if (index === 0) continue;
        const before = chapterTargets(chapter, fineSweep[index - 1] ?? 0);
        const after = chapterTargets(chapter, progress);
        for (const key of [
          "release",
          "sheet",
          "strands",
          "sky",
          "keep",
          "push",
        ] as const) {
          expect(Math.abs(after[key] - before[key])).toBeLessThan(0.1);
        }
        expect(Math.abs(after.shape - before.shape)).toBeLessThan(0.1);
        const left = shapeShares(before);
        const right = shapeShares(after);
        for (const id of SHAPES) {
          expect(Math.abs((left[id] ?? 0) - (right[id] ?? 0))).toBeLessThan(
            0.1,
          );
        }
      }
    },
  );

  test.each(CHAPTERS)(
    "REQ-SCR-01 %s clamps progress below 0, above 1 and not a number",
    (chapter) => {
      expect(chapterTargets(chapter, -1)).toEqual(chapterTargets(chapter, 0));
      expect(chapterTargets(chapter, 2)).toEqual(chapterTargets(chapter, 1));
      expect(chapterTargets(chapter, Number.NaN)).toEqual(
        chapterTargets(chapter, 0),
      );
      expect(chapterTargets(chapter, Infinity)).toEqual(
        chapterTargets(chapter, 0),
      );
    },
  );
});

describe("hero and bloom", () => {
  test("REQ-SCR-01 the hero parks every particle in the dot, whatever the progress", () => {
    for (const progress of [0, 0.5, 1]) {
      expect(chapterTargets("hero", progress)).toEqual({
        ...AMBIENT,
        release: 0,
        travel: dotTravel(progress),
      });
    }
  });

  test("REQ-SCR-01 the dot glides from its box from the first pixel and reaches the middle as the hero ends", () => {
    expect(chapterTargets("hero", 0).travel).toBe(0);
    expect(chapterTargets("hero", 1).travel).toBe(1);
    // Quick as it sets off, gentle as it arrives.
    expect(dotTravel(0.05)).toBeCloseTo(0.0975);
    expect(dotTravel(0.5)).toBe(0.75);
    let before = -1;
    for (const progress of sweep) {
      const travel = chapterTargets("hero", progress).travel;
      expect(travel).toBeGreaterThanOrEqual(before);
      before = travel;
    }
    for (const chapter of [
      "bloom",
      "work",
      "making-of",
      "about",
      "contact",
    ] as const) {
      for (const progress of sweep) {
        expect(chapterTargets(chapter, progress).travel).toBe(1);
      }
    }
    expect(AMBIENT.travel).toBe(1);
    expect(dotTravel(Number.NaN)).toBe(0);
    expect(dotTravel(-1)).toBe(0);
    expect(dotTravel(2)).toBe(1);
  });

  test("REQ-SCR-07 the dot swells on its glide, to DOT_SWELL at the middle", () => {
    expect(dotSwell(0)).toBe(1);
    expect(dotSwell(1)).toBe(DOT_SWELL);
    expect(dotSwell(0.5)).toBe((1 + DOT_SWELL) / 2);
    expect(DOT_SWELL).toBeGreaterThan(1);
    expect(dotSwell(Number.NaN)).toBe(1);
    expect(dotSwell(4)).toBe(DOT_SWELL);
  });

  test("REQ-SCR-01 the glide runs from the hero's box to the middle of the field chapter's stage, keeping the box's size", () => {
    const box = { x: 0.42, y: 0.18, halfWidth: 0.2, halfHeight: 0.3 };
    expect(glideStage(box, 0, 1.6)).toEqual(box);
    expect(glideStage(box, 1, 1.6)).toEqual({ ...box, x: 0, y: 0 });
    const half = glideStage(box, 0.5, 1.6);
    expect(half.x).toBeCloseTo(0.21);
    expect(half.y).toBeCloseTo(0.09);
    expect(half.halfWidth).toBe(0.2);
    expect(glideStage(box, 1, 0.5)).toMatchObject({
      x: NARROW_BLOOM_STAGE.x,
      y: NARROW_BLOOM_STAGE.y,
    });
    // No box yet: the whole screen, whose centre is the middle already.
    expect(glideStage(undefined, 0.3, 1.6)).toEqual(FULL_STAGE);
  });

  test("REQ-SCR-07 the bloom lets the field go from the dot by 0.3, before any formation", () => {
    expect(chapterTargets("bloom", 0).release).toBe(0);
    const opening = chapterTargets("bloom", 0.15).release;
    expect(opening).toBeGreaterThan(0);
    expect(opening).toBeLessThan(1);
    expect(chapterTargets("bloom", 0.3).release).toBe(1);
    for (const progress of sweep) {
      if (progress > 0.3) break;
      expect(chapterTargets("bloom", progress).shape).toBe(0);
    }
  });

  test("REQ-SCR-07 the T7 mark gathers first, then morphs into the T7SEN wordmark, which holds and then dissolves", () => {
    // The mark, whole.
    for (const progress of [0.42, 0.46, 0.5]) {
      const mark = chapterTargets("bloom", progress);
      expect(mark.shape).toBe(1);
      expect(shapeShares(mark).logo).toBe(1);
    }
    // Turning from one into the other, the mark's share falling all the way.
    let wordmarkShare = 0;
    for (const progress of [0.53, 0.57, 0.61]) {
      const morph = chapterTargets("bloom", progress);
      expect(morph.shape).toBe(1);
      expect(morph.shapeFrom).toBe("logo");
      expect(morph.shapeTo).toBe("wordmark");
      const shares = shapeShares(morph);
      expect(shares.wordmark).toBeGreaterThan(wordmarkShare);
      expect(shares.logo).toBeGreaterThan(0);
      wordmarkShare = shares.wordmark ?? 0;
    }
    // The wordmark, whole and held.
    for (const progress of [0.64, 0.7, 0.8, 0.84]) {
      const held = chapterTargets("bloom", progress);
      expect(held.shape).toBe(1);
      expect(shapeShares(held).wordmark).toBe(1);
    }
    // Then it dissolves into the flow.
    const dissolving = chapterTargets("bloom", 0.9);
    expect(dissolving.shape).toBeGreaterThan(0);
    expect(dissolving.shape).toBeLessThan(1);
    expect(shapeShares(dissolving).logo ?? 0).toBe(0);
    expect(chapterTargets("bloom", 0.97).shape).toBe(0);
    expect(chapterTargets("bloom", 1).shape).toBe(0);
    expect(chapterTargets("bloom", 1).release).toBe(1);

    // The mark is whole before the wordmark is.
    const firstWhole = (id: ShapeId) =>
      fineSweep.find(
        (progress) => shapeShares(chapterTargets("bloom", progress))[id] === 1,
      ) ?? 2;
    expect(firstWhole("logo")).toBeLessThan(firstWhole("wordmark"));
  });

  test("REQ-SCR-07 the mark takes the whole flow; as it turns into the wordmark, part of the lines run round it again", () => {
    expect(chapterTargets("bloom", 0.45).keep).toBe(0);
    expect(chapterTargets("bloom", 0.7).keep).toBe(BLOOM_KEEP);
    expect(BLOOM_KEEP).toBeGreaterThan(0);
    expect(BLOOM_KEEP).toBeLessThan(1);
  });

  test("REQ-SCR-07 the bloom never pushes the camera and keeps the flow's noise", () => {
    for (const progress of sweep) {
      const targets = chapterTargets("bloom", progress);
      expect(targets.push).toBe(0);
      expect(targets.noise).toBe(1);
      expect(targets.sheet + targets.strands + targets.sky).toBe(0);
    }
  });
});

describe("work", () => {
  test("REQ-SCR-01 the work chapter forms the three full studies' shapes only", () => {
    expect(WORK_SHAPES).toEqual(["making-of", "coup-online", "archelab"]);
    const formed = new Set<string>();
    for (const progress of fineSweep) {
      const targets = chapterTargets("work", progress);
      formed.add(targets.shapeFrom);
      formed.add(targets.shapeTo);
      expect(targets.keep).toBe(0);
    }
    expect([...formed].sort()).toEqual([...WORK_SHAPES].sort());
  });

  test.each(WORK_SHAPES.map((id, index) => [id, index] as const))(
    "REQ-SCR-01 the middle of step %s (%i) forms that study's shape, whole",
    (id, index) => {
      const middle = chapterTargets("work", (index + 0.5) / WORK_SHAPES.length);
      expect(middle.shape).toBe(1);
      expect(shapeShares(middle)[id]).toBe(1);
    },
  );

  test("REQ-SCR-05 one study's shape morphs into the next across the edge between their steps, with no jump at the edge", () => {
    for (let edge = 1; edge < WORK_SHAPES.length; edge += 1) {
      const at = edge / WORK_SHAPES.length;
      const before = chapterTargets("work", at - 1e-6);
      const after = chapterTargets("work", at + 1e-6);
      expectSameShares(before, after);
      expect(after.shape).toBeCloseTo(before.shape, 4);

      // Halfway through the morph at the edge, and the formation loosens
      // without letting go.
      const shares = shapeShares(after);
      expect(shares[WORK_SHAPES[edge - 1] ?? "making-of"]).toBeCloseTo(
        after.shape / 2,
        4,
      );
      expect(shares[WORK_SHAPES[edge] ?? "making-of"]).toBeCloseTo(
        after.shape / 2,
        4,
      );
      expect(after.shape).toBeGreaterThan(0.4);
      expect(after.shape).toBeLessThan(1);
    }
  });

  test("REQ-SCR-01 the chapter's own edges let the field go, and the camera pushes in as it scrolls", () => {
    expect(chapterTargets("work", 0).shape).toBe(0);
    expect(chapterTargets("work", 1).shape).toBe(0);
    expect(chapterTargets("work", 0).push).toBe(0);
    expect(chapterTargets("work", 0.4).push).toBeCloseTo(0.4);
    expect(chapterTargets("work", 1).push).toBe(1);
  });
});

describe("making-of, about and contact", () => {
  test("REQ-SCR-01 REQ-ENG-09 the making-of forms the T7 mark, whole, at every scroll position, with every line's particles in it", () => {
    for (const progress of sweep) {
      const targets = chapterTargets("making-of", progress);
      expect(targets).toEqual({
        ...AMBIENT,
        shapeFrom: "logo",
        shapeTo: "logo",
        shapeMix: 0,
        shape: 1,
        keep: 0,
      });
      expect(shapeShares(targets).logo).toBe(1);
      expect(targets.sheet).toBe(0);
    }
  });

  test("REQ-SCR-01 about gathers its strands over the first quarter, holds them and lets go at the end", () => {
    expect(chapterTargets("about", 0).strands).toBe(0);
    expect(chapterTargets("about", 0.1).strands).toBeGreaterThan(0);
    expect(chapterTargets("about", 0.25).strands).toBe(1);
    expect(chapterTargets("about", 0.5).strands).toBe(1);
    expect(chapterTargets("about", 0.85).strands).toBe(1);
    expect(chapterTargets("about", 1).strands).toBe(0);
    expect(chapterTargets("about", 0.5).push).toBe(0);
    expect(chapterTargets("about", 0.5).release).toBe(1);
  });

  test("REQ-SCR-01 no chapter forms the making-of sheet any more", () => {
    for (const chapter of CHAPTERS) {
      for (const progress of sweep) {
        expect(chapterTargets(chapter, progress).sheet).toBe(0);
      }
    }
  });

  test("D-146 REQ-SCR-01 contact gathers its sky over the first quarter and holds it to the end of the page, its stars nearly still", () => {
    expect(chapterTargets("contact", 0).sky).toBe(0);
    expect(chapterTargets("contact", 0.1).sky).toBeGreaterThan(0);
    for (const progress of [0.25, 0.5, 0.9, 1]) {
      const targets = chapterTargets("contact", progress);
      expect(targets.sky).toBe(1);
      expect(targets.noise).toBe(SKY_NOISE);
      expect(targets.keep).toBe(0);
      expect(targets.shape + targets.sheet + targets.strands).toBe(0);
      expect(targets.release).toBe(1);
      expect(targets.noise).toBeGreaterThan(0);
      expect(targets.noise).toBeLessThan(AMBIENT.noise);
    }
  });
});

describe("calm", () => {
  test("REQ-A11Y-03 the calm still changes with the chapter and the study, never with a scroll inside one", () => {
    for (const chapter of CHAPTERS) {
      if (chapter === "work") continue;
      const keys = new Set(sweep.map((progress) => calmKey(chapter, progress)));
      expect([...keys]).toEqual([chapter]);
    }

    const workKeys = sweep.map((progress) => calmKey("work", progress));
    expect(new Set(workKeys)).toEqual(
      new Set(WORK_SHAPES.map((_, index) => `work:${index}`)),
    );
    expect(calmKey("work", 0.33)).toBe("work:0");
    expect(calmKey("work", 0.34)).toBe("work:1");
    expect(calmKey("work", 0.67)).toBe("work:2");
    expect(calmKey("work", 1)).toBe("work:2");
  });

  test("REQ-A11Y-03 REQ-SCR-07 the bloom's calm still shows the T7SEN wordmark whole, wherever the scroll stood", () => {
    for (const progress of [0, 0.05, 0.4, 0.5, 0.99]) {
      const still = chapterTargets("bloom", calmProgress("bloom", progress));
      expect(still.release).toBe(1);
      expect(still.shape).toBe(1);
      expect(shapeShares(still).wordmark).toBe(1);
      // The lines still run round it, as in the live field.
      expect(still.keep).toBe(BLOOM_KEEP);
    }
  });

  test("REQ-A11Y-03 each other calm still is its chapter at its fullest: the dot, each study whole, the mark, the strands, the sky", () => {
    const calm = (chapter: ChapterId, progress: number) =>
      chapterTargets(chapter, calmProgress(chapter, progress));

    expect(calm("hero", 0.7).release).toBe(0);

    for (const [index, id] of WORK_SHAPES.entries()) {
      const near = (index + 0.05) / WORK_SHAPES.length;
      const work = calm("work", near);
      expect(work.shape).toBe(1);
      expect(shapeShares(work)[id]).toBe(1);
    }

    expect(calm("making-of", 0.99).shape).toBe(1);
    expect(shapeShares(calm("making-of", 0.99)).logo).toBe(1);
    expect(calm("about", 0).strands).toBe(1);
    expect(calm("contact", 0).sky).toBe(1);
    expect(calm("contact", 1)).toEqual(chapterTargets("contact", 0.5));
  });
});

describe("fit and light", () => {
  const wideShape: ShapeExtent = { halfWidth: 1, halfHeight: 0.4, area: 1.2 };
  const tall: ShapeExtent = { halfWidth: 0.5, halfHeight: 1, area: 1.4 };

  test.each([
    ["a wide shape, landscape", wideShape, landscape],
    ["a wide shape, portrait", wideShape, portrait],
    ["a tall shape, landscape", tall, landscape],
    ["a tall shape, portrait", tall, portrait],
  ] as const)(
    "REQ-SCR-01 %s stays inside the frame and fills it on one side",
    (_, extent, frame) => {
      const scale = fitScale(extent, frame);
      const width = extent.halfWidth * scale;
      const height = extent.halfHeight * scale;
      expect(width).toBeLessThanOrEqual(frame.halfWidth * SHAPE_FIT + 1e-9);
      expect(height).toBeLessThanOrEqual(frame.halfHeight * SHAPE_FIT + 1e-9);
      const binding = Math.max(
        width / (frame.halfWidth * SHAPE_FIT),
        height / (frame.halfHeight * SHAPE_FIT),
      );
      expect(binding).toBeCloseTo(1, 9);
    },
  );

  const extents = Object.fromEntries(
    SHAPES.map((id) => [id, id === "logo" ? wideShape : tall]),
  ) as Record<ShapeId, ShapeExtent>;

  test("REQ-A11Y-06 the ambient field keeps its light; a formation dims each particle by the share of the frame it packs into", () => {
    expect(formedLight(AMBIENT, extents, landscape)).toBe(1);

    const mark = chapterTargets("bloom", 0.45);
    const area = formedArea(mark, extents, landscape);
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThan(1);
    expect(formedLight(mark, extents, landscape)).toBeCloseTo(
      area * FORMED_GAIN,
      9,
    );

    // The thin strands and the sky's points pack tighter than the sheet, so
    // their particles give less. No chapter forms the sheet now, but the
    // simulation keeps it, so its light rule is kept tested.
    const sheet = formedLight({ ...AMBIENT, sheet: 1 }, extents, portrait);
    const strands = formedLight(
      chapterTargets("about", 0.5),
      extents,
      portrait,
    );
    expect(strands).toBeLessThan(sheet);
    expect(sheet).toBeLessThanOrEqual(1);
    const sky = formedLight(chapterTargets("contact", 0.5), extents, landscape);
    expect(sky).toBeLessThan(1);
    expect(sky).toBeLessThan(
      formedLight({ ...AMBIENT, sheet: 1 }, extents, landscape),
    );
  });

  test("REQ-A11Y-06 lines that keep their particles through a formation leave fewer to form it, so each formed one gives more light", () => {
    const held = chapterTargets("bloom", 0.7);
    const without = { ...held, keep: 0 };
    expect(KEPT_SHARE).toBeGreaterThan(0);
    expect(KEPT_SHARE).toBeLessThan(FLOW_SHARE);
    expect(formedArea(held, extents, landscape)).toBeGreaterThan(
      formedArea(without, extents, landscape),
    );
  });

  test("REQ-A11Y-06 a half formed field takes the light halfway between", () => {
    const whole = formedLight(chapterTargets("about", 0.5), extents, landscape);
    const half = formedLight(
      { ...chapterTargets("about", 0.5), strands: 0.5 },
      extents,
      landscape,
    );
    expect(half).toBeCloseTo((1 + whole) / 2, 9);
  });

  test("REQ-SCR-05 follow moves toward its target at any frame rate, never past it", () => {
    const once = follow(0, 1, 0.1, 0.4);
    const twice = follow(follow(0, 1, 0.05, 0.4), 1, 0.05, 0.4);
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(1);
    expect(twice).toBeCloseTo(once, 12);
    expect(follow(0, 1, 100, 0.4)).toBeLessThanOrEqual(1);
    expect(follow(0.3, 1, 0, 0.4)).toBe(0.3);
    expect(follow(0.3, 1, Number.NaN, 0.4)).toBe(0.3);
  });
});

describe("the swirl at the pointer", () => {
  test("REQ-SCR-06 REQ-A11Y-03 the swirl shows only in the field chapter, while the pointer stirs a running field", () => {
    expect(swirlShows("bloom", true, false)).toBe(true);
    for (const chapter of [
      "hero",
      "work",
      "making-of",
      "about",
      "contact",
      null,
    ] as const) {
      expect(swirlShows(chapter, true, false)).toBe(false);
    }
    expect(swirlShows("bloom", false, false)).toBe(false);
    expect(swirlShows("bloom", true, true)).toBe(false);
  });
});

describe("a shape's light area", () => {
  test("REQ-A11Y-06 a shape's light follows its front layer's fill area where the atlas gives one, else its area", () => {
    expect(lightArea({ halfWidth: 1, halfHeight: 1, area: 2 })).toBe(2);
    expect(
      lightArea({ halfWidth: 1, halfHeight: 1, area: 2, fillArea: 1.2 }),
    ).toBe(1.2);
    const extents = Object.fromEntries(
      (["logo", "wordmark", ...WORK_SHAPES] as const).map((id) => [
        id,
        { halfWidth: 1, halfHeight: 1, area: 2, fillArea: 1 },
      ]),
    ) as Record<ShapeId, ShapeExtent>;
    const plain = Object.fromEntries(
      Object.keys(extents).map((id) => [
        id,
        { halfWidth: 1, halfHeight: 1, area: 1 },
      ]),
    ) as Record<ShapeId, ShapeExtent>;
    const targets = chapterTargets("work", 0.5);
    expect(formedArea(targets, extents, landscape)).toBeCloseTo(
      formedArea(targets, plain, landscape),
      12,
    );
  });
});

describe("stages", () => {
  const frame = { halfWidth: 3, halfHeight: 2 };

  test("REQ-SCR-01 a chapter with no stage of its own forms in the middle of the whole frame", () => {
    expect(cleanStage(undefined)).toEqual(FULL_STAGE);
    expect(stagedFrame(undefined, frame)).toEqual({
      centreX: 0,
      centreY: 0,
      frame,
    });
    const stages = { work: FULL_STAGE, contact: FULL_STAGE };
    for (const chapter of [
      "hero",
      "making-of",
      "about",
      "contact",
      null,
    ] as const) {
      expect(formationStage(chapter, stages, 1.6)).toBeUndefined();
    }
  });

  test("REQ-SCR-07 the field chapter forms in the middle of the screen, leaving room for the ellipse round it", () => {
    expect(formationStage("bloom", {}, 1.6)).toBe(BLOOM_STAGE);
    expect(BLOOM_STAGE.x).toBe(0);
    expect(BLOOM_STAGE.y).toBe(0);
    expect(BLOOM_STAGE.halfWidth).toBeLessThan(1);
  });

  test("REQ-SCR-07 on a narrow frame, a phone held upright, the field chapter forms across the whole width, so the wordmark is larger", () => {
    // 375 by 812 and 1080 by 1920 are narrow; a tablet's 768 by 1024 and
    // every landscape frame are not.
    for (const aspect of [375 / 812, 1080 / 1920]) {
      expect(bloomStage(aspect)).toBe(NARROW_BLOOM_STAGE);
      expect(formationStage("bloom", {}, aspect)).toBe(NARROW_BLOOM_STAGE);
    }
    for (const aspect of [768 / 1024, 1, 1.6, 1920 / 1080]) {
      expect(bloomStage(aspect)).toBe(BLOOM_STAGE);
    }
    for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(bloomStage(aspect)).toBe(BLOOM_STAGE);
    }
    expect(NARROW_ASPECT).toBeLessThan(768 / 1024);
    expect(NARROW_BLOOM_STAGE.halfWidth).toBe(1);
    expect(NARROW_BLOOM_STAGE.halfWidth / BLOOM_STAGE.halfWidth).toBe(1.25);
    expect(isNarrow({ halfWidth: 375, halfHeight: 812 })).toBe(true);
    expect(isNarrow({ halfWidth: 768, halfHeight: 1024 })).toBe(false);
  });

  test("REQ-SCR-01 the work chapter forms in the study row's frame", () => {
    const row = { x: -0.3, y: 0.1, halfWidth: 0.35, halfHeight: 0.4 };
    expect(formationStage("work", { work: row }, 1.6)).toBe(row);
    // Without a measure, the whole screen.
    expect(formationStage("work", {}, 1.6)).toBeUndefined();
  });

  test("REQ-ENG-09 REQ-SCR-01 the making-of's mark forms inside the middle pass card's face, its stage, and no other", () => {
    // A 320 by 400 face in the middle of a 1280 by 800 screen.
    const card = { x: 0, y: 0, halfWidth: 0.25, halfHeight: 0.5 };
    const row = { x: -0.3, y: 0.1, halfWidth: 0.35, halfHeight: 0.4 };
    expect(formationStage("making-of", { "making-of": card }, 1.6)).toBe(card);
    expect(
      formationStage("making-of", { work: row, "making-of": card }, 1.6),
    ).toBe(card);
    expect(formationStage("work", { work: row, "making-of": card }, 1.6)).toBe(
      row,
    );
    expect(formationStage("making-of", { work: row }, 1.6)).toBeUndefined();
    for (const chapter of ["hero", "about", "contact", null] as const) {
      expect(
        formationStage(chapter, { "making-of": card }, 1.6),
      ).toBeUndefined();
    }
  });

  test("REQ-ENG-09 REQ-A11Y-03 with no card in the middle the making-of is the ambient flow; with one, and in every other chapter, the targets pass through", () => {
    const card = { x: 0.1, y: -0.2, halfWidth: 0.25, halfHeight: 0.5 };
    const mark = chapterTargets("making-of", 0.5);
    // The viewer away, calm mode's still grid, tier 3: no making-of stage.
    expect(stagedTargets("making-of", mark, {})).toEqual({
      ...mark,
      shape: 0,
    });
    expect(stagedTargets("making-of", mark, {})).toEqual({
      ...AMBIENT,
      shapeFrom: "logo",
      shapeTo: "logo",
    });
    expect(
      stagedTargets("making-of", mark, { work: card, contact: card }).shape,
    ).toBe(0);
    // A card in the middle: the mark, whole.
    expect(stagedTargets("making-of", mark, { "making-of": card })).toBe(mark);
    // The calm still follows the same rule.
    const still = chapterTargets("making-of", calmProgress("making-of", 0.3));
    expect(stagedTargets("making-of", still, {}).shape).toBe(0);
    expect(stagedTargets("making-of", still, { "making-of": card }).shape).toBe(
      1,
    );
    // Every other chapter's targets are its own, stage or none.
    for (const chapter of CHAPTERS) {
      if (chapter === "making-of") continue;
      const targets = chapterTargets(chapter, 0.5);
      expect(stagedTargets(chapter, targets, {})).toBe(targets);
      expect(stagedTargets(chapter, targets, { "making-of": card })).toBe(
        targets,
      );
    }
    expect(stagedTargets(null, AMBIENT, {})).toBe(AMBIENT);
  });

  test("REQ-SCR-01 REQ-I18N-01 a stage turns into a centre and halves at the focus plane, on either side", () => {
    const end = { x: 0.5, y: -0.25, halfWidth: 0.4, halfHeight: 0.9 };
    const staged = stagedFrame(end, frame);
    expect(staged.centreX).toBeCloseTo(1.5, 12);
    expect(staged.centreY).toBeCloseTo(-0.5, 12);
    expect(staged.frame.halfWidth).toBeCloseTo(1.2, 12);
    expect(staged.frame.halfHeight).toBeCloseTo(1.8, 12);
    // A right to left page measures its frame on the other side.
    expect(stagedFrame({ ...end, x: -0.5 }, frame).centreX).toBe(-1.5);
  });

  test("REQ-SCR-01 a broken measure falls back to the screen and never leaves it", () => {
    expect(
      cleanStage({
        x: Number.NaN,
        y: 4,
        halfWidth: Number.POSITIVE_INFINITY,
        halfHeight: -1,
      }),
    ).toEqual({ x: 0, y: 1, halfWidth: 1, halfHeight: 0 });
  });

  test("REQ-ENG-09 REQ-SCR-01 every chapter's stage stays on the screen, the making-of's too, which the page sends only while its card's face is wholly in view", () => {
    const below = { x: 0, y: -2, halfWidth: 0.25, halfHeight: 0.5 };
    expect(cleanStage(below).y).toBe(-1);
    expect(stagedFrame(below, frame).centreY).toBe(-2);
    expect(cleanStage({ ...below, y: 9 }).y).toBe(1);
    expect(cleanStage({ ...below, y: Number.NaN }).y).toBe(0);
  });

  test("REQ-SCR-01 a shape fitted to a stage stays inside SHAPE_FIT of that stage", () => {
    const extent = { halfWidth: 1, halfHeight: 0.5, area: 1 };
    const staged = stagedFrame(
      { x: 0.5, y: 0, halfWidth: 0.4, halfHeight: 1 },
      frame,
    );
    const scale = fitScale(extent, staged.frame);
    expect(extent.halfWidth * scale).toBeCloseTo(
      staged.frame.halfWidth * SHAPE_FIT,
      12,
    );
    expect(extent.halfHeight * scale).toBeLessThanOrEqual(
      staged.frame.halfHeight * SHAPE_FIT,
    );
  });

  test("REQ-SCR-07 the bloom ranks every home from the dot, the farthest corner at 1", () => {
    expect(releaseRankScale(0, 0)).toBeCloseTo(Math.SQRT1_2, 12);
    const scale = releaseRankScale(0, -0.6);
    // The corner farthest from a dot low on the screen is a top corner.
    expect(Math.hypot(1, 1.6) * scale).toBeCloseTo(1, 12);
    expect(Math.hypot(1, 0.4) * scale).toBeLessThan(1);
    expect(releaseRankScale(5, 5)).toBeCloseTo(releaseRankScale(1, 1), 12);
  });
});

describe("the making-of's stream", () => {
  test("REQ-ENG-09 each particle leaves its card at its own moment within the spread and arrives at the next within the stream's time, quick as it leaves and gentle as it settles", () => {
    expect(PASS_STREAM_SECONDS).toBeCloseTo(
      PASS_STREAM.spread + PASS_STREAM.each,
      12,
    );
    expect(PASS_STREAM_SECONDS).toBeLessThanOrEqual(0.8);
    // The first to leave, at once; the last, at the end of the spread.
    expect(streamShare(0, 0)).toBe(0);
    expect(streamShare(PASS_STREAM.each, 0)).toBe(1);
    expect(streamShare(PASS_STREAM.spread, 1)).toBe(0);
    expect(streamShare(PASS_STREAM_SECONDS, 1)).toBe(1);
    // A cubic ease out: a quarter of the way through its time, most of the
    // way there; at the end, barely moving.
    expect(streamShare(PASS_STREAM.each / 2, 0)).toBeCloseTo(0.875, 12);
    expect(streamShare(PASS_STREAM.each * 0.25, 0)).toBeGreaterThan(0.55);
    expect(
      streamShare(PASS_STREAM.each, 0) -
        streamShare(PASS_STREAM.each * 0.95, 0),
    ).toBeLessThan(0.001);
    // Never back, never past; a trait outside 0 to 1 is held inside it.
    let previous = 0;
    for (let step = 0; step <= 100; step += 1) {
      const share = streamShare((step / 100) * PASS_STREAM_SECONDS, 0.5);
      expect(share).toBeGreaterThanOrEqual(previous);
      expect(share).toBeLessThanOrEqual(1);
      previous = share;
    }
    expect(streamShare(0.1, -3)).toBe(streamShare(0.1, 0));
    expect(streamShare(Number.NaN, 0.5)).toBe(1);
  });

  test("REQ-ENG-09 the stream as a whole starts at the card it left and ends at the next, and never runs back", () => {
    expect(meanStreamShare(0)).toBe(0);
    expect(meanStreamShare(PASS_STREAM_SECONDS)).toBeCloseTo(1, 12);
    expect(meanStreamShare(PASS_STREAM_SECONDS / 2)).toBeGreaterThan(0.5);
    expect(meanStreamShare(PASS_STREAM_SECONDS / 2)).toBeLessThan(0.95);
    let previous = 0;
    for (let step = 0; step <= 50; step += 1) {
      const share = meanStreamShare((step / 50) * PASS_STREAM_SECONDS);
      expect(share).toBeGreaterThanOrEqual(previous);
      previous = share;
    }
  });
});

describe("flow lines", () => {
  test("REQ-SCR-07 about four fifths of the particles stream on a few lines, one of them a closed ellipse, one or two brighter than the rest", () => {
    expect(FLOW_SHARE).toBeCloseTo(0.8, 9);
    const shares = FLOW_LINES.reduce((sum, line) => sum + line.share, 0);
    expect(shares).toBeCloseTo(1, 9);
    expect(FLOW_LINES.length).toBeGreaterThanOrEqual(3);
    expect(FLOW_LINES.length).toBeLessThanOrEqual(8);
    expect(FLOW_LINES.filter((line) => line.closed)).toHaveLength(1);

    const lights = FLOW_LINES.map((line) => line.light).sort((a, b) => b - a);
    expect(lights[1]).toBeGreaterThanOrEqual(0.8);
    for (const light of lights.slice(2)) expect(light).toBeLessThanOrEqual(0.6);
  });

  test("REQ-SCR-07 REQ-ENG-05 each particle's own seed puts it on a line or in the backdrop, in the lines' shares", () => {
    const random = seeded(7);
    const counts = new Array<number>(FLOW_LINES.length).fill(0);
    let backdrop = 0;
    const total = 200_000;
    for (let index = 0; index < total; index += 1) {
      const pick = trait(
        TRAITS.pick,
        Math.fround(random() * 2 - 1),
        Math.fround(random() * 2 - 1),
        Math.fround(random() * 2 - 1),
      );
      expect(pick).toBeGreaterThanOrEqual(0);
      expect(pick).toBeLessThan(1);
      const line = flowLineOf(pick);
      if (line < 0) backdrop += 1;
      else counts[line] = (counts[line] ?? 0) + 1;
    }
    expect(backdrop / total).toBeCloseTo(1 - FLOW_SHARE, 2);
    FLOW_LINES.forEach((line, index) => {
      expect((counts[index] ?? 0) / total).toBeCloseTo(
        line.share * FLOW_SHARE,
        2,
      );
    });
  });

  test("REQ-SCR-07 the flow clock is held until the bloom's release is complete, so the bloom still grows from the dot", () => {
    for (const release of [0, 0.3, 0.9, 0.99, Number.NaN]) {
      expect(flowClockStep(12, 1 / 60, release)).toEqual({
        clock: 12,
        delta: 0,
      });
    }
    // The lines start to take particles from the noise homes only near the
    // end of the release, and the clock waits for the release to finish.
    expect(FLOW_FROM).toBeGreaterThanOrEqual(0.9);
    expect(FLOW_FROM).toBeLessThan(FLOW_RELEASE_DONE);
    expect(FLOW_RELEASE_DONE).toBeLessThanOrEqual(1);
    const bloom = fineSweep.find(
      (progress) =>
        chapterTargets("bloom", progress).release >= FLOW_RELEASE_DONE,
    );
    expect(bloom).toBeGreaterThan(0.25);

    const running = flowClockStep(12, 1 / 60, 1);
    expect(running.clock).toBeCloseTo(12 + 1 / 60, 12);
    expect(running.delta).toBeCloseTo(1 / 60, 12);
    // No step for no time, or for time that is not a number.
    expect(flowClockStep(12, 0, 1)).toEqual({ clock: 12, delta: 0 });
    expect(flowClockStep(12, Number.NaN, 1)).toEqual({ clock: 12, delta: 0 });
    // It wraps at the period, where every line and drift repeats.
    const wrapped = flowClockStep(FLOW_PERIOD - 0.01, 0.02, 1);
    expect(wrapped.clock).toBeCloseTo(0.01, 9);
    expect(wrapped.delta).toBeCloseTo(0.02, 12);
  });

  test("REQ-SCR-07 every line and drift repeats at the flow period, so the clock wraps without a seam", () => {
    for (const line of FLOW_LINES) {
      expect(Number.isInteger(line.passes)).toBe(true);
      for (const wave of line.waves)
        expect(Number.isInteger(wave.drift)).toBe(true);
      for (const t of [0, 0.13, 0.5, 0.91]) {
        expect(flowAlong(t, line.passes, FLOW_PERIOD)).toBeCloseTo(
          flowAlong(t, line.passes, 0),
          6,
        );
        if (line.closed) {
          const start = orbitPoint(line, t, 0, landscape);
          const end = orbitPoint(line, t, FLOW_PERIOD, landscape);
          expect(end.x).toBeCloseTo(start.x, 6);
          expect(end.y).toBeCloseTo(start.y, 6);
        } else {
          const start = openLinePoint(line, t, 0);
          const end = openLinePoint(line, t, FLOW_PERIOD);
          expect(end.y).toBeCloseTo(start.y, 6);
        }
      }
    }
  });

  test("REQ-SCR-07 REQ-ENG-05 a particle whose line wraps is put back at the start outside the frame, judged by its own numbers only", () => {
    const random = seeded(11);
    const step = 1 / 30;
    let wraps = 0;
    for (const line of FLOW_LINES) {
      if (line.closed) continue;
      // Open lines start and end past the frame's sides.
      expect(Math.abs(openLinePoint(line, 0, 0).x)).toBeGreaterThan(1);
      expect(Math.abs(openLinePoint(line, 1, 0).x)).toBeGreaterThan(1);
      expect(FLOW_REACH).toBeGreaterThan(1);

      const alongs = Array.from({ length: 120 }, () => random());
      let clock = 0;
      const wrongWraps: number[] = [];
      const longMoves: number[] = [];
      for (let frame = 0; frame < 3_000; frame += 1) {
        const next = flowClockStep(clock, step, 1);
        for (const along of alongs) {
          const before = flowAlong(along, line.passes, clock);
          const after = flowAlong(along, line.passes, next.clock);
          const moved = Math.abs(before - after);
          if (flowWrapped(along, line.passes, next.clock, next.delta)) {
            wraps += 1;
            // It crossed the end of its line in this step, from one side of
            // the frame to the other: both places are outside the frame.
            const outside =
              Math.abs(openLinePoint(line, before, clock).x) > 1 &&
              Math.abs(openLinePoint(line, after, next.clock).x) > 1;
            if (!(moved > 0.5 && outside)) wrongWraps.push(along);
          } else if (!(moved < 0.01)) {
            // Otherwise it moved a short way along its line.
            longMoves.push(along);
          }
        }
        clock = next.clock;
      }
      expect(wrongWraps).toEqual([]);
      expect(longMoves).toEqual([]);
    }
    expect(wraps).toBeGreaterThan(0);
  });

  test("REQ-ENG-05 the clock's own wrap at the period moves no particle to the start", () => {
    for (const line of FLOW_LINES) {
      const next = flowClockStep(FLOW_PERIOD - 0.001, 0.002, 1);
      for (const along of [0.1, 0.4, 0.75]) {
        const plain = flowWrapped(
          along,
          line.passes,
          FLOW_PERIOD + 0.001,
          0.002,
        );
        expect(flowWrapped(along, line.passes, next.clock, next.delta)).toBe(
          plain,
        );
      }
    }
  });

  test.each([
    ["1280 by 800", landscape],
    ["1920 by 1080", wide],
    ["375 by 812", portrait],
  ] as const)(
    "REQ-SCR-07 at %s the ellipse closes round the wordmark, and the lines that keep running stay clear of it",
    (_, frame) => {
      const staged = stagedFrame(
        bloomStage(frame.halfWidth / frame.halfHeight),
        frame,
      );
      const extent = wordmarkExtent();
      const scale = fitScale(extent, staged.frame);
      const halfWidth = extent.halfWidth * scale;
      const halfHeight = extent.halfHeight * scale;
      const width = FLOW_WIDTH * shortHalf(frame);

      const ellipse = FLOW_LINES.find((line) => line.closed);
      expect(ellipse).toBeDefined();
      if (ellipse === undefined) return;
      const { a, b } = orbitAxes(frame);
      const wobble = 1 - ellipse.waves[0].amplitude;
      expect(a * wobble - width).toBeGreaterThan(halfWidth);
      expect(b * wobble - width).toBeGreaterThan(halfHeight);

      for (const line of FLOW_LINES) {
        if (line.closed || line.keeps === 0) continue;
        for (let t = 0; t <= 1; t += 1 / 400) {
          for (const clock of [0, 97, 311, 640]) {
            const point = openLinePoint(line, t, clock);
            if (Math.abs(point.x * frame.halfWidth) > halfWidth) continue;
            expect(
              Math.abs(point.y * frame.halfHeight) - width,
            ).toBeGreaterThan(halfHeight);
          }
        }
      }
    },
  );
});

describe("about strands and the contact sky", () => {
  test("REQ-SCR-01 about is three thin dotted strands across the full width, one bright and two faint, offset in phase", () => {
    expect(STRANDS).toHaveLength(3);
    expect(STRANDS.reduce((sum, strand) => sum + strand.share, 0)).toBeCloseTo(
      1,
      9,
    );
    const lights = STRANDS.map((strand) => strand.light).sort((a, b) => b - a);
    expect(lights[0]).toBe(1);
    expect(lights[1]).toBeLessThanOrEqual(0.5);
    expect(lights[2]).toBeLessThanOrEqual(0.5);
    expect(new Set(STRANDS.map((strand) => strand.phase)).size).toBe(3);

    for (const frame of [landscape, portrait]) {
      const band = strandsBand(frame);
      for (const strand of STRANDS) {
        // Past both sides of the frame.
        expect(strandPoint(strand, -1, 0, 0, frame).x).toBeLessThan(
          -frame.halfWidth,
        );
        expect(strandPoint(strand, 1, 0, 0, frame).x).toBeGreaterThan(
          frame.halfWidth,
        );
        expect(STRANDS_REACH).toBeGreaterThan(1);
        for (let place = -1; place <= 1; place += 1 / 64) {
          for (const offset of [-1, 0, 1]) {
            for (const seconds of [0, 3.7, 40]) {
              const point = strandPoint(strand, place, offset, seconds, frame);
              expect(Math.abs(point.y - band.centreY)).toBeLessThanOrEqual(
                band.halfHeight + 1e-9,
              );
            }
          }
        }
      }
      // Above the middle of the frame, where the preview draws them over
      // the about text, and well inside the screen.
      expect(band.centreY).toBeGreaterThan(0);
      expect(band.centreY + band.halfHeight).toBeLessThan(frame.halfHeight);
    }
  });

  test("REQ-SCR-01 the strands keep their size as the screen narrows, so a phone sees about one wave of the bright strand", () => {
    const bright = STRANDS.find((strand) => strand.light === 1);
    expect(bright).toBeDefined();
    if (bright === undefined) return;
    const waves = (frame: Frame) =>
      (2 * frame.halfWidth) / (bright.wavelength * frame.halfHeight);
    expect(waves({ halfWidth: 1440 / 2, halfHeight: 900 / 2 })).toBeCloseTo(
      4,
      1,
    );
    expect(waves(portrait)).toBeGreaterThan(0.8);
    expect(waves(portrait)).toBeLessThan(1.6);
  });

  test("REQ-SCR-01 the ellipse is wider on a narrow frame, where the wordmark takes the whole width", () => {
    expect(orbitAxes(portrait).a).toBeCloseTo(
      ORBIT_WIDTH_NARROW * portrait.halfWidth,
      9,
    );
    expect(orbitAxes(landscape).a).toBeCloseTo(
      ORBIT_WIDTH * landscape.halfWidth,
      9,
    );
    expect(ORBIT_WIDTH_NARROW).toBeGreaterThan(ORBIT_WIDTH);
  });

  test("REQ-SCR-01 the strands are thinner than a halftone cell, so each reads as one thin dotted line", () => {
    // In CSS pixels at 1280 by 800: a strand's half thickness is a share of
    // the half height (400).
    expect(2 * STRAND_THICKNESS * 400).toBeLessThan(8);
    expect(STRANDS_LIT).toBeGreaterThan(1);
  });

  test("D-146 the sky's particles are stars, constellation lines and a faint dust, and its light counts a small share of the frame", () => {
    expect(SKY_STAR_SHARE).toBeGreaterThan(0.5);
    expect(SKY_FORMED_SHARE).toBeGreaterThan(SKY_STAR_SHARE);
    expect(SKY_FORMED_SHARE).toBeLessThan(1);
    expect(SKY_AREA).toBeGreaterThan(0);
    expect(SKY_AREA).toBeLessThan(0.2);
    // The dust between the stars stays, faint, so the field never goes out.
    expect(SKY_DIM).toBeGreaterThan(0.5);
    expect(SKY_DIM).toBeLessThan(1);
    expect(SKY_NOISE).toBeLessThan(AMBIENT.noise);
  });
});
