"use client";

import { useEffect } from "react";

import { type OverlayStore, overlayStore } from "@/lib/overlay-store";
import { type SoundPanelStore, soundPanelStore } from "@/lib/sound-panel-store";
import { type SoundStore, soundStore } from "@/lib/sound-store";

/** The least time between two hover sounds anywhere on the page. */
export const HOVER_GAP_MS = 90;

/**
 * How long after a scroll or the wheel a pointer that lands on a control
 * stays silent: the page moved under a still mouse, which is not a hover.
 */
export const SCROLL_QUIET_MS = 250;

/**
 * How long a press lasts for the one tick it plays: from its pointerdown or
 * keydown to its click. A click with no press this recent (a screen reader,
 * a script) starts its own.
 */
export const PRESS_MS = 1000;

/** What a click ticks "select" on: links, buttons and the controls like them. */
export const PRESS_TARGETS = [
  "a[href]",
  "button",
  '[role="button"]',
  '[role="link"]',
  '[role="switch"]',
  '[role="option"]',
  '[role="tab"]',
  "summary",
  'input[type="checkbox"]',
  'input[type="radio"]',
].join(", ");

/** What a mouse ticks "hover" on: links, buttons and switches. */
export const HOVER_TARGETS = [
  "a[href]",
  "button",
  '[role="button"]',
  '[role="link"]',
  '[role="switch"]',
].join(", ");

export type InterfaceTicksOptions = {
  sound?: Pick<SoundStore, "tick" | "ticksAsked">;
  overlay?: Pick<OverlayStore, "subscribe" | "getSnapshot">;
  panel?: Pick<SoundPanelStore, "subscribe" | "getSnapshot">;
  now?: () => number;
};

function elementOf(target: EventTarget | null): Element | null {
  return target !== null && typeof (target as Element).closest === "function"
    ? (target as Element)
    : null;
}

function isDisabled(element: Element): boolean {
  return (
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true"
  );
}

/**
 * The interface sounds everywhere [T7SEN, 15 Nov 2026], from one set of
 * listeners on the window. Returns the teardown. The store plays nothing
 * while the interface sounds are off, so this asks freely.
 *
 * - select: a click (mouse, touch, or Enter and Space, which arrive as
 *   clicks) on a link, button, switch, option or tab, a summary, or a
 *   checkbox or radio. Heard after the page's own handlers, so a press that
 *   already ticked (a dialog opening or closing, a palette row) plays that
 *   tick alone: one tick for one press.
 * - open and close: the menu, the palette or a sound panel opening or
 *   closing, one tick for each change and one for each event; within one
 *   pointer press, one tick for the press, the last change it made (Menu
 *   pressed outside an open sound panel closes the panel at the pointerdown
 *   and opens the menu at the click: only the open is heard).
 * - hover: a mouse (never touch or pen) reaching a link, button or switch,
 *   once until it leaves that control, at most one every HOVER_GAP_MS, and
 *   never as the page scrolls under it.
 *
 * Nothing ticks on scroll, the wheel or focus moving, and calm mode leaves
 * the sound alone (calm is about motion).
 */
