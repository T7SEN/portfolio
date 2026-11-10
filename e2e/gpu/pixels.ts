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
