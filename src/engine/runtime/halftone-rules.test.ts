import { describe, expect, test } from "vitest";

import {
  AMBIENT_TONE,
  BACKDROP_GAIN,
  BACK_DIM,
  CELL_PX,
  CHECK_ALPHA,
  DENSE_WHITE_TO,
  DOT_DIM_FLOOR,
  DOT_RADIUS_MAX,
  DOT_RADIUS_MIN,
  FILL_TONE,
  FRAME_FADE_CELLS,
  GLOW_FROM,
  GLOW_GAIN,
  GLOW_TAPS,
  HALO_ALPHA,
  HALO_REACH_PX,
  HALO_REACH_WIDTH_PX,
  RIM_FRONT_FROM,
  RIM_FRONT_TO,
  HERO_DOT_PX,
  HERO_FADE,
  LINE_GAIN,
  NEAR_FROM,
  ON_SCREEN,
  RIM_WEIGHT,
  RING_INNER_LIGHT,
  RING_INNER_PX,
  RING_OUTER_LIGHT,
  RING_OUTER_PX,
  SPLAT_SUB,
  SPRINKLE_CELLS,
  SPRINKLE_MIX,
  SPRINKLE_TONE,
  SWIRL_RADIUS,
  SWIRL_TURN,
  TONE_FULL,
  TONE_GLOW,
  NARROW_BELOW_PX,
  NARROW_CELL_PX,
  backdropWeight,
  blurWeights,
  cellFor,
  cellTone,
  checkPassed,
  densityScale,
  discCoverage,
  dotColour,
  dotLight,
  dotRadius,
  frameLattice,
  gatherTaps,
  glowLight,
  gridFor,
  halftoneLight,
  haloAlpha,
  haloReach,
  heroCore,
  heroLight,
  liveLook,
  nearActivity,
  particleWeight,
  rimWeight,
  ringLight,
  smoothstep,
  softBackdropWeight,
  speedShare,
  sprinkle,
  splatSize,
  stageToCss,
  swirlTurn,
  tent,
  worldToCss,
} from "./halftone-rules";
import { FLOW_SHARE, TRAITS, trait } from "./story";

// The halftone's rules as plain numbers. halftone.ts and field.ts build the
// same formulas in TSL and name the rule beside each line, so these tests
// hold the numbers the GPU draws with (REQ-ENG-05: every rule is per cell or
// per particle, the same on WebGPU and WebGL2).

const COUNTS = [100_000, 250_000, 1_000_000];
const SIZES: Array<[number, number]> = [
  [1280, 800],
  [375, 812],
  [1920, 1080],
];

describe("the cell grid", () => {
  test("REQ-PERF-06 the grid is whole 8 px cells from the CSS size, a little larger than the canvas and centred on it", () => {
    expect(gridFor(1280, 800)).toEqual({
      cell: CELL_PX,
      columns: 160,
      rows: 100,
      padX: 0,
      padY: 0,
    });
    const odd = gridFor(1001, 503);
    expect(odd.columns).toBe(126);
    expect(odd.rows).toBe(63);
    expect(odd.padX).toBeCloseTo(3.5);
    expect(odd.padY).toBeCloseTo(0.5);
    for (const [width, height] of SIZES) {
      const grid = gridFor(width, height);
      expect(grid.columns * grid.cell).toBeGreaterThanOrEqual(width);
      expect(grid.columns * grid.cell - width).toBeLessThan(grid.cell);
      expect(grid.rows * grid.cell - height).toBeLessThan(grid.cell);
    }
  });

  test("REQ-PERF-06 a canvas under 480 px wide gets 6 px cells, so the wordmark does not read thin on a phone", () => {
    expect(cellFor(479)).toBe(NARROW_CELL_PX);
    expect(cellFor(NARROW_BELOW_PX)).toBe(CELL_PX);
    expect(NARROW_CELL_PX).toBe(6);
    expect(gridFor(375, 812)).toEqual({
      cell: 6,
      columns: 63,
      rows: 136,
      padX: 1.5,
      padY: 2,
    });
    // A smaller cell draws a smaller dot, with the same gap round it.
    expect(dotRadius(TONE_FULL, 6)).toBeCloseTo((DOT_RADIUS_MAX * 6) / 8);
    expect(2 * dotRadius(TONE_FULL, 6)).toBeLessThan(6);
  });

  test("REQ-PERF-06 the grid depends on the CSS size only, so a pixel-ratio step never moves the lattice", () => {
    // gridFor takes no ratio: the runtime sizes the drawing buffer at every
    // adaptive step, and the cells stay where they were.
    expect(gridFor.length).toBe(2);
    expect(gridFor(0, 0)).toMatchObject({ columns: 1, rows: 1 });
    // A size that is not a number counts as one pixel wide: a narrow cell.
    expect(gridFor(Number.NaN, 800)).toMatchObject({ columns: 1, rows: 134 });
  });

  test("REQ-ENG-05 a splat sprite is one splat texel wide at every depth", () => {
    const fov = 50;
    const tanHalf = Math.tan((fov * Math.PI) / 360);
    for (const height of [500, 800, 1080]) {
      for (const depth of [3.4, 5, 6.5]) {
        // World units per CSS pixel at that depth, and the sprite's width.
        const perPixel = (2 * depth * tanHalf) / height;
        for (const cell of [CELL_PX, NARROW_CELL_PX]) {
          const widthPx = (splatSize(height, fov, cell) * depth) / perPixel;
          expect(widthPx).toBeCloseTo(cell / SPLAT_SUB, 6);
        }
      }
    }
  });
});

