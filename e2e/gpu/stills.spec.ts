import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { FIELD_STILLS } from "../../src/components/home/field-stills";
import { WORK_SHAPES } from "../../src/engine/story";
import { packAtlas } from "../../src/engine/runtime/atlas";
import {
  bloomStage,
  calmProgress,
  fitScale,
  stagedFrame,
} from "../../src/engine/runtime/story";
import { readSurface, watchErrors } from "./frame-times";
import { pixelStats } from "./pixels";

// Captures the tier 3 pictures from the settled tier 1 field (REQ-TIER-03):
// the field stills behind the whole page, one still of each full study's
// shape for its frame on the home page, and the field chapter's wordmark,
// wide and tall. They are written into public/still, so they run only when
// asked:
//   CAPTURE_STILLS=1 pnpm exec playwright test --config playwright.engine.config.ts stills
// STILLS_DIR writes them elsewhere instead, to look at a capture before it
// replaces the shipped files. Build again afterwards, so the production
// build is made with the new files in place.
//
// Each format chosen by size on 12 Nov 2026 (P3.5), measured against the
// lossless frame. The field stills are WebP: lossless at 87,582 and 82,448
// bytes, where JPEG at quality 80 was 97,932 and 94,903 bytes with losses
// (PSNR 35.0 and 34.8 dB). The study stills are WebP at 0.8, 89,908 to
// 96,176 bytes (PSNR 34.7 to 35.9 dB), where JPEG needed quality 40 to 48
// to fit 100 KB (PSNR 29.7 to 30.5 dB). The wordmark's stills are JPEG (see
// WORDMARK_TARGET_BYTES). Playwright writes no WebP, so the browser encodes
// every still from the lossless frame; Chromium encodes WebP without loss
// at quality 1.

const VIEW = '[data-testid="engine-view"]';
const HOST = `${VIEW} [data-part="host"]`;
const OUT_DIR = process.env.STILLS_DIR ?? "public/still";
// The first quality that fits the target is kept; the last one is kept
// whatever its size, and the size is printed. 1 is lossless.
const QUALITIES = [1, 0.9, 0.85, 0.8, 0.72, 0.64, 0.56, 0.48];

const STILLS = [
  { file: "field-wide.webp", width: 1920, height: 1080 },
  { file: "field-tall.webp", width: 1080, height: 1920 },
] as const;
const FIELD_TARGET_BYTES = 250 * 1024;
// The halftone field between formations is the flow lines and a sprinkle of
// dots, far sparser than the field of P3, which lit over 0.05 of each
// quarter. A capture on 12 Nov 2026 lit 0.0177 to 0.0239 of each quarter at
// 1920 by 1080 and 1080 by 1920; the line is half the lowest.
const QUARTER_LIT = 0.008;

// The frame a full study's row draws on the home page at 1280 px, about 649
// by 440 CSS px (src/components/study/study-frame.tsx); captured at twice
// the pixel density so the picture stays sharp on a dense screen. The page
// shows it with object-fit cover, so other widths crop its sides.
const FRAME = { width: 649, height: 440, scale: 2 } as const;
const STUDY_TARGET_BYTES = 100 * 1024;
// The shape fills the middle of the frame; this box holds nearly all of it.
const STUDY_SHARE = 0.85;

interface Encoded {
  bytes: Buffer;
  quality: number;
  /** Peak signal to noise against the lossless frame, in dB; 99 when equal. */
  psnr: number;
}

/**
 * Encodes the lossless PNG frame as WebP, or JPEG, in the page, at the first
 * quality that fits the target, and decodes the result again to measure
 * what the encoding lost.
 */
