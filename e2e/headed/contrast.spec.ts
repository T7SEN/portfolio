import { devices, expect, test, type Page } from "@playwright/test";

import { colors } from "../../src/tokens/colors";
import { pixelStats, type Box } from "../gpu/pixels";

// Text over the field keeps 4.5 to 1 against the brightest pixel behind it
// (REQ-A11Y-06). Measured on the production build, headed, from screenshots
// of the field with the page's text hidden, so only the field and its veil
// are sampled inside the boxes the text occupies.

const FIELD = '[data-testid="engine-field"]';
const MINIMUM = 4.5;
const FRAMES = Number(process.env.CONTRAST_FRAMES ?? 12);
const FRAME_GAP_MS = 250;
// Extra veil strengths to measure beside the shipped one, as "0.5,0.7".
const EXTRA_VEILS = (process.env.CONTRAST_VEILS ?? "")
  .split(",")
  .filter((value) => value !== "")
  .map(Number);

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(textHex: string, backgroundLuminance: number): number {
  return (luminance(textHex) + 0.05) / (backgroundLuminance + 0.05);
}

/** The boxes of the bar's and the hero's text that sit straight on the field. */
async function textBoxes(page: Page): Promise<{ boxes: Box[]; own: number }> {
  return page.evaluate(() => {
    const boxes: Box[] = [];
    let own = 0;
    const elements = document.querySelectorAll(
      'header :is(a, button), section[aria-labelledby="hero-headline"] :is(p, h1, a)',
    );
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      const inView =
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.top < window.innerHeight;
      if (!inView) continue;
      // A filled button carries its own background; the field is not behind
      // its text.
      const fill = getComputedStyle(element).backgroundColor;
      if (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") {
        own += 1;
        continue;
      }
      boxes.push({ x: box.x, y: box.y, width: box.width, height: box.height });
    }
    return { boxes, own };
  });
}

const CASES = [
  {
    name: "tier 1 at 1280 x 800",
    viewport: { width: 1280, height: 800 },
    tier: 1,
    setup: "none",
  },
  {
    name: "tier 1 at 375 x 812",
    viewport: { width: 375, height: 812 },
    tier: 1,
    setup: "none",
  },
  {
    name: "tier 2 at 1280 x 800",
    viewport: { width: 1280, height: 800 },
    tier: 2,
    setup: "no-webgpu",
  },
  {
    name: "tier 2 on a touch screen at 375 x 812",
    viewport: { width: 375, height: 812 },
    tier: 2,
    setup: "touch",
  },
  {
    name: "tier 3 still at 1280 x 800",
    viewport: { width: 1280, height: 800 },
    tier: 3,
    setup: "save-data",
  },
  {
    name: "tier 3 still at 375 x 812",
    viewport: { width: 375, height: 812 },
    tier: 3,
    setup: "save-data",
  },
] as const;

