import { describe, expect, test } from "vitest";

import { WORK_SHAPES, type ShapeId } from "../story";
import type { ChapterId } from "../types";
import {
  AMBIENT,
  FORMED_GAIN,
  FULL_STAGE,
  SHAPE_FIT,
  calmKey,
  calmProgress,
  chapterTargets,
  cleanStage,
  fitScale,
  follow,
  formationStage,
  formedArea,
  formedLight,
  releaseRankScale,
  stagedFrame,
  type ShapeExtent,
  type StoryTargets,
} from "./story";

const CHAPTERS: ChapterId[] = [
  "hero",
  "bloom",
  "work",
  "making-of",
  "about",
  "contact",
];
const SHAPES: ShapeId[] = ["logo", ...WORK_SHAPES];
const sweep = Array.from({ length: 201 }, (_, index) => index / 200);
// Fine enough that the steepest ease, the first study gathering over a
// twentieth of the chapter, moves less than a tenth between two positions.
const fineSweep = Array.from({ length: 1001 }, (_, index) => index / 1000);

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

describe("every chapter", () => {
  test.each(CHAPTERS)(
    "REQ-SCR-01 %s keeps every value in range and at most one formation at a time",
    (chapter) => {
      for (const progress of sweep) {
        const targets = chapterTargets(chapter, progress);
        for (const key of [
          "release",
          "shapeMix",
          "shape",
          "sheet",
          "wave",
          "noise",
          "push",
        ] as const) {
          expect(targets[key]).toBeGreaterThanOrEqual(0);
          expect(targets[key]).toBeLessThanOrEqual(1);
        }
        const formations = [targets.shape, targets.sheet, targets.wave];
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
        for (const key of ["release", "sheet", "wave", "push"] as const) {
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
      });
    }
  });

  test("REQ-SCR-07 the bloom lets the field go by about 0.35, gathers the mark, holds it and lets it dissolve", () => {
    expect(chapterTargets("bloom", 0).release).toBe(0);
    const opening = chapterTargets("bloom", 0.15).release;
    expect(opening).toBeGreaterThan(0);
    expect(opening).toBeLessThan(1);
    expect(chapterTargets("bloom", 0.35).release).toBe(1);
    expect(chapterTargets("bloom", 0.35).shape).toBe(0);

    for (const progress of [0.52, 0.6, 0.7]) {
      const formed = chapterTargets("bloom", progress);
      expect(formed.shape).toBe(1);
      expect(formed.shapeFrom).toBe("logo");
      expect(formed.shapeTo).toBe("logo");
    }

    const dissolving = chapterTargets("bloom", 0.82).shape;
    expect(dissolving).toBeGreaterThan(0);
    expect(dissolving).toBeLessThan(1);
    expect(chapterTargets("bloom", 0.95).shape).toBe(0);
    expect(chapterTargets("bloom", 1)).toEqual(AMBIENT);
  });

  test("REQ-SCR-07 the bloom never pushes the camera and keeps the flow's noise", () => {
    for (const progress of sweep) {
      const targets = chapterTargets("bloom", progress);
      expect(targets.push).toBe(0);
      expect(targets.noise).toBe(1);
      expect(targets.sheet + targets.wave).toBe(0);
    }
  });
});

