import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { readSurface, watchErrors } from "./frame-times";
import { pixelStats } from "./pixels";

// Captures the tier 3 pictures from the settled tier 1 field (REQ-TIER-03).
// It writes into public/still, so it runs only when asked:
//   CAPTURE_STILLS=1 pnpm exec playwright test --config playwright.engine.config.ts stills
// Build again afterwards, so the production build is made with the new
// files in place.

const VIEW = '[data-testid="engine-view"]';
const HOST = `${VIEW} [data-part="host"]`;
const TARGET_BYTES = 250 * 1024;
// The first quality that fits the target is kept; the last one is kept
// whatever its size, and the size is printed.
const QUALITIES = [80, 72, 64, 56, 48, 40, 32];

const STILLS = [
  { file: "public/still/field-wide.jpg", width: 1920, height: 1080 },
  { file: "public/still/field-tall.jpg", width: 1080, height: 1920 },
] as const;

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
    for (const [name, x, y] of [
      ["top start", 0, 0],
      ["top end", half.width, 0],
      ["bottom start", 0, half.height],
      ["bottom end", half.width, half.height],
    ] as const) {
      const stats = await pixelStats(page, frame, [{ x, y, ...half }]);
      expect(stats.litShare, `${name} quarter shows the field`).toBeGreaterThan(
        0.05,
      );
    }

    let jpeg: Buffer = Buffer.alloc(0);
    let quality = 0;
    for (quality of QUALITIES) {
      jpeg = await host.screenshot({ type: "jpeg", quality });
      if (jpeg.length <= TARGET_BYTES) break;
    }

    mkdirSync("public/still", { recursive: true });
    writeFileSync(file, jpeg);
    console.log(
      `still ${file} ${width} x ${height} ${jpeg.length} bytes jpeg quality ${quality} ` +
        `gpu ${surface.gpu} browser ${browserName} ${browser.version()}`,
    );
    expect(errors).toEqual([]);
  });
}
