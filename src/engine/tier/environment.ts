import type { AdapterFacts, Environment } from "../types";

// TypeScript 6.0.3's lib.dom declares no Network Information API, so the one
// field read from it gets a narrow type here.
interface NavigatorWithConnection {
  readonly connection?: { readonly saveData?: unknown };
}

const SAVE_DATA_QUERY = "(prefers-reduced-data: reduce)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";

function connectionSavesData(): boolean {
  try {
    const { connection } = navigator as Navigator & NavigatorWithConnection;
    return connection?.saveData === true;
  } catch {
    return false;
  }
}

function mediaMatches(query: string): boolean {
  try {
    return (
      typeof matchMedia === "function" && matchMedia(query).matches === true
    );
  } catch {
    return false;
  }
}

function readGpu(): GPU | null {
  try {
    // The key can exist and hold nothing, and the renderer would then fall
    // back to WebGL2 anyway, so that counts as no WebGPU.
    return "gpu" in navigator ? (navigator.gpu ?? null) : null;
  } catch {
    return null;
  }
}

interface NavigatorWithPlatform {
  readonly userAgentData?: { readonly platform?: unknown };
}

/**
 * The power preference the WebGPU adapter is asked for: the faster GPU on a
 * device with two. Chrome on Windows ignores it and writes a console warning
 * for every request that names it (crbug.com/369219127), so there it is left
 * out, which changes nothing that runs. Read from the platform Chromium
 * reports, else from the user agent string.
 */
export function adapterPowerPreference(
  nav: Navigator | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): GPUPowerPreference | undefined {
  try {
    const platform = (nav as (Navigator & NavigatorWithPlatform) | undefined)
      ?.userAgentData?.platform;
    const isWindows =
      typeof platform === "string" && platform !== ""
        ? platform === "Windows"
        : typeof nav?.userAgent === "string" && /Windows/.test(nav.userAgent);
    return isWindows ? undefined : "high-performance";
  } catch {
    return "high-performance";
  }
}

// A limit that is missing or not a number must fail the size check, and a
// comparison with undefined would pass it.
function limitOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function readAdapter(gpu: GPU): Promise<AdapterFacts | null> {
  try {
    const powerPreference = adapterPowerPreference();
    const adapter = await gpu.requestAdapter(
      powerPreference === undefined ? undefined : { powerPreference },
    );
    if (!adapter) return null;

    return {
      isFallbackAdapter: adapter.info.isFallbackAdapter === true,
      maxStorageBufferBindingSize: limitOrZero(
        adapter.limits.maxStorageBufferBindingSize,
      ),
      maxBufferSize: limitOrZero(adapter.limits.maxBufferSize),
    };
  } catch {
    return null;
  }
}

/**
 * Reads what the tier decision needs from the device (REQ-TIER-01). It never
 * rejects: a missing API or a throw gives the value that leads to the lower
 * tier.
 */
export async function readEnvironment(): Promise<Environment> {
  const saveData = connectionSavesData() || mediaMatches(SAVE_DATA_QUERY);
  const coarsePointer = mediaMatches(COARSE_POINTER_QUERY);
  const gpu = readGpu();

  // Save-Data and phones are decided without the adapter, so it is not
  // requested for them.
  const adapter =
    saveData || coarsePointer || gpu === null ? null : await readAdapter(gpu);

  return { saveData, coarsePointer, hasWebGpu: gpu !== null, adapter };
}
