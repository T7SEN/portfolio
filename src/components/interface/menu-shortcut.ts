import { useSyncExternalStore } from "react";

import type { ShortcutKeys } from "@/content/site";

type PlatformNavigator = Navigator & {
  userAgentData?: { platform?: string };
};

const APPLE = /^(?:mac|iphone|ipad|ipod|ios)/i;

/**
 * Whether the keyboard's command key is Command, as on a Mac, an iPhone or
 * an iPad, where the palette opens with Command K rather than Ctrl K. The
 * client hints' platform first, then the older platform string, which iPadOS
 * reports as MacIntel.
 */
export function isApplePlatform(
  nav: PlatformNavigator | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): boolean {
  if (nav === undefined) return false;
  const platform = nav.userAgentData?.platform || nav.platform || "";
  return APPLE.test(platform);
}

const noChange = () => () => undefined;
const clientKeys = (): ShortcutKeys => (isApplePlatform() ? "⌘ K" : "Ctrl K");
const serverKeys = (): ShortcutKeys => "Ctrl K";

/**
 * The palette's keys as this visitor's keyboard labels them. The static HTML
 * says Ctrl K; an Apple device reads Command K once the page hydrates.
 */
export function useShortcutKeys(): ShortcutKeys {
  return useSyncExternalStore(noChange, clientKeys, serverKeys);
}
