import { expect, test, type Locator, type Page } from "@playwright/test";

import { HINT_DELAY_MS, HINT_KEY } from "../src/components/sound/hint-moment";
import { studies } from "../src/content";
import { menuCopy } from "../src/content/menu";
import { paletteCopy } from "../src/content/palette";
import { site } from "../src/content/site";
import { soundCopy } from "../src/content/sound";
import { SOUND_KEY, TICKS_KEY } from "../src/lib/sound-choice";
import { expectNoAxeViolations } from "./support/axe";
import {
  barControls,
  DIALOG_CODE_MS,
  menuButton,
  menuDialog,
  openMenu,
  paletteButton,
  paletteDialog,
  paletteInput,
  paletteRow,
  paletteShown,
  soundPanel,
  soundSwitch,
  soundToggle,
  transitionsDone,
  waitForHydration,
} from "./support/interface";
import { withoutLoader } from "./support/loader";
import {
  asTier2,
  collectScripts,
  ENGINE_TIMEOUT_MS,
  FIELD,
  scriptsHolding,
  waitForField,
} from "./support/tiers";

// The interface layer of P5 on the production build, at 1280 and 375 px:
// the bar (REQ-NAV-02), the menu (REQ-NAV-03), the palette (REQ-NAV-04,
// REQ-TIER-04), the hidden commands (REQ-NAV-05) and sound (REQ-SND-01,
// REQ-SND-02). The eggs themselves are drawn by the engine and checked
// headed (e2e/gpu/eggs.spec.ts); here the page's answers are read.

// Every tab opens the home page with no loader cover (withoutLoader in
// e2e/support/loader.ts), so the bar is reachable from the first frame.
test.beforeEach(async ({ context }) => {
  await withoutLoader(context);
});

// After the load, long enough for anything scheduled after first content
// (the engine, the motion libraries, the sound hint) to have asked for its
// code.
const SETTLE_MS = 2_500;

// The calm toggle's key (calm-store.ts) and the tier choice's
// (tier-choice-store.ts), both in session storage.
const CALM_KEY = "portfolio:calm";
const TIER_KEY = "portfolio:tier";

