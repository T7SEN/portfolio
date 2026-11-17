// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ATTACK_MS,
  bandLevel,
  createBarMeter,
  createStrandMeter,
  barScale,
  follow,
  logBands,
  MEAN_MS,
  PEAK_SCALE,
  PRESENCE_FULL,
  RELEASE_MS,
  REST_SCALE,
  STRAND_BANDS,
  STRAND_REST,
  strandLevels,
  type Spectrum,
} from "./levels";

// 48 kHz with an fftSize of 1024: 512 bins of 46.875 Hz.
const BIN_HZ = 48_000 / 1024;

function spectrum(fill: (hz: number) => number): Spectrum {
  const bins = new Uint8Array(512);
  bins.forEach((_, i) => {
    bins[i] = fill(i * BIN_HZ);
  });
  return { bins, binHz: BIN_HZ };
}

describe("band levels", () => {
  it("REQ-SND-03 splits the strands at 250 Hz and 2 kHz, low first", () => {
    expect(STRAND_BANDS).toEqual([
      [20, 250],
      [250, 2000],
      [2000, 20_000],
    ]);
    const lowOnly = spectrum((hz) => (hz < 250 ? 255 : 0));
    const [low, mid, high] = strandLevels(lowOnly);
    expect(low).toBeGreaterThan(0.8);
    expect(mid).toBeLessThan(0.05);
    expect(high).toBe(0);
    const highOnly = spectrum((hz) => (hz >= 2000 ? 255 : 0));
    expect(strandLevels(highOnly)).toEqual([0, 0, 1]);
  });

  it("REQ-SND-03 reads each band as its mean, 0 to 1, leaving out the constant bin", () => {
    // Only the lowest bin, the signal's constant part, is loud.
    const constant = spectrum((hz) => (hz === 0 ? 255 : 0));
    expect(bandLevel(constant, [0, 250])).toBe(0);
    const half = spectrum(() => 128);
    expect(bandLevel(half, [250, 2000])).toBeCloseTo(128 / 255, 5);
  });

  it("REQ-SND-03 reads the bin a band narrower than one bin falls in, and nothing from an empty frame", () => {
    const ramp = spectrum((hz) => Math.min(255, Math.round(hz / 100)));
    expect(bandLevel(ramp, [1000, 1010])).toBeGreaterThan(0);
    expect(
      bandLevel({ bins: new Uint8Array(0), binHz: BIN_HZ }, [0, 100]),
    ).toBe(0);
    expect(bandLevel({ bins: new Uint8Array(8), binHz: 0 }, [0, 100])).toBe(0);
  });

  it("REQ-SND-03 spaces bands evenly on a log scale, edge to edge", () => {
    const bands = logBands(4, 40, 640);
    expect(bands).toHaveLength(4);
    expect(bands[0]?.[0]).toBeCloseTo(40);
    expect(bands[0]?.[1]).toBeCloseTo(80);
    expect(bands[3]?.[1]).toBeCloseTo(640);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]?.[0]).toBeCloseTo(bands[i - 1]?.[1] ?? Number.NaN);
    }
  });
});

describe("smoothing", () => {
  it("REQ-SND-03 rises fast and falls slowly, by the time passed", () => {
    expect(ATTACK_MS).toBeLessThan(RELEASE_MS);
    const up = follow(0, 1, ATTACK_MS);
    const down = follow(1, 0, ATTACK_MS);
    expect(up).toBeCloseTo(1 - Math.exp(-1), 5);
    expect(1 - down).toBeLessThan(up);
    expect(follow(0.4, 0.9, 0)).toBe(0.4);
    expect(follow(0, 1, 10_000)).toBeCloseTo(1, 5);
  });

  it("REQ-SND-03 keeps levels within 0 to 1 and treats what is not a number as silence", () => {
    expect(follow(2, 3, 1000)).toBe(1);
    expect(follow(-1, Number.NaN, 1000)).toBe(0);
    expect(follow(0.5, Number.POSITIVE_INFINITY, 1000)).toBeLessThan(0.5);
  });
});