async function encodeWebp(
  page: Page,
  png: Buffer,
  targetBytes: number,
  type: "image/webp" | "image/jpeg" = "image/webp",
): Promise<Encoded> {
  const result = await page.evaluate(
    async ({ data, qualities, target, type }) => {
      const decode = async (bytes: Uint8Array<ArrayBuffer>, type: string) => {
        const bitmap = await createImageBitmap(new Blob([bytes], { type }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("No 2D context to decode with");
        context.drawImage(bitmap, 0, 0);
        return { canvas, bitmap, context };
      };
      const source = await decode(
        Uint8Array.from(atob(data), (char) => char.charCodeAt(0)),
        "image/png",
      );
      const reference = source.context.getImageData(
        0,
        0,
        source.bitmap.width,
        source.bitmap.height,
      ).data;

      let blob: Blob | null = null;
      let quality = 0;
      for (quality of qualities) {
        blob = await source.canvas.convertToBlob({ type, quality });
        if (blob.size <= target) break;
      }
      if (blob === null || blob.type !== type) {
        throw new Error(`This browser cannot encode ${type}`);
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const encoded = await decode(bytes, type);
      if (
        encoded.bitmap.width !== source.bitmap.width ||
        encoded.bitmap.height !== source.bitmap.height
      ) {
        throw new Error("The WebP decodes to another size");
      }
      const pixels = encoded.context.getImageData(
        0,
        0,
        encoded.bitmap.width,
        encoded.bitmap.height,
      ).data;
      let sum = 0;
      let count = 0;
      for (let index = 0; index < reference.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          const difference =
            (reference[index + channel] ?? 0) - (pixels[index + channel] ?? 0);
          sum += difference * difference;
          count += 1;
        }
      }
      const error = sum / count;
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return {
        data: btoa(binary),
        quality,
        psnr: error === 0 ? 99 : 10 * Math.log10((255 * 255) / error),
      };
    },
    {
      data: png.toString("base64"),
      qualities: QUALITIES,
      target: targetBytes,
      type,
    },
  );
  return {
    bytes: Buffer.from(result.data, "base64"),
    quality: result.quality,
    psnr: result.psnr,
  };
}

function expectWebp(bytes: Buffer) {
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
}

function expectJpeg(bytes: Buffer) {
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
}

for (const { file, width, height } of STILLS) {
  test(`REQ-TIER-03 the tier 3 still ${file} is one settled tier 1 frame`, async ({
    page,
    browser,
    browserName,
  }) => {
    test.skip(
      process.env.CAPTURE_STILLS !== "1",
      "Set CAPTURE_STILLS=1 to write the stills into public/still",
    );

    const { errors } = watchErrors(page);
    await page.setViewportSize({ width, height });
    // Calm from the start: the field settles unseen and draws one frame.
    await page.goto("/engine?tier=1&calm=1&bare=1");
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });

    const view = page.locator(VIEW);
    await expect(view).toHaveAttribute("data-ready", "true", {
      timeout: 90_000,
    });
    await expect(view).toHaveAttribute("data-tier", "1");
    await page.waitForTimeout(1_000);

    const host = page.locator(HOST);
    expect(await host.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    const surface = await readSurface(page, `${HOST} > canvas`);
    expect(surface).toMatchObject({ backend: "webgpu", width, height });

    // Proof on the lossless frame that the field is there, edge to edge.
    const frame = await host.screenshot();
    const half = { width: width / 2, height: height / 2 };
    const quarters: string[] = [];
    for (const [name, x, y] of [
      ["top start", 0, 0],
      ["top end", half.width, 0],
      ["bottom start", 0, half.height],
      ["bottom end", half.width, half.height],
    ] as const) {
      const stats = await pixelStats(page, frame, [{ x, y, ...half }]);
      quarters.push(`${name} ${stats.litShare.toFixed(4)}`);
      expect(stats.litShare, `${name} quarter shows the field`).toBeGreaterThan(
        QUARTER_LIT,
      );
    }

    const webp = await encodeWebp(page, frame, FIELD_TARGET_BYTES);
    expectWebp(webp.bytes);

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, file), webp.bytes);
    console.log(
      `still ${join(OUT_DIR, file)} ${width} x ${height} ${webp.bytes.length} bytes webp quality ${webp.quality} ` +
        `(PSNR ${webp.psnr.toFixed(2)} dB, png ${frame.length} bytes), lit share per quarter ${quarters.join(", ")}, ` +
        `gpu ${surface.gpu} browser ${browserName} ${browser.version()}`,
    );
    expect(webp.bytes.length).toBeLessThanOrEqual(FIELD_TARGET_BYTES);
    expect(errors).toEqual([]);
  });
}

