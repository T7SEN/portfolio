import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { waitForFieldShown } from "./support/tiers";

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
  await page.goto("/");
  await waitForFieldShown(page);
  await expectNoAxeViolations(page);
});

test("REQ-A11Y-01 home page reflows without horizontal scrolling", async ({
  page,
}, testInfo) => {
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
