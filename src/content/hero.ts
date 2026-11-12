import type { Text, Tier, TierLines } from "./types";

export type HeroCopy = {
  eyebrow: Text;
  /** The whole headline: the h1's text as assistive technology reads it. */
  headline: Text;
  /** The same headline in its two lines; the second is shown muted. */
  headlineLines: readonly [Text, Text];
  subLine: Text;
  primaryAction: Text;
  secondaryAction: Text;
  cornerControl: Text;
  /** The word above the thin line at the foot of the hero. */
  scrollCue: Text;
};

// The page HTML exists before the engine reports a tier, so it carries the
// tier 3 line, which is true on every device. The tiers 1 and 2 line replaces
// it only after the engine reports tier 1 or 2 (D-027, REQ-CNT-10).
export const STATIC_TIER = 3 satisfies Tier;

/** The headline's two lines. Only the second changes with the tier. */
export const headlineParts = {
  first: "Real-time worlds,",
  second: { gpu: "rendered by your GPU.", still: "built for your GPU." },
} as const satisfies { first: Text; second: TierLines };

// Both whole lines are exported so the hero can reserve the space of the
// longer one and the swap moves nothing (REQ-PERF-03).
export const headlines = {
  gpu: "Real-time worlds, rendered by your GPU.",
  still: "Real-time worlds, built for your GPU.",
} as const satisfies TierLines;

export function heroCopy(tier: Tier): HeroCopy {
  const form = tier === 3 ? "still" : "gpu";
  return {
    eyebrow: "WebGPU developer",
    headline: headlines[form],
    headlineLines: [headlineParts.first, headlineParts.second[form]],
    subLine:
      "Interactive 3D, campaigns and web games, shipped to every screen.",
    primaryAction: "See the work",
    secondaryAction: "Send a message",
    cornerControl: "Skip intro",
    scrollCue: "Scroll",
  };
}

const TIER_NAMES = {
  1: "Tier 1 · WebGPU",
  2: "Tier 2 · WebGL2",
  3: "Tier 3 · Still frame",
} as const satisfies Record<Tier, Text>;

/** The tier as the field chapter's readout names it. */
export function tierLabel(tier: Tier): Text {
  return TIER_NAMES[tier];
}

/** A particle count in the readout's short form: 1M, 250K, 100K. */
export function particleCount(count: number): Text {
  if (count >= 999_500) {
    const millions = Math.round(count / 100_000) / 10;
    return `${millions}M`;
  }
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return String(Math.round(count));
}

/**
 * The phone hero's readout, from the real tier and the count its ready event
 * reported: "Tier 2 · WebGL2 · 100K particles". None on tier 3, which draws
 * no particles, and none before the field is ready (A14).
 */
export function tierReadout(
  tier: Tier | null,
  particles: number | null,
): Text | null {
  if (tier === null || tier === 3) return null;
  if (particles === null || !Number.isFinite(particles) || particles <= 0) {
    return null;
  }
  return `${tierLabel(tier)} · ${particleCount(particles)} particles`;
}
