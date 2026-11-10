import type { Page } from "@playwright/test";

import { median, percentile } from "../../src/engine/tier/probe";

// Shared by the headed specs: frame times are read in the page from
// requestAnimationFrame, which never runs faster than the display, so a
// figure on the display's refresh interval is a ceiling, not the GPU's limit.

export const WARM_UP_MS = 3_000;
export const WINDOW_MS = 10_000;
// 60 fps for tier 1 (REQ-PERF-06) and 30 fps for tier 2 (REQ-ENG-06).
export const PASS_FPS = { 1: 60, 2: 30 } as const;
// The frame interval of each rate plus 0.1 ms: frame timestamps are rounded
// to 0.1 ms, so a field that holds exactly the rate can measure a median that
// far above its true interval and must still pass.
export const PASS_MEDIAN_MS = {
  1: 1000 / PASS_FPS[1] + 0.1,
  2: 1000 / PASS_FPS[2] + 0.1,
} as const;
// How far the engine's own frame rate may sit from the page's count.
export const FPS_TOLERANCE = 0.03;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

interface Readout {
  /** The frame rate the engine published. */
  fps: number;
  /** Frames the page had counted when it was published. */
  frames: number;
  at: number;
}

interface Sample {
  deltas: number[];
  readouts: Readout[];
}

export interface FrameSummary {
  frames: number;
  medianMs: number;
  p95Ms: number;
  /** Mean of the engine's frameRate events inside the window. */
  engineFps: number;
  /** The page's own frame rate over the same intervals. */
  pageFps: number;
  readouts: number;
}

/** Page errors and console errors, collected from the moment of the call. */
export function watchErrors(page: Page): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") warnings.push(message.text());
  });
  return { errors, warnings };
}

/**
 * Waits for the warm-up, then records every requestAnimationFrame interval
 * for the window, and each data-fps value the element at the selector
 * publishes meanwhile.
 */
export async function measureFrames(
  page: Page,
  selector: string,
): Promise<FrameSummary> {
  const sample = await page.evaluate(
    ({ target, warmUpMs, windowMs }) =>
      new Promise<Sample>((resolve, reject) => {
        const element = document.querySelector<HTMLElement>(target);
        if (element === null) {
          reject(new Error(`Nothing matches ${target}`));
          return;
        }

        const deltas: number[] = [];
        const readouts: Readout[] = [];
        let start: number | null = null;
        let last = 0;

        // The attribute is written on every frameRate event, so each write
        // is one event, even when the value repeats.
        const observer = new MutationObserver(() => {
          if (start === null) return;
          readouts.push({
            fps: Number(element.dataset.fps),
            frames: deltas.length,
            at: performance.now(),
          });
        });
        observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-fps"],
        });

        const tick = (now: number) => {
          if (start === null) start = now;
          else deltas.push(now - last);
          last = now;

          if (now - start >= windowMs) {
            observer.disconnect();
            resolve({ deltas, readouts });
            return;
          }
          requestAnimationFrame(tick);
        };

        window.setTimeout(() => requestAnimationFrame(tick), warmUpMs);
      }),
    { target: selector, warmUpMs: WARM_UP_MS, windowMs: WINDOW_MS },
  );

  // Each published rate covers the time since the one before it, so the
  // first readout has no interval of the page's own to compare with.
  const engineRates: number[] = [];
  const pageRates: number[] = [];
  for (const [index, readout] of sample.readouts.entries()) {
    const previous = sample.readouts[index - 1];
    if (previous === undefined) continue;
    engineRates.push(readout.fps);
    pageRates.push(
      ((readout.frames - previous.frames) * 1000) / (readout.at - previous.at),
    );
  }
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    frames: sample.deltas.length,
    medianMs: median(sample.deltas),
    p95Ms: percentile(sample.deltas, 0.95),
    engineFps: mean(engineRates),
    pageFps: mean(pageRates),
    readouts: sample.readouts.length,
  };
}

export interface Surface {
  backend: "webgpu" | "webgl2" | "none";
  /** The WebGL2 renderer string, or the WebGPU adapter's vendor and family. */
  gpu: string;
  width: number;
  height: number;
  isSoftware: boolean;
}

/**
 * Which context the canvas holds and what GPU is behind it. A canvas keeps
 * one context type for life, so asking for the other type returns null and
 * changes nothing. Call it after measuring, never before.
 */
export async function readSurface(
  page: Page,
  canvasSelector: string,
): Promise<Surface> {
  const surface = await page.evaluate(async (target) => {
    const canvas = document.querySelector<HTMLCanvasElement>(target);
    if (canvas === null) {
      return { backend: "none" as const, gpu: "", width: 0, height: 0 };
    }

    const size = { width: canvas.width, height: canvas.height };
    const gl = canvas.getContext("webgl2");
    if (gl !== null) {
      // RENDERER alone is masked ("WebKit WebGL"); the extension names the
      // real GPU, or the software renderer when there is none.
      const names = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        backend: "webgl2" as const,
        gpu: String(
          gl.getParameter(
            names === null ? gl.RENDERER : names.UNMASKED_RENDERER_WEBGL,
          ),
        ),
        ...size,
      };
    }
    if (canvas.getContext("webgpu") === null) {
      return { backend: "none" as const, gpu: "", ...size };
    }

    const adapter = await navigator.gpu.requestAdapter();
    const info = adapter?.info;
    return {
      backend: "webgpu" as const,
      gpu:
        info === undefined
          ? "no adapter"
          : `${info.vendor} ${info.architecture}${info.isFallbackAdapter ? " fallback" : ""}`,
      ...size,
    };
  }, canvasSelector);

  return {
    ...surface,
    isSoftware:
      SOFTWARE_RENDERER.test(surface.gpu) || surface.gpu.endsWith("fallback"),
  };
}