for (const { name, viewport, tier, setup } of CASES) {
  test(`REQ-A11Y-06 text over the field keeps 4.5 to 1: ${name}`, async ({
    browser,
    baseURL,
  }) => {
    // A touch screen is emulated at a pixel ratio of 1, so the screenshot's
    // pixels are the page's own.
    const context = await browser.newContext({
      baseURL,
      ...(setup === "touch"
        ? { ...devices["Pixel 5"], deviceScaleFactor: 1 }
        : {}),
      viewport,
    });
    const page = await context.newPage();
    try {
      if (setup === "no-webgpu") {
        await page.addInitScript(() => {
          Reflect.deleteProperty(Navigator.prototype, "gpu");
        });
      }
      if (setup === "save-data") {
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "connection", {
            value: { saveData: true },
            configurable: true,
          });
        });
      }

      await page.goto("/");
      const field = page.locator(FIELD);
      await expect(field).toHaveAttribute("data-ready", "true", {
        timeout: 90_000,
      });
      const reason = await field.getAttribute("data-tier-reason");
      test.skip(
        (await field.getAttribute("data-tier")) !== String(tier),
        `This machine gave tier ${await field.getAttribute("data-tier")} (${reason}), not tier ${tier}`,
      );
      await expect(field).toHaveCSS("opacity", "1");
      if (tier === 3) {
        await expect(field.locator('img[data-part="still"]')).toHaveCSS(
          "opacity",
          "1",
        );
      } else {
        // The field needs a moment to leave its even starting haze.
        await page.waitForTimeout(3_000);
      }

      // The window is on a real screen, where a stray wheel or key can
      // scroll it; the hero must be the part that is measured.
      await page.evaluate(() => window.scrollTo(0, 0));
      const { boxes, own } = await textBoxes(page);
      expect(
        boxes.length,
        `text boxes in view at scroll ${await page.evaluate(() => window.scrollY)}`,
      ).toBeGreaterThan(5);
      await page.addStyleTag({
        content: "header, main, footer { visibility: hidden !important; }",
      });

      const shipped = Number(
        await field.evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--field-veil"),
        ),
      );
      expect(Number.isFinite(shipped)).toBe(true);

      const worst = new Map<number, { text: number; muted: number }>();
      // 0 is the bare field and 1 the bare background, which shows whether
      // the screenshot returns the page's own colours.
      const veils = new Set([0, ...EXTRA_VEILS, shipped, 1]);
      test.setTimeout(60_000 + veils.size * FRAMES * 2_000);
      for (const veil of veils) {
        await field.evaluate(
          (element, value) =>
            (element as HTMLElement).style.setProperty(
              "--field-veil",
              String(value),
            ),
          veil,
        );
        // The veil's plates behind the text (story-veil.ts) are part of the
        // shipped veil, so they stay for every measured strength. The control
        // looks at the bare background alone: void plates blended over void
        // come back a level or two brighter (#09090B on 11 Nov 2026).
        await page.evaluate((isControl) => {
          const plates = document.querySelector<HTMLElement>(
            '[data-part="veil-plates"]',
          );
          if (plates !== null) {
            plates.style.visibility = isControl ? "hidden" : "";
          }
        }, veil === 1);
        let maxLuminance = 0;
        let brightest = "";
        // A still picture and the bare background do not change.
        const frames = tier === 3 || veil === 1 ? 1 : FRAMES;
        for (let frame = 0; frame < frames; frame += 1) {
          await page.waitForTimeout(FRAME_GAP_MS);
          const stats = await pixelStats(page, await page.screenshot(), boxes);
          if (stats.maxLuminance >= maxLuminance) {
            maxLuminance = stats.maxLuminance;
            brightest = stats.brightest;
          }
        }
        const result = {
          text: contrast(colors.text, maxLuminance),
          muted: contrast(colors.muted, maxLuminance),
        };
        worst.set(veil, result);
        console.log(
          `contrast ${name} (${reason}) veil ${veil}${veil === shipped ? " shipped" : ""}: ` +
            `brightest ${brightest} luminance ${maxLuminance.toFixed(4)} in ` +
            `${boxes.length} text boxes over ${frames} frames; text ${colors.text} ` +
            `${result.text.toFixed(2)} to 1, muted ${colors.muted} ${result.muted.toFixed(2)} to 1` +
            (own > 0 ? `; ${own} filled elements left out` : ""),
        );
        // The control: a screenshot with shifted colours would skew every
        // ratio above, so the bare background must come back as its token.
        if (veil === 1) {
          expect(
            brightest,
            "the screenshot returns the page's own colours",
          ).toBe(colors.void.toUpperCase());
        }
      }

      expect(worst.get(shipped)?.text).toBeGreaterThanOrEqual(MINIMUM);
      expect(worst.get(shipped)?.muted).toBeGreaterThanOrEqual(MINIMUM);
    } finally {
      await context.close();
    }
  });
}

// Further down the page the field gathers into formations: the mark in the
// bloom, a mark per study, the flat sheet and the wave. They pack the
// particles far more densely than the ambient field, so the text in view at
// each one is measured too (accessibility.md section 7).

type ColouredBox = Box & { colour: string };

/**
 * Every piece of text in view that sits straight on the field, with the
 * colour it is drawn in. Text on a card or a chip has its own surface, so the
 * field is not behind it; visually hidden scene lines are not drawn at all.
 */
