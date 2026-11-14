// @vitest-environment node
import { describe, expect, it } from "vitest";

import { SKY_CONSTELLATIONS, SKY_SEGMENTS, SKY_STARS } from "./catalogue";
import {
  SKY_PLACE,
  SKY_VIEW,
  chooseTrace,
  constellationsInView,
  createPlaced,
  easePointer,
  headTurn,
  horizonDim,
  placeSky,
  prepareSky,
  revealTarget,
  SKY_GATHER,
  siderealDegrees,
  skyFrame,
  skyGather,
  skyScale,
  starLight,
  traceProgress,
  type ConstellationView,
  type SkyFrame,
} from "./sky";

const catalogue = {
  stars: SKY_STARS,
  segments: SKY_SEGMENTS,
  constellations: SKY_CONSTELLATIONS,
};
const JAN_15 = Date.parse("2026-01-15T16:00:00Z");
const FRAME: SkyFrame = { width: 1280, height: 800, horizon: 304 };
const NO_TURN = { turn: 0, tilt: 0 };

/** The star nearest a place in the J2000 catalogue. */
function starNear(raHours: number, dec: number): number {
  let best = -1;
  let distance = Infinity;
  for (let star = 0; star * 4 < SKY_STARS.length; star += 1) {
    const d = Math.hypot(
      ((SKY_STARS[star * 4] ?? 0) - raHours) * 15,
      (SKY_STARS[star * 4 + 1] ?? 0) - dec,
    );
    if (d < distance) {
      distance = d;
      best = star;
    }
  }
  return best;
}

const SIRIUS = starNear(6.7525, -16.716);
const POLARIS = starNear(2.5303, 89.264);

