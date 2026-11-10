// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BYTES_PER_PARTICLE, PARTICLES } from "../config";
import type { AdapterFacts, Environment, Tier, TierDecision } from "../types";
import { decideTier, tier2ParticleCount } from "./decide";

const TIER1_BYTES = PARTICLES.tier1 * BYTES_PER_PARTICLE;

// The WebGPU specification's default limits: 128 MiB and 256 MiB.
const capableAdapter: AdapterFacts = {
  isFallbackAdapter: false,
  maxStorageBufferBindingSize: 134_217_728,
  maxBufferSize: 268_435_456,
};

// A desktop that reaches the probe. Each test changes only what it proves.
function desktop(changes: Partial<Environment> = {}): Environment {
  return {
    saveData: false,
    coarsePointer: false,
    hasWebGpu: true,
    adapter: capableAdapter,
    ...changes,
  };
}

function adapter(changes: Partial<AdapterFacts>): AdapterFacts {
  return { ...capableAdapter, ...changes };
}

// The opposite of the capable desktop: every later check would send it lower.
const worstCase: Environment = {
  saveData: true,
  coarsePointer: true,
  hasWebGpu: false,
  adapter: null,
};

describe("decideTier, the decision table row by row", () => {
  const forcedRows: readonly [Tier, TierDecision][] = [
    [3, { kind: "still", reason: "forced" }],
    [2, { kind: "webgl2", reason: "forced" }],
    [1, { kind: "webgpu", reason: "forced" }],
  ];

  it.each(forcedRows)(
    "REQ-TIER-01 a forced tier %i is used as asked",
    (tier, expected) => {
      expect(decideTier(desktop(), tier)).toEqual(expected);
    },
  );

  it("REQ-TIER-01 REQ-TIER-03 Save-Data gives the still frame", () => {
    expect(decideTier(desktop({ saveData: true }))).toEqual({
      kind: "still",
      reason: "save-data",
    });
  });

  it("REQ-TIER-01 REQ-TIER-02 a coarse pointer gives WebGL2, even with a capable adapter", () => {
    expect(decideTier(desktop({ coarsePointer: true }))).toEqual({
      kind: "webgl2",
      reason: "phone",
    });
  });

  it("REQ-TIER-01 a browser without navigator.gpu gives WebGL2", () => {
    expect(decideTier(desktop({ hasWebGpu: false, adapter: null }))).toEqual({
      kind: "webgl2",
      reason: "no-webgpu",
    });
  });

  it("REQ-TIER-01 a null adapter gives WebGL2", () => {
    expect(decideTier(desktop({ adapter: null }))).toEqual({
      kind: "webgl2",
      reason: "no-adapter",
    });
  });

  it("REQ-TIER-01 a fallback adapter gives WebGL2", () => {
    const environment = desktop({
      adapter: adapter({ isFallbackAdapter: true }),
    });

    expect(decideTier(environment)).toEqual({
      kind: "webgl2",
      reason: "fallback-adapter",
    });
  });

  it("REQ-TIER-01 a storage binding limit below the tier 1 buffer gives WebGL2", () => {
    const environment = desktop({
      adapter: adapter({ maxStorageBufferBindingSize: TIER1_BYTES - 1 }),
    });

    expect(decideTier(environment)).toEqual({
      kind: "webgl2",
      reason: "adapter-limits",
    });
  });

  it("REQ-TIER-01 a buffer size limit below the tier 1 buffer gives WebGL2", () => {
    const environment = desktop({
      adapter: adapter({ maxBufferSize: TIER1_BYTES - 1 }),
    });

    expect(decideTier(environment)).toEqual({
      kind: "webgl2",
      reason: "adapter-limits",
    });
  });

  it("REQ-TIER-01 a capable desktop goes to the probe", () => {
    expect(decideTier(desktop())).toEqual({ kind: "probe" });
  });
});