describe("the splat and its gather", () => {
  test("REQ-ENG-05 the tent shares each particle across its four nearest cells and keeps all of its light", () => {
    for (const [fx, fy] of [
      [0, 0],
      [0.25, 0.75],
      [0.5, 0.5],
      [0.9, 0.1],
    ] as const) {
      const sum =
        tent(fx, fy) +
        tent(1 - fx, fy) +
        tent(fx, 1 - fy) +
        tent(1 - fx, 1 - fy);
      expect(sum).toBeCloseTo(1, 10);
    }
    expect(tent(1, 0)).toBe(0);
    expect(tent(-1.5, 0)).toBe(0);
  });

  test("REQ-ENG-05 the gather reads two cells' worth of splat texels per axis, and each texel's weights to its two cells add up to 1", () => {
    const taps = gatherTaps();
    expect(taps).toHaveLength(2 * SPLAT_SUB);
    expect(taps.map((tap) => tap.offset)).toEqual(
      Array.from(
        { length: 2 * SPLAT_SUB },
        (_, index) => index - SPLAT_SUB / 2,
      ),
    );
    // A texel at offset o from one cell's first texel sits at o - SPLAT_SUB
    // from the next cell's: its two weights add up to 1.
    for (const tap of taps) {
      const next = taps.find(
        (other) => other.offset === tap.offset - SPLAT_SUB,
      );
      const previous = taps.find(
        (other) => other.offset === tap.offset + SPLAT_SUB,
      );
      const partner = next ?? previous;
      expect(partner).toBeDefined();
      expect(tap.weight + (partner?.weight ?? 0)).toBeCloseTo(1, 10);
    }
    // Symmetric about the cell's centre, highest next to it.
    const weights = taps.map((tap) => tap.weight);
    expect(weights).toEqual([...weights].reverse());
    expect(Math.max(...weights)).toBeCloseTo(1 - 0.5 / SPLAT_SUB, 10);
    for (const tap of taps) {
      expect(tap.weight).toBeCloseTo(
        tent((tap.offset - SPLAT_SUB / 2 + 0.5) / SPLAT_SUB, 0),
        10,
      );
    }
  });

  test("REQ-PERF-06 the ambient field lands on the ambient tone at every count and size", () => {
    for (const count of COUNTS) {
      for (const [width, height] of SIZES) {
        const cell = cellFor(width);
        const cells = (width * height) / (cell * cell);
        const perCell = (count * ON_SCREEN) / cells;
        expect(perCell * densityScale(count, width, height)).toBeCloseTo(
          AMBIENT_TONE,
          10,
        );
      }
    }
  });

  test("REQ-A11Y-06 a formation's fill lands on the glow token's tone, whatever area it packs into", () => {
    for (const area of [0.03, 0.08, 0.15]) {
      const light = halftoneLight(area, 1);
      // Every formed particle on screen, packed into area of the frame.
      const tone = (light * AMBIENT_TONE) / (area * ON_SCREEN);
      expect(tone).toBeCloseTo(FILL_TONE, 10);
    }
    expect(halftoneLight(0.05, 0)).toBe(1);
    expect(halftoneLight(0.05, 0.5)).toBeGreaterThan(halftoneLight(0.05, 1));
    // A formation as wide as the frame is never brightened, a tiny one
    // never vanishes.
    expect(halftoneLight(1, 1)).toBe(1);
    expect(halftoneLight(0, 1)).toBeGreaterThan(0);
    expect(halftoneLight(Number.NaN, 1)).toBe(1);
  });
});

