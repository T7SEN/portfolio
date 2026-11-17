import { expect, type Locator, type Page } from "@playwright/test";

import { menuCopy } from "../../src/content/menu";
import { paletteCopy } from "../../src/content/palette";
import { site } from "../../src/content/site";

// The bar and its two overlays as built at P5 (REQ-NAV-02 to 04): the home
// link, then the nav named Site controls holding Sound, Ctrl K and Menu.

/** The bar's nav. While the menu is open the page is hidden from the tree, so this names the menu's own bar instead. */
export function barControls(page: Page): Locator {
  return page.getByRole("navigation", { name: site.names.siteControls });
}

/** The bar's Menu button. */
export function menuButton(page: Page): Locator {
  return page
    .getByRole("banner")
    .getByRole("button", { name: site.controls.menu, exact: true });
}

/** The bar's palette button: the Ctrl K pill, or the magnifier below 640 px. */
export function paletteButton(page: Page): Locator {
  return page
    .getByRole("banner")
    .getByRole("button", { name: /^Open the command palette, / });
}

/**
 * The bar's sound pill, whatever its state: its name ends "Sound settings"
 * (from 15 Nov 2026 it opens the panel of the two settings).
 */
export function soundToggle(page: Page): Locator {
  return page
    .getByRole("banner")
    .getByRole("button", { name: /Sound settings$/ });
}

/** The panel the bar's sound pill opens. */
export function soundPanel(page: Page): Locator {
  return page
    .getByRole("banner")
    .getByRole("group", { name: "Sound settings", exact: true });
}

/** One of the panel's two switches: "Background" or "Interface sounds". */
export function soundSwitch(
  page: Page,
  name: "Background" | "Interface sounds",
): Locator {
  return soundPanel(page).getByRole("switch", { name, exact: true });
}

export function menuDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: menuCopy.name, exact: true });
}

export function paletteDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: paletteCopy.name, exact: true });
}

/** The palette's search field, which holds focus while the palette is open. */
export function paletteInput(page: Page): Locator {
  return paletteDialog(page).getByRole("combobox");
}

/** The palette's row holding the words, by its option role. */
export function paletteRow(page: Page, label: string | RegExp): Locator {
  return paletteDialog(page).getByRole("option", {
    name: typeof label === "string" ? new RegExp(`^${escape(label)}`) : label,
  });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Waits until React has taken the bar over, so its handlers and the window's
 * keys (interface-keys.tsx) are live: a key pressed on the static HTML before
 * that does nothing. Hydration leaves React's props on each element it owns.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-part="palette-button"]');
    return (
      button !== null &&
      Object.keys(button).some((key) => key.startsWith("__reactProps"))
    );
  });
  // The window's keys start in an effect, which runs after the commit.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Waits until React has attached its handlers to this element. Each island
 * hydrates on its own, so the palette button's handlers say nothing about
 * the Menu button's or a link's: a press that lands first is lost (the full
 * run of 14 Nov 2026, loader.spec.ts line 770, where the trace showed the
 * click land on a Menu button that never expanded).
 */
export async function waitForHandlers(target: Locator): Promise<void> {
  await expect
    .poll(() =>
      target.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}

/**
 * Waits for every CSS transition running now to end (a fade in, a colour
 * change on focus), so a scan reads each colour as it settles. Animations
 * that loop are left alone.
 */
export async function transitionsDone(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    ).then(() => undefined),
  );
}

/** The longest wait for a dialog's code on its first open. */
export const DIALOG_CODE_MS = 15_000;

/** Opens the menu from the bar and waits for its fade in to end. */
export async function openMenu(page: Page): Promise<Locator> {
  await waitForHydration(page);
  const button = menuButton(page);
  await waitForHandlers(button);
  await button.click();
  // Heard: the store opens the menu at once, before its code arrives. Found
  // by its markup, since the open dialog hides the bar from the tree.
  await expect(
    page.locator('header [data-part="menu-button"]'),
  ).toHaveAttribute("aria-expanded", "true");
  const dialog = menuDialog(page);
  // The menu's code arrives with this first press (overlays.tsx). Opened
  // while the page is still loading, with many browsers sharing the
  // machine, its chunk waited more than 5 s behind the page's own requests.
  await expect(dialog).toBeVisible({ timeout: DIALOG_CODE_MS });
  await expect(dialog).toHaveCSS("opacity", "1");
  return dialog;
}

/** Waits for the palette's fade in to end, so a scan reads its colours whole. */
export async function paletteShown(page: Page): Promise<void> {
  await expect(paletteDialog(page)).toHaveCSS("opacity", "1");
}

/**
 * A move inside the site as the bar offers it from P5, when its page links
 * moved into the menu: opens the menu and follows the link of that name in
 * its Pages row ("All work, no 3D" for /work, "About", "Contact").
 */
export async function goThroughMenu(page: Page, name: string): Promise<void> {
  const dialog = await openMenu(page);
  await dialog
    .getByRole("navigation", { name: menuCopy.pagesName, exact: true })
    .getByRole("link", { name, exact: true })
    .click();
  await expect(dialog).toBeHidden();
}

const workLink = menuCopy.pages.find((link) => link.href === "/work");
if (workLink === undefined) throw new Error("The menu has no link to /work");

/** The menu's link to /work. */
export const MENU_WORK: string = workLink.label;
