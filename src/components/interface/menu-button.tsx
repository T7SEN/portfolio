"use client";

import { useSyncExternalStore } from "react";

import { cx } from "@/components/site/class-names";
import { pillClassName } from "@/components/site/pill";
import { site } from "@/content/site";
import { overlayStore } from "@/lib/overlay-store";

import { MenuIcon } from "./menu-icons";
import { preloadOverlay } from "./overlays";

const preload = () => preloadOverlay("menu");

const MENU_PILL = cx(
  pillClassName({ variant: "quiet", size: "bar", gap: false }),
  "gap-2 max-sm:gap-1.5 max-sm:rounded-xl max-sm:px-2.5",
);

/**
 * The bar's Menu pill: the two-line icon and the word, on every width
 * (REQ-NAV-03). It opens the menu dialog, and a second press while the
 * menu's code is still loading closes it again (once open, the menu's own
 * close takes over). With scripts off the button is hidden and a link of
 * the same look takes its place, to the footer's site links, so the fast
 * path needs no script.
 */
export function MenuButton() {
  const overlay = useSyncExternalStore(
    overlayStore.subscribe,
    overlayStore.getSnapshot,
    overlayStore.getServerSnapshot,
  );

  // The wrappers carry the switch, so no display utility fights the pill's.
  return (
    <>
      <span className="contents noscript:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={overlay === "menu"}
          data-part="menu-button"
          onClick={() => overlayStore.toggle("menu")}
          onPointerEnter={preload}
          onFocus={preload}
          className={MENU_PILL}
        >
          <MenuIcon className="size-4" />
          {site.controls.menu}
        </button>
      </span>
      <span className="hidden noscript:contents">
        <a
          href={`#${site.siteLinksId}`}
          data-part="menu-link"
          className={MENU_PILL}
        >
          <MenuIcon className="size-4" />
          {site.controls.menu}
        </a>
      </span>
    </>
  );
}
