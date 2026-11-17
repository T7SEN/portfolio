"use client";

import {
  type ComponentType,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { site } from "@/content/site";
import { overlayStore } from "@/lib/overlay-store";

type OverlayKind = "menu" | "palette";

type DialogModule = { default: ComponentType };

// The one import of each dialog, so Radix Dialog and cmdk stay out of every
// page's first load and arrive on the first open (REQ-NAV-03, REQ-NAV-04).
// The module system resolves each once; an early call only starts it sooner.
const LOADERS: Record<OverlayKind, () => Promise<DialogModule>> = {
  menu: () => import("./menu-dialog"),
  palette: () => import("./palette-dialog"),
};

/**
 * Starts a dialog's import before its first open, from the pointer reaching
 * or focus landing on the control that opens it. A failure here is left to
 * the open itself, which tries again.
 */
export function preloadOverlay(kind: OverlayKind): void {
  LOADERS[kind]().catch(() => undefined);
}

/**
 * Set on the html element while a dialog asked for is still loading: the
 * pointer shows the page is busy (globals.css).
 */
export const LOADING_ATTRIBUTE = "data-overlay-loading";

// With a dialog's code out of reach (offline, a failed chunk), the control
// still leads somewhere: to the footer's site links, as the menu does with
// scripts off, and the palette's commands are those links too (rule A11).
function showSiteLinks() {
  const links = document.getElementById(site.siteLinksId);
  links?.scrollIntoView({ block: "center" });
  links?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
}

/**
 * Mounted once in the root layout. Loads each dialog on its first open and
 * keeps it mounted after, so a second open is instant; each dialog reads the
 * overlay store itself to know when it is open. While a dialog's code is
 * on its way the page says it is busy, Esc closes the dialog asked for (as
 * it would close it open), and its control's second press closes it too.
 */
export function Overlays() {
  const overlay = useSyncExternalStore(
    overlayStore.subscribe,
    overlayStore.getSnapshot,
    overlayStore.getServerSnapshot,
  );
  const [dialogs, setDialogs] = useState<
    Partial<Record<OverlayKind, ComponentType>>
  >({});

  useEffect(() => {
    if (overlay === null || dialogs[overlay] !== undefined) return;
    const kind = overlay;
    let live = true;
    LOADERS[kind]().then(
      (module) => {
        if (live) {
          setDialogs((current) => ({ ...current, [kind]: module.default }));
        }
      },
      (error: unknown) => {
        if (!live) return;
        if (process.env.NODE_ENV !== "production") {
          console.warn(`overlay: no-${kind}`, error);
        }
        if (overlayStore.getSnapshot() === kind) {
          overlayStore.close();
          // No dialog mounted to take it; the site links take focus instead.
          overlayStore.takeReturnFocus();
        }
        showSiteLinks();
      },
    );
    return () => {
      live = false;
    };
  }, [overlay, dialogs]);

  const isLoading = overlay !== null && dialogs[overlay] === undefined;
  useEffect(() => {
    if (!isLoading) return;
    const html = document.documentElement;
    html.setAttribute(LOADING_ATTRIBUTE, "");
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      overlayStore.close();
      // Focus never left the page, so there is nothing to give back.
      overlayStore.takeReturnFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.removeAttribute(LOADING_ATTRIBUTE);
      window.removeEventListener("keydown", onKey);
    };
  }, [isLoading]);

  const Menu = dialogs.menu;
  const Palette = dialogs.palette;
  return (
    <>
      {Menu !== undefined && <Menu />}
      {Palette !== undefined && <Palette />}
    </>
  );
}
