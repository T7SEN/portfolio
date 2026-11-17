// Plain numbers from the analyser's spectrum (REQ-SND-03), for the about
// chapter's strands, the bar's level bars and the /about waveform. No React
// and no Web Audio objects, so it is tested in Node and loads with the bar.

import type { AudioLevels } from "@/engine/story";

/** One frame of the analyser: byte magnitudes, and the width of one bin. */
export type Spectrum = {
  bins: Uint8Array;
  /** Hertz per bin: the context's sample rate over the analyser's fftSize. */
  binHz: number;
};

/** A band of frequencies, from its lower edge up to its upper one, in Hz. */
export type Band = readonly [fromHz: number, toHz: number];

/**
 * The strands' three bands, in the order of the strands: low below 250 Hz,
 * middle to 2 kHz, high above. The lowest bin holds the signal's constant
 * part, not a sound, so the low band starts above it.
 */
export const STRAND_BANDS: readonly [Band, Band, Band] = [
  [20, 250],
  [250, 2000],
  [2000, 20_000],
];

function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/**
 * The mean loudness of a band, 0 to 1. Each byte is already the bin's level
 * on the analyser's decibel scale, so the mean of the bytes is a loudness, not
 * an energy. A band narrower than one bin reads the bin it falls in.
 */
export function bandLevel(spectrum: Spectrum, [fromHz, toHz]: Band): number {
  const { bins, binHz } = spectrum;
  if (bins.length === 0 || !(binHz > 0)) return 0;
  const last = bins.length - 1;
  const from = Math.min(Math.max(Math.ceil(fromHz / binHz), 1), last);
  const to = Math.min(Math.max(Math.floor(toHz / binHz), from), last);
  let sum = 0;
  for (let i = from; i <= to; i += 1) sum += bins[i] ?? 0;
  return unit(sum / ((to - from + 1) * 255));
}

/** The strands' three levels from one frame, before smoothing. */
export function strandLevels(spectrum: Spectrum): AudioLevels {
  const [low, mid, high] = STRAND_BANDS.map((band) =>
    bandLevel(spectrum, band),
  );
  return [low ?? 0, mid ?? 0, high ?? 0];
}

/**
 * count bands spaced evenly on a log scale from fromHz to toHz, as the ear
 * hears pitch, so the low bands are not all crowded into the first bins.
 */
export function logBands(count: number, fromHz: number, toHz: number): Band[] {
  const ratio = Math.pow(toHz / fromHz, 1 / count);
  return Array.from({ length: count }, (_, i) => [
    fromHz * Math.pow(ratio, i),
    fromHz * Math.pow(ratio, i + 1),
  ]);
}

/** How fast a smoothed level rises to a louder frame and falls from it. */
export const ATTACK_MS = 60;
export const RELEASE_MS = 260;

/**
 * Moves a level towards the frame's value over elapsedMs: quickly up, slowly
 * down, so a strand swells with a sound and settles after it. A value that is
 * not finite counts as silence.
 */
export function follow(
  previous: number,
  next: number,
  elapsedMs: number,
): number {
  const from = unit(previous);
  const to = unit(next);
  const tau = to > from ? ATTACK_MS : RELEASE_MS;
  const step = elapsedMs > 0 ? 1 - Math.exp(-elapsedMs / tau) : 0;
  return unit(from + (to - from) * step);
}

/**
 * A bed is steady: measured offline on 14 Nov 2026, each band of each of the
 * three beds stays within about 0.05 of its own mean once faded in. So a bar
 * shows how far its band sits from its own recent mean, not the loudness
 * itself, which would hold every bar still. MEAN_MS is how long that mean
 * takes to follow; WOBBLE_GAIN turns a step of 0.08 above it into half the
 * bar's travel. A band whose mean is below PRESENCE_FULL is partly silent and
 * moves its bar that much less, so a band with no sound in it rests short.
 */
export const MEAN_MS = 2500;
export const WOBBLE_GAIN = 6;
export const PRESENCE_FULL = 0.25;

/**
 * Reads bars from frames: (spectrum, elapsedMs) gives each bar's level, 0 to
 * 1, at rest (0.5 unless given) where its band holds steady. order[i] names
 * the band bar i follows. Each meter keeps its own means, so a new one starts
 * afresh.
 */
export function createBarMeter(
  bands: readonly Band[],
  order: readonly number[],
  rest = 0.5,
): (spectrum: Spectrum, elapsedMs: number) => number[] {
  const means: (number | null)[] = bands.map(() => null);
  return (spectrum, elapsedMs) => {
    const step = elapsedMs > 0 ? 1 - Math.exp(-elapsedMs / MEAN_MS) : 0;
    const levels = bands.map((band, index) => {
      const level = bandLevel(spectrum, band);
      const previous = means[index] ?? level;
      const mean = previous + (level - previous) * step;
      means[index] = mean;
      const presence = unit(mean / PRESENCE_FULL);
      return unit(presence * (rest + (level - mean) * WOBBLE_GAIN));
    });
    return order.map((index) => levels[index] ?? 0);
  };
}

/**
 * A bar's vertical scale against its drawn height: REST_SCALE when silent,
 * up to PEAK_SCALE at full level, so the drawn shape still shows through.
 */
export const REST_SCALE = 0.3;
export const PEAK_SCALE = 1.2;

export function barScale(level: number): number {
  return REST_SCALE + (PEAK_SCALE - REST_SCALE) * unit(level);
}

/**
 * The strands' resting level. The bed is steady, so its loudness alone would
 * hold each strand at one lift; like the bars, a strand follows how far its
 * band moves from its own recent mean, resting low so each wave of the sea
 * swells it and the lulls let it settle.
 */
export const STRAND_REST = 0.25;

/** Reads the strands' three levels from frames, each 0 to 1. */
export function createStrandMeter(): (
  spectrum: Spectrum,
  elapsedMs: number,
) => AudioLevels {
  const meter = createBarMeter(STRAND_BANDS, [0, 1, 2], STRAND_REST);
  return (spectrum, elapsedMs) => {
    const [low, mid, high] = meter(spectrum, elapsedMs);
    return [low ?? 0, mid ?? 0, high ?? 0];
  };
}
