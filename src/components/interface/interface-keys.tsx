"use client";

import { useEffect, useSyncExternalStore } from "react";

import { LOADER_ATTRIBUTE } from "@/components/loader/loader-config";
// Development only: hides React's hydration report when browser extensions
// alone changed the page. Imported here because this module loads with the
// root layout's client code, after the development overlay wraps
// console.error; production builds keep nothing of it.
import "@/lib/dev/quiet-extension-mismatch";
import type { EggId } from "@/engine/types";
import { calmStore, type CalmStore } from "@/lib/calm-store";
import { eggNotice } from "@/lib/egg-notice";
import type { EggOutcome } from "@/lib/eggs";
import { overlayStore, type OverlayStore } from "@/lib/overlay-store";

import { requestEggAloud } from "./egg-refusal";
import { isApplePlatform } from "./menu-shortcut";

/** The eggs a visitor types outside a text field (REQ-NAV-05). */
export const TYPED_EGGS: readonly { word: string; egg: EggId }[] = [
  { word: "gg", egg: "gg" },
  { word: "flip", egg: "flip" },
];

/** A longer pause than this between two keys starts a word again. */
export const KEY_PAUSE_MS = 1000;

const LONGEST = Math.max(...TYPED_EGGS.map(({ word }) => word.length));

// Pressed on their own while typing, as Shift is for a capital; they neither
// count as letters nor break a word.
const MODIFIERS = new Set([
  "Shift",
  "CapsLock",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
]);

/**
 * The letters typed so far, as one word: key() takes each key's value and
 * returns the egg its last letters spell, or null.
 */
export function createTypedEggs(now: () => number = () => performance.now()) {
  let typed = "";
  let last = Number.NEGATIVE_INFINITY;

  return {
    key(key: string): EggId | null {
      const time = now();
      if (time - last > KEY_PAUSE_MS) typed = "";
      last = time;
      if (key.length !== 1) {
        if (!MODIFIERS.has(key)) typed = "";
        return null;
      }
      typed = (typed + key.toLowerCase()).slice(-LONGEST);
      const found = TYPED_EGGS.find(({ word }) => typed.endsWith(word));
      if (found === undefined) return null;
      typed = "";
      return found.egg;
    },
    reset() {
      typed = "";
    },
  };
}

/**
 * Ctrl K, or Command K on Apple platforms, with no other modifier. A layout
 * whose K key types no Latin letter (Arabic, for one) is matched by where
 * the key sits; a Latin layout by the letter, so Dvorak's K is its own.
 */
export function isPaletteShortcut(
  event: KeyboardEvent,
  apple: boolean,
): boolean {
  if (event.altKey || event.shiftKey || event.isComposing) return false;
  const isCommand = apple
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!isCommand) return false;
  if (event.key.toLowerCase() === "k") return true;
  return !/^[a-z]$/i.test(event.key) && event.code === "KeyK";
}

// The keys of a text field, a list box or an editable region are its own.
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable === true ||
    target.matches("input, textarea, select") ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

export type InterfaceKeysOptions = {
  overlay?: Pick<OverlayStore, "getSnapshot" | "toggle">;
  requestEgg?: (egg: EggId) => EggOutcome;
  calm?: Pick<CalmStore, "getSnapshot" | "subscribe">;
  /** Command K rather than Ctrl K. Read from the platform by default. */
  apple?: boolean;
  now?: () => number;
};

/**
 * The site's keys on the window. Returns the teardown. The palette's key is
 * heard in the capture phase, so it works everywhere: in a text field, in
 * the open menu (where it switches to the palette) and in the palette (where
 * it closes it), and the browser's own Ctrl K never runs. While the home
 * page's loader cover holds the page it is left to the browser: the cover
 * has no way past it (D-134). A typed egg is heard after the page's own
 * handlers, so a key something else took never counts. Calm mode, or the
 * system's reduced motion, turns the typed eggs off: letters then do nothing
 * and say nothing, so a word typed or spoken by chance never plays an egg or
 * interrupts with why it did not (WCAG 2.1.4, D-173). The palette's egg rows
 * and the logo's long press still say why, as nothing is typed there.
 */
export function startInterfaceKeys(
  win: Window,
  {
    overlay = overlayStore,
    requestEgg = requestEggAloud,
    calm = calmStore,
    apple = isApplePlatform(win.navigator),
    now,
  }: InterfaceKeysOptions = {},
): () => void {
  const typed = createTypedEggs(now);
  const html = win.document.documentElement;
  // Calm turned on or off between two keys starts the word again, so a
  // letter typed before it never joins one typed after (D-180).
  const stopCalm = calm.subscribe(() => typed.reset());

  const onShortcut = (event: KeyboardEvent) => {
    if (!isPaletteShortcut(event, apple)) return;
    if (html.getAttribute(LOADER_ATTRIBUTE) === "up") return;
    event.preventDefault();
    // Holding the keys down would open and close it on every repeat.
    if (!event.repeat) overlay.toggle("palette");
  };

  const onTyped = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      isEditable(event.target) ||
      overlay.getSnapshot() !== null ||
      calm.getSnapshot().calm
    ) {
      typed.reset();
      return;
    }
    const egg = typed.key(event.key);
    if (egg !== null) requestEgg(egg);
  };

  win.addEventListener("keydown", onShortcut, true);
  win.addEventListener("keydown", onTyped);
  return () => {
    win.removeEventListener("keydown", onShortcut, true);
    win.removeEventListener("keydown", onTyped);
    stopCalm();
  };
}

/**
 * The palette's key and the typed eggs, for every route. The root layout
 * mounts it once. It renders the polite status where an egg asked for
 * outside the palette says why it did not play (REQ-NAV-05): typed, or the
 * logo's long press.
 */
export function InterfaceKeys() {
  useEffect(() => startInterfaceKeys(window), []);
  const notice = useSyncExternalStore(
    eggNotice.subscribe,
    eggNotice.getSnapshot,
    eggNotice.getServerSnapshot,
  );
  return (
    <p role="status" data-part="egg-status" className="sr-only">
      {/* Each notice is a new node, so the same words twice are heard twice. */}
      {notice !== null && <span key={notice.id}>{notice.text}</span>}
    </p>
  );
}
