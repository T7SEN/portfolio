"use client";

import { useState, useSyncExternalStore } from "react";

import { cx } from "@/components/site/class-names";
import { story } from "@/content/story";
import { tierStore } from "@/lib/tier-store";

import { FIELD_STILLS } from "./field-stills";

/**
 * The T7SEN wordmark on tier 3, where no live field forms it: the field
 * chapter's calm frame, captured from the live field, behind the chapter's
 * label, readout and note while they hold on screen. Tiers 1 and 2 form the
 * wordmark themselves, and the static HTML has no picture, so only a tier 3
 * visitor downloads it, as the chapter nears the screen. It shows the
 * wordmark, so its alt names it (REQ-A11Y-05). The void under it keeps the
 * field still behind the page from showing through. No veil lies over it,
 * as none lies over the study stills in their frames, so the wordmark is as
 * bright as they are. The words held over it keep their contrast through
 * their own plates (held-plate.tsx): with no open veil under them, each
 * plate is the void at VEIL_TEXT itself while the still shows, which the
 * class below sets for every held plate after this element (a unit test
 * holds it to VEIL_TEXT). A failed load leaves the field still showing.
 */
export function FieldStill() {
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
    <div
      data-part="field-still"
      className={cx(
        "absolute inset-0 -z-20 bg-void transition-opacity duration-700 ease-out [&~*_[data-part=own-plate]]:[--plate:color-mix(in_srgb,var(--color-void)_80%,transparent)]",
        status === "loaded" ? "opacity-100" : "opacity-0",
      )}
    >
      <picture>
        <source media="(orientation: portrait)" srcSet={FIELD_STILLS.tall} />
        {/* A plain img: the site uses no image optimisation service. */}
        <img
          src={FIELD_STILLS.wide}
          alt={story.field.wordmarkAlt}
          decoding="async"
          loading="lazy"
          fetchPriority="low"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
    </div>
  );
}
