"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { calmStore } from "@/lib/calm-store";
import { storyBridge } from "@/lib/story-bridge";
import { tierStore } from "@/lib/tier-store";

import { createEngineSession, type EngineSession } from "./engine-session";
import { startPointerInput } from "./pointer-input";
import { TierStill } from "./tier-still";

// The routes that show the field. Every other route hides the wrapper, so
// the engine pauses by itself and a route that never had the field loads no
// 3D code (REQ-CNT-02).
const FIELD_ROUTES: readonly string[] = ["/"];

/**
 * The field's place behind the page. The root layout renders it once, so the
 * engine's host element and its canvas survive every route change
 * (REQ-ENG-01). It starts transparent and fades in when the engine reports
 * ready (REQ-PERF-07).
 */
export function EngineHost() {
  const isFieldRoute = FIELD_ROUTES.includes(usePathname());
  const { tier } = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );
  const { calm } = useSyncExternalStore(
    calmStore.subscribe,
    calmStore.getSnapshot,
    calmStore.getServerSnapshot,
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<EngineSession | null>(null);
  // A still field has nothing to stir, and calm sends no active pointer.
  const canStir = isFieldRoute && !calm && tier !== 3;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const host = hostRef.current;
    if (wrapper === null || host === null) return;

    const session = createEngineSession(wrapper, host);
    sessionRef.current = session;

    return () => {
      sessionRef.current = null;
      void session.dispose();
    };
  }, []);

  useEffect(() => {
    if (!isFieldRoute) return;
    return sessionRef.current?.request();
  }, [isFieldRoute]);

  // The cursor or a finger stirs the field anywhere in the window
  // (REQ-SCR-06). Leaving the route, turning calm on or unmounting removes
  // every listener.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!canStir || wrapper === null) return;
    return startPointerInput({
      send: storyBridge.setPointer,
      area: () => wrapper.getBoundingClientRect(),
    });
  }, [canStir]);

  return (
    <div
      ref={wrapperRef}
      data-testid="engine-field"
      aria-hidden="true"
      hidden={!isFieldRoute}
      className="pointer-events-none fixed inset-0 -z-10 opacity-0 transition-opacity duration-700 ease-out [--field-veil:0.7] data-[ready=true]:opacity-100"
    >
      {/* The engine owns this element and the canvas inside it. React never
          renders children here. */}
      <div ref={hostRef} data-part="host" className="absolute inset-0" />
      {tier === 3 && isFieldRoute ? <TierStill /> : null}
      {/* Dims the field so the text over it keeps 4.5 to 1 against the
          brightest pixel behind it. The strength is --field-veil on the
          wrapper, set from the headed contrast measurement. */}
      <div
        data-part="veil"
        className="absolute inset-0 bg-void opacity-(--field-veil)"
      />
    </div>
  );
}
