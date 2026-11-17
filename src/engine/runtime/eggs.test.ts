// @vitest-environment node
import { describe, expect, test } from "vitest";

import { EGGS } from "../story";
import {
  AUDIO_ATTACK_SECONDS,
  AUDIO_LIFT,
  AUDIO_RELEASE_SECONDS,
  CHUNK_SCATTER,
  CHUNK_SOFT,
  EGG_CHUNK,
  EGG_HOLD,
  EGG_REST,
  EGG_SECONDS,
  EGG_SHAPE,
  FALL_FLOOR,
  FALL_GRAVITY,
  GG_CHUNK,
  GG_CRUMBLE,
  LET_GO_ORDER,
  LET_GO_SOFT,
  LET_GO_SPREAD,
  RAIN_COLUMNS,
  RAIN_DONE,
  RAIN_HIGH,
  RAIN_LIGHT,
  RAIN_LOW,
  RAIN_SCATTER,
  RAIN_SOFT_LIGHT,
  RAIN_START_SPREAD,
  chunkOf,
  cleanLevels,
  easeLevels,
  eggFrame,
  eggLight,
  eggPlacement,
  formedShare,
  heldShare,
  isEgg,
  letGoShare,
  litShare,
  rainAt,
  rainColumn,
  rainLight,
  stepPhases,
  strandLifts,
  type EggFrame,
  type RainDrop,
} from "./eggs";
import { halftoneLight } from "./halftone-rules";
import {
  BLOOM_STAGE,
  MIN_LIGHT,
  NARROW_BLOOM_STAGE,
  STRANDS,
  STRANDS_SPEED,
  fitScale,
} from "./story";

const STEP = 1 / 240;
const KEYS = Object.keys(EGG_REST) as Array<keyof EggFrame>;

/** Every moment of an egg at a fine step, from before its start to past its end. */
function moments(egg: (typeof EGGS)[number]) {
  const out: Array<{ t: number; frame: EggFrame }> = [];
  for (let t = -STEP; t <= EGG_SECONDS[egg] + STEP; t += STEP) {
    out.push({ t, frame: eggFrame(egg, t) });
  }
  return out;
}

/**
 * Particles of the rain spread over a 16:10 screen: places across and up,
 * and their own numbers stepped evenly, so every column and height is met.
 */
function drops(count = 4000): RainDrop[] {
  const out: RainDrop[] = [];
  for (let index = 0; index < count; index += 1) {
    const a = (index * 0.6180339887) % 1;
    const b = (index * 0.7548776662) % 1;
    const c = (index * 0.569840291) % 1;
    out.push({
      x: (a * 2 - 1) * 1.6,
      y: b * 2 - 1,
      start: c,
      apex: (index * 0.4142135624) % 1,
      pace: (index * 0.7320508076) % 1,
    });
  }
  return out;
}

