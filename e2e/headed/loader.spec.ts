import { expect, test, type BrowserContext } from "@playwright/test";

import { EXIT_LIMIT_MS } from "../../src/components/loader/loader-config";
import { RIPPLE_MS } from "../../src/components/loader/scene/ripple";
import { watchErrors } from "../gpu/frame-times";
import { pixelStats } from "../gpu/pixels";
import {
  COVER,
  COVER_CANVAS,
  expectPageFree,
  LIFT_TIMEOUT_MS,
  liftTimes,
  readLoaderLog,
  recordLoader,
  waitForLift,
  withoutLoader,
} from "../support/loader";
import { asTier2, CANVAS, FIELD } from "../support/tiers";

// The home page's loader cover on the production build, headed, on this
// machine's GPU (pnpm e2e:gpu, after pnpm build; phase P4.5, REQ-LOAD-01).
// The GPU test judges how evenly frames arrive while the cover draws its
// scene beside it, so the tier it chooses is compared with the cover and
// without it, over several loads; and the cover must leave onto a field
// that has drawn, so frames are sampled from the moment it begins to leave.

// Loads each way per setup. LOADER_RUNS sets more for a longer look.
const RUNS = Number(process.env.LOADER_RUNS ?? 3);
// The field's first frame, headed and alone, as the other headed specs
// wait for it.
const READY_TIMEOUT_MS = 90_000;
// A pixel counts as lit above this channel value (pixels.ts). The void is
// #07070A, so an empty canvas lights nothing.
const LIT_ABOVE = 40;
// Below this share of lit pixels the hero dot's box shows no field.
const EMPTY_SHARE = 0.002;
// Each frame after the lift keeps at least this part of the lit share the
// settled field shows, so a field that drew and then emptied fails.
const SETTLED_PART = 0.25;
// Sampling goes on this long after the page is free.
const AFTER_LIFT_MS = 1_000;

type Setup = {
  name: string;
  hideWebGpu: boolean;
  tier: 1 | 2;
  reason: string;
  /** How the cover's GPU test step ends: a test ran, or none was due. */
  test: "done" | "skipped";
};

const SETUPS: readonly Setup[] = [
  {
    name: "tier 1 headed",
    hideWebGpu: false,
    tier: 1,
    reason: "probe-pass",
    test: "done",
  },
  {
    name: "tier 2 forced (no WebGPU)",
    hideWebGpu: true,
    tier: 2,
    reason: "no-webgpu",
    test: "skipped",
  },
];

type Run = {
  cover: boolean;
  tier: number;
  reason: string | null;
  /** The cover's GPU test steps, in order. */
  tests: (string | null)[];
  line: string;
};

/**
 * One load of the home page in a new tab: with the cover, as every load has
 * it, or with no cover, its inline script emptied (withoutLoader).
 */
async function loadOnce(
  context: BrowserContext,
  setup: Setup,
  cover: boolean,
): Promise<Run> {
  const page = await context.newPage();
  try {
    if (!cover) await withoutLoader(page);
    if (setup.hideWebGpu) await asTier2(page);
    // Marks only: a check on every frame would cost the GPU test frames.
    await recordLoader(page, { frames: false });
    await page.goto("/");
    const field = page.locator(FIELD);
    await expect(field).toHaveAttribute("data-ready", "true", {
      timeout: READY_TIMEOUT_MS,
    });
    if (cover) await waitForLift(page);
    else {
      await expect(page.locator("html")).not.toHaveAttribute("data-loader");
      await expect(page.locator("html")).not.toHaveAttribute("data-loader-off");
    }
    const log = await readLoaderLog(page);
    const ready = log.marks.find(
      (mark) =>
        mark.on === "field" &&
        mark.name === "data-ready" &&
        mark.value === "true",
    );
    const readyMs =
      ready === undefined || log.firstPaint === null
        ? "none"
        : `${Math.round(ready.at - log.firstPaint)} ms`;
    const run = {
      cover,
      tier: Number(await field.getAttribute("data-tier")),
      reason: await field.getAttribute("data-tier-reason"),
      tests: log.marks
        .filter(
          (mark) => mark.on === "cover" && mark.name === "data-loader-test",
        )
        .map((mark) => mark.value),
    };
    const lift = cover ? `; ${liftTimes(log).line}` : "";
    return {
      ...run,
      line: `${cover ? "with the cover" : "no cover"}: tier ${run.tier} (${run.reason}), ready ${readyMs} after the first paint${lift}`,
    };
  } finally {
    await page.close();
  }
}