async function textOnField(
  page: Page,
): Promise<{ boxes: ColouredBox[]; own: number }> {
  return page.evaluate(() => {
    const boxes: ColouredBox[] = [];
    let own = 0;
    const hex = (rgb: string) => {
      const parts = rgb.match(/\d+(\.\d+)?/g)?.slice(0, 3) ?? ["0", "0", "0"];
      return `#${parts
        .map((part) => Number(part).toString(16).padStart(2, "0"))
        .join("")}`.toUpperCase();
    };
    const filled = (element: Element) => {
      for (
        let node: Element | null = element;
        node !== null && node !== document.body;
        node = node.parentElement
      ) {
        const fill = getComputedStyle(node).backgroundColor;
        if (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") return true;
      }
      return false;
    };
    const elements = document.querySelectorAll(
      "header :is(a, button), main :is(h1, h2, h3, p, a, li, span)",
    );
    for (const element of elements) {
      if (element.closest(".sr-only, [hidden], [aria-hidden='true']")) {
        continue;
      }
      const box = element.getBoundingClientRect();
      const inView =
        box.width > 2 &&
        box.height > 2 &&
        box.bottom > 0 &&
        box.top < window.innerHeight;
      if (!inView || (element.textContent ?? "").trim() === "") continue;
      if (filled(element)) {
        own += 1;
        continue;
      }
      boxes.push({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        colour: hex(getComputedStyle(element).color),
      });
    }
    return { boxes, own };
  });
}

const CHAPTER_CASES = [
  {
    name: "tier 1 at 1280 x 800",
    viewport: { width: 1280, height: 800 },
    tier: 1,
    setup: "none",
  },
  {
    name: "tier 2 at 1280 x 800",
    viewport: { width: 1280, height: 800 },
    tier: 2,
    setup: "no-webgpu",
  },
  {
    name: "tier 2 on a touch screen at 375 x 812",
    viewport: { width: 375, height: 812 },
    tier: 2,
    setup: "touch",
  },
] as const;

// Where each formation is whole, as a scroll position: a chapter's progress
// through its section, or the middle of a study card.
// The bloom and making-of words sit at the bottom of their sections, so they
// come into view late in the chapter: 0.75 and 0.8 catch them over the
// dissolving mark and the sheet that still holds.
// text says whether words are in view there. A text state must find at least
// one box to measure, so a broken selector fails instead of passing on
// nothing. At bloom 0.58 and making-of 0.5 only the field is in view: those
// states check that the story reached the formation and that no text sits
// over it, and a box found there fails too, so the flag cannot go stale.
const FORMED_STATES = [
  {
    // 0.58, not 0.6: after the design review the bloom label reaches the
    // viewport's bottom at 0.608 on the phone and 0.613 at 1280 (measured
    // 11 Nov 2026), so at 0.6 a late font swap could bring it into view.
    // The mark is whole from 0.52.
    name: "bloom 0.58, the mark",
    chapter: "bloom",
    progress: 0.58,
    text: false,
  },
  {
    name: "bloom 0.75, the mark letting go",
    chapter: "bloom",
    progress: 0.75,
    text: true,
  },
  { name: "work, the coup-online mark", step: 1, text: true },
  { name: "work, the archelab mark", step: 2, text: true },
  {
    name: "making-of 0.5, the sheet",
    chapter: "making-of",
    progress: 0.5,
    text: false,
  },
  {
    name: "making-of 0.8, the sheet",
    chapter: "making-of",
    progress: 0.8,
    text: true,
  },
  { name: "about 0.3, the wave", chapter: "about", progress: 0.3, text: true },
  { name: "about 0.5, the wave", chapter: "about", progress: 0.5, text: true },
] as const;

// The field needs about a second and a half to gather after a jump.
const FORMED_SETTLE_MS = 3_000;

for (const { name, viewport, tier, setup } of CHAPTER_CASES) {
  test(`REQ-A11Y-06 REQ-SCR-07 chapter text over the formed field keeps 4.5 to 1: ${name}`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000 + FORMED_STATES.length * FRAMES * 2_000);
    const context = await browser.newContext({
      baseURL,
      ...(setup === "touch"
        ? { ...devices["Pixel 5"], deviceScaleFactor: 1 }
        : {}),
      viewport,
    });
    const page = await context.newPage();
    try {
      if (setup === "no-webgpu") {
        await page.addInitScript(() => {
          Reflect.deleteProperty(Navigator.prototype, "gpu");
        });
      }

      await page.goto("/");
      const field = page.locator(FIELD);
      await expect(field).toHaveAttribute("data-ready", "true", {
        timeout: 90_000,
      });
      const reason = await field.getAttribute("data-tier-reason");
      test.skip(
        (await field.getAttribute("data-tier")) !== String(tier),
        `This machine gave tier ${await field.getAttribute("data-tier")} (${reason}), not tier ${tier}`,
      );
      await expect(field).toHaveCSS("opacity", "1");
      const shipped = Number(
        await field.evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--field-veil"),
        ),
      );

      const results: Array<{ state: string; worst: number }> = [];
      for (const state of FORMED_STATES) {
        const top = await page.evaluate((target) => {
          const middle = window.innerHeight / 2;
          const element =
            "step" in target
              ? document.querySelector(`main [data-work-step="${target.step}"]`)
              : document.querySelector(
                  `main [data-chapter="${target.chapter}"]`,
                );
          if (element === null)
            throw new Error(`No element for ${target.name}`);
          const box = element.getBoundingClientRect();
          const progress = "step" in target ? 0.5 : target.progress;
          return box.top + window.scrollY - middle + progress * box.height;
        }, state);
        await page.evaluate(
          (y) => window.scrollTo({ top: y, behavior: "instant" }),
          top,
        );
        await page.waitForTimeout(FORMED_SETTLE_MS);
        const chapter = await field.getAttribute("data-chapter");
        const { boxes, own } = await textOnField(page);

        const colours = [...new Set(boxes.map((box) => box.colour))];
        const brightest = new Map<string, { luminance: number; hex: string }>();
        // A state with no text in view has nothing to measure.
        const frames = boxes.length > 0 ? FRAMES : 0;
        const hidden = await page.addStyleTag({
          content: "header, main, footer { visibility: hidden !important; }",
        });
        for (let frame = 0; frame < frames; frame += 1) {
          await page.waitForTimeout(FRAME_GAP_MS);
          const png = await page.screenshot();
          for (const colour of colours) {
            const stats = await pixelStats(
              page,
              png,
              boxes.filter((box) => box.colour === colour),
            );
            const seen = brightest.get(colour);
            if (seen === undefined || stats.maxLuminance >= seen.luminance) {
              brightest.set(colour, {
                luminance: stats.maxLuminance,
                hex: stats.brightest,
              });
            }
          }
        }
        await hidden.evaluate((element) =>
          element.parentNode?.removeChild(element),
        );

        // Every colour against the brightest pixel behind its own boxes.
        const ratios = colours.map((colour) => {
          const behind = brightest.get(colour);
          return {
            colour,
            boxes: boxes.filter((box) => box.colour === colour).length,
            behind: behind?.hex ?? "none",
            ratio: contrast(colour, behind?.luminance ?? 0),
          };
        });
        if (ratios.length > 0) {
          results.push({
            state: state.name,
            worst: Math.min(...ratios.map(({ ratio }) => ratio)),
          });
        }
        console.log(
          `contrast chapters ${name} (${reason}) veil ${shipped} ${state.name} ` +
            `(field chapter ${chapter}, scroll ${Math.round(top)}, ` +
            `${state.text ? "a text state" : "a field-only state"}): ` +
            `${boxes.length} text boxes over ${frames} frames` +
            (own > 0 ? `, ${own} on their own surface left out` : "") +
            "; " +
            (ratios.length > 0
              ? ratios
                  .map(
                    ({ colour, boxes: count, behind, ratio }) =>
                      `${colour} x${count} over ${behind} ${ratio.toFixed(2)} to 1`,
                  )
                  .join(", ")
              : "nothing to measure"),
        );
        expect(chapter, `the story reached ${state.name}`).toBe(
          "step" in state ? "work" : state.chapter,
        );
        if (state.text) {
          expect(
            boxes.length,
            `${state.name} is a text state: text in view to measure`,
          ).toBeGreaterThan(0);
        } else {
          expect(
            boxes.length,
            `${state.name} is a field-only state: text in view there needs the flag text: true`,
          ).toBe(0);
        }
      }

      for (const { state, worst } of results) {
        expect(worst, state).toBeGreaterThanOrEqual(MINIMUM);
      }
    } finally {
      await context.close();
    }
  });
}
