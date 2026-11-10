"use client";

import { useSyncExternalStore } from "react";

import { headlines } from "@/content/hero";
import { tierStore } from "@/lib/tier-store";

type HeroHeadlineProps = {
  id: string;
  /** The line in the static HTML, kept until a tier 1 or 2 field has drawn. */
  text: string;
};

// The static HTML and the server snapshot carry the tier 3 line, which is
// true on every device. The tiers 1 and 2 line shows only while a tier 1 or
// 2 field is on screen: the tier is chosen and it has drawn. A chosen tier
// that never draws would otherwise leave the claim over an empty page. The
// first line returns while a tier changes and if it drops to 3 (D-027,
// REQ-CNT-10, A14).
//
// The other headline is drawn by a hidden ::before in the h1's grid cell, so
// the cell is as tall as the longer line at any width and the swap moves
// nothing (REQ-PERF-03). Kept in a data attribute rather than page text, so
// the static HTML never states the tier 1 and 2 claim, even with CSS off or
// in a reader view.
export function HeroHeadline({ id, text }: HeroHeadlineProps) {
  const { tier, ready } = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );
  const shown = ready && (tier === 1 || tier === 2) ? headlines.gpu : text;
  const reserved = shown === headlines.still ? headlines.gpu : headlines.still;

  return (
    <div
      data-reserve={reserved}
      className="grid grid-cols-1 before:invisible before:col-start-1 before:row-start-1 before:font-display before:text-display before:content-[attr(data-reserve)]"
    >
      <h1 id={id} className="col-start-1 row-start-1 font-display text-display">
        {shown}
      </h1>
    </div>
  );
}