describe("bars", () => {
  it("REQ-SND-03 a steady band holds its bar at half travel; a step above its own mean lifts it", () => {
    const bands = logBands(2, 40, 400);
    const meter = createBarMeter(bands, [0, 1]);
    const steady = spectrum((hz) => (hz < 400 ? 180 : 0));
    let levels = meter(steady, 0);
    for (let i = 0; i < 60; i += 1) levels = meter(steady, 50);
    expect(levels[0]).toBeCloseTo(0.5, 5);
    expect(levels[1]).toBeCloseTo(0.5, 5);

    const louder = spectrum((hz) => (hz < 120 ? 200 : hz < 400 ? 180 : 0));
    const lifted = meter(louder, 16);
    expect(lifted[0]).toBeGreaterThan(0.75);
    expect(lifted[1]).toBeCloseTo(0.5, 2);
    // Held there, the mean catches up and the bar settles again.
    for (let i = 0; i < 400; i += 1) levels = meter(louder, 50);
    expect(levels[0]).toBeCloseTo(0.5, 2);
    expect(MEAN_MS).toBeGreaterThan(1000);
  });

  it("REQ-SND-03 a band with no sound in it rests its bar short, and bars take bands in the order given", () => {
    const bands = logBands(3, 40, 6000);
    const lowOnly = spectrum((hz) => (hz < 200 ? 255 : 0));
    const meter = createBarMeter(bands, [2, 0, 1]);
    const [high, low, mid] = meter(lowOnly, 0);
    expect(low).toBeCloseTo(0.5, 5);
    expect(high).toBe(0);
    expect(mid).toBe(0);
    // Partly silent: a band at half the presence level moves half as much.
    const quiet = spectrum((hz) =>
      hz < 200 ? Math.round(255 * PRESENCE_FULL * 0.5) : 0,
    );
    expect(createBarMeter(bands, [0])(quiet, 0)[0]).toBeCloseTo(0.25, 1);
  });

  it("REQ-SND-03 each meter keeps its own means", () => {
    const bands = logBands(1, 40, 400);
    const first = createBarMeter(bands, [0]);
    for (let i = 0; i < 100; i += 1)
      first(
        spectrum(() => 100),
        50,
      );
    const second = createBarMeter(bands, [0]);
    expect(
      second(
        spectrum(() => 250),
        0,
      )[0],
    ).toBeCloseTo(0.5, 5);
    expect(
      first(
        spectrum(() => 250),
        16,
      )[0],
    ).toBe(1);
  });

  it("REQ-SND-03 a steady bed rests the strands low; a swell in one band lifts its strand, a lull drops it", () => {
    const meter = createStrandMeter();
    const steady = spectrum(() => 160);
    let levels = meter(steady, 0);
    for (let i = 0; i < 80; i += 1) levels = meter(steady, 50);
    for (const level of levels) expect(level).toBeCloseTo(STRAND_REST, 5);

    const wave = spectrum((hz) => (hz < 250 ? 200 : 160));
    const [low, mid, high] = meter(wave, 16);
    expect(low).toBeGreaterThan(0.75);
    expect(mid).toBeCloseTo(STRAND_REST, 2);
    expect(high).toBeCloseTo(STRAND_REST, 2);

    const lull = spectrum((hz) => (hz < 250 ? 120 : 160));
    for (let i = 0; i < 80; i += 1) levels = meter(steady, 50);
    expect(meter(lull, 16)[0]).toBeLessThan(STRAND_REST);
  });

  it("REQ-SND-03 scales a bar from a short rest to a little past its drawn height", () => {
    expect(barScale(0)).toBe(REST_SCALE);
    expect(barScale(1)).toBe(PEAK_SCALE);
    expect(barScale(5)).toBe(PEAK_SCALE);
    expect(REST_SCALE).toBeGreaterThan(0);
  });
});