describe("each particle's weight", () => {
  test("REQ-SCR-07 a formed particle splats at the formation's light, a line particle at its line's, and the backdrop is the ambient field until the lines take over", () => {
    expect(particleWeight(1, 0.2, 1, 1, 0, 1)).toBeCloseTo(0.2);
    expect(particleWeight(0, 0.2, 1, 1, 0.8, 0)).toBeCloseTo(LINE_GAIN * 0.8);
    // Before the lines take over every particle is the ambient field.
    expect(particleWeight(0, 0.2, 1, 0, 0, 1)).toBe(1);
    expect(particleWeight(0, 0.2, 0, 0, 0, backdropWeight(0, 0, 9))).toBe(1);
  });

  test("REQ-PERF-06 once the lines take over, only the sprinkle of the backdrop is lit, the same share of cells at every count", () => {
    expect(backdropWeight(1, 0, 50)).toBe(0);
    expect(backdropWeight(1, 1, 50)).toBe(50);
    expect(backdropWeight(0.5, 1, 50)).toBeCloseTo(25.5);
    for (const [width, height] of SIZES) {
      const totals = COUNTS.map((count) => {
        const { share, gain } = sprinkle(count, width, height, FLOW_SHARE);
        expect(share).toBeGreaterThan(0);
        expect(share).toBeLessThanOrEqual(1);
        // One lit particle alone has the sprinkle's tone.
        expect(gain * densityScale(count, width, height)).toBeCloseTo(
          SPRINKLE_TONE,
          10,
        );
        const cell = cellFor(width);
        const cells = (width * height) / (cell * cell);
        const backdrop = count * ON_SCREEN * (1 - FLOW_SHARE);
        return (share * backdrop) / cells;
      });
      for (const total of totals) expect(total).toBeCloseTo(SPRINKLE_CELLS, 10);
    }
  });

  test("REQ-ENG-05 the sprinkle's pick is the particle's own even number, apart from its flow pick", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    };
    let below = 0;
    let both = 0;
    const total = 20_000;
    for (let index = 0; index < total; index += 1) {
      const [x, y, z] = [random(), random(), random()];
      const pick = trait(SPRINKLE_MIX, x, y, z);
      const flow = trait(TRAITS.pick, x, y, z);
      if (pick < 0.1) below += 1;
      if (pick < 0.1 && flow >= FLOW_SHARE) both += 1;
    }
    expect(below / total).toBeGreaterThan(0.09);
    expect(below / total).toBeLessThan(0.11);
    // Independent of being in the backdrop at all.
    expect(both / total).toBeCloseTo(0.1 * (1 - FLOW_SHARE), 2);
  });

  test("REQ-ENG-05 the soft look keeps its own brighter backdrop, and an outline splats heavier", () => {
    expect(softBackdropWeight(0)).toBe(1);
    expect(softBackdropWeight(1)).toBe(BACKDROP_GAIN);
    expect(rimWeight(0)).toBe(1);
    expect(rimWeight(1)).toBe(1 + RIM_WEIGHT);
    expect(rimWeight(4)).toBe(1 + RIM_WEIGHT);
    expect(rimWeight(Number.NaN)).toBe(1);
  });
});

