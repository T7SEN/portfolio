import { LOADER_ATTRIBUTE } from "@/components/loader/loader-config";
import type { EggId } from "@/engine/types";

import { calmStore, type CalmStore } from "./calm-store";
import { isFieldRoute } from "./field-routes";
import { storyBridge, type StoryBridge } from "./story-bridge";
import { tierStore, type TierStore } from "./tier-store";

/**
 * What became of an egg asked for (REQ-NAV-05), so whoever asked can say so
 * honestly (A14): played, or why not. no-field: no live field is on screen
 * (a route without it, the loader's cover up, or a tier not drawn yet).
 * still: the field is tier 3's picture. calm: calm mode or reduced motion
 * holds it still.
 */
export type EggOutcome =
  { played: true } | { played: false; reason: "no-field" | "still" | "calm" };

export type EggRequestOptions = {
  tier?: Pick<TierStore, "getSnapshot">;
  calm?: Pick<CalmStore, "getSnapshot">;
  bridge?: Pick<StoryBridge, "playEgg">;
  /** The window whose route and loader cover count. */
  win?: () => Window | undefined;
};

/** The request with its stores in hand; tests pass their own. */
export function createEggRequest({
  tier = tierStore,
  calm = calmStore,
  bridge = storyBridge,
  win = () => (typeof window === "undefined" ? undefined : window),
}: EggRequestOptions = {}): (egg: EggId) => EggOutcome {
  return (egg) => {
    const view = win();
    const isCovered =
      view?.document.documentElement.getAttribute(LOADER_ATTRIBUTE) === "up";
    const { tier: shown, ready } = tier.getSnapshot();
    if (
      view === undefined ||
      isCovered ||
      !isFieldRoute(view.location.pathname) ||
      shown === null ||
      !ready
    ) {
      return { played: false, reason: "no-field" };
    }
    if (shown === 3) return { played: false, reason: "still" };
    if (calm.getSnapshot().calm) return { played: false, reason: "calm" };
    bridge.playEgg(egg);
    return { played: true };
  };
}

const request = createEggRequest();

/**
 * Plays an egg when the live field is on screen: a field route with no
 * loader cover, tier 1 or 2 drawn, calm off. The engine also ignores an egg
 * while another plays; the page cannot see that, so it still counts here as
 * played.
 */
export function requestEgg(egg: EggId): EggOutcome {
  return request(egg);
}

/** How long a pointer is held for a long press, by default. */
export const LONG_PRESS_MS = 600;

// A finger never holds perfectly still; a move past this is a drag or a
// scroll, not a press.
const SLOP_PX = 10;

// The click that ends a long press follows the release at once. A release
// with no click after it (the pointer let go off the element) stops
// swallowing after this long, so a later click is a click.
const CLICK_WINDOW_MS = 1000;

/**
 * Calls onLongPress when the primary pointer is held still on the element
 * for ms. The click and the context menu that follow it are swallowed, so a
 * long press on a link never follows it or opens the browser's link menu; a
 * short press is an ordinary click. Returns the unbind.
 */
export function bindLongPress(
  element: HTMLElement,
  onLongPress: () => void,
  ms = LONG_PRESS_MS,
): () => void {
  let press: {
    id: number;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let hasFired = false;
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelPress() {
    if (press === null) return;
    clearTimeout(press.timer);
    press = null;
  }

  function clearRelease() {
    if (releaseTimer !== null) clearTimeout(releaseTimer);
    releaseTimer = null;
  }

  const onDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    cancelPress();
    clearRelease();
    hasFired = false;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        press = null;
        hasFired = true;
        onLongPress();
      }, ms),
    };
  };

  const onMove = (event: PointerEvent) => {
    if (press === null || event.pointerId !== press.id) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > SLOP_PX) cancelPress();
  };

  const onEnd = (event: PointerEvent) => {
    if (press !== null && event.pointerId === press.id) cancelPress();
    if (!hasFired) return;
    clearRelease();
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      hasFired = false;
    }, CLICK_WINDOW_MS);
  };

  // In the capture phase on the element itself, so the click is stopped
  // before a link's own handler or the browser follows it.
  const onClick = (event: MouseEvent) => {
    if (!hasFired) return;
    hasFired = false;
    clearRelease();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  // A touch held on a link opens the browser's menu for it; while a press
  // runs, and just after one fired, the press is the egg's.
  const onContextMenu = (event: MouseEvent) => {
    if (press !== null || hasFired) event.preventDefault();
  };

  element.addEventListener("pointerdown", onDown);
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerup", onEnd);
  element.addEventListener("pointercancel", onEnd);
  element.addEventListener("pointerleave", onEnd);
  element.addEventListener("click", onClick, true);
  element.addEventListener("contextmenu", onContextMenu);

  return () => {
    cancelPress();
    clearRelease();
    hasFired = false;
    element.removeEventListener("pointerdown", onDown);
    element.removeEventListener("pointermove", onMove);
    element.removeEventListener("pointerup", onEnd);
    element.removeEventListener("pointercancel", onEnd);
    element.removeEventListener("pointerleave", onEnd);
    element.removeEventListener("click", onClick, true);
    element.removeEventListener("contextmenu", onContextMenu);
  };
}