describe("decideTier, the order of precedence", () => {
  const forcedOverWorst: readonly [Tier, TierDecision][] = [
    [1, { kind: "webgpu", reason: "forced" }],
    [2, { kind: "webgl2", reason: "forced" }],
    [3, { kind: "still", reason: "forced" }],
  ];

  it.each(forcedOverWorst)(
    "REQ-TIER-01 a forced tier %i wins over Save-Data, a phone and a missing GPU",
    (tier, expected) => {
      expect(decideTier(worstCase, tier)).toEqual(expected);
    },
  );

  it("REQ-TIER-01 REQ-TIER-03 Save-Data wins over a phone and a missing GPU", () => {
    expect(decideTier(worstCase)).toEqual({
      kind: "still",
      reason: "save-data",
    });
  });

  it("REQ-TIER-01 REQ-TIER-02 a phone wins over a missing GPU and a missing adapter", () => {
    expect(decideTier({ ...worstCase, saveData: false })).toEqual({
      kind: "webgl2",
      reason: "phone",
    });
  });

  it("REQ-TIER-01 a missing navigator.gpu wins over every adapter fact", () => {
    const environment = desktop({
      hasWebGpu: false,
      adapter: adapter({ isFallbackAdapter: true, maxBufferSize: 0 }),
    });

    expect(decideTier(environment)).toEqual({
      kind: "webgl2",
      reason: "no-webgpu",
    });
  });

  it("REQ-TIER-01 a fallback adapter wins over its limits", () => {
    const environment = desktop({
      adapter: {
        isFallbackAdapter: true,
        maxStorageBufferBindingSize: 0,
        maxBufferSize: 0,
      },
    });

    expect(decideTier(environment)).toEqual({
      kind: "webgl2",
      reason: "fallback-adapter",
    });
  });
});

describe("decideTier, the adapter limits", () => {
  it("REQ-TIER-01 the tier 1 buffer is 16,000,000 bytes by default", () => {
    expect(TIER1_BYTES).toBe(16_000_000);
  });

  it("REQ-TIER-01 limits exactly at the tier 1 buffer size go to the probe", () => {
    const environment = desktop({
      adapter: adapter({
        maxStorageBufferBindingSize: TIER1_BYTES,
        maxBufferSize: TIER1_BYTES,
      }),
    });

    expect(decideTier(environment)).toEqual({ kind: "probe" });
  });

  it("REQ-TIER-01 the limits are checked against the particle count passed in", () => {
    const particles = 2_000_000;
    const bytes = particles * BYTES_PER_PARTICLE;
    const exact = desktop({
      adapter: adapter({
        maxStorageBufferBindingSize: bytes,
        maxBufferSize: bytes,
      }),
    });
    const short = desktop({
      adapter: adapter({
        maxStorageBufferBindingSize: bytes - 1,
        maxBufferSize: bytes,
      }),
    });

    // The same adapter passes for the default count and fails for the larger.
    expect(decideTier(short)).toEqual({ kind: "probe" });
    expect(decideTier(exact, undefined, particles)).toEqual({ kind: "probe" });
    expect(decideTier(short, undefined, particles)).toEqual({
      kind: "webgl2",
      reason: "adapter-limits",
    });
  });

  it("REQ-TIER-01 a smaller particle count lets a smaller adapter through", () => {
    const environment = desktop({
      adapter: adapter({
        maxStorageBufferBindingSize: 1_600_000,
        maxBufferSize: 1_600_000,
      }),
    });

    expect(decideTier(environment)).toEqual({
      kind: "webgl2",
      reason: "adapter-limits",
    });
    expect(decideTier(environment, undefined, 100_000)).toEqual({
      kind: "probe",
    });
  });
});

describe("decideTier, purity", () => {
  it("REQ-TIER-01 the same facts give the same decision and are left unchanged", () => {
    const environment = Object.freeze(
      desktop({ adapter: Object.freeze(adapter({})) }),
    );
    const before = JSON.stringify(environment);

    expect(decideTier(environment)).toEqual(decideTier(environment));
    expect(JSON.stringify(environment)).toBe(before);
  });
});

describe("tier2ParticleCount", () => {
  it("REQ-TIER-02 REQ-TIER-05 a coarse pointer gets the phone target", () => {
    expect(tier2ParticleCount(true)).toBe(PARTICLES.tier2Phone);
  });

  it("REQ-TIER-05 a fine pointer gets the desktop target", () => {
    expect(tier2ParticleCount(false)).toBe(PARTICLES.tier2Desktop);
  });
});
