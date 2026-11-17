"use client";

import { useSyncExternalStore } from "react";

import { useFinePointer } from "@/components/home/use-fine-pointer";
import { cx, LINK_HOVER } from "@/components/site/class-names";
import { pillClassName } from "@/components/site/pill";
import { paletteButtonName, paletteInvite } from "@/content/site";
import { overlayStore } from "@/lib/overlay-store";

import { SearchIcon } from "./menu-icons";
import { useShortcutKeys } from "./menu-shortcut";
import { preloadOverlay } from "./overlays";

/** A raised key cap, as the preview draws Ctrl and K. */
export function KeyCap({ children }: { children: string }) {
  return (
    <span className="inline-flex min-w-5.5 items-center justify-center rounded-[5px] border border-edge/40 bg-raised px-1.5 py-1 font-mono text-[0.6875rem] leading-none text-text">
      {children}
    </span>
  );
}

const preload = () => preloadOverlay("palette");

/**
 * The palette's control in the bar and in the menu's bar: the Ctrl K pill
 * with two raised key caps from 640 px, a square magnifying glass below it.
 * Its name holds the keys the pill shows (WCAG 2.5.3). Opening the palette
 * closes the menu (overlay-store.ts), and the palette's code starts loading
 * as soon as the pointer or focus reaches the control.
 */
export function PaletteButton({ className }: { className?: string }) {
  const keys = useShortcutKeys();
  const overlay = useSyncExternalStore(
    overlayStore.subscribe,
    overlayStore.getSnapshot,
    overlayStore.getServerSnapshot,
  );
  const [modifier, letter] = keys.split(" ") as [string, string];

  return (
    <button
      type="button"
      aria-label={paletteButtonName(keys)}
      aria-haspopup="dialog"
      aria-expanded={overlay === "palette"}
      data-part="palette-button"
      onClick={() => overlayStore.open("palette")}
      onPointerEnter={preload}
      onFocus={preload}
      className={cx(
        pillClassName({ variant: "quiet", size: "bar", gap: false }),
        "gap-1.5 max-sm:size-11 max-sm:rounded-xl max-sm:px-0 sm:px-3",
        className,
      )}
    >
      <SearchIcon className="size-4.5 sm:hidden" />
      <span
        aria-hidden="true"
        className="flex items-center gap-1.5 max-sm:hidden"
      >
        {/* The space draws nothing in the flex row, but keeps the keys
            apart in the visible text, "Ctrl K" as the name has it. */}
        <KeyCap>{modifier}</KeyCap> <KeyCap>{letter}</KeyCap>
      </span>
    </button>
  );
}

/**
 * The footer's way into the palette, in the copyright row: "Press Ctrl K for
 * everything", or on touch, where no key opens it, words that point at the
 * search button instead. Hidden with scripts off, when it cannot open
 * anything.
 */
export function PaletteInvite({ className }: { className?: string }) {
  const keys = useShortcutKeys();
  const finePointer = useFinePointer();

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-part="palette-invite"
      onClick={() => overlayStore.open("palette")}
      onPointerEnter={preload}
      onFocus={preload}
      className={cx(
        "inline-flex min-h-11 cursor-pointer items-center text-start noscript:hidden",
        LINK_HOVER,
        className,
      )}
    >
      {paletteInvite(finePointer ? keys : null)}
    </button>
  );
}