for (const setup of SETUPS) {
  test(`REQ-LOAD-01 REQ-TIER-01 REQ-TIER-05 ${setup.name}: with the loader drawing, the GPU test chooses the same tier as without it, over ${RUNS} loads each way`, async ({
    context,
  }, testInfo) => {
    test.setTimeout(RUNS * 2 * 60_000 + 30_000);
    const runs: Run[] = [];
    // Alternated, so a warmer cache or a busier machine falls on both.
    for (let index = 0; index < RUNS; index += 1) {
      for (const cover of [true, false]) {
        const run = await loadOnce(context, setup, cover);
        console.log(`loader-tier ${setup.name} run ${index + 1} ${run.line}`);
        testInfo.annotations.push({
          type: `run ${index + 1}`,
          description: run.line,
        });
        runs.push(run);
      }
    }

    expect(
      runs.map(({ cover, tier, reason }) => ({ cover, tier, reason })),
    ).toEqual(
      runs.map(({ cover }) => ({
        cover,
        tier: setup.tier,
        reason: setup.reason,
      })),
    );
    // With the cover, its GPU test step ran where the engine ran one, and
    // was passed over where none was due.
    for (const run of runs.filter(({ cover }) => cover)) {
      expect(run.tests.at(-1), run.line).toBe(setup.test);
      expect(run.tests.includes("running"), run.line).toBe(
        setup.test === "done",
      );
    }
  });
}

for (const setup of SETUPS) {
  test(`REQ-LOAD-01 REQ-ENG-01 ${setup.name}: the ripple lifts the cover onto a drawn field, and no frame sampled from the lift on shows an empty canvas`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(READY_TIMEOUT_MS + LIFT_TIMEOUT_MS + 60_000);
    const { errors } = watchErrors(page);
    if (setup.hideWebGpu) await asTier2(page);
    await recordLoader(page, { frames: false });
    await page.goto("/");
    const cover = page.locator(COVER);
    await expect(cover).toHaveAttribute("data-loader-state", "leaving", {
      timeout: LIFT_TIMEOUT_MS,
    });

    // The hero dot's place is an empty box the field draws its dot in,
    // never under a word (hero.tsx).
    const box = await page.locator('[data-stage="dot"]').boundingBox();
    if (box === null) throw new Error("The hero dot's box has no layout");
    const frames: { at: number; isFree: boolean; png: Buffer }[] = [];
    const started = Date.now();
    let freeSince: number | null = null;
    while (Date.now() - started < EXIT_LIMIT_MS + AFTER_LIFT_MS * 2) {
      const isFree =
        (await page.locator("html").getAttribute("data-loader")) === "done";
      const png = await page.screenshot({ clip: box });
      frames.push({ at: Date.now() - started, isFree, png });
      if (isFree) freeSince ??= Date.now();
      if (freeSince !== null && Date.now() - freeSince > AFTER_LIFT_MS) {
        break;
      }
    }
    await waitForLift(page);
    const settled = await pixelStats(
      page,
      await page.screenshot({ clip: box }),
      [],
      LIT_ABOVE,
    );

    const times = liftTimes(await readLoaderLog(page));
    const shares: string[] = [];
    const litShares: number[] = [];
    const freeShares: number[] = [];
    for (const frame of frames) {
      const stats = await pixelStats(page, frame.png, [], LIT_ABOVE);
      shares.push(
        `${frame.at} ms ${frame.isFree ? "free" : "leaving"} ${stats.litShare.toFixed(4)}`,
      );
      litShares.push(stats.litShare);
      if (frame.isFree) freeShares.push(stats.litShare);
    }
    const line =
      `${times.line}; settled lit share ${settled.litShare.toFixed(4)}; ` +
      `${frames.length} frames sampled from the lift on: ${shares.join(", ")}`;
    console.log(`loader-lift ${setup.name}: ${line}`);
    testInfo.annotations.push({ type: "lift", description: line });

    expect(times.outcome, line).toBe("field");
    expect(times.atLeaving.cover?.exit, line).toBe("ripple");
    // The field had drawn and faded in when the cover began to leave.
    expect(times.atLeaving.field?.ready, line).toBe("true");
    expect(times.atLeaving.field?.opacity ?? 0, line).toBeGreaterThan(0.9);
    const length = times.done - times.leaving;
    expect(length, line).toBeGreaterThanOrEqual(RIPPLE_MS - 50);
    expect(length, line).toBeLessThan(EXIT_LIMIT_MS);

    const field = page.locator(FIELD);
    expect({
      tier: Number(await field.getAttribute("data-tier")),
      reason: await field.getAttribute("data-tier-reason"),
    }).toEqual({ tier: setup.tier, reason: setup.reason });
    expect(settled.litShare, line).toBeGreaterThan(EMPTY_SHARE);
    // The box lights once the ripple's opening reaches it, and from then
    // on never goes dark again, during the ripple or after it.
    const firstLit = litShares.findIndex((share) => share > EMPTY_SHARE);
    expect(firstLit, line).toBeGreaterThanOrEqual(0);
    expect(
      litShares.slice(firstLit).filter((share) => share <= EMPTY_SHARE),
      `frames dark again after the box first lit: ${line}`,
    ).toEqual([]);
    expect(freeShares.length, line).toBeGreaterThan(0);
    const floor = Math.max(EMPTY_SHARE, settled.litShare * SETTLED_PART);
    expect(
      freeShares.filter((share) => share < floor),
      `frames after the lift under ${floor.toFixed(4)}: ${line}`,
    ).toEqual([]);

    await expectPageFree(page);
    await expect(page.locator(CANVAS)).toHaveCount(1);
    await expect(page.locator(COVER_CANVAS)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
