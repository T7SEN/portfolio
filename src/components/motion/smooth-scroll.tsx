"use client";

import { useEffect } from "react";

import { calmStore } from "@/lib/calm-store";

import { COARSE_POINTER_QUERY } from "./should-smooth-scroll";
import { createSmoothScroll } from "./smooth-scroll-session";

function coarsePointerQuery(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === "function"
      ? window.matchMedia(COARSE_POINTER_QUERY)
      : null;
  } catch {
    return null;
  }
}

/**
 * Smooth wheel scrolling on desktop, on every route. The root layout mounts
 * it once; it renders nothing and loads Lenis only after first content
 * (REQ-PERF-04, REQ-SCR-03).
 */
export function SmoothScroll() {
  useEffect(() => {
    const session = createSmoothScroll({
      calm: calmStore,
      pointer: coarsePointerQuery(),
    });
    return () => session.dispose();
  }, []);

  return null;
}