// The field chapter's tier 3 picture: its calm frame, the T7SEN wordmark
// whole with the lines round it, at the sizes of the field stills, so it
// fills the screen the chapter holds. A narrow frame forms the wordmark
// across the whole width (runtime/story.ts, bloomStage), so the tall one is
// its own capture. JPEG, chosen by size on 12 Nov 2026: the wordmark's dense
// dots made WebP the larger at the same loss, 143,028 against 105,190 bytes
// at quality 0.8 (PSNR 36.91 against 37.11 dB) wide, and 93,036 against
// 74,116 bytes (37.98 against 38.12 dB) tall; lossless WebP was 506,728
// and 394,508 bytes. The first quality under the target is kept.
const WORDMARK_TARGET_BYTES = 128 * 1024;
const WORDMARK_STILLS = [
  { file: FIELD_STILLS.wide, width: 1920, height: 1080 },
  { file: FIELD_STILLS.tall, width: 1080, height: 1920 },
] as const;
// Most of the light is the wordmark; the lines that keep running round it
// add the rest (e2e/gpu/story.spec.ts measures the same share).
const WORDMARK_SHARE = 0.5;
const atlas = packAtlas();

for (const { file, width, height } of WORDMARK_STILLS) {
  const name = file.replace("/still/", "");
  test(`REQ-TIER-03 REQ-A11Y-05 the tier 3 still ${name} is the field chapter's calm frame, the wordmark whole`, async ({
    page,
    browser,
    browserName,
  }) => {
    test.skip(
      process.env.CAPTURE_STILLS !== "1",
      "Set CAPTURE_STILLS=1 to write the stills into public/still",
    );

    const { errors } = watchErrors(page);
    await page.setViewportSize({ width, height });
    await page.goto(
      `/engine?tier=1&calm=1&bare=1&chapter=bloom&progress=${calmProgress("bloom", 0)}`,
    );
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });

    const view = page.locator(VIEW);
    await expect(view).toHaveAttribute("data-ready", "true", {
      timeout: 90_000,
    });
    await expect(view).toHaveAttribute("data-tier", "1");
    await expect(view).toHaveAttribute("data-chapter", "bloom");
    await page.waitForTimeout(1_000);

    const host = page.locator(HOST);
    expect(await host.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    const surface = await readSurface(page, `${HOST} > canvas`);
    expect(surface).toMatchObject({ backend: "webgpu", width, height });

    // Where the wordmark sits: its fitted box in its bloom stage, with room
    // for the noise and the lattice.
    const frame = { halfWidth: width / height, halfHeight: 1 };
    const staged = stagedFrame(bloomStage(width / height), frame);
    const extent = atlas.extents.wordmark;
    const scale = fitScale(extent, staged.frame);
    const margin = 0.05 * (Math.min(width, height) / 2) + 16;
    const halfWidth =
      ((extent.halfWidth * scale) / frame.halfWidth) * (width / 2) + margin;
    const halfHeight = extent.halfHeight * scale * (height / 2) + margin;
    const box = {
      x: width / 2 - halfWidth,
      y: height / 2 - halfHeight,
      width: 2 * halfWidth,
      height: 2 * halfHeight,
    };

    const png = await host.screenshot();
    const whole = await pixelStats(page, png);
    const inBox = await pixelStats(page, png, [box]);
    const lit = whole.litShare * whole.pixels;
    const share = lit === 0 ? 0 : (inBox.litShare * inBox.pixels) / lit;

    const webp = await encodeWebp(
      page,
      png,
      WORDMARK_TARGET_BYTES,
      "image/jpeg",
    );
    expectJpeg(webp.bytes);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, name), webp.bytes);
    console.log(
      `still ${join(OUT_DIR, name)} ${width} x ${height} ${webp.bytes.length} bytes jpeg quality ${webp.quality} ` +
        `(PSNR ${webp.psnr.toFixed(2)} dB, png ${png.length} bytes), ${Math.round(lit)} lit pixels, ` +
        `${(share * 100).toFixed(1)}% in the wordmark's box ${Math.round(box.width)} x ${Math.round(box.height)}, ` +
        `lit share there ${inBox.litShare.toFixed(4)}, gpu ${surface.gpu} browser ${browserName} ${browser.version()}`,
    );
    expect(inBox.litShare, "the wordmark is drawn").toBeGreaterThan(0.05);
    expect(share, "most of the light is the wordmark").toBeGreaterThan(
      WORDMARK_SHARE,
    );
    expect(webp.bytes.length).toBeLessThanOrEqual(WORDMARK_TARGET_BYTES);
    expect(errors).toEqual([]);
  });
}

