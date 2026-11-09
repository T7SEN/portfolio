import { expect, test, type Locator } from "@playwright/test";

import { heroCopy, STATIC_TIER } from "../src/content/hero";
import { ROUTES } from "./support/routes";

const HERO = heroCopy(STATIC_TIER);

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no layout box`);
  return box;
}

// R1 ships English only; forcing dir="rtl" shows whether the logical
// utilities hold before Arabic arrives in R2.
for (const route of ROUTES) {
  test(`REQ-I18N-02 ${route.path} holds its layout with dir=rtl forced`, async ({
    page,
  }, testInfo) => {
    await page.goto(route.path);
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const { overflow, width } = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      width: document.documentElement.clientWidth,
    }));
    await page.screenshot({
      path: testInfo.outputPath(`rtl-${route.name}.png`),
      fullPage: true,
    });
    expect(overflow).toBe(0);

    // Inline start is the right side in a right-to-left page.
    const logo = await boxOf(
      page.getByRole("link", { name: "T7SEN, home", exact: true }),
    );
    expect(logo.x + logo.width / 2).toBeGreaterThan(width / 2);

    if (route.path === "/") {
      const hero = page.getByRole("region", { name: HERO.headline });
      for (const name of [HERO.primaryAction, HERO.secondaryAction]) {
        const action = await boxOf(
          hero.getByRole("link", { name, exact: true }),
        );
        expect(action.x, name).toBeGreaterThanOrEqual(0);
        expect(action.x + action.width, name).toBeLessThanOrEqual(width);
      }
    }
  });
}