describe("the easter eggs' timelines", () => {
  test.each(EGGS)(
    "REQ-NAV-05 %s lasts about 4 to 5 s and starts and ends on the rest values, so the story takes the field back with no jump",
    (egg) => {
      expect(EGG_SECONDS[egg]).toBeGreaterThanOrEqual(4);
      expect(EGG_SECONDS[egg]).toBeLessThanOrEqual(5);
      expect(eggFrame(egg, -0.01)).toEqual(EGG_REST);
      expect(eggFrame(egg, Number.NaN)).toEqual(EGG_REST);
      expect(eggFrame(egg, EGG_SECONDS[egg])).toEqual(EGG_REST);
      const start = eggFrame(egg, 0);
      for (const key of KEYS) expect(start[key]).toBeCloseTo(0, 9);

      // Just before its end every value a particle feels is at rest: no pull
      // of the formation, no gravity, no loosened pull, no fade, no kept
      // look, and the hero's parked particles hidden again. The rain's clock
      // runs on, but every particle of it is home and unlit by then.
      const end = eggFrame(egg, EGG_SECONDS[egg] - 1e-6);
      expect(end.form * (1 - end.free)).toBeCloseTo(0, 6);
      for (const key of [
        "gravity",
        "loose",
        "trail",
        "keep",
        "recall",
        "shown",
      ] as const) {
        expect(end[key]).toBeCloseTo(0, 6);
      }
      for (const drop of drops(500)) {
        expect(rainAt(end.rain, drop)).toEqual({ rise: 0, lit: 0 });
      }
    },
  );

  test.each(EGGS)(
    "REQ-NAV-05 %s moves what each particle feels by small steps: nothing jumps between two frames",
    (egg) => {
      // What a particle with each trait feels (simulation.ts and field.ts):
      // its share of the formation, the gravity and loosened pull once it has
      // let go, its fade and kept look, whether a parked particle shows, and
      // the rain's rise (in screen heights over the screen's 2) and light.
      // The clocks and the form alone may drop at the end, where nothing
      // reads them.
      const soft = EGG_CHUNK[egg] > 0 ? CHUNK_SOFT : LET_GO_SOFT;
      const raining = drops(60);
      const felt = (frame: EggFrame) =>
        [0, 0.5, 1]
          .flatMap((trait) => {
            const free = letGoShare(frame.free, trait, trait, 0, soft);
            return [
              frame.form * (1 - free),
              (frame.gravity * free) / Math.abs(FALL_GRAVITY),
              frame.loose * free,
              frame.trail * free,
              frame.keep * free,
              frame.recall * free,
            ];
          })
          .concat([frame.shown])
          .concat(
            raining.flatMap((drop) => {
              const { rise, lit } = rainAt(frame.rain, drop);
              return [rise / 2, lit];
            }),
          );
      const all = moments(egg);
      let largest = 0;
      for (let index = 1; index < all.length; index += 1) {
        const before = felt(all[index - 1]?.frame ?? EGG_REST);
        const after = felt(all[index]?.frame ?? EGG_REST);
        after.forEach((value, at) => {
          largest = Math.max(largest, Math.abs(value - (before[at] ?? 0)));
        });
      }
      // At 240 steps a second nothing moves by more than 5% of its range in
      // one step, where a jump would move by all of it. gg's pieces each let
      // go over about a tenth of a second (CHUNK_SOFT), so a row breaks off
      // cleanly: up to 8% a step, still five frames at 60 a second.
      expect(largest).toBeLessThanOrEqual(egg === "gg" ? 0.08 : 0.05);
    },
  );

  test("REQ-NAV-05 gg and mark hold their formation whole for 1.5 s, then let go", () => {
    for (const egg of ["gg", "mark"] as const) {
      const { from, to } = EGG_HOLD[egg];
      expect(to - from).toBeCloseTo(1.5, 9);
      for (let t = from; t < to; t += 0.05) {
        const frame = eggFrame(egg, t);
        expect(frame.form).toBe(1);
        expect(frame.free).toBe(0);
        expect(heldShare(frame)).toBe(1);
        expect(formedShare(frame)).toBe(1);
      }
      expect(heldShare(eggFrame(egg, to + 0.4))).toBeGreaterThan(0);
      expect(heldShare(eggFrame(egg, to + 0.4))).toBeLessThan(1);
    }
  });

  test("REQ-NAV-05 gg's pieces fall under gravity with the letters' own light and white until the last part of the fall; mark lets go with no fall and keeps nothing", () => {
    expect(GG_CRUMBLE.from).toBe(EGG_HOLD.gg.to);
    const middle = (GG_CRUMBLE.from + GG_CRUMBLE.to) / 2;
    const fall = eggFrame("gg", middle);
    expect(fall.gravity).toBe(FALL_GRAVITY);
    expect(fall.gravity).toBeLessThan(0);
    expect(fall.loose).toBe(1);
    expect(fall.trail).toBe(1);
    expect(fall.keep).toBe(1);
    // In the middle of the crumble the field is as lit, and as white in its
    // densest cells, as the whole letters were (the spec's floor is 0.6).
    const whole = eggFrame("gg", 2);
    expect(litShare(fall)).toBeGreaterThanOrEqual(0.6 * litShare(whole));
    expect(formedShare(fall)).toBeGreaterThanOrEqual(0.6 * formedShare(whole));
    // The light fades only over the last part of the fall.
    for (let t = GG_CRUMBLE.from; t <= GG_CRUMBLE.to - 0.4; t += 0.05) {
      expect(eggFrame("gg", t).keep).toBeCloseTo(eggFrame("gg", t).trail, 9);
      expect(litShare(eggFrame("gg", t))).toBeGreaterThan(0.99);
    }
    expect(eggFrame("gg", GG_CRUMBLE.to).trail).toBe(0);
    expect(eggFrame("gg", GG_CRUMBLE.to).keep).toBe(0);

    for (const { frame } of moments("mark")) {
      expect(frame.gravity).toBe(0);
      expect(frame.loose).toBe(0);
      expect(frame.keep).toBe(0);
      expect(frame.rain).toBe(0);
    }
    expect(EGG_CHUNK.mark).toBe(0);
    expect(EGG_CHUNK.flip).toBe(0);
    expect(EGG_CHUNK.gg).toBe(GG_CHUNK);
  });

  test("REQ-NAV-05 a fallen piece rests just below the screen, so the story calls it back from there", () => {
    expect(FALL_FLOOR).toBeGreaterThan(1);
    expect(FALL_FLOOR).toBeLessThan(1.3);
  });

  test("REQ-NAV-05 the flip forms no shape and pulls nothing: its only value is the rain's clock, and the story keeps every particle's place", () => {
    for (const { t, frame } of moments("flip")) {
      expect({ ...frame, rain: 0 }).toEqual(EGG_REST);
      if (t >= 0 && t < EGG_SECONDS.flip) expect(frame.rain).toBeCloseTo(t, 9);
    }
    expect(heldShare(eggFrame("flip", 2))).toBe(0);
    expect(litShare(eggFrame("flip", 2))).toBe(0);
    expect(EGG_SHAPE.flip).toBeNull();
    expect(EGG_SHAPE.gg).toBe("gg");
    expect(EGG_SHAPE.mark).toBe("logo");
  });

  test("REQ-NAV-05 only the three eggs are eggs", () => {
    for (const egg of EGGS) expect(isEgg(egg)).toBe(true);
    for (const other of ["GG", "logo", "", null, 3, undefined]) {
      expect(isEgg(other)).toBe(false);
    }
  });
});

