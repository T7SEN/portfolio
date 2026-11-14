import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
} from "three/webgpu";

import {
  createPlaced,
  horizonDim,
  placeSky,
  prepareSky,
  type SkyCatalogue,
  type SkyFrame,
} from "../sky/sky";
import type { SkyView } from "../types";

// The contact sky's textures (D-146), read by the simulation the way it
// reads the shape atlas: textureLoad on a float texture, so tier 2 draws
// what tier 1 draws (REQ-ENG-05). The CPU fills them on each step while the
// sky shows: every star's place at the focus plane, whether it is in view
// and its light; every constellation line's two ends and how much of it
// shows. A fixed table hands out star particles by brightness.

/** Texels a row in every sky texture. */
export const SKY_TEXTURE_WIDTH = 64;
/** Entries in the pick table: a seeded pick reads one, a star's index. */
export const SKY_PICKS = 4096;
/** A shown line's light where the pointer settles, and where words trace it. */
export const SKY_HOVER_LIGHT = 1.8;
export const SKY_TRACE_LIGHT = 2.4;
/** A traced constellation's stars brighten by this, more for the flash. */
export const SKY_TRACE_BOOST = 0.8;
export const SKY_FLASH_GAIN = 1.5;

function floatTexture(texels: number): DataTexture {
  const rows = Math.max(1, Math.ceil(texels / SKY_TEXTURE_WIDTH));
  const texture = new DataTexture(
    new Float32Array(SKY_TEXTURE_WIDTH * rows * 4),
    SKY_TEXTURE_WIDTH,
    rows,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The pick table: entry i holds the star whose share of the summed square
 * roots of the stars' light reaches (i + 0.5) / SKY_PICKS, so bright stars
 * draw more particles without the faint ones going unseen.
 */
export function skyPicks(light: Float32Array, picks = SKY_PICKS): Float32Array {
  const table = new Float32Array(picks);
  let total = 0;
  for (const value of light) total += Math.sqrt(value);
  let star = 0;
  let reached = Math.sqrt(light[0] ?? 0);
  for (let entry = 0; entry < picks; entry += 1) {
    const at = ((entry + 0.5) / picks) * total;
    while (reached < at && star < light.length - 1) {
      star += 1;
      reached += Math.sqrt(light[star] ?? 0);
    }
    table[entry] = star;
  }
  return table;
}

/** A place in CSS pixels to world units at the focus plane. */
export type ToWorld = (x: number, y: number) => { x: number; y: number };

/**
 * The sky's textures for this catalogue (catalogue.ts, which the runtime
 * loads by dynamic import, so the page and the engine share one chunk of
 * it), its stars moved to the year of atMs.
 */
export function createSkyField(catalogue: SkyCatalogue, atMs: number) {
  const sky = prepareSky(catalogue, atMs);
  const placed = createPlaced(sky.count);
  const stars = floatTexture(sky.count);
  const segments = floatTexture(sky.segmentCount * 2);
  const picks = floatTexture(SKY_PICKS);
  const pickTable = skyPicks(sky.light);
  const pickData = picks.image.data as Float32Array;
  for (let entry = 0; entry < SKY_PICKS; entry += 1) {
    pickData[entry * 4] = pickTable[entry] ?? 0;
  }
  picks.needsUpdate = true;

  return {
    stars,
    segments,
    picks,
    segmentCount: sky.segmentCount,

    /** Fills the stars and lines for a view of the sky on a frame. */
    update(view: SkyView, frame: SkyFrame, toWorld: ToWorld): void {
      placeSky(sky, view.at, frame, view, placed);
      const trace = view.trace;
      const traced = trace?.constellation ?? -1;
      const flash = trace?.flash ?? 0;
      const starData = stars.image.data as Float32Array;
      for (let star = 0; star < sky.count; star += 1) {
        const place = toWorld(placed.x[star] ?? 0, placed.y[star] ?? 0);
        const up = placed.up[star] === 1;
        const visited = trace !== null && sky.constellation[star] === traced;
        const at = star * 4;
        starData[at] = place.x;
        starData[at + 1] = place.y;
        starData[at + 2] = up
          ? (sky.light[star] ?? 0) * horizonDim(placed.altitude[star] ?? 0)
          : 0;
        starData[at + 3] = visited ? 1 + SKY_TRACE_BOOST + flash : 1;
      }
      const lineData = segments.image.data as Float32Array;
      const progress =
        trace === null
          ? { done: 0, partial: 0 }
          : { done: trace.done, partial: trace.partial };
      for (let segment = 0; segment < sky.segmentCount; segment += 1) {
        const a = sky.segments[segment * 4] ?? 0;
        const b = sky.segments[segment * 4 + 1] ?? 0;
        const constellation = sky.segments[segment * 4 + 2] ?? 0;
        const order = sky.segments[segment * 4 + 3] ?? 0;
        const from = toWorld(placed.x[a] ?? 0, placed.y[a] ?? 0);
        const to = toWorld(placed.x[b] ?? 0, placed.y[b] ?? 0);
        const reveal = view.reveal[constellation] ?? 0;
        const lines = sky.segmentsOf[constellation] ?? 1;
        const shown = Math.min(Math.max(reveal * lines - order, 0), 1);
        let light = shown > 0 ? SKY_HOVER_LIGHT : 0;
        let limit = shown;
        if (constellation === traced) {
          const part =
            order < progress.done
              ? 1
              : order === progress.done
                ? progress.partial
                : 0;
          if (part > 0) {
            light = SKY_TRACE_LIGHT * (1 + SKY_FLASH_GAIN * flash);
            limit = Math.max(limit, part);
          }
        }
        const at = segment * 8;
        lineData[at] = from.x;
        lineData[at + 1] = from.y;
        lineData[at + 2] = to.x;
        lineData[at + 3] = to.y;
        lineData[at + 4] = placed.up[a] === 1 && placed.up[b] === 1 ? 1 : 0;
        lineData[at + 5] = light;
        lineData[at + 6] = limit;
        lineData[at + 7] = 0;
      }
      stars.needsUpdate = true;
      segments.needsUpdate = true;
    },

    dispose(): void {
      stars.dispose();
      segments.dispose();
      picks.dispose();
    },
  };
}

export type SkyField = ReturnType<typeof createSkyField>;
