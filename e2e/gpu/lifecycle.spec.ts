import { expect, test, type Page } from "@playwright/test";

import { readSurface, watchErrors } from "./frame-times";
import { pixelStats } from "./pixels";

// The engine's life on a real GPU, headed, on the development page: a lost
// context, a lost device, calm mode, tier changes and teardown.

const VIEW = '[data-testid="engine-view"]';
const HOST = `${VIEW} [data-part="host"]`;
const CANVAS = `${HOST} > canvas`;
// three.js reports a loss with console.error; nothing else may be logged.
const LOSS_MESSAGE = /lost/i;

function settled(page: Page, tier: 1 | 2 | 3) {
  return page.locator(`${VIEW}[data-tier="${tier}"][data-ready="true"]`);
}

async function open(page: Page, query: string) {
  await page.goto(`/engine?${query}`);
  // The development server's own badge sits over the corner of the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
}

async function eventCount(page: Page): Promise<number> {
  return Number(await page.locator(VIEW).getAttribute("data-events"));
}

test("REQ-ENG-08 a WebGL2 context lost on tier 2 ends on tier 3 with its reason", async ({
  page,
}) => {
  const { errors } = watchErrors(page);
  await open(page, "tier=2&count=100000");
  await expect(settled(page, 2)).toBeVisible({ timeout: 90_000 });

  const lost = await page.locator(CANVAS).evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const extension = canvas
      .getContext("webgl2")
      ?.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return extension !== null && extension !== undefined;
  });
  expect(lost, "the browser offers WEBGL_lose_context").toBe(true);

  await expect(settled(page, 3)).toBeVisible({ timeout: 30_000 });
  const view = page.locator(VIEW);
  await expect(view).toHaveAttribute("data-tier-reason", "device-lost");
  await expect(view).toHaveAttribute("data-status", "still");
  await expect(page.locator(CANVAS)).toHaveCount(0);

  await page.waitForTimeout(1_000);
  console.log(
    `lifecycle context-loss console errors: ${JSON.stringify(errors)}`,
  );
  expect(errors.filter((message) => !LOSS_MESSAGE.test(message))).toEqual([]);
});

test("REQ-ENG-08 a WebGPU device lost on tier 1 rebuilds once as tier 2", async ({
  browser,
  baseURL,
}) => {
  // No page script can lose a device for real: destroy() reports the reason
  // "destroyed", which three.js ignores. Crashing the GPU process does it,
  // in a browser of this test's own, so no other test meets the crash.
  const own = await browser
    .browserType()
    .launch({ channel: "chromium", headless: false });
  try {
    const page = await own.newPage({
      baseURL,
      viewport: { width: 1280, height: 800 },
    });
    const { errors } = watchErrors(page);
    await open(page, "tier=1");
    await expect(settled(page, 1)).toBeVisible({ timeout: 90_000 });
    expect((await readSurface(page, CANVAS)).backend).toBe("webgpu");
    const first = await page.locator(CANVAS).elementHandle();

    const session = await own.newBrowserCDPSession();
    await session.send("Browser.crashGpuProcess");

    await expect(settled(page, 2)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(VIEW)).toHaveAttribute(
      "data-tier-reason",
      "device-lost",
    );
    await expect(page.locator(CANVAS)).toHaveCount(1);
    expect(
      await page
        .locator(CANVAS)
        .evaluate((canvas, old) => canvas === old, first),
      "the WebGL2 field draws on a new canvas",
    ).toBe(false);
    const surface = await readSurface(page, CANVAS);
    expect(surface.backend).toBe("webgl2");

    // The rebuilt field really runs.
    const before = await eventCount(page);
    await page.waitForTimeout(2_500);
    expect(await eventCount(page)).toBeGreaterThan(before);

    console.log(
      `lifecycle device-loss: tier 2 on ${surface.gpu}; console errors: ${JSON.stringify(errors)}`,
    );
    expect(errors.filter((message) => !LOSS_MESSAGE.test(message))).toEqual([]);
  } finally {
    await own.close();
  }
});