describe("letting go", () => {
  test("REQ-NAV-05 REQ-ENG-05 each particle lets go at its own moment, and every one has let go once the clock reaches 1", () => {
    expect(LET_GO_SPREAD + LET_GO_SOFT).toBeCloseTo(1, 9);
    for (let trait = 0; trait <= 1; trait += 0.125) {
      expect(letGoShare(0, trait)).toBe(0);
      expect(letGoShare(1, trait)).toBe(1);
      expect(letGoShare(trait * LET_GO_SPREAD, trait)).toBe(0);
      // A piece's quicker release ends on the same clock.
      expect(letGoShare(1, trait, trait, 0, CHUNK_SOFT)).toBe(1);
      expect(
        letGoShare(trait * (1 - CHUNK_SOFT), trait, trait, 0, CHUNK_SOFT),
      ).toBe(0);
    }
    // An early particle is further along than a late one.
    expect(letGoShare(0.3, 0.1)).toBeGreaterThan(letGoShare(0.3, 0.9));
    expect(letGoShare(0.5, Number.NaN)).toBe(letGoShare(0.5, 0));
  });

  test("REQ-NAV-05 a shape crumbles from the bottom up: with the order, a low particle lets go before a high one of the same trait", () => {
    const low = letGoShare(0.4, 0.5, 0, LET_GO_ORDER);
    const high = letGoShare(0.4, 0.5, 1, LET_GO_ORDER);
    expect(low).toBeGreaterThan(high);
    // With no order the height plays no part.
    expect(letGoShare(0.4, 0.5, 0, 0)).toBe(letGoShare(0.4, 0.5, 1, 0));
    expect(letGoShare(1, 0.5, 1, LET_GO_ORDER)).toBe(1);
  });

  test("REQ-NAV-05 REQ-ENG-05 gg breaks into pieces from each particle's own point: one piece lets go together, with a short trail of its own", () => {
    // Two particles in one piece share its height and nearly its trait,
    // whatever their own traits: the piece comes from the point alone.
    const a = chunkOf(0.31, -0.2, GG_CHUNK, 0);
    const b = chunkOf(0.33, -0.17, GG_CHUNK, 1);
    expect(a.height).toBe(b.height);
    expect(Math.abs(a.trait - b.trait)).toBeLessThanOrEqual(
      CHUNK_SCATTER + 1e-12,
    );
    expect(chunkOf(0.31, -0.2, GG_CHUNK, 0.4)).toEqual(
      chunkOf(0.31, -0.2, GG_CHUNK, 0.4),
    );
    // A piece's middle: the row's own, so a lower row lets go earlier.
    expect(chunkOf(0, -0.3, GG_CHUNK, 0).height).toBeLessThan(
      chunkOf(0, 0.3, GG_CHUNK, 0).height,
    );
    // The pieces' traits spread over 0 to 1, so the crumble has scatter.
    const traits: number[] = [];
    for (let column = -8; column < 8; column += 1) {
      for (let row = -4; row < 4; row += 1) {
        traits.push(
          chunkOf(
            (column + 0.5) * GG_CHUNK,
            (row + 0.5) * GG_CHUNK,
            GG_CHUNK,
            0.5,
          ).trait,
        );
      }
    }
    expect(Math.min(...traits)).toBeLessThan(0.1);
    expect(Math.max(...traits)).toBeGreaterThan(0.9);
    // With no pieces, the particle is its own: mark lets go as it did.
    expect(chunkOf(0.31, -0.2, 0, 0.7)).toEqual({ trait: 0.7, height: -0.2 });
  });

  test("REQ-NAV-05 the held share falls from the form to 0 as the clock runs", () => {
    let before = Infinity;
    for (let free = 0; free <= 1; free += 0.05) {
      const held = heldShare({ ...EGG_REST, form: 0.8, free });
      expect(held).toBeLessThanOrEqual(before + 1e-12);
      before = held;
    }
    expect(heldShare({ ...EGG_REST, form: 0.8, free: 0 })).toBeCloseTo(0.8, 9);
    expect(heldShare({ ...EGG_REST, form: 0.8, free: 1 })).toBe(0);
    expect(heldShare(EGG_REST)).toBe(0);
  });

  test("REQ-NAV-05 the lit share is the held share plus the trail's part of those that have let go, and the white share the held share plus the keep's", () => {
    const whole = { ...EGG_REST, form: 1 };
    expect(litShare(whole)).toBe(1);
    expect(litShare({ ...whole, free: 1 })).toBe(0);
    expect(litShare({ ...whole, free: 1, trail: 0.5 })).toBeCloseTo(0.5, 9);
    const midway = { ...whole, free: 0.5, trail: 0.4 };
    expect(litShare(midway)).toBeGreaterThan(heldShare(midway));
    expect(litShare(midway)).toBeLessThan(1);
    expect(litShare(EGG_REST)).toBe(0);

    expect(formedShare({ ...whole, free: 1, keep: 1 })).toBe(1);
    expect(formedShare({ ...whole, free: 1 })).toBe(0);
    expect(formedShare(midway)).toBeCloseTo(heldShare(midway), 9);
    expect(formedShare(EGG_REST)).toBe(0);
  });
});

