import { useSyncExternalStore } from "react";

/** A pointer that hovers and is precise: a mouse or a trackpad. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

function queryOf(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return null;
  return window.matchMedia(FINE_POINTER_QUERY);
}

function subscribe(listener: () => void) {
  const query = queryOf();
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

const getSnapshot = () => queryOf()?.matches ?? false;
const getServerSnapshot = () => false;

/**
 * Whether the visitor's primary pointer hovers and is fine, watched live, so
 * a laptop with a touch screen follows whichever it uses. A browser that
 * cannot answer counts as touch.
 */
export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