// The first-visit hint, whichever keys it names: Ctrl K on the desktop
// project, search on the phone's touch screen (soundCopy.hint).
const HINT_WORDS = new RegExp(
  `^${escapeForRegExp(soundCopy.hint("Ctrl K")).replace("Ctrl K", "(?:Ctrl K|search)")}$`,
);

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STUDY_TITLES = studies.map(
  (study) =>
    (menuCopy.rowTitles as Partial<Record<string, string>>)[study.slug] ??
    study.title,
);

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${locator} has no layout box`);
  return box;
}

function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

/** Whether the element shows a focus ring of at least 2 px. */
function focusRing(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      ring:
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
    };
  });
}

async function expectRing(locator: Locator, name: string) {
  await expect(locator, name).toBeFocused();
  expect(await focusRing(locator), name).toEqual({
    focusVisible: true,
    ring: true,
  });
}

async function openPaletteByKeys(page: Page): Promise<void> {
  await waitForHydration(page);
  await page.keyboard.press("Control+K");
  await expect(paletteDialog(page)).toBeVisible({ timeout: DIALOG_CODE_MS });
  await expect(paletteInput(page)).toBeFocused();
}

/** Types into the palette's search and waits for the row to be the active one. */
async function searchFor(page: Page, search: string, row: string) {
  await paletteInput(page).fill(search);
  await expect(paletteRow(page, row)).toHaveAttribute("aria-selected", "true");
}

test("REQ-NAV-02 the bar holds the home link, then Sound, the palette and Menu in one row of 44 px targets, with no sideways scroll", async ({
  page,
  isMobile,
}, testInfo) => {
  for (const path of ["/", "/work"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const banner = page.getByRole("banner");
    const home = banner.getByRole("link", {
      name: site.names.logoLink,
      exact: true,
    });
    const controls = [soundToggle(page), paletteButton(page), menuButton(page)];

    // In order inside the nav named Site controls, the home link first.
    expect(
      await barControls(page)
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute("aria-label") ?? ""),
        ),
    ).toEqual([
      soundCopy.toggle.names.off,
      "Open the command palette, Ctrl K",
      "",
    ]);
    await expect(barControls(page).getByRole("button").last()).toHaveText(
      site.controls.menu,
    );

    const bar = await boxOf(banner);
    const homeBox = await boxOf(home);
    const boxes = await Promise.all(controls.map(boxOf));
    const line =
      `bar ${testInfo.project.name} ${path}: ${Math.round(bar.height)} px tall; ` +
      ["home", "sound", "palette", "menu"]
        .map((name, index) => {
          const box = index === 0 ? homeBox : boxes[index - 1]!;
          return `${name} ${Math.round(box.width)} by ${Math.round(box.height)} at ${Math.round(box.x)}`;
        })
        .join(", ");
    console.log(line);
    testInfo.annotations.push({ type: "bar", description: line });

    // 68 px below 1024 px and 100 px from it: one row of 44 px controls.
    expect(Math.round(bar.height), line).toBe(isMobile ? 68 : 100);
    const middle = homeBox.y + homeBox.height / 2;
    for (const [index, box] of boxes.entries()) {
      expect(box.width, line).toBeGreaterThanOrEqual(44);
      expect(box.height, line).toBeGreaterThanOrEqual(44);
      expect(Math.abs(box.y + box.height / 2 - middle), line).toBeLessThan(2);
      if (index > 0) {
        const before = boxes[index - 1]!;
        expect(box.x, `${line}: in order`).toBeGreaterThan(before.x);
      }
    }
    expect(boxes[0]!.x, line).toBeGreaterThan(homeBox.x + homeBox.width);
    for (const control of controls) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }

    if (isMobile) {
      // Below 640 px Sound and the palette are 44 px squares with no words;
      // Menu keeps its word.
      expect(Math.round(boxes[0]!.width), line).toBe(44);
      expect(Math.round(boxes[1]!.width), line).toBe(44);
      await expect(soundToggle(page)).not.toContainText(
        soundCopy.toggle.words.off,
        { useInnerText: true },
      );
    } else {
      await expect(soundToggle(page)).toContainText(
        soundCopy.toggle.words.off,
        { useInnerText: true },
      );
      await expect(paletteButton(page)).toHaveText(/Ctrl\s*K/, {
        useInnerText: true,
      });
    }
    await expect(menuButton(page)).toHaveText(site.controls.menu, {
      useInnerText: true,
    });
    expect(
      await sideways(page),
      `${path} scrolls sideways`,
    ).toBeLessThanOrEqual(0);
  }
});

test.describe("with scripts off", () => {
  test.use({ javaScriptEnabled: false });

  test("REQ-NAV-02 REQ-CNT-01 with scripts off Menu is a link to the footer's site links and the controls that need a script are hidden", async ({
    page,
  }) => {
    await page.goto("/work");
    const banner = page.getByRole("banner");
    const menuLink = banner.getByRole("link", {
      name: site.controls.menu,
      exact: true,
    });
    await expect(menuLink).toBeVisible();
    await expect(menuLink).toHaveAttribute("href", `#${site.siteLinksId}`);
    await expect(banner.getByRole("button")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: site.names.footer, exact: true }),
    ).toHaveAttribute("id", site.siteLinksId);
  });
});

