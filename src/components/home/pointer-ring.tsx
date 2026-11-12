"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { calmStore } from "@/lib/calm-store";
import { tierStore } from "@/lib/tier-store";

import { useFinePointer } from "./use-fine-pointer";

/** Half the ring's 44 px, so its centre sits on the pointer. */
const RING_RADIUS = 22;

/**
 * A thin ring with a dot at its centre that follows a mouse over the field
 * chapter, drawn as well as the system cursor, never instead of it. It shows
 * only where stirring does something: a tier 1 or 2 field on screen, a
 * pointer that hovers and is fine, calm mode off (which covers the OS
 * reduced motion setting, REQ-A11Y-03). It is decoration, hidden from
 * assistive technology, and takes no pointer events (REQ-A11Y-05).
 */
export function PointerRing() {
  const ringRef = useRef<HTMLDivElement>(null);
  const { tier, ready } = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );
  const { calm } = useSyncExternalStore(
    calmStore.subscribe,
    calmStore.getSnapshot,
    calmStore.getServerSnapshot,
  );
  const isFine = useFinePointer();
  const isOn = ready && (tier === 1 || tier === 2) && !calm && isFine;

  useEffect(() => {
    const ring = ringRef.current;
    const area = ring?.closest("section");
    if (!isOn || ring === null || area === null || area === undefined) return;

    let point: { x: number; y: number } | null = null;
    const show = (isShown: boolean) => {
      if (isShown) ring.dataset.shown = "true";
      else delete ring.dataset.shown;
    };
    const onMove = (event: PointerEvent) => {
      // A pen or a finger has no cursor to ring.
      if (event.pointerType !== "mouse") {
        point = null;
        show(false);
        return;
      }
      point = { x: event.clientX, y: event.clientY };
      ring.style.transform = `translate3d(${point.x - RING_RADIUS}px, ${point.y - RING_RADIUS}px, 0)`;
      show(true);
    };
    const onLeave = () => {
      point = null;
      show(false);
    };
    // A scroll can carry the chapter out from under a cursor that has not
    // moved, and no pointer event says so.
    const onScroll = () => {
      if (point === null) return;
      const box = area.getBoundingClientRect();
      show(
        point.x >= box.left &&
          point.x <= box.right &&
          point.y >= box.top &&
          point.y <= box.bottom,
      );
    };

    area.addEventListener("pointermove", onMove, { passive: true });
    area.addEventListener("pointerleave", onLeave, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      show(false);
      ring.style.transform = "";
    };
  }, [isOn]);

  // The layer reads left to right whatever the page's direction, because
  // the pointer's position is measured from the window's left edge.
  return (
    <div
      aria-hidden="true"
      dir="ltr"
      className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
    >
      <div
        ref={ringRef}
        data-part="pointer-ring"
        className="invisible absolute start-0 top-0 flex size-11 items-center justify-center rounded-full border border-text/55 data-shown:visible"
      >
        <span className="size-1.5 rounded-full bg-text" />
      </div>
    </div>
  );
}
