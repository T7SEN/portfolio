import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { FIELD_STILLS } from "../../src/components/home/field-stills";
import { PASS_STILLS } from "../../src/components/home/pass-stills";
import { PASSES, WORK_SHAPES } from "../../src/engine/story";
import { packAtlas } from "../../src/engine/runtime/atlas";
import {
  SHEET_FIT,
  bloomStage,
  calmProgress,
  fitScale,
  stagedFrame,
} from "../../src/engine/runtime/story";
import { compareImages } from "./cards";
import { readSurface, watchErrors } from "./frame-times";
import { pixelStats } from "./pixels";

// Captures the tier 3 pictures from the settled tier 1 field (REQ-TIER-03):
// the field stills behind the whole page, one still of each full study's
// shape for its frame on the home page, the field chapter's wordmark, wide
// and tall, and one still of each making-of pass for its card. They are
// written into public/still, so they run only when
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
  qualities: readonly number[] = QUALITIES,
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
      qualities,
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

/**
 * The middle of the making-of sheet, the frame's own shape at SHEET_FIT of
 * it round its centre, at the given size's width over height: the sheet's
 * full height where the sheet is wider than that. Drawn down to the size
 * with the browser's best filter. It is the part of the frame a pass card
 * shows (the engine's sheetCrop in runtime/pass-rules.ts). Returned as a
 * lossless PNG.
 */
async function fitStill(
  page: Page,
  png: Buffer,
  size: { width: number; height: number },
): Promise<Buffer> {
  const data = await page.evaluate(
    async ({ source, width, height, fit }) => {
      const bytes = Uint8Array.from(atob(source), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const aspect = width / height;
      const cropWidth = Math.min(
        bitmap.width * fit,
        bitmap.height * fit * aspect,
      );
      const cropHeight = cropWidth / aspect;
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("No 2D context to draw with");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        bitmap,
        (bitmap.width - cropWidth) / 2,
        (bitmap.height - cropHeight) / 2,
        cropWidth,
        cropHeight,
        0,
        0,
        width,
        height,
      );
      const blob = await canvas.convertToBlob({ type: "image/png" });
      let binary = "";
      for (const byte of new Uint8Array(await blob.arrayBuffer())) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary);
    },
    { source: png.toString("base64"), ...size, fit: SHEET_FIT },
  );
  return Buffer.from(data, "base64");
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

// The making-of pass stills (REQ-ENG-09): one per pass, for every card the
// field does not draw live (tier 3, before the field is ready, and velocity
// on tier 2). Each is the pass over the making-of sheet's box on forced
// tier 1, the only tier that draws every pass, in the making-of chapter's
// calm still at the desktop frame's size, then the middle of the sheet at
// the card's width over height, as a live card crops the frame
// (runtime/pass-rules.ts, sheetCrop). The card's face is 200 by 270 CSS px
// from 1024 px wide, so the still is twice that, sharp on a dense screen;
// the page shows it with object-fit cover, so the flat phone cards crop it
// to wide.
const PASS_FRAME = { width: 1280, height: 800 } as const;
const PASS_STILL = { width: 400, height: 540 } as const;
// WebP, kept on 12 Nov 2026 when the stills were captured again inside the
// sheet. At the same quality it was the smaller format for velocity (5,870
// bytes against JPEG's 13,330), density (59,262 against 76,435) and glow
// (2,344 against 4,921). For points and the final frame JPEG was smaller
// (73,184 against 79,152 bytes at 0.85, and 75,211 against 80,946 at 0.8)
// but lost more (PSNR 31.27 against 33.44 dB, and 28.64 against 30.48), and
// both WebP files fit the target. Lossless is left out: velocity and glow
// are smooth and lose under 0.5 per cent at 0.9 (PSNR 47.66 and 49.29 dB).
const PASS_QUALITIES = [0.9, 0.85, 0.8, 0.72];
const PASS_TARGET_BYTES = 80 * 1024;
// Every pass lights part of its still, and every pass but the final frame
// differs from the plain frame (the final pass is the frame itself).
// Measured on 12 Nov 2026, cropped inside the sheet: lit 0.93 to 1.00 of
// each still, and every pass but the final one changed the whole sheet,
// the final one none.
const PASS_LIT = 0.2;
const PASS_CHANGED = 0.2;

