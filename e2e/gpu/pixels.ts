import type { Page } from "@playwright/test";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelStats {
  pixels: number;
  /** WCAG relative luminance of the brightest pixel, 0 to 1. */
  maxLuminance: number;
  /** The brightest pixel as #RRGGBB. */
  brightest: string;
  meanLuminance: number;
  /** Share of pixels with a channel above the threshold, 0 to 1. */
  litShare: number;
}

/**
 * Decodes a PNG screenshot in the page and measures the pixels inside the
 * boxes (the whole image when none are given). The repo has no image
 * decoder of its own, and the browser's is exact for an 8-bit sRGB PNG.
 */
export async function pixelStats(
  page: Page,
  png: Buffer,
  boxes: readonly Box[] = [],
  litAbove = 40,
): Promise<PixelStats> {
  return page.evaluate(
    async ({ data, regions, threshold }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("No 2D context to decode with");
      context.drawImage(bitmap, 0, 0);

      const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      const hex = (channel: number) => channel.toString(16).padStart(2, "0");

      let pixels = 0;
      let lit = 0;
      let sum = 0;
      let maxLuminance = 0;
      let brightest = "#000000";

      const whole = [
        { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
      ];
      for (const region of regions.length > 0 ? regions : whole) {
        const x = Math.max(0, Math.floor(region.x));
        const y = Math.max(0, Math.floor(region.y));
        const width = Math.min(bitmap.width - x, Math.ceil(region.width));
        const height = Math.min(bitmap.height - y, Math.ceil(region.height));
        if (width <= 0 || height <= 0) continue;

        const image = context.getImageData(x, y, width, height).data;
        for (let index = 0; index < image.length; index += 4) {
          const r = image[index] ?? 0;
          const g = image[index + 1] ?? 0;
          const b = image[index + 2] ?? 0;
          const value = luminance(r, g, b);
          pixels += 1;
          sum += value;
          if (Math.max(r, g, b) > threshold) lit += 1;
          if (value > maxLuminance) {
            maxLuminance = value;
            brightest = `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
          }
        }
      }

      return {
        pixels,
        maxLuminance,
        brightest,
        meanLuminance: pixels === 0 ? 0 : sum / pixels,
        litShare: pixels === 0 ? 0 : lit / pixels,
      };
    },
    { data: png.toString("base64"), regions: [...boxes], threshold: litAbove },
  );
}

export interface Rings {
  /** The rings' centre, in image pixels. */
  x: number;
  y: number;
  /** Each ring's radius, in image pixels. */
  radii: readonly number[];
  /** How far from a ring's radius a lit pixel still counts as on it. */
  band: number;
}

/**
 * The share of the image's lit pixels that lie on the rings: within the band
 * of one of the radii from the centre. A formation of rings round a point
 * puts nearly all its light there; light anywhere else lowers the share.
 */
export async function ringShare(
  page: Page,
  png: Buffer,
  rings: Rings,
  litAbove = 40,
): Promise<{ lit: number; onRings: number; share: number }> {
  return page.evaluate(
    async ({ data, target, threshold }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("No 2D context to decode with");
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);

      let lit = 0;
      let onRings = 0;
      for (let y = 0; y < bitmap.height; y += 1) {
        for (let x = 0; x < bitmap.width; x += 1) {
          const index = (y * bitmap.width + x) * 4;
          const brightest = Math.max(
            image.data[index] ?? 0,
            image.data[index + 1] ?? 0,
            image.data[index + 2] ?? 0,
          );
          if (brightest <= threshold) continue;
          lit += 1;
          const distance = Math.hypot(x + 0.5 - target.x, y + 0.5 - target.y);
          if (
            target.radii.some(
              (radius) => Math.abs(distance - radius) <= target.band,
            )
          ) {
            onRings += 1;
          }
        }
      }
      return { lit, onRings, share: lit === 0 ? 0 : onRings / lit };
    },
    {
      data: png.toString("base64"),
      target: { ...rings, radii: [...rings.radii] },
      threshold: litAbove,
    },
  );
}

/** The halftone lattice in image pixels (halftone-rules.ts gridFor, times the pixel ratio). */
export interface Lattice {
  /** One cell's side. */
  cell: number;
  /** How far the grid starts before the image's left and top edges. */
  padX: number;
  padY: number;
}

// A cell is lit when its brightest pixel passes this relative luminance,
// and white when it passes the second: the glow token is about 0.34 and the
// near-white text token about 0.85, so only rim and densest dots pass 0.6.
export const LIT_CELL_LUMINANCE = 0.05;
export const WHITE_CELL_LUMINANCE = 0.6;

export interface CellStats {
  cells: number;
  litCells: number;
  whiteCells: number;
  /** The highest mean relative luminance of any one cell, 0 to 1. */
  brightestCellMean: number;
  /** That cell's centre, in image pixels. */
  brightestCellAt: { x: number; y: number };
  /**
   * Over the lit cells, the light in the pixels at a cell's corners against
   * the light in the pixels at its centre. The halftone draws one disc at
   * each cell's centre, so its corners stay nearly dark; the soft field's
   * sprites have no lattice, so its corners are about as bright as centres.
   */
  cornerToCentre: number;
}

/**
 * Measures the image cell by cell on the halftone lattice: the burn rule's
 * brightest cell mean and white cells, and whether the dots sit on the
 * lattice at all. Only cells whose centre lies inside the boxes count (all
 * cells when none are given).
 */
export async function cellStats(
  page: Page,
  png: Buffer,
  lattice: Lattice,
  boxes: readonly Box[] = [],
): Promise<CellStats> {
  return page.evaluate(
    async ({ data, grid, regions, litAt, whiteAt }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("No 2D context to decode with");
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);

      const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      };
      const columns = Math.ceil((bitmap.width + 2 * grid.padX) / grid.cell);
      const rows = Math.ceil((bitmap.height + 2 * grid.padY) / grid.cell);
      const count = columns * rows;
      const sum = new Float64Array(count);
      const pixels = new Uint32Array(count);
      const brightest = new Float64Array(count);
      const corner = new Float64Array(count);
      const centre = new Float64Array(count);
      const cornerPixels = new Uint32Array(count);
      const centrePixels = new Uint32Array(count);
      const far = 0.55 * grid.cell;

      for (let y = 0; y < bitmap.height; y += 1) {
        const row = Math.floor((y + 0.5 + grid.padY) / grid.cell);
        const dy = y + 0.5 + grid.padY - (row + 0.5) * grid.cell;
        for (let x = 0; x < bitmap.width; x += 1) {
          const column = Math.floor((x + 0.5 + grid.padX) / grid.cell);
          const dx = x + 0.5 + grid.padX - (column + 0.5) * grid.cell;
          const index = (y * bitmap.width + x) * 4;
          const value =
            0.2126 * linear(image.data[index] ?? 0) +
            0.7152 * linear(image.data[index + 1] ?? 0) +
            0.0722 * linear(image.data[index + 2] ?? 0);
          const cell = row * columns + column;
          sum[cell] = (sum[cell] ?? 0) + value;
          pixels[cell] = (pixels[cell] ?? 0) + 1;
          if (value > (brightest[cell] ?? 0)) brightest[cell] = value;
          const distance = Math.hypot(dx, dy);
          if (distance <= 1) {
            centre[cell] = (centre[cell] ?? 0) + value;
            centrePixels[cell] = (centrePixels[cell] ?? 0) + 1;
          } else if (distance >= far) {
            corner[cell] = (corner[cell] ?? 0) + value;
            cornerPixels[cell] = (cornerPixels[cell] ?? 0) + 1;
          }
        }
      }

      const inRegions = (x: number, y: number) =>
        regions.length === 0 ||
        regions.some(
          (box) =>
            x >= box.x &&
            x < box.x + box.width &&
            y >= box.y &&
            y < box.y + box.height,
        );

      let cells = 0;
      let litCells = 0;
      let whiteCells = 0;
      let brightestCellMean = 0;
      let brightestCellAt = { x: 0, y: 0 };
      let cornerLight = 0;
      let centreLight = 0;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const cell = row * columns + column;
          const count = pixels[cell] ?? 0;
          if (count === 0) continue;
          const x = (column + 0.5) * grid.cell - grid.padX;
          const y = (row + 0.5) * grid.cell - grid.padY;
          if (!inRegions(x, y)) continue;
          cells += 1;
          const peak = brightest[cell] ?? 0;
          if (peak <= litAt) continue;
          litCells += 1;
          if (peak > whiteAt) whiteCells += 1;
          const mean = (sum[cell] ?? 0) / count;
          if (mean > brightestCellMean) {
            brightestCellMean = mean;
            brightestCellAt = { x, y };
          }
          const corners = cornerPixels[cell] ?? 0;
          const centres = centrePixels[cell] ?? 0;
          if (corners > 0 && centres > 0) {
            cornerLight += (corner[cell] ?? 0) / corners;
            centreLight += (centre[cell] ?? 0) / centres;
          }
        }
      }
      return {
        cells,
        litCells,
        whiteCells,
        brightestCellMean,
        brightestCellAt,
        cornerToCentre: centreLight === 0 ? 0 : cornerLight / centreLight,
      };
    },
    {
      data: png.toString("base64"),
      grid: lattice,
      regions: [...boxes],
      litAt: LIT_CELL_LUMINANCE,
      whiteAt: WHITE_CELL_LUMINANCE,
    },
  );
}