export function startInterfaceTicks(
  win: Window,
  {
    sound = soundStore,
    overlay = overlayStore,
    panel = soundPanelStore,
    now = () => win.performance.now(),
  }: InterfaceTicksOptions = {},
): () => void {
  let pressAt = Number.NEGATIVE_INFINITY;
  let askedAtPress = sound.ticksAsked();
  let lastHoverAt = Number.NEGATIVE_INFINITY;
  let lastScrollAt = Number.NEGATIVE_INFINITY;
  let hovered: Element | null = null;
  // An open or close already played in this task: one event, one tick.
  let hasTickedInTask = false;
  let taskTimer: number | null = null;
  // A pointer press under way, from its pointerdown to its click (or the
  // lift, when no click comes): an open or close heard meanwhile waits, and
  // the last one plays when the press ends.
  let isPointerPress = false;
  let pending: "open" | "close" | null = null;
  let pressTimer: number | null = null;

  function endPointerPress() {
    if (pressTimer !== null) win.clearTimeout(pressTimer);
    pressTimer = null;
    isPointerPress = false;
    const kind = pending;
    pending = null;
    if (kind !== null) openOrClose(kind);
  }

  function openOrClose(kind: "open" | "close") {
    if (isPointerPress) {
      pending = kind;
      return;
    }
    if (hasTickedInTask) return;
    hasTickedInTask = true;
    taskTimer = win.setTimeout(() => {
      taskTimer = null;
      hasTickedInTask = false;
    }, 0);
    sound.tick(kind);
  }

  function startPress() {
    pressAt = now();
    askedAtPress = sound.ticksAsked();
  }

  const onPressStart = (event: Event) => {
    startPress();
    if (event.type !== "pointerdown") return;
    endPointerPress();
    isPointerPress = true;
    pressTimer = win.setTimeout(endPointerPress, PRESS_MS);
  };

  // The click, if one comes, follows the lift in the same task and ends the
  // press itself; otherwise the press ends just after the lift.
  const onPressLift = () => {
    if (!isPointerPress) return;
    if (pressTimer !== null) win.clearTimeout(pressTimer);
    pressTimer = win.setTimeout(endPointerPress, 0);
  };

  const onClickStart = () => {
    if (now() - pressAt > PRESS_MS) startPress();
  };

  const onClick = (event: MouseEvent) => {
    // The press's own open or close first, so its select is not heard too.
    if (isPointerPress) endPointerPress();
    const target = elementOf(event.target)?.closest(PRESS_TARGETS) ?? null;
    if (target === null || isDisabled(target)) return;
    if (sound.ticksAsked() !== askedAtPress) return;
    sound.tick("select");
  };

  const onScroll = () => {
    lastScrollAt = now();
  };

  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const target = elementOf(event.target)?.closest(HOVER_TARGETS) ?? null;
    if (target === hovered) return;
    hovered = target;
    if (target === null || isDisabled(target) || event.buttons !== 0) return;
    const at = now();
    if (at - lastScrollAt < SCROLL_QUIET_MS) return;
    if (at - lastHoverAt < HOVER_GAP_MS) return;
    lastHoverAt = at;
    sound.tick("hover");
  };

  // Out of the window altogether: the next control it reaches is new.
  const onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget === null) hovered = null;
  };

  let overlayWas = overlay.getSnapshot();
  const stopOverlay = overlay.subscribe(() => {
    const next = overlay.getSnapshot();
    if (next === overlayWas) return;
    overlayWas = next;
    openOrClose(next === null ? "close" : "open");
  });

  let panelWas = panel.getSnapshot();
  const stopPanel = panel.subscribe(() => {
    const next = panel.getSnapshot();
    if (next === panelWas) return;
    panelWas = next;
    openOrClose(next === null ? "close" : "open");
  });

  const quiet = { capture: true, passive: true } as const;
  win.addEventListener("pointerdown", onPressStart, quiet);
  win.addEventListener("keydown", onPressStart, quiet);
  win.addEventListener("pointerup", onPressLift, quiet);
  win.addEventListener("pointercancel", onPressLift, quiet);
  win.addEventListener("click", onClickStart, quiet);
  win.addEventListener("click", onClick, { passive: true });
  win.addEventListener("scroll", onScroll, quiet);
  win.addEventListener("wheel", onScroll, quiet);
  win.addEventListener("pointerover", onPointerOver, { passive: true });
  win.addEventListener("pointerout", onPointerOut, { passive: true });

  return () => {
    stopOverlay();
    stopPanel();
    if (taskTimer !== null) win.clearTimeout(taskTimer);
    if (pressTimer !== null) win.clearTimeout(pressTimer);
    win.removeEventListener("pointerdown", onPressStart, quiet);
    win.removeEventListener("keydown", onPressStart, quiet);
    win.removeEventListener("pointerup", onPressLift, quiet);
    win.removeEventListener("pointercancel", onPressLift, quiet);
    win.removeEventListener("click", onClickStart, quiet);
    win.removeEventListener("click", onClick);
    win.removeEventListener("scroll", onScroll, quiet);
    win.removeEventListener("wheel", onScroll, quiet);
    win.removeEventListener("pointerover", onPointerOver);
    win.removeEventListener("pointerout", onPointerOut);
  };
}

/**
 * The interface sounds for every route. The root layout mounts it once; it
 * renders nothing.
 */
export function InterfaceTicks() {
  useEffect(() => startInterfaceTicks(window), []);
  return null;
}