describe("a cell's dot", () => {
  test("REQ-ENG-05 tone follows the summed weight, dimmed for the layers behind", () => {
    expect(cellTone(100, 0.005, 0)).toBeCloseTo(0.5);
    expect(cellTone(100, 0.005, 1)).toBeCloseTo(0.5 * (1 - BACK_DIM));
    expect(cellTone(-3, 0.005, 0)).toBe(0);
  });

  test("REQ-ENG-05 a dot's area follows its tone up to its full size, and a dot under the smallest size fades out", () => {
    expect(dotRadius(0)).toBe(0);
    expect(dotRadius(TONE_FULL)).toBeCloseTo(DOT_RADIUS_MAX);
    expect(dotRadius(4)).toBeCloseTo(DOT_RADIUS_MAX);
    expect(dotRadius(0.25)).toBeCloseTo(DOT_RADIUS_MAX / 2);
    // Every 8 px cell keeps a gap round its dot.
    expect(2 * DOT_RADIUS_MAX).toBeLessThan(CELL_PX);
    for (const ratio of [0.75, 1, 2]) {
      expect(discCoverage(2, 0, ratio)).toBe(1);
      expect(discCoverage(2, 3, ratio)).toBe(0);
      expect(discCoverage(DOT_RADIUS_MIN / 2, 0, ratio)).toBe(0);
    }
    // The edge is one device pixel wide at any ratio.
    expect(discCoverage(2, 2, 1)).toBeCloseTo(0.5);
    expect(discCoverage(2, 2.25, 2)).toBeCloseTo(0);
  });

  test("REQ-A11Y-06 sparse cells are violet, a fill is the glow token, and only rims and the densest formed cells turn white", () => {
    expect(dotColour(0.05, 0, 0, 0)).toEqual({ glow: 0, white: 0 });
    expect(dotColour(FILL_TONE, 0, 0, 1)).toEqual({ glow: 1, white: 0 });
    expect(dotColour(TONE_GLOW, 0, 0, 0).glow).toBe(1);
    // A rim cell of a fill turns white.
    expect(dotColour(FILL_TONE, 0, 1, 1).white).toBe(1);
    // A lone particle in flight with a rim weight does not flash white.
    expect(dotColour(0.1, 0, 1, 1).white).toBe(0);
    // The densest cells turn white only while the field is formed.
    expect(dotColour(DENSE_WHITE_TO, 0, 0, 1).white).toBe(1);
    expect(dotColour(DENSE_WHITE_TO, 0, 0, 0).white).toBe(0);
    // A fast cell leans toward glow.
    expect(dotColour(0.05, 1, 0, 0).glow).toBeGreaterThan(0.5);
    expect(speedShare(0)).toBe(0);
    expect(speedShare(10)).toBe(1);
  });

  test("REQ-A11Y-06 only the front layer's rim turns white: an outline behind it keeps the accent, as the preview's sheets and cards do", () => {
    // The front layer's rim, its depth of layer 0.
    expect(dotColour(FILL_TONE, 0, 1, 1, 0).white).toBe(1);
    expect(dotColour(FILL_TONE, 0, 1, 1).white).toBe(1);
    // A sheet or card behind, from 0.25 of a layer back, stays glow.
    expect(dotColour(FILL_TONE, 0, 1, 1, 0.25)).toEqual({ glow: 1, white: 0 });
    expect(dotColour(FILL_TONE, 0, 1, 1, RIM_FRONT_TO).white).toBe(0);
    // ArcheLab's last line, a tenth back, is between the two.
    const between = dotColour(FILL_TONE, 0, 1, 1, 0.1).white;
    expect(between).toBeGreaterThan(0.3);
    expect(between).toBeLessThan(0.7);
    expect(RIM_FRONT_FROM).toBeLessThan(0.1);
    // The densest cells still turn white wherever layers cross.
    expect(dotColour(DENSE_WHITE_TO, 0, 0, 1, 0.5).white).toBe(1);
  });

  test("REQ-A11Y-06 a small dot is a dim one, and a fill is at full light", () => {
    expect(dotLight(0)).toBe(DOT_DIM_FLOOR);
    expect(dotLight(FILL_TONE)).toBe(1);
    expect(dotLight(0.2)).toBeGreaterThan(DOT_DIM_FLOOR);
    expect(dotLight(0.2)).toBeLessThan(1);
  });
});