test.describe("the pass stills", () => {
  test.use({ viewport: PASS_FRAME, deviceScaleFactor: 1 });

  test("REQ-ENG-09 REQ-TIER-03 each making-of pass has a still of its own pass, captured on tier 1 at the card's shape", async ({
    page,
    browser,
    browserName,
  }) => {
    test.skip(
      process.env.CAPTURE_STILLS !== "1",
      "Set CAPTURE_STILLS=1 to write the stills into public/still",
    );
    test.setTimeout(300_000);

    const { errors } = watchErrors(page);
    const view = page.locator(VIEW);
    const host = page.locator(HOST);
    const state =
      "tier=1&count=1000000&calm=1&bare=1&chapter=making-of&progress=0.5";

    async function settledFrame(query: string) {
      await page.goto(`/engine?${query}`);
      // The development server's badge, and the real cursor: the capture
      // never stirs the field.
      await page.addStyleTag({
        content: `nextjs-portal { display: none; } ${HOST} { pointer-events: none !important; }`,
      });
      await expect(view).toHaveAttribute("data-ready", "true", {
        timeout: 90_000,
      });
      await expect(view).toHaveAttribute("data-tier", "1");
      await expect(view).toHaveAttribute("data-chapter", "making-of");
      await page.waitForTimeout(1_000);
      expect(await host.boundingBox()).toEqual({ x: 0, y: 0, ...PASS_FRAME });
      const surface = await readSurface(page, `${HOST} > canvas`);
      expect(surface).toMatchObject({ backend: "webgpu", ...PASS_FRAME });
      return { png: await host.screenshot(), gpu: surface.gpu };
    }

    const plain = await settledFrame(state);

    for (const pass of PASSES) {
      const frame = await settledFrame(`${state}&pass=${pass}`);
      await expect(view).toHaveAttribute("data-pass", pass);

      // The pass covers the sheet's box alone, so its changed share is
      // counted over the sheet.
      const compared = await compareImages(page, plain.png, frame.png);
      const changed =
        compared.changed / (compared.pixels * SHEET_FIT * SHEET_FIT);
      const fitted = await fitStill(page, frame.png, PASS_STILL);
      const stats = await pixelStats(page, fitted);

      const webp = await encodeWebp(
        page,
        fitted,
        PASS_TARGET_BYTES,
        "image/webp",
        PASS_QUALITIES,
      );
      expectWebp(webp.bytes);
      const jpeg = await encodeWebp(page, fitted, 0, "image/jpeg", [
        webp.quality,
      ]);

      const file = PASS_STILLS[pass].replace("/still/", "");
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, file), webp.bytes);
      console.log(
        `still ${join(OUT_DIR, file)} ${PASS_STILL.width} x ${PASS_STILL.height} ${webp.bytes.length} bytes ` +
          `webp quality ${webp.quality} (PSNR ${webp.psnr.toFixed(2)} dB, png ${fitted.length} bytes; ` +
          `jpeg at the same quality ${jpeg.bytes.length} bytes, PSNR ${jpeg.psnr.toFixed(2)} dB), ` +
          `lit share ${stats.litShare.toFixed(4)}, brightest ${stats.brightest}, ` +
          `${changed.toFixed(4)} of the sheet differs from the plain frame (largest ${compared.maxDifference}), ` +
          `gpu ${frame.gpu} browser ${browserName} ${browser.version()}`,
      );

      expect(stats.litShare, `${pass} lights its still`).toBeGreaterThan(
        PASS_LIT,
      );
      if (pass === "final") {
        expect(changed, "the final pass is the frame itself").toBeLessThan(
          0.001,
        );
      } else {
        expect(changed, `${pass} is not the frame`).toBeGreaterThan(
          PASS_CHANGED,
        );
      }
      expect(webp.bytes.length).toBeLessThanOrEqual(PASS_TARGET_BYTES);
    }
    expect(errors).toEqual([]);
  });
});