for (const tier of [1, 2] as const) {
  test(`REQ-A11Y-03 REQ-ENG-07 calm freezes the tier ${tier} field to one frame and lets it go again`, async ({
    page,
  }) => {
    const { errors } = watchErrors(page);
    await open(page, `tier=${tier}`);
    await expect(settled(page, tier)).toBeVisible({ timeout: 90_000 });
    const canvas = page.locator(CANVAS);
    await canvas.scrollIntoViewIfNeeded();
    const calm = page.getByRole("button", { name: "Calm" });

    await calm.click();
    await expect(calm).toHaveAttribute("aria-pressed", "true");
    // Longer than one frameRate interval, so a late event has passed.
    await page.waitForTimeout(1_500);
    const eventsWhenCalm = await eventCount(page);
    const still = await canvas.screenshot();
    await page.waitForTimeout(1_500);
    const later = await canvas.screenshot();
    expect(await eventCount(page), "no frameRate event while calm").toBe(
      eventsWhenCalm,
    );
    expect(still.equals(later), "the calm field does not move").toBe(true);
    const stats = await pixelStats(page, still);
    console.log(
      `lifecycle calm tier ${tier}: lit share ${stats.litShare.toFixed(4)}, brightest ${stats.brightest}`,
    );
    expect(stats.litShare, "the still frame shows the field").toBeGreaterThan(
      0.01,
    );

    await calm.click();
    await expect(calm).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(2_500);
    expect(await eventCount(page)).toBeGreaterThan(eventsWhenCalm);
    const moving = await canvas.screenshot();
    expect(still.equals(moving), "the field moves again").toBe(false);

    expect(errors).toEqual([]);
  });
}

