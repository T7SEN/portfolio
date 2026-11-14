"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { cx } from "@/components/site/class-names";
import { headlineParts } from "@/content/hero";
import { calmStore } from "@/lib/calm-store";
import { LIFT_LIMIT_MS } from "@/lib/loader-store";
import { tierStore } from "@/lib/tier-store";

type HeroHeadlineProps = {
  id: string;
  /** Classes on the headline's cell, such as its place in the hero's grid. */
  className?: string;
};

/**
 * The second line in calm mode and under reduced motion, where no cover
 * hides the swap [T7SEN, 14 Nov 2026, "Hold the line"]. pending: the static
 * HTML and hydration, where only CSS can hold it. held: hidden, its room
 * kept, until the tier is known. shown: from then on, whatever calm does.
 */
export type SecondLine = "pending" | "held" | "shown";

/**
 * Before hydration the inline first paint script has marked the html
 * element data-loader-off="calm" or "reduced" (loader-script.ts), and these
 * hold the line from the first paint, so the tier 3 words are never painted
 * there. They run the cover's failsafe keyframes (globals.css) in reverse:
 * their end, transparent and hidden, fills the delay, then the line fades
 * in. So a page whose script never hydrates still shows it, at the cover's
 * own 11 s (LIFT_LIMIT_MS plus FAILSAFE_MARGIN_MS). The global reduced
 * motion rule shortens the fade and leaves the delay alone.
 */
export const HELD_BEFORE_HYDRATION =
  "[html[data-loader-off=calm]_&]:[animation:loader-failsafe_0.3s_ease-out_11s_reverse_backwards] [html[data-loader-off=reduced]_&]:[animation:loader-failsafe_0.3s_ease-out_11s_reverse_backwards]";

const noSubscription = () => () => {};
const onClient = () => true;
const onServer = () => false;

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
//
// With the cover up the swap happens under it. In calm mode and under
// reduced motion no cover shows, so the second line waits, hidden with its
// room kept, until the tier store is ready, then shows once with that
// tier's words. While it waits it is out of the h1's name, which reads
// "Real-time worlds," and claims nothing (A14). It waits at most
// LIFT_LIMIT_MS from mount; then the tier 3 words show, which are true
// anyway. Calm turned off meanwhile does not end the wait, so the words
// still do not shift, and nothing hides a line once it has shown.
export function HeroHeadline({ id, className }: HeroHeadlineProps) {
  const hydrated = useSyncExternalStore(noSubscription, onClient, onServer);
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
  const [line, setLine] = useState<SecondLine>("pending");
  const [isLate, setLate] = useState(false);

  // Decided while rendering, so no frame shows the line between hydration
  // and the hold.
  let next = line;
  if (next === "pending" && hydrated) next = calm && !ready ? "held" : "shown";
  if (next === "held" && (ready || isLate)) next = "shown";
  if (next !== line) setLine(next);

  const isHeld = next === "held";
  useEffect(() => {
    if (!isHeld) return;
    const timer = window.setTimeout(() => setLate(true), LIFT_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [isHeld]);

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
        <span
          aria-hidden={isHeld ? true : undefined}
          className={cx(
            "block text-muted",
            next === "pending" && HELD_BEFORE_HYDRATION,
            isHeld && "invisible",
          )}
        >
          {headlineParts.second[shown]}
        </span>
      </h1>
    </div>
  );
}
