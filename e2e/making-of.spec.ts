import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  DEFAULT_PASS,
  passAnnouncement,
  passPosition,
  passViewer,
} from "../src/content/passes";
import { LIVE_PASSES, PASSES, type PassId } from "../src/engine/story";
import { expectNoAxeViolations } from "./support/axe";
import {
  ENGINE_TIMEOUT_MS,
  FIELD,
  asTier2,
  asTier3,
  waitForField,
} from "./support/tiers";

// The making-of chapter's pass viewer (REQ-ENG-09) on each tier the gate can
// reach, at 1280 and 375. A tier 1 field needs a GPU that passes the probe,
// so the desktop's own choice runs as it is and the test checks the tier it
// got: tier 1 when the probe passes, tier 2 with its reason when the gate's
// shared GPU is slow. Tier 1 forced on a real GPU is the headed making-of
// spec's part. Phones always get tier 2 (REQ-TIER-02), so their own choice
// is the forced tier 2 case.

const VIEWER = "[data-pass-viewer]";

type Setup = {
  name: string;
  force: ((page: Page) => Promise<void>) | null;
  desktopOnly: boolean;
};

const SETUPS: readonly Setup[] = [
  { name: "the probe's tier", force: null, desktopOnly: true },
  { name: "forced tier 2", force: asTier2, desktopOnly: false },
  { name: "forced tier 3", force: asTier3, desktopOnly: false },
];

function cardsOf(page: Page): Locator {
  return page
    .locator(VIEWER)
    .getByRole("group", { name: passViewer.group })
    .getByRole("button");
}

/** The passes whose face the field draws live, in page order. */
function liveFaces(page: Page): Promise<string[]> {
  return page
    .locator(`${VIEWER} [data-pass-face][data-live]`)
    .evaluateAll((faces) =>
      faces.map((face) => face.getAttribute("data-pass-face") ?? ""),
    );
}

/** The pass each card chooses, and whether it is pressed, in page order. */
function pressed(page: Page): Promise<[string, string][]> {
  return cardsOf(page).evaluateAll((cards) =>
    cards.map((card) => [
      card.getAttribute("data-pass") ?? "",
      card.getAttribute("aria-pressed") ?? "",
    ]),
  );
}

async function expectChosen(page: Page, chosen: PassId) {
  await expect
    .poll(() => pressed(page))
    .toEqual(PASSES.map((pass) => [pass, String(pass === chosen)]));
  const viewer = page.locator(VIEWER);
  for (const pass of PASSES) {
    const breakdown = viewer.locator(`[data-pass-breakdown="${pass}"]`);
    if (pass === chosen) {
      await expect(breakdown).toBeVisible();
      await expect(breakdown).not.toHaveAttribute("aria-hidden", "true");
      await expect(breakdown).toContainText(passPosition(pass));
      await expect(breakdown).toContainText(passViewer.passes[pass].title);
    } else {
      await expect(breakdown).toBeHidden();
      await expect(breakdown).toHaveAttribute("aria-hidden", "true");
    }
  }
}

for (const setup of SETUPS) {
  test(`REQ-ENG-09 REQ-A11Y-02 REQ-A11Y-01 the pass viewer on ${setup.name}: five passes in order, chosen by Tab, Enter and Space, live windows only for its tier's passes and a still with alt text everywhere else`, async ({
    page,
  }, testInfo) => {
    test.skip(
      setup.desktopOnly && testInfo.project.name !== "desktop",
      "Phones get tier 2 before WebGPU is looked at (REQ-TIER-02)",
    );
    test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);

    if (setup.force !== null) await setup.force(page);
    await page.goto("/");
    const { tier, reason } = await waitForField(page);
    const expectedTier =
      setup.force === asTier3 ? [3] : setup.force === asTier2 ? [2] : [1, 2];
    expect(expectedTier, `tier ${tier}, reason ${reason}`).toContain(tier);

    const viewer = page.locator(VIEWER);
    const cards = cardsOf(page);
    await cards.first().scrollIntoViewIfNeeded();

    // Five toggle buttons, in the frame's order, each named by its number
    // and pass and described by what the pass shows.
    await expect(cards).toHaveCount(PASSES.length);
    for (const [index, pass] of PASSES.entries()) {
      const card = cards.nth(index);
      await expect(card).toHaveAttribute("data-pass", pass);
      await expect(card).toContainText(
        `${index + 1} · ${passViewer.passes[pass].name}`,
      );
      await expect(card).toHaveAccessibleDescription(
        passViewer.passes[pass].shows,
      );
    }
    await expectChosen(page, DEFAULT_PASS);

    // Live windows only for the passes this tier draws, and only on the
    // halftone, whose own steps they are; a still with alt text in every
    // other face, loaded, so no face is ever empty.
    const look = await page.locator(FIELD).getAttribute("data-look");
    const live: readonly PassId[] =
      (tier === 1 || tier === 2) && look === "halftone"
        ? LIVE_PASSES[tier]
        : [];
    expect(look, "a live tier says how it draws; tier 3 says nothing").toEqual(
      tier === 3 ? null : expect.stringMatching(/^(?:halftone|soft)$/),
    );
    await expect.poll(() => liveFaces(page)).toEqual([...live]);
    for (const pass of PASSES) {
      const face = viewer.locator(`[data-pass-face="${pass}"]`);
      const still = face.locator('img[data-part="pass-still"]');
      if (live.includes(pass)) {
        await expect(still).toHaveCount(0);
        continue;
      }
      await expect(still).toHaveAttribute("alt", passViewer.passes[pass].shows);
      await still.scrollIntoViewIfNeeded();
      await expect
        .poll(
          () =>
            still.evaluate(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          { message: `the ${pass} still has loaded` },
        )
        .toBe(true);
      const box = await face.boundingBox();
      expect(box?.width ?? 0, `the ${pass} face has a size`).toBeGreaterThan(0);
      expect(box?.height ?? 0, `the ${pass} face has a size`).toBeGreaterThan(
        0,
      );
    }

    // Tab reaches each card in order; Enter and Space choose it, and the
    // panel and the polite line follow.
    const announcement = viewer.locator('[aria-live="polite"]');
    await expect(announcement).toHaveText("");
    await cards.first().focus();
    await page.keyboard.press("Enter");
    await expectChosen(page, "points");
    await expect(announcement).toHaveText(passAnnouncement("points"));

    await page.keyboard.press("Tab");
    await expect(cards.nth(1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cards.nth(2)).toBeFocused();
    await page.keyboard.press("Space");
    await expectChosen(page, "density");
    await expect(announcement).toHaveText(passAnnouncement("density"));

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(cards.nth(4)).toBeFocused();
    await page.keyboard.press("Enter");
    await expectChosen(page, "final");
    await expect(announcement).toHaveText(passAnnouncement("final"));

    // Choosing a pass changes no tier's live set.
    await expect.poll(() => liveFaces(page)).toEqual([...live]);

    const line = `making-of ${testInfo.project.name} ${setup.name}: tier ${tier}, reason ${reason}, look ${look ?? "none"}, live ${live.join(", ") || "none"}`;
    console.log(line);
    testInfo.annotations.push({ type: "pass-viewer", description: line });

    await expectNoAxeViolations(page);
  });
}