describe("the flip's rain", () => {
  const drop: RainDrop = { x: 0.37, y: -0.9, start: 0.3, apex: 0.6, pace: 0.4 };

  test("REQ-NAV-05 REQ-ENG-05 a particle rises from its own place, slows to nothing at its own highest point, hangs, and settles back with no snap", () => {
    const path: Array<{ t: number; rise: number; lit: number }> = [];
    for (let t = 0; t <= EGG_SECONDS.flip; t += STEP) {
      path.push({ t, ...rainAt(t, drop) });
    }
    const top = Math.max(...path.map((point) => point.rise));
    expect(top).toBeGreaterThan(0.3);
    expect(drop.y + top).toBeLessThanOrEqual(RAIN_HIGH + 1e-9);
    // It starts and ends at its place in the story, unlit.
    expect(path[0]).toEqual({ t: 0, rise: 0, lit: 0 });
    expect(path.at(-1)?.rise).toBe(0);
    expect(path.at(-1)?.lit).toBe(0);
    // Its speed: quickest as it leaves, as a drop thrown upward, unlit
    // then; from the first whole step after (the step it leaves in holds
    // only part of one) no step in it, through the top, the hang, the fall
    // and the settle, so nothing snaps; nothing left at the top or the end.
    const speeds = path
      .slice(1)
      .map((point, index) => (point.rise - (path[index]?.rise ?? 0)) / STEP);
    const fastest = Math.max(...speeds);
    const left = speeds.findIndex((speed) => speed > 0);
    expect(path[left + 1]?.lit ?? 1).toBeLessThan(0.05);
    const peak = path.findIndex((point) => point.rise === top);
    expect(Math.abs(speeds[peak - 1] ?? 1)).toBeLessThan(0.05 * fastest);
    expect(Math.abs(speeds.at(-1) ?? 1)).toBeLessThan(1e-9);
    for (let index = left + 2; index < speeds.length; index += 1) {
      expect(
        Math.abs((speeds[index] ?? 0) - (speeds[index - 1] ?? 0)),
      ).toBeLessThan(0.05 * fastest);
    }
    // It hangs a moment at the top, lit, before it falls.
    const hanging = path.filter((point) => point.rise > top - 1e-6);
    expect(hanging.length * STEP).toBeGreaterThan(0.2);
    expect(Math.min(...hanging.map((point) => point.lit))).toBe(1);
  });

  test("REQ-NAV-05 the highest points spread from a third of the way up the screen to near the top, and the top tenth never holds more than a fifth of the lit particles", () => {
    expect(RAIN_LOW).toBeCloseTo(-1 / 3, 9);
    expect(RAIN_HIGH).toBeLessThan(0.9);
    const field = drops();
    let tops = 0;
    for (const one of field) {
      let top = 0;
      for (let t = 0; t < EGG_SECONDS.flip; t += 0.05)
        top = Math.max(top, rainAt(t, one).rise);
      if (top > 0) {
        tops += 1;
        expect(one.y + top).toBeLessThanOrEqual(RAIN_HIGH + 1e-9);
      }
    }
    // Most particles rise; the ones already above their highest point stay.
    expect(tops / field.length).toBeGreaterThan(0.5);
    for (let t = 0.2; t < EGG_SECONDS.flip; t += 0.2) {
      const lit = field.filter((one) => rainAt(t, one).lit > 0.5);
      if (lit.length === 0) continue;
      const high = lit.filter((one) => one.y + rainAt(t, one).rise > 0.8);
      expect(high.length / lit.length).toBeLessThanOrEqual(0.2);
    }
  });

  test("REQ-NAV-05 a particle already above its highest point stays where the story holds it, unlit", () => {
    const high = { ...drop, y: 0.95 };
    for (let t = 0; t < EGG_SECONDS.flip; t += 0.1) {
      expect(rainAt(t, high)).toEqual({ rise: 0, lit: 0 });
    }
  });

  test("REQ-NAV-05 REQ-ENG-05 each column rises at its own moment and the particles of one column leave close together, so the rain reads as streaks", () => {
    const starts: number[] = [];
    for (let column = -48; column < 48; column += 1) {
      starts.push(rainColumn((column + 0.5) / RAIN_COLUMNS).start);
    }
    expect(Math.min(...starts)).toBeLessThan(0.1);
    expect(Math.max(...starts)).toBeGreaterThan(0.9);
    // Two particles of one column with the most different own starts leave
    // at most RAIN_SCATTER of the spread apart.
    const leaves = (own: number) => {
      for (let t = 0; t < EGG_SECONDS.flip; t += STEP) {
        if (rainAt(t, { ...drop, start: own }).rise > 0) return t;
      }
      return Infinity;
    };
    expect(leaves(1) - leaves(0)).toBeLessThanOrEqual(
      RAIN_SCATTER * RAIN_START_SPREAD + 2 * STEP,
    );
    expect(rainColumn(0.37)).toEqual(rainColumn(0.37 + 0.2 / RAIN_COLUMNS));
  });

  test("REQ-NAV-05 every particle of the rain is home and unlit well before the flip ends", () => {
    expect(RAIN_DONE).toBeLessThan(EGG_SECONDS.flip - 0.3);
    for (const one of drops(800)) {
      expect(rainAt(RAIN_DONE + 1e-6, one)).toEqual({ rise: 0, lit: 0 });
      expect(rainAt(0, one)).toEqual({ rise: 0, lit: 0 });
      expect(rainAt(Number.NaN, one)).toEqual({ rise: 0, lit: 0 });
    }
  });

  test("REQ-NAV-05 the rain's light is its own, on each look", () => {
    expect(rainLight("halftone")).toBe(RAIN_LIGHT);
    expect(rainLight("soft")).toBe(RAIN_SOFT_LIGHT);
    expect(RAIN_LIGHT).toBeGreaterThan(1);
  });
});