describe("the contact sky over AlUla (D-146)", () => {
  it("D-146 the catalogue holds every star a line uses and all 88 constellations", () => {
    const count = SKY_STARS.length / 4;
    expect(Number.isInteger(count)).toBe(true);
    expect(SKY_SEGMENTS.length % 4).toBe(0);
    expect(SKY_CONSTELLATIONS).toHaveLength(88);
    for (let at = 0; at < SKY_SEGMENTS.length; at += 4) {
      expect(SKY_SEGMENTS[at]).toBeLessThan(count);
      expect(SKY_SEGMENTS[at + 1]).toBeLessThan(count);
      expect(SKY_SEGMENTS[at + 2]).toBeLessThan(88);
    }
    expect(SKY_STARS[SIRIUS * 4 + 2]).toBeCloseTo(-1.44, 1);
    expect(SKY_STARS[POLARIS * 4 + 2]).toBeCloseTo(1.97, 1);
  });

  it("D-146 Sirius crosses the south at 46.67 degrees over AlUla, as its declination gives", () => {
    const sky = prepareSky(catalogue, JAN_15);
    const placed = createPlaced(sky.count);
    let highest = -90;
    let xAtHighest = 0;
    for (let minute = 0; minute < 1440; minute += 1) {
      placeSky(sky, JAN_15 + minute * 60_000, FRAME, NO_TURN, placed);
      const altitude = placed.altitude[SIRIUS] ?? -90;
      if (altitude > highest) {
        highest = altitude;
        xAtHighest = placed.x[SIRIUS] ?? 0;
      }
    }
    const declination = sky.dec[SIRIUS] ?? 0;
    expect(highest).toBeCloseTo(90 - SKY_PLACE.latitude + declination, 1);
    expect(highest).toBeCloseTo(46.67, 0);
    // Due south is the middle of the frame.
    expect(Math.abs(xAtHighest - FRAME.width / 2)).toBeLessThan(3);
  });

  it("D-146 Polaris stands within 0.7 degrees of AlUla's latitude", () => {
    const sky = prepareSky(catalogue, JAN_15);
    const placed = placeSky(
      sky,
      JAN_15,
      FRAME,
      NO_TURN,
      createPlaced(sky.count),
    );
    expect(
      Math.abs((placed.altitude[POLARIS] ?? 0) - SKY_PLACE.latitude),
    ).toBeLessThan(0.7);
  });

  it("D-146 the view faces south with east on the left, the horizon on its line", () => {
    const sky = prepareSky(catalogue, JAN_15);
    const placed = placeSky(
      sky,
      JAN_15,
      FRAME,
      NO_TURN,
      createPlaced(sky.count),
    );
    const lst = siderealDegrees(JAN_15, SKY_PLACE.longitude);
    for (let star = 0; star < sky.count; star += 1) {
      if (placed.up[star] !== 1) continue;
      // Rising (east, hour angle below 0) is left of the middle.
      let hour = lst - (sky.ra[star] ?? 0);
      hour -= 360 * Math.round(hour / 360);
      if (Math.abs(hour) > 20 && Math.abs(hour) < 160) {
        expect((placed.x[star] ?? 0) < FRAME.width / 2).toBe(hour < 0);
      }
      expect(placed.y[star]).toBeLessThan(FRAME.horizon);
    }
  });

  it("D-146 the band's horizon sits at 0.6 of the height on any screen, the screen's top never past 80 degrees up", () => {
    for (const [width, height] of [
      [1280, 800],
      [1920, 1080],
      [1024, 768],
      [375, 812],
      [320, 548],
      [600, 300],
    ] as const) {
      const frame = skyFrame(width, height);
      expect(frame.horizon).toBeCloseTo(height * SKY_VIEW.bandShare, 9);
      const scale = skyScale(frame);
      expect(frame.horizon / scale).toBeLessThanOrEqual(
        SKY_VIEW.bandAltitude + 1e-9,
      );
      expect(width / scale).toBeLessThanOrEqual(
        (width < SKY_VIEW.narrowBelow
          ? SKY_VIEW.narrowWidthDegrees
          : SKY_VIEW.widthDegrees) + 1e-9,
      );
    }
    // A tall phone shows about 60 degrees across; a wide desktop its 220.
    const phone = skyFrame(375, 812);
    expect(375 / skyScale(phone)).toBeCloseTo(61.6, 1);
    expect(1920 / skyScale(skyFrame(1920, 1080))).toBeCloseTo(
      SKY_VIEW.widthDegrees,
      9,
    );
  });

  it("D-146 a phone draws the same stars per screen as a desktop: the brighter ones and every constellation's own", () => {
    const sky = prepareSky(catalogue, JAN_15);
    const density = (width: number, height: number) => {
      const frame = skyFrame(width, height);
      const placed = placeSky(
        sky,
        JAN_15,
        frame,
        NO_TURN,
        createPlaced(sky.count),
      );
      let drawn = 0;
      for (let star = 0; star < sky.count; star += 1) {
        if (placed.up[star] !== 1) continue;
        drawn += 1;
        const allowed =
          (sky.magnitude[star] ?? 9) <= SKY_VIEW.magnitudeLimit ||
          sky.inFigure[star] === 1;
        expect(allowed).toBe(true);
      }
      return drawn / (width * frame.horizon);
    };
    const desktop = density(1280, 800);
    const phone = density(375, 812);
    expect(phone / desktop).toBeGreaterThan(0.5);
    expect(phone / desktop).toBeLessThan(2);
  });

  it("REQ-SCR-06 the head turn swings the sky against the pointer and keeps the stars' places among themselves", () => {
    const sky = prepareSky(catalogue, JAN_15);
    const rest = placeSky(sky, JAN_15, FRAME, NO_TURN, createPlaced(sky.count));
    const turn = headTurn({ x: FRAME.width, y: 0, presence: 1 }, FRAME);
    expect(turn.turn).toBeCloseTo(SKY_VIEW.turnDegrees, 5);
    expect(turn.tilt).toBeCloseTo(SKY_VIEW.tiltDegrees, 5);
    const turned = placeSky(sky, JAN_15, FRAME, turn, createPlaced(sky.count));
    const shifts = new Set<string>();
    for (let star = 0; star < sky.count; star += 1) {
      if (rest.up[star] !== 1 || turned.up[star] !== 1) continue;
      const dx = (turned.x[star] ?? 0) - (rest.x[star] ?? 0);
      const dy = (turned.y[star] ?? 0) - (rest.y[star] ?? 0);
      expect(dx).toBeLessThan(0);
      expect(dy).toBeGreaterThan(0);
      shifts.add(`${dx.toFixed(2)} ${dy.toFixed(2)}`);
    }
    // One shift for every star: the sky moves as one.
    expect(shifts.size).toBe(1);
    expect(headTurn(null, FRAME)).toEqual(NO_TURN);
  });

  it("REQ-SCR-05 the pointer glides, and its presence fades when it leaves", () => {
    let eased = easePointer(null, { x: 100, y: 100 }, 1 / 60);
    expect(eased).toEqual({ x: 100, y: 100, presence: 0 });
    eased = easePointer(eased, { x: 400, y: 100 }, 0.3);
    expect(eased?.x).toBeGreaterThan(200);
    expect(eased?.x).toBeLessThan(400);
    for (let frame = 0; frame < 120; frame += 1)
      eased = easePointer(eased, null, 1 / 60);
    expect(eased).toBeNull();
  });

  it("D-146 a constellation's lines show where the pointer settles near it", () => {
    const near = revealTarget(
      { x: 500, y: 100 },
      { x: 510, y: 100, presence: 1 },
    );
    const far = revealTarget(
      { x: 500, y: 100 },
      { x: 900, y: 100, presence: 1 },
    );
    expect(near).toBe(1);
    expect(far).toBe(0);
    expect(revealTarget({ x: 500, y: 100 }, null)).toBe(0);
  });

  it("D-146 the trace keeps its constellation while it stays whole, else takes the brightest whole one", () => {
    const view = (
      index: number,
      light: number,
      whole: boolean,
      lines = 4,
    ): ConstellationView => ({
      index,
      segments: Array.from({ length: lines }, (_, at) => at),
      x: 0,
      y: 0,
      top: 0,
      bottom: 0,
      light,
      whole,
    });
    expect(
      chooseTrace(-1, [view(1, 5, true), view(2, 9, true), view(3, 20, false)]),
    ).toBe(2);
    expect(chooseTrace(1, [view(1, 5, true), view(2, 9, true)])).toBe(1);
    expect(chooseTrace(1, [view(1, 5, false), view(2, 9, true)])).toBe(2);
    expect(chooseTrace(-1, [view(4, 9, true, 2)])).toBe(-1);
  });

  it("D-146 the words trace one line each; three letters draw the next", () => {
    expect(traceProgress(0, 0, 10)).toEqual({ done: 0, partial: 0 });
    expect(traceProgress(1, 2, 10)).toEqual({ done: 0, partial: 2 / 3 });
    expect(traceProgress(4, 0, 10)).toEqual({ done: 4, partial: 0 });
    expect(traceProgress(4, 5, 10)).toEqual({ done: 3, partial: 1 });
    expect(traceProgress(30, 0, 10)).toEqual({ done: 10, partial: 0 });
  });

  it("D-146 a whole constellation in view lists every line it has", () => {
    const sky = prepareSky(catalogue, JAN_15);
    const placed = placeSky(
      sky,
      JAN_15,
      FRAME,
      NO_TURN,
      createPlaced(sky.count),
    );
    const views = constellationsInView(sky, placed);
    const orion = views.find(
      (view) => SKY_CONSTELLATIONS[view.index] === "Ori",
    );
    expect(orion?.whole).toBe(true);
    expect(orion?.segments).toHaveLength(
      sky.segmentsOf[orion?.index ?? 0] ?? -1,
    );
  });

  it("D-146 the sky gathers over the contact chapter's first quarter, eased", () => {
    expect(skyGather(0)).toBe(0);
    expect(skyGather(SKY_GATHER / 2)).toBeCloseTo(0.5, 9);
    expect(skyGather(SKY_GATHER)).toBe(1);
    expect(skyGather(1)).toBe(1);
    expect(skyGather(-1)).toBe(0);
    expect(skyGather(Number.NaN)).toBe(0);
  });

  it("D-146 light follows magnitude and the air dims the horizon", () => {
    expect(starLight(-1.46)).toBeGreaterThan(starLight(1));
    expect(starLight(1)).toBeCloseTo(0.9, 5);
    expect(starLight(9)).toBe(0.07);
    expect(horizonDim(0)).toBeCloseTo(0.35, 5);
    expect(horizonDim(30)).toBe(1);
  });
});