describe("work", () => {
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
  test.each([
    ["making-of", "sheet"],
    ["about", "wave"],
  ] as const)(
    "REQ-SCR-01 %s gathers its %s over the first quarter, holds it and lets go at the end",
    (chapter, key) => {
      expect(chapterTargets(chapter, 0)[key]).toBe(0);
      expect(chapterTargets(chapter, 0.1)[key]).toBeGreaterThan(0);
      expect(chapterTargets(chapter, 0.25)[key]).toBe(1);
      expect(chapterTargets(chapter, 0.5)[key]).toBe(1);
      expect(chapterTargets(chapter, 0.85)[key]).toBe(1);
      expect(chapterTargets(chapter, 1)[key]).toBe(0);
      expect(chapterTargets(chapter, 0.5).push).toBe(0);
      expect(chapterTargets(chapter, 0.5).release).toBe(1);
    },
  );

  test("REQ-SCR-01 contact settles the field on its homes with a gentler drift", () => {
    for (const progress of [0, 0.5, 1]) {
      const targets = chapterTargets("contact", progress);
      expect(targets.shape + targets.sheet + targets.wave).toBe(0);
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
    expect(calmKey("work", 0.19)).toBe("work:0");
    expect(calmKey("work", 0.2)).toBe("work:1");
    expect(calmKey("work", 1)).toBe("work:4");
  });

  test("REQ-A11Y-03 each calm still is its chapter at its fullest: the dot, the whole mark, each study whole, the sheet, the wave, the rest", () => {
    const calm = (chapter: ChapterId, progress: number) =>
      chapterTargets(chapter, calmProgress(chapter, progress));

    expect(calm("hero", 0.7).release).toBe(0);

    const bloom = calm("bloom", 0.05);
    expect(bloom.release).toBe(1);
    expect(bloom.shape).toBe(1);
    expect(bloom.shapeFrom).toBe("logo");

    for (const [index, id] of WORK_SHAPES.entries()) {
      const near = (index + 0.05) / WORK_SHAPES.length;
      const work = calm("work", near);
      expect(work.shape).toBe(1);
      expect(shapeShares(work)[id]).toBe(1);
    }

    expect(calm("making-of", 0.99).sheet).toBe(1);
    expect(calm("about", 0).wave).toBe(1);
    expect(calm("contact", 1)).toEqual(chapterTargets("contact", 0.5));
  });
});

describe("fit and light", () => {
  const wide: ShapeExtent = { halfWidth: 1, halfHeight: 0.4, area: 1.2 };
  const tall: ShapeExtent = { halfWidth: 0.5, halfHeight: 1, area: 1.4 };
  // Half frames at the focus plane: 1280 x 800 and 375 x 812.
  const landscape = { halfWidth: 2.33 * 1.6, halfHeight: 2.33 };
  const portrait = { halfWidth: 2.33 * (375 / 812), halfHeight: 2.33 };

  test.each([
    ["a wide shape, landscape", wide, landscape],
    ["a wide shape, portrait", wide, portrait],
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
    SHAPES.map((id) => [id, id === "logo" ? wide : tall]),
  ) as Record<ShapeId, ShapeExtent>;

  test("REQ-A11Y-06 the ambient field keeps its light; a formation dims each sprite by the share of the frame it packs into", () => {
    expect(formedLight(AMBIENT, extents, landscape)).toBe(1);
    expect(
      formedLight(chapterTargets("contact", 0.5), extents, landscape),
    ).toBe(1);

    const logo = chapterTargets("bloom", 0.6);
    const area = formedArea(logo, extents, landscape);
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThan(1);
    expect(formedLight(logo, extents, landscape)).toBeCloseTo(
      area * FORMED_GAIN,
      9,
    );

    // The thin wave packs tighter than the sheet, so its sprites give less.
    const sheet = formedLight(
      chapterTargets("making-of", 0.5),
      extents,
      portrait,
    );
    const wave = formedLight(chapterTargets("about", 0.5), extents, portrait);
    expect(wave).toBeLessThan(sheet);
    expect(sheet).toBeLessThanOrEqual(1);
  });

  test("REQ-A11Y-06 a half formed field takes the light halfway between", () => {
    const whole = formedLight(chapterTargets("about", 0.5), extents, landscape);
    const half = formedLight(
      { ...chapterTargets("about", 0.5), wave: 0.5 },
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

describe("stages", () => {
  const frame = { halfWidth: 3, halfHeight: 2 };

  test("REQ-SCR-01 a chapter with no stage forms in the middle of the whole frame", () => {
    expect(cleanStage(undefined)).toEqual(FULL_STAGE);
    expect(stagedFrame(undefined, frame)).toEqual({
      centreX: 0,
      centreY: 0,
      frame,
    });
    expect(formationStage("bloom", { work: FULL_STAGE })).toBeUndefined();
    expect(formationStage(null, { work: FULL_STAGE })).toBeUndefined();
  });

  test("REQ-SCR-01 REQ-I18N-01 a stage turns into a centre and halves at the focus plane, on either side", () => {
    const end = { x: 0.5, y: -0.25, halfWidth: 0.4, halfHeight: 0.9 };
    const staged = stagedFrame(end, frame);
    expect(staged.centreX).toBeCloseTo(1.5, 12);
    expect(staged.centreY).toBeCloseTo(-0.5, 12);
    expect(staged.frame.halfWidth).toBeCloseTo(1.2, 12);
    expect(staged.frame.halfHeight).toBeCloseTo(1.8, 12);
    // A right to left page measures its free half on the other side.
    expect(stagedFrame({ ...end, x: -0.5 }, frame).centreX).toBe(-1.5);
    expect(formationStage("work", { work: end })).toBe(end);
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