describe("the egg's formation", () => {
  test("REQ-NAV-05 it is fitted to the field chapter's stage, as the bloom's mark is, on a wide and a narrow frame", () => {
    const extent = { halfWidth: 1, halfHeight: 0.48, area: 1.2 };
    const wide = { halfWidth: 3.7, halfHeight: 2.33 };
    const narrow = { halfWidth: 1.1, halfHeight: 2.33 };
    expect(eggPlacement(extent, wide).scale).toBeCloseTo(
      fitScale(extent, {
        halfWidth: BLOOM_STAGE.halfWidth * wide.halfWidth,
        halfHeight: BLOOM_STAGE.halfHeight * wide.halfHeight,
      }),
      9,
    );
    expect(eggPlacement(extent, narrow).scale).toBeCloseTo(
      fitScale(extent, {
        halfWidth: NARROW_BLOOM_STAGE.halfWidth * narrow.halfWidth,
        halfHeight: NARROW_BLOOM_STAGE.halfHeight * narrow.halfHeight,
      }),
      9,
    );
    const { scale, area } = eggPlacement(extent, wide);
    expect(area).toBeCloseTo(
      (1.2 * scale * scale) / (4 * wide.halfWidth * wide.halfHeight),
      9,
    );
  });

  test("REQ-NAV-05 REQ-A11Y-06 its light is the halftone's rule for a whole formation, or the soft look's", () => {
    expect(eggLight(0.1, "halftone")).toBeCloseTo(halftoneLight(0.1, 1), 9);
    expect(eggLight(0.1, "soft")).toBeCloseTo(0.16, 9);
    expect(eggLight(0, "soft")).toBe(MIN_LIGHT);
    expect(eggLight(5, "soft")).toBe(1);
    expect(eggLight(Number.NaN, "soft")).toBe(1);
  });
});