test("REQ-TIER-04 REQ-ENG-01 tiers 1, 2, 3 and 1 again on one host, each backend on its own canvas", async ({
  page,
}) => {
  const { errors } = watchErrors(page);
  await open(page, "tier=1");
  await expect(settled(page, 1)).toBeVisible({ timeout: 90_000 });
  expect((await readSurface(page, CANVAS)).backend).toBe("webgpu");
  const firstCanvas = await page.locator(CANVAS).elementHandle();
  const host = await page.locator(HOST).elementHandle();

  await page.getByRole("button", { name: "Tier 2" }).click();
  await expect(settled(page, 2)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(CANVAS)).toHaveCount(1);
  expect(
    await page
      .locator(CANVAS)
      .evaluate((canvas, old) => canvas === old, firstCanvas),
  ).toBe(false);
  expect((await readSurface(page, CANVAS)).backend).toBe("webgl2");
  const secondCanvas = await page.locator(CANVAS).elementHandle();

  await page.getByRole("button", { name: "Tier 3" }).click();
  await expect(settled(page, 3)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(VIEW)).toHaveAttribute("data-status", "still");
  await expect(page.locator(CANVAS)).toHaveCount(0);

  await page.getByRole("button", { name: "Tier 1" }).click();
  await expect(settled(page, 1)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(CANVAS)).toHaveCount(1);
  expect(
    await page
      .locator(CANVAS)
      .evaluate(
        (canvas, old) => old.includes(canvas),
        [firstCanvas, secondCanvas],
      ),
  ).toBe(false);
  expect((await readSurface(page, CANVAS)).backend).toBe("webgpu");
  expect(
    await page.locator(HOST).evaluate((element, old) => element === old, host),
    "the host element is never replaced",
  ).toBe(true);

  const before = await eventCount(page);
  await page.waitForTimeout(2_500);
  expect(await eventCount(page)).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

for (const tier of [1, 2] as const) {
  test(`REQ-ENG-07 leaving the page with a tier ${tier} field logs nothing, and a fresh engine starts after`, async ({
    page,
  }) => {
    const { errors, warnings } = watchErrors(page);
    await open(page, `tier=${tier}`);
    await expect(settled(page, tier)).toBeVisible({ timeout: 90_000 });
    const warningsWhileRunning = warnings.length;

    // A client-side navigation unmounts the view, which disposes the engine.
    // What dispose frees, and in what order, is checked in the runtime's
    // unit tests; a page cannot see a renderer that was left alive.
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Work" })
      .click();
    await page.waitForURL("**/work");
    await expect(page.locator(VIEW)).toHaveCount(0);
    await page.waitForTimeout(2_000);
    console.log(
      `lifecycle dispose tier ${tier}: errors ${JSON.stringify(errors)}, warnings after leaving ${JSON.stringify(warnings.slice(warningsWhileRunning))}`,
    );
    expect(errors).toEqual([]);
    expect(warnings.slice(warningsWhileRunning)).toEqual([]);

    // A fresh engine starts in the same document afterwards.
    await page.goBack();
    await expect(settled(page, tier)).toBeVisible({ timeout: 90_000 });
    expect(errors).toEqual([]);
  });
}

for (const tier of [1, 2] as const) {
  test(`REQ-ENG-07 a resize redraws the calm tier ${tier} field at its new size`, async ({
    page,
  }) => {
    const { errors } = watchErrors(page);
    await open(page, `tier=${tier}&calm=1`);
    await expect(settled(page, tier)).toBeVisible({ timeout: 90_000 });
    const canvas = page.locator(CANVAS);
    const sizes = () =>
      canvas.evaluate((element) =>
        element instanceof HTMLCanvasElement
          ? {
              buffer: `${element.width} x ${element.height}`,
              box: `${element.clientWidth} x ${element.clientHeight}`,
            }
          : null,
      );
    const before = await sizes();
    expect(before?.buffer).toBe(before?.box);

    await page.setViewportSize({ width: 1000, height: 700 });
    await expect
      .poll(async () => (await sizes())?.buffer)
      .not.toBe(before?.buffer);
    const after = await sizes();
    expect(after?.buffer).toBe(after?.box);

    // Calm draws no frames of its own, so only the resize can have drawn it.
    await page.waitForTimeout(500);
    await canvas.scrollIntoViewIfNeeded();
    const stats = await pixelStats(page, await canvas.screenshot());
    console.log(
      `lifecycle resize tier ${tier}: ${before?.buffer} to ${after?.buffer}, lit share ${stats.litShare.toFixed(4)}`,
    );
    expect(
      stats.litShare,
      "the resized canvas shows the field",
    ).toBeGreaterThan(0.01);
    expect(errors).toEqual([]);
  });

  test(`REQ-PERF-06 slow frames lower the tier ${tier} drawing buffer's pixel ratio and fast frames raise it again`, async ({
    page,
  }) => {
    const { errors } = watchErrors(page);
    await open(page, `tier=${tier}`);
    await expect(settled(page, tier)).toBeVisible({ timeout: 90_000 });
    const canvas = page.locator(CANVAS);
    await canvas.scrollIntoViewIfNeeded();
    const ratio = () =>
      canvas.evaluate((element) =>
        element instanceof HTMLCanvasElement
          ? element.width / element.clientWidth
          : 0,
      );
    expect(await ratio()).toBe(1);

    // Every frame of the page now takes 30 ms or more, whatever the GPU.
    await page.evaluate(() => {
      const state = { on: true, spins: 0 };
      Object.defineProperty(window, "slowFrames", { value: state });
      const burn = () => {
        if (!state.on) return;
        const until = performance.now() + 30;
        while (performance.now() < until) state.spins += 1;
        requestAnimationFrame(burn);
      };
      requestAnimationFrame(burn);
    });
    await expect.poll(ratio, { timeout: 15_000 }).toBeCloseTo(0.75, 2);
    const lowered = await pixelStats(page, await canvas.screenshot());
    expect(
      lowered.litShare,
      "the field is drawn at the lower ratio",
    ).toBeGreaterThan(0.01);

    await page.evaluate(() => {
      (window as unknown as { slowFrames: { on: boolean } }).slowFrames.on =
        false;
    });
    await expect.poll(ratio, { timeout: 20_000 }).toBe(1);
    const raised = await pixelStats(page, await canvas.screenshot());
    expect(
      raised.litShare,
      "the field is drawn at the full ratio",
    ).toBeGreaterThan(0.01);
    // Read after the last screenshot, so the printed line and the assertion
    // speak of the same value.
    const restored = await ratio();
    console.log(
      `lifecycle adaptive tier ${tier}: ratio 1, then ${restored === 1 ? "0.75 under 30 ms frames, then 1 again" : `not restored (${restored})`}`,
    );
    expect(restored, "the ratio is 1 again after the last screenshot").toBe(1);
    expect(errors).toEqual([]);
  });
}

for (const tier of [1, 2] as const) {
  test(`REQ-A11Y-03 the calm tier ${tier} field fills the frame again after it turns from tall to wide`, async ({
    page,
  }) => {
    const { errors } = watchErrors(page);
    await page.setViewportSize({ width: 500, height: 800 });
    await open(page, `tier=${tier}&calm=1&bare=1`);
    // In bare mode the view has no height of its own, so it is never visible.
    await expect(settled(page, tier)).toHaveCount(1, { timeout: 90_000 });
    const canvas = page.locator(CANVAS);
    const bufferWidth = () =>
      canvas.evaluate((element) =>
        element instanceof HTMLCanvasElement ? element.width : 0,
      );
    expect(await bufferWidth()).toBe(500);

    await page.setViewportSize({ width: 1280, height: 700 });
    await expect.poll(bufferWidth).toBe(1280);
    await page.waitForTimeout(500);

    // A frozen field left on its old homes would light only the middle of
    // the wide frame and leave both outer fifths dark.
    const png = await canvas.screenshot();
    const band = (x: number) => ({ x, y: 0, width: 256, height: 700 });
    const start = await pixelStats(page, png, [band(0)]);
    const middle = await pixelStats(page, png, [band(512)]);
    const end = await pixelStats(page, png, [band(1024)]);
    console.log(
      `lifecycle reshape tier ${tier}: lit share ${start.litShare.toFixed(4)} at one edge, ${middle.litShare.toFixed(4)} in the middle, ${end.litShare.toFixed(4)} at the other edge`,
    );
    expect(middle.litShare).toBeGreaterThan(0.01);
    expect(start.litShare).toBeGreaterThan(middle.litShare / 2);
    expect(end.litShare).toBeGreaterThan(middle.litShare / 2);
    expect(errors).toEqual([]);
  });
}
