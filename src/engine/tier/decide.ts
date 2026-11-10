import { BYTES_PER_PARTICLE, PARTICLES } from "../config";
import type { Environment, Tier, TierDecision } from "../types";

/**
 * The first step of the tier choice (REQ-TIER-01), taken from facts alone so
 * it can run before three.js is loaded. The order of the checks is the order
 * of precedence: the first one that applies decides.
 */
export function decideTier(
  environment: Environment,
  forcedTier?: Tier,
  tier1Particles: number = PARTICLES.tier1,
): TierDecision {
  if (forcedTier === 3) return { kind: "still", reason: "forced" };
  if (forcedTier === 2) return { kind: "webgl2", reason: "forced" };
  if (forcedTier === 1) return { kind: "webgpu", reason: "forced" };

  if (environment.saveData) return { kind: "still", reason: "save-data" };
  if (environment.coarsePointer) return { kind: "webgl2", reason: "phone" };
  if (!environment.hasWebGpu) return { kind: "webgl2", reason: "no-webgpu" };

  const { adapter } = environment;
  if (adapter === null) return { kind: "webgl2", reason: "no-adapter" };
  if (adapter.isFallbackAdapter) {
    return { kind: "webgl2", reason: "fallback-adapter" };
  }

  // One storage buffer holds every particle, so both the largest buffer and
  // the largest storage binding must take it whole.
  const bufferBytes = tier1Particles * BYTES_PER_PARTICLE;
  if (
    !adapter.coreFeatures ||
    adapter.maxStorageBufferBindingSize < bufferBytes ||
    adapter.maxBufferSize < bufferBytes
  ) {
    return { kind: "webgl2", reason: "adapter-limits" };
  }

  return { kind: "probe" };
}

export function tier2ParticleCount(coarsePointer: boolean): number {
  return coarsePointer ? PARTICLES.tier2Phone : PARTICLES.tier2Desktop;
}
