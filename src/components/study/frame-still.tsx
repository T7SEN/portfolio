"use client";

import { useState, useSyncExternalStore } from "react";

import { cx } from "@/components/site/class-names";
import type { FullSlug } from "@/content/types";
import { tierStore } from "@/lib/tier-store";

import { STUDY_STILLS } from "./study-stills";

type FrameStillProps = {
  slug: FullSlug;
};

/**
 * A study's shape on tier 3, where no live field forms it. Tiers 1 and 2
 * leave the frame open so the field shows through, and the static HTML has
 * no picture, so a visitor whose device draws the field never downloads it.
 * Decoration inside an aria-hidden frame, so its alt is empty; a failed load
 * leaves the frame empty.
 */
export function FrameStill({ slug }: FrameStillProps) {
  const { tier } = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );

  if (tier !== 3 || status === "failed") return null;

  return (
    <picture>
      {/* A plain img: the site uses no image optimisation service. */}
      <img
        data-part="frame-still"
        src={STUDY_STILLS[slug]}
        alt=""
        decoding="async"
        loading="lazy"
        fetchPriority="low"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("failed")}
        className={cx(
          "absolute inset-0 size-full object-cover transition-opacity duration-700 ease-out",
          status === "loaded" ? "opacity-100" : "opacity-0",
        )}
      />
    </picture>
  );
}