describe("the glow and the lattice", () => {
  test("REQ-ENG-05 one blur pass adds up to 1 and falls away from the centre", () => {
    const weights = blurWeights();
    expect(weights).toHaveLength(GLOW_TAPS + 1);
    const total = weights.reduce(
      (sum, weight, tap) => sum + (tap === 0 ? weight : 2 * weight),
      0,
    );
    expect(total).toBeCloseTo(1, 10);
    for (let tap = 1; tap < weights.length; tap += 1) {
      expect(weights[tap] ?? 0).toBeLessThan(weights[tap - 1] ?? 0);
    }
  });

  test("REQ-A11Y-06 the glow and the lattice show only near activity, and the glow stays faint", () => {
    expect(glowLight(0)).toBe(0);
    expect(glowLight(GLOW_FROM)).toBe(0);
    expect(glowLight(5)).toBeCloseTo(GLOW_GAIN);
    expect(GLOW_GAIN).toBeLessThan(0.2);
    expect(nearActivity(NEAR_FROM)).toBe(0);
    expect(nearActivity(1)).toBe(1);
  });

  test("REQ-SCR-01 the lattice fills a work frame and fades in over its edge", () => {
    expect(frameLattice(-4)).toBe(0);
    expect(frameLattice(0)).toBe(0);
    expect(frameLattice(FRAME_FADE_CELLS * CELL_PX)).toBe(1);
    expect(frameLattice(200)).toBe(1);
  });

  test.each([CELL_PX, NARROW_CELL_PX])(
    "REQ-SCR-01 with %i px cells the frame's lattice fades over FRAME_FADE_CELLS of them, as the pass reads the live cell",
    (cell) => {
      const fade = FRAME_FADE_CELLS * cell;
      expect(frameLattice(0, cell)).toBe(0);
      expect(frameLattice(fade / 2, cell)).toBeCloseTo(0.5, 12);
      expect(frameLattice(fade, cell)).toBe(1);
      expect(frameLattice(fade + 1, cell)).toBe(1);
      // The pass's own rule: smoothstep of the inset in cells over 0 to 2.
      for (const inset of [1, 3, 5, 9, 11, 14]) {
        const t = Math.min(Math.max(inset / cell / FRAME_FADE_CELLS, 0), 1);
        expect(frameLattice(inset, cell)).toBeCloseTo(t * t * (3 - 2 * t), 12);
      }
    },
  );
});

describe("the hero dot", () => {
  test("REQ-SCR-07 the dot and its halo are lit in the hero and gone once the bloom has let half the field go", () => {
    expect(heroLight(0)).toBe(1);
    expect(heroLight(HERO_FADE)).toBe(0);
    expect(heroLight(1)).toBe(0);
  });

  test("REQ-SCR-07 the dot is a solid disc in two soft rings of lower light that breathe with the pulse", () => {
    expect(heroCore(0, 1)).toBe(1);
    expect(heroCore(HERO_DOT_PX + 1, 1)).toBe(0);
    // Inside the inner ring both rings' light, between them the outer's.
    expect(ringLight(HERO_DOT_PX, 0)).toBeCloseTo(
      RING_INNER_LIGHT + RING_OUTER_LIGHT,
      3,
    );
    expect(ringLight((RING_INNER_PX + RING_OUTER_PX) / 2, 0)).toBeCloseTo(
      RING_OUTER_LIGHT,
      3,
    );
    expect(ringLight(RING_OUTER_PX * 2, 0)).toBe(0);
    // The pulse breathes them: brighter and wider at its peak.
    expect(ringLight(RING_INNER_PX, 1)).toBeGreaterThan(
      ringLight(RING_INNER_PX, 0),
    );
    expect(ringLight(RING_INNER_PX, -1)).toBeLessThan(
      ringLight(RING_INNER_PX, 0),
    );
    // The rings stay well under the dot: a soft light, never a second dot.
    expect(RING_INNER_LIGHT + RING_OUTER_LIGHT).toBeLessThan(0.15);
  });

  test("REQ-SCR-07 the swell draws the disc, the rings and the halo larger, each in proportion", () => {
    const swell = 2;
    expect(heroCore(HERO_DOT_PX * 1.5, 1, swell)).toBe(1);
    expect(heroCore(HERO_DOT_PX * swell + 1, 1, swell)).toBe(0);
    for (const distance of [0, 9, 23, 30, 41, 60]) {
      expect(ringLight(distance * swell, 0.4, swell)).toBeCloseTo(
        ringLight(distance, 0.4),
        6,
      );
      expect(haloAlpha(distance * swell, 120, swell)).toBeCloseTo(
        haloAlpha(distance, 120),
        6,
      );
    }
    // The light stays as it is: only the size grows.
    expect(ringLight(0, 0, swell)).toBeCloseTo(ringLight(0, 0), 6);
    expect(haloAlpha(0, 170, swell)).toBe(HALO_ALPHA);
  });

  test("REQ-SCR-07 the halo's lattice fades with distance to nothing at its reach", () => {
    expect(haloAlpha(0, 170)).toBe(HALO_ALPHA);
    expect(haloAlpha(85, 170)).toBeCloseTo(HALO_ALPHA / 4);
    expect(haloAlpha(170, 170)).toBe(0);
    expect(haloAlpha(400, 170)).toBe(0);
  });

  test("REQ-SCR-07 the halo's reach comes from the hero stage's halves, the smaller in pixels, or a set reach without one", () => {
    expect(haloReach(undefined, 1280, 800)).toBe(HALO_REACH_PX);
    const stage = { x: 0.5, y: 0, halfWidth: 0.25, halfHeight: 0.5 };
    // Half sizes of 160 and 200 CSS px: a round halo takes 160.
    expect(haloReach(stage, 1280, 800)).toBeCloseTo(160);
    expect(haloReach({ ...stage, halfWidth: 0 }, 1280, 800)).toBe(
      HALO_REACH_PX,
    );
    expect(haloReach({ ...stage, halfHeight: Number.NaN }, 1280, 800)).toBe(
      HALO_REACH_PX,
    );
  });

  test("REQ-SCR-07 the halo reaches about 170 px at 1440 px, as the preview's does, whatever the 16rem dot box", () => {
    // The dot box from 1024 px: 256 by 256 CSS px.
    const box = (width: number, height: number) => ({
      x: 0.5,
      y: 0,
      halfWidth: 256 / width,
      halfHeight: 256 / height,
    });
    expect(haloReach(box(1440, 900), 1440, 900)).toBeCloseTo(170, 9);
    expect(HALO_REACH_WIDTH_PX).toBe(1440);
    // In proportion below it, as the preview's mask is, never past it.
    expect(haloReach(box(1280, 800), 1280, 800)).toBeCloseTo(
      (170 * 1280) / 1440,
      9,
    );
    expect(haloReach(box(1920, 1080), 1920, 1080)).toBe(HALO_REACH_PX);
    // Never smaller than half the box: at 1024 the box's 128 holds.
    expect(haloReach(box(1024, 768), 1024, 768)).toBe(128);
    // A phone's dot room keeps its own reach.
    const phone = { x: 0, y: 0.6, halfWidth: 343 / 375, halfHeight: 200 / 812 };
    expect(haloReach(phone, 375, 812)).toBeCloseTo(100, 9);
  });
});