test.describe("the study stills", () => {
  test.use({
    viewport: { width: FRAME.width, height: FRAME.height },
    deviceScaleFactor: FRAME.scale,
  });

  for (const [index, slug] of WORK_SHAPES.entries()) {
    const file = `work-${slug}.webp`;
    test(`REQ-TIER-03 REQ-A11Y-03 the tier 3 still ${file} is the ${slug} shape, settled on tier 1 at the frame's size`, async ({
      page,
      browser,
      browserName,
    }) => {
      test.skip(
        process.env.CAPTURE_STILLS !== "1",
        "Set CAPTURE_STILLS=1 to write the stills into public/still",
      );

      const { errors } = watchErrors(page);
      // The study at the middle of its step, whole, as calm shows it.
      const progress = (index + 0.5) / WORK_SHAPES.length;
      await page.goto(
        `/engine?tier=1&calm=1&bare=1&chapter=work&progress=${progress}`,
      );
      await page.addStyleTag({ content: "nextjs-portal { display: none; }" });

      const view = page.locator(VIEW);
      await expect(view).toHaveAttribute("data-ready", "true", {
        timeout: 90_000,
      });
      await expect(view).toHaveAttribute("data-tier", "1");
      await expect(view).toHaveAttribute("data-chapter", "work");
      await page.waitForTimeout(1_000);

      const host = page.locator(HOST);
      expect(await host.boundingBox()).toEqual({
        x: 0,
        y: 0,
        width: FRAME.width,
        height: FRAME.height,
      });
      const surface = await readSurface(page, `${HOST} > canvas`);
      expect(surface).toMatchObject({
        backend: "webgpu",
        width: FRAME.width * FRAME.scale,
        height: FRAME.height * FRAME.scale,
      });

      // The shape sits in the middle of the frame: nearly all the light is
      // inside the middle 80 per cent on each axis, in device pixels.
      const frame = await host.screenshot();
      const whole = await pixelStats(page, frame);
      const middle = await pixelStats(page, frame, [
        {
          x: 0.1 * FRAME.width * FRAME.scale,
          y: 0.1 * FRAME.height * FRAME.scale,
          width: 0.8 * FRAME.width * FRAME.scale,
          height: 0.8 * FRAME.height * FRAME.scale,
        },
      ]);
      const lit = whole.litShare * whole.pixels;
      const share = lit === 0 ? 0 : (middle.litShare * middle.pixels) / lit;

      const webp = await encodeWebp(page, frame, STUDY_TARGET_BYTES);
      expectWebp(webp.bytes);

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, file), webp.bytes);
      console.log(
        `still ${join(OUT_DIR, file)} ${FRAME.width * FRAME.scale} x ${FRAME.height * FRAME.scale} ` +
          `${webp.bytes.length} bytes webp quality ${webp.quality} (PSNR ${webp.psnr.toFixed(2)} dB), ` +
          `${Math.round(lit)} lit pixels, ${(share * 100).toFixed(1)}% in the middle, brightest ${whole.brightest}, ` +
          `gpu ${surface.gpu} browser ${browserName} ${browser.version()}`,
      );
      expect(lit, "the shape is drawn").toBeGreaterThan(1_000);
      expect(
        share,
        "the shape sits in the middle of the frame",
      ).toBeGreaterThan(STUDY_SHARE);
      expect(webp.bytes.length).toBeLessThanOrEqual(STUDY_TARGET_BYTES);
      expect(errors).toEqual([]);
    });
  }
});