test("REQ-NAV-03 REQ-PERF-04 no Radix, cmdk or sound code loads before the first press; the menu opens on Menu, lists every study in order, and Esc closes it with focus back on Menu", async ({
  page,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 30_000);
  const scripts = collectScripts(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(SETTLE_MS);
  for (const library of ["Radix Dialog", "cmdk", "sound"]) {
    expect(
      await scriptsHolding(scripts, library),
      `${library} before any press`,
    ).toEqual([]);
  }

  const dialog = await openMenu(page);
  expect(
    (await scriptsHolding(scripts, "Radix Dialog")).length,
    "Radix arrives with the menu",
  ).toBeGreaterThan(0);
  expect(
    await scriptsHolding(scripts, "cmdk"),
    "cmdk waits for the palette",
  ).toEqual([]);

  const list = dialog.getByRole("navigation", {
    name: menuCopy.listName,
    exact: true,
  });
  const rows = list.getByRole("link");
  await expect(rows).toHaveCount(studies.length);
  for (const [index, title] of STUDY_TITLES.entries()) {
    await expect(rows.nth(index)).toHaveAccessibleName(
      new RegExp(`^${title}\\s*,`),
    );
  }
  // Focus moves in on open, to the first study when no study is on screen.
  await expect(rows.first()).toBeFocused();
  await expect(
    dialog.getByRole("navigation", { name: menuCopy.pagesName, exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
});

test("REQ-NAV-03 on a study page the menu opens on that study's row, marked as the page", async ({
  page,
}) => {
  const study = studies[1]!;
  await page.goto(`/work/${study.slug}`);
  const dialog = await openMenu(page);
  const row = dialog
    .getByRole("navigation", { name: menuCopy.listName, exact: true })
    .getByRole("link", { name: new RegExp(`^${STUDY_TITLES[1]}\\s*,`) });
  await expect(row).toBeFocused();
  await expect(row).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(menuButton(page)).toBeFocused();
});

test("REQ-NAV-04 the palette opens by Ctrl K and by its button, and keys alone jump to a study", async ({
  page,
}) => {
  await page.goto("/work");
  await openPaletteByKeys(page);
  const study = studies[1]!;
  await searchFor(page, study.title.slice(0, 4), study.title);
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/work/${study.slug}`);
  await expect(paletteDialog(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(study.title);

  await paletteButton(page).click();
  await expect(paletteDialog(page)).toBeVisible();
  await expect(paletteInput(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(paletteDialog(page)).toBeHidden();
  await expect(paletteButton(page)).toBeFocused();

  // Ctrl K again closes it, so the keys toggle it.
  await openPaletteByKeys(page);
  await page.keyboard.press("Control+K");
  await expect(paletteDialog(page)).toBeHidden();
});

test("REQ-NAV-04 REQ-A11Y-04 the palette turns calm mode on and off from the keyboard and stays open", async ({
  page,
}) => {
  await page.goto("/work");
  await openPaletteByKeys(page);
  const row = paletteRow(page, paletteCopy.settings.calm);
  await searchFor(page, "calm", paletteCopy.settings.calm);
  await expect(row).toContainText(paletteCopy.values.off);

  await page.keyboard.press("Enter");
  await expect(row).toContainText(paletteCopy.values.on);
  await expect(paletteDialog(page)).toBeVisible();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), CALM_KEY),
  ).toBe("on");
  await expect(paletteDialog(page).getByRole("status")).toHaveText(
    paletteCopy.announce.calmOn,
  );

  await page.keyboard.press("Escape");
  const footerSwitch = page
    .getByRole("contentinfo")
    .getByRole("switch", { name: "Calm mode", exact: true });
  await expect(footerSwitch).toHaveAttribute("aria-checked", "true");

  await openPaletteByKeys(page);
  await searchFor(page, "calm", paletteCopy.settings.calm);
  await page.keyboard.press("Enter");
  await expect(row).toContainText(paletteCopy.values.off);
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), CALM_KEY),
  ).toBeNull();
  await page.keyboard.press("Escape");
  await expect(footerSwitch).toHaveAttribute("aria-checked", "false");
});

test("REQ-NAV-04 the palette copies the email address and says so", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/work");
  await openPaletteByKeys(page);
  const row = paletteRow(page, paletteCopy.actions.copyEmail);
  await searchFor(page, "copy", paletteCopy.actions.copyEmail);
  await expect(row).toContainText(site.email);

  await page.keyboard.press("Enter");
  await expect(row).toContainText(paletteCopy.copied);
  await expect(paletteDialog(page).getByRole("status")).toHaveText(
    paletteCopy.copied,
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    site.email,
  );
});

test("REQ-TIER-04 REQ-NAV-04 the palette's tier page forces tier 3, then Auto hands the choice back to the decision table", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(3 * ENGINE_TIMEOUT_MS + 30_000);
  await asTier2(page);
  await page.goto("/");
  const field = page.locator(FIELD);
  const natural = await waitForField(page);
  expect(natural).toEqual({
    tier: 2,
    reason: isMobile ? "phone" : "no-webgpu",
  });

  await openPaletteByKeys(page);
  const tierRow = paletteRow(page, paletteCopy.settings.tier);
  await searchFor(page, "quality", paletteCopy.settings.tier);
  await expect(tierRow).toContainText("Auto · Tier 2 · WebGL2");
  await page.keyboard.press("Enter");

  // The tier page: Auto, chosen, then the three tiers.
  await expect(paletteInput(page)).toHaveAttribute(
    "placeholder",
    paletteCopy.tierPage.placeholder,
  );
  const options = paletteDialog(page).getByRole("option");
  await expect(options).toHaveCount(4);
  await expect(options.first()).toContainText(paletteCopy.tierPage.chosen);
  await page.keyboard.press("End");
  await expect(paletteRow(page, "Tier 3 · Still")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Enter");

  await expect(field).toHaveAttribute("data-tier", "3", {
    timeout: ENGINE_TIMEOUT_MS,
  });
  await expect(field).toHaveAttribute("data-tier-reason", "forced");
  await expect(field).toHaveAttribute("data-ready", "true", {
    timeout: ENGINE_TIMEOUT_MS,
  });
  await expect(tierRow).toContainText("Tier 3 · Still");
  await expect(paletteDialog(page).getByRole("status")).toHaveText(
    paletteCopy.announce.tierSet("Tier 3 · Still"),
  );
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), TIER_KEY),
  ).toBe("3");

  // Back on the first page with the tier row active: Enter opens the tier
  // page again on the choice in use, Home goes to Auto.
  await expect(tierRow).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await expect(paletteRow(page, "Auto")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Enter");

  await expect(field).toHaveAttribute("data-tier", "2", {
    timeout: ENGINE_TIMEOUT_MS,
  });
  await expect(field).toHaveAttribute("data-tier-reason", natural.reason ?? "");
  await expect(field).toHaveAttribute("data-ready", "true", {
    timeout: ENGINE_TIMEOUT_MS,
  });
  await expect(tierRow).toContainText("Auto · Tier 2 · WebGL2");
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), TIER_KEY),
  ).toBeNull();
});

test("REQ-NAV-05 A14 a hidden code on a page without the field says so and plays nothing", async ({
  page,
}) => {
  await page.goto("/work");
  await openPaletteByKeys(page);
  // Hidden until its exact code is typed.
  await expect(paletteRow(page, paletteCopy.eggs[0].label)).toHaveCount(0);
  await searchFor(page, "gg", paletteCopy.eggs[0].label);
  await page.keyboard.press("Enter");
  await expect(paletteDialog(page)).toBeVisible();
  await expect(paletteDialog(page).getByRole("status")).toHaveText(
    paletteCopy.eggRefusals["no-field-page"],
  );
  await expect(page.locator(FIELD)).toBeHidden();
});

test("REQ-A11Y-02 keys alone run through the bar, the sound panel, the menu and the palette, each stop with a visible focus ring", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  const banner = page.getByRole("banner");
  for (const [name, stop] of [
    ["skip link", page.getByRole("link", { name: "Skip to content" })],
    [
      "home link",
      banner.getByRole("link", { name: site.names.logoLink, exact: true }),
    ],
    ["sound", soundToggle(page)],
  ] as const) {
    await page.keyboard.press("Tab");
    await expectRing(stop, name);
  }

  // Enter opens the sound panel on its first switch; Tab moves through it,
  // Space turns a switch over, Esc closes it with focus back on the pill.
  await page.keyboard.press("Enter");
  await expect(soundToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expectRing(soundSwitch(page, "Background"), "background switch");
  await page.keyboard.press("Tab");
  await expectRing(soundSwitch(page, "Interface sounds"), "interface switch");
  await page.keyboard.press("Space");
  await expect(soundSwitch(page, "Interface sounds")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Space");
  await expect(soundSwitch(page, "Interface sounds")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.keyboard.press("Escape");
  await expect(soundPanel(page)).toBeHidden();
  await expectRing(soundToggle(page), "sound after its panel");

  for (const [name, stop] of [
    ["palette", paletteButton(page)],
    ["menu", menuButton(page)],
  ] as const) {
    await page.keyboard.press("Tab");
    await expectRing(stop, name);
  }

  // Enter opens the menu on the first study; Tab walks the studies.
  await page.keyboard.press("Enter");
  const rows = menuDialog(page)
    .getByRole("navigation", { name: menuCopy.listName, exact: true })
    .getByRole("link");
  await expectRing(rows.first(), "first study");
  for (let index = 1; index < studies.length; index += 1) {
    await page.keyboard.press("Tab");
    await expectRing(rows.nth(index), `study ${index + 1}`);
  }
  await page.keyboard.press("Escape");
  await expect(menuDialog(page)).toBeHidden();
  await expectRing(menuButton(page), "menu after the menu");

  // Shift+Tab back to the palette's control; Enter opens it with focus in the
  // search, the active row filled, and the arrows moving the fill.
  await page.keyboard.press("Shift+Tab");
  await expectRing(paletteButton(page), "palette");
  await page.keyboard.press("Enter");
  await expect(paletteInput(page)).toBeFocused();
  const options = paletteDialog(page).getByRole("option");
  const fill = (index: number) =>
    options.nth(index).evaluate((row) => getComputedStyle(row).backgroundColor);
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  const filled = await fill(0);
  expect(filled).not.toBe(await fill(1));
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => fill(1)).toBe(filled);
  await expect(paletteInput(page)).toHaveAttribute(
    "aria-activedescendant",
    (await options.nth(1).getAttribute("id")) ?? "",
  );
  await page.keyboard.press("Escape");
  await expect(paletteDialog(page)).toBeHidden();
  await expectRing(paletteButton(page), "palette after the palette");
});

/**
 * Counts the AudioContexts the page makes, through either constructor, from
 * before its first script. Returns the reader.
 */
async function countAudioContexts(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const counted = window as unknown as { audioContexts: number };
    counted.audioContexts = 0;
    const Native = window.AudioContext;
    if (typeof Native !== "function") return;
    class Counted extends Native {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        counted.audioContexts += 1;
      }
    }
    for (const name of ["AudioContext", "webkitAudioContext"]) {
      Object.defineProperty(window, name, {
        value: Counted,
        configurable: true,
        writable: true,
      });
    }
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { audioContexts: number }).audioContexts,
    );
}

/** Opens the bar's sound panel by its pill and waits for it. */
async function openSoundPanel(page: Page): Promise<Locator> {
  await waitForHydration(page);
  await soundToggle(page).click();
  const panel = soundPanel(page);
  await expect(panel).toBeVisible();
  await expect(soundToggle(page)).toHaveAttribute("aria-expanded", "true");
  return panel;
}

function savedChoices(page: Page) {
  return page.evaluate(
    ([sound, ticks]) => ({
      sound: localStorage.getItem(sound),
      ticks: localStorage.getItem(ticks),
    }),
    [SOUND_KEY, TICKS_KEY] as const,
  );
}

test("REQ-SND-01 no AudioContext exists before a gesture, the Background switch makes one, and turning it off and on again, or the interface sounds on, keeps that one", async ({
  page,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 30_000);
  const contexts = await countAudioContexts(page);
  const scripts = collectScripts(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(SETTLE_MS);
  expect(await contexts(), "no AudioContext before a gesture").toBe(0);
  expect(await scriptsHolding(scripts, "sound")).toEqual([]);

  const toggle = soundToggle(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await openSoundPanel(page);
  // Opening the panel plays nothing and makes nothing.
  expect(await contexts(), "no AudioContext from opening the panel").toBe(0);

  const background = soundSwitch(page, "Background");
  await background.click();
  await expect(toggle).toHaveAttribute("data-sound", "on");
  await expect(background).toHaveAttribute("aria-checked", "true");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.background);
  expect(await contexts()).toBe(1);
  expect((await scriptsHolding(scripts, "sound")).length).toBeGreaterThan(0);

  await background.click();
  await expect(toggle).toHaveAttribute("data-sound", "off");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.off);
  await background.click();
  await expect(toggle).toHaveAttribute("data-sound", "on");
  await soundSwitch(page, "Interface sounds").click();
  await expect(toggle).toHaveAttribute("data-ticks", "on");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.on);
  expect(await contexts(), "one AudioContext for the visit").toBe(1);
});

test("REQ-SND-01 REQ-SND-02 a returning visitor who left the background on loads silent with no AudioContext, sees the note and hears it from the first click", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 30_000);
  // The background turned on at an earlier visit, in this browser.
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "on");
  }, SOUND_KEY);
  const contexts = await countAudioContexts(page);
  const scripts = collectScripts(page);
  await page.goto("/");
  await waitForHydration(page);

  const toggle = soundToggle(page);
  await expect(toggle).toHaveAttribute("data-sound", "waiting");
  // While it waits the pill keeps its word.
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.background);
  await expect(toggle).toContainText(soundCopy.toggle.words.background);

  // The note in the hint's place, once the hero settles, taking no focus.
  const note = page.getByRole("banner").getByText(soundCopy.note);
  await expect(note).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(HINT_WORDS)).toHaveCount(0);
  expect(
    await page.evaluate(() => document.activeElement === document.body),
  ).toBe(true);
  const noteBox = await boxOf(note);
  const toggleBox = await boxOf(toggle);
  expect(noteBox.y).toBeGreaterThan(toggleBox.y + toggleBox.height);
  expect(noteBox.x).toBeGreaterThanOrEqual(0);
  expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );

  // Silent: no AudioContext and no sound code before a gesture.
  expect(await contexts(), "no AudioContext before a gesture").toBe(0);
  expect(await scriptsHolding(scripts, "sound")).toEqual([]);

  // The first click, or tap on the phone, on the headline, which does
  // nothing else; the window hears it whatever lies on top.
  const heading = await boxOf(page.getByRole("heading", { level: 1 }));
  const x = heading.x + heading.width / 2;
  const y = heading.y + Math.min(heading.height / 2, 24);
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);

  await expect(toggle).toHaveAttribute("data-sound", "on");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.background);
  await expect(note).toBeHidden();
  expect(await contexts(), "one AudioContext, from the first click").toBe(1);
  expect((await scriptsHolding(scripts, "sound")).length).toBeGreaterThan(0);
  expect(await savedChoices(page)).toEqual({ sound: "on", ticks: null });
});

test("REQ-SND-01 REQ-SND-03 the sound panel turns Background and Interface sounds on and off on their own, and each is remembered after a reload", async ({
  page,
}) => {
  test.setTimeout(ENGINE_TIMEOUT_MS + 60_000);
  const contexts = await countAudioContexts(page);
  await page.goto("/");
  const toggle = soundToggle(page);
  const panel = await openSoundPanel(page);
  const background = soundSwitch(page, "Background");
  const ticks = soundSwitch(page, "Interface sounds");

  // Under the pill, inside the screen, focus on its first switch.
  const panelBox = await boxOf(panel);
  const toggleBox = await boxOf(toggle);
  expect(panelBox.y).toBeGreaterThan(toggleBox.y + toggleBox.height);
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
  await expect(background).toBeFocused();
  for (const each of [background, ticks]) {
    expect((await boxOf(each)).height).toBeGreaterThanOrEqual(44);
  }

  // Interface sounds alone.
  await ticks.click();
  await expect(ticks).toHaveAttribute("aria-checked", "true");
  await expect(background).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.interface);
  await expect
    .poll(() => savedChoices(page))
    .toEqual({
      sound: null,
      ticks: "on",
    });
  // Then the background too, then the interface sounds off again.
  await background.click();
  await expect(toggle).toHaveAttribute("data-sound", "on");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.on);
  await ticks.click();
  await expect(ticks).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.background);
  expect(await savedChoices(page)).toEqual({ sound: "on", ticks: "off" });
  expect(await contexts()).toBe(1);

  // A press outside closes the panel.
  await page.getByRole("heading", { level: 1 }).click();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Reloaded: the background waits for the first click, the interface
  // sounds stay off, and no AudioContext exists yet.
  await page.reload();
  await waitForHydration(page);
  await expect(toggle).toHaveAttribute("data-sound", "waiting");
  await expect(toggle).toHaveAttribute("data-ticks", "off");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.background);
  expect(await contexts(), "no AudioContext before a gesture").toBe(0);
  await openSoundPanel(page);
  await expect(background).toHaveAttribute("aria-checked", "true");
  await expect(ticks).toHaveAttribute("aria-checked", "false");
  // The pill's press is a first click, so the background starts as its note
  // promises (D-164); its switch then turns it off.
  await expect(toggle).toHaveAttribute("data-sound", "on");
  expect(await contexts()).toBe(1);
  await background.click();
  await expect(toggle).toHaveAttribute("data-sound", "off");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.off);
  await ticks.click();
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.interface);
  await expect
    .poll(() => savedChoices(page))
    .toEqual({
      sound: "off",
      ticks: "on",
    });

  // Reloaded again: interface sounds only, still silent until a press.
  await page.reload();
  await waitForHydration(page);
  await expect(toggle).toHaveAttribute("data-sound", "off");
  await expect(toggle).toHaveAttribute("data-ticks", "on");
  await expect(toggle).toHaveAccessibleName(soundCopy.toggle.names.interface);
  expect(await contexts(), "no AudioContext before a gesture").toBe(0);
  // The first press that ticks makes the one context.
  await menuButton(page).click();
  await expect(menuDialog(page)).toBeVisible({ timeout: DIALOG_CODE_MS });
  await expect.poll(contexts).toBe(1);
});

test("REQ-SND-02 the sound hint shows once under the toggle, takes no focus, and stays away on the next visit", async ({
  page,
  context,
}) => {
  await page.goto("/work");
  const hint = page.getByRole("banner").getByText(HINT_WORDS);
  await expect(hint).toBeVisible({ timeout: 10_000 });
  expect(
    await page.evaluate(() => document.activeElement === document.body),
  ).toBe(true);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), HINT_KEY),
  ).toBe("seen");
  // Under the toggle, inside the page.
  const hintBox = await boxOf(hint);
  const toggleBox = await boxOf(soundToggle(page));
  expect(hintBox.y).toBeGreaterThan(toggleBox.y + toggleBox.height);
  expect(hintBox.x).toBeGreaterThanOrEqual(0);
  expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );

  // A second visit: a new tab in the same browser.
  const again = await context.newPage();
  try {
    await again.goto("/work");
    await again.waitForTimeout(HINT_DELAY_MS + SETTLE_MS);
    await expect(again.getByText(HINT_WORDS)).toHaveCount(0);
  } finally {
    await again.close();
  }
});

test("REQ-A11Y-01 axe finds nothing on the open menu, the open palette and its tier page", async ({
  page,
}) => {
  await page.goto("/");
  await openMenu(page);
  await transitionsDone(page);
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(menuDialog(page)).toBeHidden();

  await openPaletteByKeys(page);
  await paletteShown(page);
  await transitionsDone(page);
  await expectNoAxeViolations(page);
  await searchFor(page, "quality", paletteCopy.settings.tier);
  await page.keyboard.press("Enter");
  await expect(paletteDialog(page).getByRole("option")).toHaveCount(4);
  await transitionsDone(page);
  await expectNoAxeViolations(page);
});
