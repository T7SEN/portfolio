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
      'header a, section[aria-labelledby="hero-headline"] :is(p, h1, a)',
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
