import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnvironment } from "./environment";

const SAVE_DATA_QUERY = "(prefers-reduced-data: reduce)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";

interface FakeAdapter {
  info?: { isFallbackAdapter?: unknown };
  features?: ReadonlySet<string>;
  limits?: { maxStorageBufferBindingSize?: unknown; maxBufferSize?: unknown };
}

function capableAdapter(): FakeAdapter {
  return {
    info: { isFallbackAdapter: false },
    features: new Set(["timestamp-query"]),
    limits: {
      maxStorageBufferBindingSize: 134_217_728,
      maxBufferSize: 268_435_456,
    },
  };
}

function adapterRequest(adapter: FakeAdapter | null) {
  return vi.fn<
    (options?: GPURequestAdapterOptions) => Promise<FakeAdapter | null>
  >(async () => adapter);
}

function stubNavigator(fake: Record<string, unknown>): void {
  vi.stubGlobal("navigator", fake);
}

/** Fakes matchMedia so that only the listed queries match. */
function stubMatchMedia(...matching: string[]) {
  const matchMedia = vi.fn((query: string) => ({
    matches: matching.includes(query),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return matchMedia;
}

const noAdapterAsked = {
  saveData: false,
  coarsePointer: false,
  hasWebGpu: false,
  adapter: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readEnvironment, with nothing to read", () => {
  it("REQ-TIER-01 a browser with no matchMedia, no connection and no navigator.gpu gives the safe values", async () => {
    // jsdom as it comes: none of the three exists.
    expect("gpu" in navigator).toBe(false);
    expect("connection" in navigator).toBe(false);
    expect(typeof globalThis.matchMedia).toBe("undefined");

    await expect(readEnvironment()).resolves.toEqual(noAdapterAsked);
  });

  it("REQ-TIER-01 a missing navigator gives the safe values", async () => {
    vi.stubGlobal("navigator", undefined);

    await expect(readEnvironment()).resolves.toEqual(noAdapterAsked);
  });
});

describe("readEnvironment, Save-Data", () => {
  it("REQ-TIER-01 REQ-TIER-03 navigator.connection.saveData true is read as Save-Data", async () => {
    stubNavigator({ connection: { saveData: true } });
    stubMatchMedia();

    const environment = await readEnvironment();

    expect(environment.saveData).toBe(true);
  });

  it("REQ-TIER-01 REQ-TIER-03 the prefers-reduced-data query is read as Save-Data", async () => {
    stubNavigator({});
    const matchMedia = stubMatchMedia(SAVE_DATA_QUERY);

    const environment = await readEnvironment();

    expect(environment.saveData).toBe(true);
    expect(environment.coarsePointer).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith(SAVE_DATA_QUERY);
  });

  it.each([
    ["false", { saveData: false }],
    ["missing", {}],
    ["the string true", { saveData: "true" }],
    ["the number 1", { saveData: 1 }],
  ])(
    "REQ-TIER-01 a connection whose saveData is %s is not Save-Data",
    async (_label, connection) => {
      stubNavigator({ connection });
      stubMatchMedia();

      const environment = await readEnvironment();

      expect(environment.saveData).toBe(false);
    },
  );

  it("REQ-TIER-01 a connection that throws when read is not Save-Data", async () => {
    const fake = {};
    Object.defineProperty(fake, "connection", {
      get() {
        throw new Error("connection is blocked");
      },
    });
    stubNavigator(fake);
    stubMatchMedia();

    await expect(readEnvironment()).resolves.toEqual(noAdapterAsked);
  });

  it("REQ-TIER-01 REQ-TIER-03 Save-Data never asks for an adapter", async () => {
    const requestAdapter = adapterRequest(capableAdapter());
    stubNavigator({
      connection: { saveData: true },
      gpu: { requestAdapter },
    });
    stubMatchMedia();

    const environment = await readEnvironment();

    expect(environment).toEqual({
      saveData: true,
      coarsePointer: false,
      hasWebGpu: true,
      adapter: null,
    });
    expect(requestAdapter).not.toHaveBeenCalled();
  });
});

describe("readEnvironment, the pointer", () => {
  it("REQ-TIER-02 a coarse primary pointer is read as a phone", async () => {
    stubNavigator({});
    const matchMedia = stubMatchMedia(COARSE_POINTER_QUERY);

    const environment = await readEnvironment();

    expect(environment.coarsePointer).toBe(true);
    expect(environment.saveData).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith(COARSE_POINTER_QUERY);
  });

  it("REQ-TIER-02 a fine primary pointer is not a phone", async () => {
    stubNavigator({});
    stubMatchMedia();

    const environment = await readEnvironment();

    expect(environment.coarsePointer).toBe(false);
  });

  it("REQ-TIER-02 a phone never asks for an adapter, even where WebGPU exists", async () => {
    const requestAdapter = adapterRequest(capableAdapter());
    stubNavigator({ gpu: { requestAdapter } });
    stubMatchMedia(COARSE_POINTER_QUERY);

    const environment = await readEnvironment();

    expect(environment).toEqual({
      saveData: false,
      coarsePointer: true,
      hasWebGpu: true,
      adapter: null,
    });
    expect(requestAdapter).not.toHaveBeenCalled();
  });
});

describe("readEnvironment, matchMedia failures", () => {
  it("REQ-TIER-01 a matchMedia that throws reads as no Save-Data and a fine pointer", async () => {
    stubNavigator({});
    vi.stubGlobal("matchMedia", () => {
      throw new Error("matchMedia is blocked");
    });

    await expect(readEnvironment()).resolves.toEqual(noAdapterAsked);
  });

  it("REQ-TIER-01 a matchMedia that returns nothing reads as no Save-Data and a fine pointer", async () => {
    stubNavigator({});
    vi.stubGlobal("matchMedia", () => undefined);

    await expect(readEnvironment()).resolves.toEqual(noAdapterAsked);
  });

  it("REQ-TIER-01 the adapter is still read when matchMedia is missing", async () => {
    const requestAdapter = adapterRequest(capableAdapter());
    stubNavigator({ gpu: { requestAdapter } });

    const environment = await readEnvironment();

    expect(environment.adapter).not.toBeNull();
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });
});

describe("readEnvironment, navigator.gpu", () => {
  it("REQ-TIER-01 a fine pointer with navigator.gpu asks once for a high-performance adapter", async () => {
    const requestAdapter = adapterRequest(capableAdapter());
    stubNavigator({ gpu: { requestAdapter } });
    stubMatchMedia();

    const environment = await readEnvironment();

    expect(environment.hasWebGpu).toBe(true);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(requestAdapter).toHaveBeenCalledWith({
      powerPreference: "high-performance",
    });
  });

  it("REQ-TIER-01 the adapter is mapped to its three facts", async () => {
    stubNavigator({
      gpu: { requestAdapter: adapterRequest(capableAdapter()) },
    });
    stubMatchMedia();

    await expect(readEnvironment()).resolves.toEqual({
      saveData: false,
      coarsePointer: false,
      hasWebGpu: true,
      adapter: {
        isFallbackAdapter: false,
        maxStorageBufferBindingSize: 134_217_728,
        maxBufferSize: 268_435_456,
      },
    });
  });

  it("REQ-TIER-01 a fallback adapter is reported as one", async () => {
    const adapter = { ...capableAdapter(), info: { isFallbackAdapter: true } };
    stubNavigator({ gpu: { requestAdapter: adapterRequest(adapter) } });
    stubMatchMedia();

    const environment = await readEnvironment();

    expect(environment.adapter?.isFallbackAdapter).toBe(true);
  });

  it("REQ-TIER-01 the adapter's feature list is not read", async () => {
    const adapter: FakeAdapter = {
      info: { isFallbackAdapter: false },
      limits: capableAdapter().limits,
    };
    stubNavigator({ gpu: { requestAdapter: adapterRequest(adapter) } });
    stubMatchMedia();

    const environment = await readEnvironment();

    expect(environment.adapter).toEqual({
      isFallbackAdapter: false,
      maxStorageBufferBindingSize: 134_217_728,
      maxBufferSize: 268_435_456,
    });
  });

  it("REQ-TIER-01 limits that are missing or not numbers are read as 0", async () => {
    const adapter = {
      ...capableAdapter(),
      limits: { maxStorageBufferBindingSize: "134217728" },
    };
    stubNavigator({ gpu: { requestAdapter: adapterRequest(adapter) } });
    stubMatchMedia();

    const environment = await readEnvironment();

    expect(environment.adapter).toEqual({
      isFallbackAdapter: false,
      maxStorageBufferBindingSize: 0,
      maxBufferSize: 0,
    });
  });

  it("REQ-TIER-01 a navigator.gpu that holds nothing counts as no WebGPU", async () => {
    stubNavigator({ gpu: undefined });
    stubMatchMedia();

    await expect(readEnvironment()).resolves.toEqual(noAdapterAsked);
  });
});

describe("readEnvironment, adapter failures", () => {
  const hasGpuNoAdapter = {
    saveData: false,
    coarsePointer: false,
    hasWebGpu: true,
    adapter: null,
  };

  it("REQ-TIER-01 requestAdapter resolving null gives no adapter", async () => {
    stubNavigator({ gpu: { requestAdapter: adapterRequest(null) } });
    stubMatchMedia();

    await expect(readEnvironment()).resolves.toEqual(hasGpuNoAdapter);
  });

  it("REQ-TIER-01 requestAdapter rejecting gives no adapter", async () => {
    const requestAdapter = vi.fn(() =>
      Promise.reject(new Error("adapter request failed")),
    );
    stubNavigator({ gpu: { requestAdapter } });
    stubMatchMedia();

    await expect(readEnvironment()).resolves.toEqual(hasGpuNoAdapter);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it("REQ-TIER-01 requestAdapter throwing gives no adapter", async () => {
    const requestAdapter = vi.fn(() => {
      throw new Error("adapter request threw");
    });
    stubNavigator({ gpu: { requestAdapter } });
    stubMatchMedia();

    await expect(readEnvironment()).resolves.toEqual(hasGpuNoAdapter);
  });

  it("REQ-TIER-01 a navigator.gpu without requestAdapter gives no adapter", async () => {
    stubNavigator({ gpu: {} });
    stubMatchMedia();

    await expect(readEnvironment()).resolves.toEqual(hasGpuNoAdapter);
  });

  it.each([
    ["info", { limits: {} }],
    ["limits", { info: { isFallbackAdapter: false } }],
  ] satisfies [string, FakeAdapter][])(
    "REQ-TIER-01 an adapter without %s gives no adapter",
    async (_part, adapter) => {
      stubNavigator({ gpu: { requestAdapter: adapterRequest(adapter) } });
      stubMatchMedia();

      await expect(readEnvironment()).resolves.toEqual(hasGpuNoAdapter);
    },
  );
});
