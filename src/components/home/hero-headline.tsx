"use client";

import { useSyncExternalStore } from "react";

import { cx } from "@/components/site/class-names";
import { headlineParts } from "@/content/hero";
import { tierStore } from "@/lib/tier-store";

type HeroHeadlineProps = {
  id: string;
  /** Classes on the headline's cell, such as its place in the hero's grid. */
  className?: string;
};

// The static HTML and the server snapshot carry the tier 3 line, which is
// true on every device. The tiers 1 and 2 line shows only while a tier 1 or
// 2 field is on screen: the tier is chosen and it has drawn. A chosen tier
// that never draws would otherwise leave the claim over an empty page. The
// tier 3 line returns while a tier changes and if it drops to 3 (D-027,
// REQ-CNT-10, A14).
//
// Two lines on every tier, the second muted; only the second changes. The
// other headline is drawn by a hidden ::before in the h1's grid cell, broken
// after the first line as the h1 is, so the cell is as tall as the taller
// form at any width and the swap moves nothing (REQ-PERF-03). It is kept in
// a data attribute rather than page text, so the static HTML never states
// the tier 1 and 2 claim, even with CSS off or in a reader view.
export function HeroHeadline({ id, className }: HeroHeadlineProps) {
  const { tier, ready } = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );
  const shown = ready && (tier === 1 || tier === 2) ? "gpu" : "still";
  const reserved = shown === "gpu" ? "still" : "gpu";

  return (
    <div
      data-reserve={`${headlineParts.first}\n${headlineParts.second[reserved]}`}
      className={cx(
        "grid grid-cols-1 before:invisible before:col-start-1 before:row-start-1 before:font-display before:text-display before:whitespace-pre-line before:content-[attr(data-reserve)]",
        className,
      )}
    >
      <h1 id={id} className="col-start-1 row-start-1 font-display text-display">
        {headlineParts.first}{" "}
        <span className="block text-muted">{headlineParts.second[shown]}</span>
      </h1>
    </div>
  );
}
