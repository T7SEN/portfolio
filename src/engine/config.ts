// Numbers the controller, the tier decision and the runtime share. Particle
// counts are targets until a headed run on a real GPU has measured them
// (REQ-TIER-05); the measured results live in docs/test-log.md.

export const PARTICLES = {
  tier1: 1_000_000,
  tier2Desktop: 250_000,
  tier2Phone: 100_000,
} as const;

// The tier 1 probe (REQ-TIER-01): the real field runs unseen for about two
// seconds and its frame times decide between tier 1 and tier 2.
export const PROBE = {
  durationMs: 2000,
  // Shader compilation lands in the first frames; they are not counted.
  warmupMs: 500,
  // Tier 1 promises 60 fps (REQ-PERF-06). A median above 20 ms means most
  // frames missed a 60 Hz refresh, so the field belongs on tier 2.
  passMedianMs: 20,
  // Fewer counted frames than this means the backend never really drew.
  minFrames: 10,
} as const;

/** How often a frameRate event goes out while the field runs. */
export const FRAME_RATE_INTERVAL_MS = 1000;

/** Bytes per particle in one storage buffer: three pads vec3 to vec4. */
export const BYTES_PER_PARTICLE = 16;
