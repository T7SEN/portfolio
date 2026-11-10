import { PROBE } from "../config";
import type { ProbeVerdict } from "../types";

/**
 * The value at a fraction of the way through the sorted list, 0 for the
 * smallest and 1 for the largest, interpolated between neighbours. An empty
 * list has no percentile and gives NaN.
 */
export function percentile(
  values: readonly number[],
  fraction: number,
): number {
  if (values.length === 0) return Number.NaN;

  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(Math.max(fraction, 0), 1) * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const lower = sorted[lowerIndex] ?? Number.NaN;
  const upper = sorted[Math.ceil(position)] ?? lower;

  return lower + (upper - lower) * (position - lowerIndex);
}

/** The middle value, or the mean of the middle two. NaN for an empty list. */
export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

/**
 * Judges the tier 1 probe from the frame times counted after its warm-up
 * (REQ-TIER-01). The median decides, so a few long frames do not cost a
 * capable GPU its tier.
 */
export function classifyProbe(frameTimesMs: readonly number[]): ProbeVerdict {
  if (frameTimesMs.length < PROBE.minFrames) return "failed";
  return median(frameTimesMs) <= PROBE.passMedianMs ? "pass" : "slow";
}
