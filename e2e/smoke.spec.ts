import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { withoutLoader } from "./support/loader";
import { ENGINE_TIMEOUT_MS, waitForFieldShown } from "./support/tiers";

// Every tab opens the home page with no loader cover: withoutLoader
// serves each page with its inline script emptied, as a blocked script
// leaves it. e2e/loader.spec.ts covers the cover (REQ-LOAD-01).
test.beforeEach(async ({ context }) => {
  await withoutLoader(context);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("REQ-CNT-01 home page text is in the static HTML", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Real-time worlds, built for your GPU.",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });
});

test("REQ-A11Y-01 home page has zero axe violations", async ({ page }) => {
  // Above the wait for the field, so a slow field fails on that bound.
  test.setTimeout(ENGINE_TIMEOUT_MS + 30_000);
  await page.goto("/");
  await waitForFieldShown(page);
  await expectNoAxeViolations(page);
});

test("REQ-A11Y-01 home page reflows without horizontal scrolling", async ({
  page,
}, testInfo) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 30_000);
  await page.goto("/");
  await waitForFieldShown(page);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
  expect(overflow).toBe(0);
});