describe("places on the screen", () => {
  test("REQ-SCR-01 a point at the focus plane and a stage map to CSS pixels, y down", () => {
    expect(worldToCss(0, 0, 2, 1, 1000, 500)).toEqual({ x: 500, y: 250 });
    expect(worldToCss(2, 1, 2, 1, 1000, 500)).toEqual({ x: 1000, y: 0 });
    expect(worldToCss(-2, -1, 2, 1, 1000, 500)).toEqual({ x: 0, y: 500 });
    expect(
      stageToCss(
        { x: 0.5, y: -0.5, halfWidth: 0.25, halfHeight: 0.5 },
        1000,
        500,
      ),
    ).toEqual({ x: 750, y: 375, halfWidth: 125, halfHeight: 125 });
  });

  test("REQ-SCR-06 the swirl turns the particles nearest the pointer most, and none while it does not stir", () => {
    expect(swirlTurn(0, 0, 0)).toBe(0);
    expect(swirlTurn(0, 1, 0)).toBeCloseTo(SWIRL_TURN);
    expect(swirlTurn(SWIRL_RADIUS, 1, 0)).toBeCloseTo(SWIRL_TURN / Math.E);
    expect(swirlTurn(SWIRL_RADIUS * 4, 1, 0)).toBeLessThan(1e-6);
    expect(swirlTurn(0, 1, 1)).toBeGreaterThan(swirlTurn(0, 1, -1));
  });
});

describe("the look", () => {
  test("REQ-ENG-08 the start check passes only when two draws summed past 1 in half float", () => {
    const expected = (2 * CHECK_ALPHA - 1) * 255;
    expect(checkPassed(expected)).toBe(true);
    expect(checkPassed(Math.round(expected))).toBe(true);
    // Clamped at 1 on an 8-bit target, or not blended at all.
    expect(checkPassed(0)).toBe(false);
    expect(checkPassed(255)).toBe(false);
    expect(checkPassed(undefined)).toBe(false);
    expect(checkPassed(Number.NaN)).toBe(false);
  });

  test("REQ-ENG-08 the halftone is drawn only where it was asked for and the device can draw it; otherwise the soft field", () => {
    expect(liveLook("halftone", true)).toBe("halftone");
    expect(liveLook("halftone", false)).toBe("soft");
    expect(liveLook("soft", true)).toBe("soft");
    expect(liveLook("soft", false)).toBe("soft");
  });

  test("REQ-ENG-05 smoothstep is the GLSL and WGSL one", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });
});