describe("the strands and the sound", () => {
  test("REQ-SND-03 three strands follow the low, middle and high band in order", () => {
    expect(STRANDS).toHaveLength(3);
    expect(strandLifts([1, 0.5, 0])).toEqual([
      1 + AUDIO_LIFT,
      1 + AUDIO_LIFT / 2,
      1,
    ]);
  });

  test("REQ-SND-03 a level that is not finite is 0, every level is clamped to 0 to 1, and null is silence", () => {
    expect(cleanLevels([Number.NaN, 2, -1])).toEqual([0, 1, 0]);
    expect(cleanLevels([Infinity, 0.25, 0.5])).toEqual([0, 0.25, 0.5]);
    expect(cleanLevels(null)).toEqual([0, 0, 0]);
  });

  test("REQ-SND-03 the levels rise over about 60 ms and fall over about 300 ms, so a frame without new levels never jumps", () => {
    const risen = easeLevels([0, 0, 0], [1, 1, 1], AUDIO_ATTACK_SECONDS);
    expect(risen[0]).toBeCloseTo(1 - Math.exp(-1), 9);
    const fallen = easeLevels([1, 1, 1], [0, 0, 0], AUDIO_RELEASE_SECONDS);
    expect(fallen[0]).toBeCloseTo(Math.exp(-1), 9);
    // A step of no length changes nothing.
    expect(easeLevels([0.3, 0.4, 0.5], [1, 1, 1], 0)).toEqual([0.3, 0.4, 0.5]);
  });

  test("REQ-SND-03 with no sound a strand's phase is the elapsed time times STRANDS_SPEED; a level speeds it a little; it wraps at a whole turn", () => {
    let phases: [number, number, number] = [0, 0, 0];
    for (let step = 0; step < 90; step += 1) {
      phases = stepPhases(phases, [0, 0, 1], 1 / 30);
    }
    expect(phases[0]).toBeCloseTo(3 * STRANDS_SPEED, 9);
    expect(phases[2]).toBeGreaterThan(phases[0]);
    expect(phases[2]).toBeLessThan(2 * phases[0]);
    const wrapped = stepPhases([6.2, 0, 0], [0, 0, 0], 1);
    expect(wrapped[0]).toBeCloseTo((6.2 + STRANDS_SPEED) % (2 * Math.PI), 9);
    expect(stepPhases([1, 1, 1], [0, 0, 0], Number.NaN)).toEqual([1, 1, 1]);
  });
});
