import type { Text, Tier } from "./types";

export type HeroCopy = {
  eyebrow: Text;
  headline: Text;
  subLine: Text;
  primaryAction: Text;
  secondaryAction: Text;
  cornerControl: Text;
};

// The page HTML exists before the engine reports a tier, so it carries the
// tier 3 line, which is true on every device. The tiers 1 and 2 line replaces
// it only after the engine reports tier 1 or 2 (D-027, REQ-CNT-10).
export const STATIC_TIER = 3 satisfies Tier;

// Both lines are exported so the hero can reserve the space of the longer one
// and the swap moves nothing (REQ-PERF-03).
export const headlines = {
  gpu: "Real-time worlds, rendered by your GPU.",
  still: "Real-time worlds, built for your GPU.",
} as const;

export function heroCopy(tier: Tier): HeroCopy {
  return {
    eyebrow: "WebGPU developer",
    headline: tier === 3 ? headlines.still : headlines.gpu,
    subLine:
      "Interactive 3D, campaigns and web games, shipped to every screen.",
    primaryAction: "See the work",
    secondaryAction: "Send a message",
    cornerControl: "Skip intro",
  };
}
