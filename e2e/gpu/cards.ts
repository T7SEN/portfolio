import type { Page } from "@playwright/test";

import type { PassCard, PassId } from "../../src/engine/types";

/** A card's face on the image: its four corners in image pixels, y down. */
export interface Quad {
  pass: PassId;
  corners: ReadonlyArray<{ x: number; y: number }>;
}

/** The cards as the page sent them, on an image of this size. */
export function quadsOf(
  cards: readonly PassCard[],
  width: number,
  height: number,
): Quad[] {
  return cards.map((card) => ({
    pass: card.pass,
    corners: card.corners.map((corner) => ({
      x: ((corner.x + 1) / 2) * width,
      y: ((1 - corner.y) / 2) * height,
    })),
  }));
}

export interface CardRegion {
  pass: PassId;
  /** Pixels well inside the face. */
  pixels: number;
  /** Their share with a channel above the lit threshold, in the frame with cards. */
  litShare: number;
  /** Their share that differs from the frame without cards by more than the tolerance. */
  changedShare: number;
}

export interface CardComparison {
  cards: CardRegion[];
  /** Pixels well clear of every face. */
  outside: number;
  /** Of those, how many differ between the two frames by more than the tolerance. */
  outsideChanged: number;
  /** The largest difference of any channel outside the faces, 0 to 255. */
  outsideMaxDifference: number;
}

/**
 * Compares two captures of the same still, one without cards and one with
 * them, face by face: what each face holds, and whether anything changed
 * outside them. A band of pixels along every edge counts as neither inside
 * nor outside, since a pixel there is cut by the edge. Decoded in the page,
 * as pixels.ts does.
 */
export async function compareCards(
  page: Page,
  without: Buffer,
  withCards: Buffer,
  quads: readonly Quad[],
  band: number,
  tolerance = 2,
  litAbove = 40,
): Promise<CardComparison> {
  return page.evaluate(
    async ({ plain, carded, faces, edge, allowed, threshold }) => {
      const decode = async (data: string) => {
        const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("No 2D context to decode with");
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const before = await decode(plain);
      const after = await decode(carded);
      if (before.width !== after.width || before.height !== after.height) {
        throw new Error("The two captures differ in size");
      }

      // Each edge as a line, oriented so the face is on its positive side.
      const edges = faces.map((face) => {
        const points = face.corners;
        let area = 0;
        for (let index = 0; index < points.length; index += 1) {
          const a = points[index];
          const b = points[(index + 1) % points.length];
          if (a === undefined || b === undefined) continue;
          area += a.x * b.y - b.x * a.y;
        }
        const sign = area >= 0 ? 1 : -1;
        return points.map((a, index) => {
          const b = points[(index + 1) % points.length] ?? a;
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          return {
            ax: a.x,
            ay: a.y,
            nx: (-(b.y - a.y) / length) * sign,
            ny: ((b.x - a.x) / length) * sign,
          };
        });
      });
      // The signed distance of a point to a face: above 0 inside it.
      const depthIn = (index: number, x: number, y: number) => {
        let nearest = Number.POSITIVE_INFINITY;
        for (const line of edges[index] ?? []) {
          const distance = (x - line.ax) * line.nx + (y - line.ay) * line.ny;
          nearest = Math.min(nearest, distance);
        }
        return nearest;
      };

      const regions = faces.map((face) => ({
        pass: face.pass,
        pixels: 0,
        lit: 0,
        changed: 0,
      }));
      let outside = 0;
      let outsideChanged = 0;
      let outsideMaxDifference = 0;

      for (let y = 0; y < after.height; y += 1) {
        for (let x = 0; x < after.width; x += 1) {
          const index = (y * after.width + x) * 4;
          let difference = 0;
          let brightest = 0;
          for (let channel = 0; channel < 3; channel += 1) {
            const now = after.data[index + channel] ?? 0;
            const was = before.data[index + channel] ?? 0;
            difference = Math.max(difference, Math.abs(now - was));
            brightest = Math.max(brightest, now);
          }
          const changed = difference > allowed;
          let near = false;
          let inside = -1;
          for (let face = 0; face < faces.length; face += 1) {
            const depth = depthIn(face, x + 0.5, y + 0.5);
            if (depth >= edge) inside = face;
            if (depth > -edge) near = true;
          }
          const region = regions[inside];
          if (region !== undefined) {
            region.pixels += 1;
            if (brightest > threshold) region.lit += 1;
            if (changed) region.changed += 1;
          } else if (!near) {
            outside += 1;
            if (changed) outsideChanged += 1;
            outsideMaxDifference = Math.max(outsideMaxDifference, difference);
          }
        }
      }

      return {
        cards: regions.map((region) => ({
          pass: region.pass,
          pixels: region.pixels,
          litShare: region.pixels === 0 ? 0 : region.lit / region.pixels,
          changedShare:
            region.pixels === 0 ? 0 : region.changed / region.pixels,
        })),
        outside,
        outsideChanged,
        outsideMaxDifference,
      };
    },
    {
      plain: without.toString("base64"),
      carded: withCards.toString("base64"),
      faces: quads.map((quad) => ({
        pass: quad.pass,
        corners: quad.corners.map((corner) => ({ ...corner })),
      })),
      edge: band,
      allowed: tolerance,
      threshold: litAbove,
    },
  );
}

/** Two captures of one size: how many pixels differ, and by how much at most. */
export async function compareImages(
  page: Page,
  a: Buffer,
  b: Buffer,
  tolerance = 2,
): Promise<{ pixels: number; changed: number; maxDifference: number }> {
  return page.evaluate(
    async ({ first, second, allowed }) => {
      const decode = async (data: string) => {
        const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("No 2D context to decode with");
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const one = await decode(first);
      const two = await decode(second);
      let changed = 0;
      let maxDifference = 0;
      for (let index = 0; index < one.length; index += 4) {
        let difference = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          difference = Math.max(
            difference,
            Math.abs((one[index + channel] ?? 0) - (two[index + channel] ?? 0)),
          );
        }
        if (difference > allowed) changed += 1;
        maxDifference = Math.max(maxDifference, difference);
      }
      return { pixels: one.length / 4, changed, maxDifference };
    },
    {
      first: a.toString("base64"),
      second: b.toString("base64"),
      allowed: tolerance,
    },
  );
}
