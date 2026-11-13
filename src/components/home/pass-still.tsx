"use client";

import { useCallback, useState } from "react";

import type { PassId } from "@/engine/story";

import { PASS_STILLS } from "./pass-stills";

type PassStillProps = {
  pass: PassId;
  /** What the still shows. */
  alt: string;
};

/**
 * A still of a pass, in its card's face. It is in the static HTML, so every
 * card shows its pass before any script runs, and with none (REQ-CNT-01);
 * it loads late, since the cards sit far down the page. A failed load
 * removes it and leaves the card's own fill. In the still grid its alt text
 * is read with the card; in the sliding row the face is hidden from
 * assistive technology, and its button is described by the same words.
 */
export function PassStill({ pass, alt }: PassStillProps) {
  const [hasFailed, setHasFailed] = useState(false);
  // A still that failed before the page's script ran sent its error event
  // to nobody, so its state is read once React holds it.
  const readState = useCallback((image: HTMLImageElement | null) => {
    if (image !== null && image.complete && image.naturalWidth === 0) {
      setHasFailed(true);
    }
  }, []);

  if (hasFailed) return null;

  return (
    <picture>
      {/* A plain img: the site uses no image optimisation service. */}
      <img
        ref={readState}
        data-part="pass-still"
        src={PASS_STILLS[pass]}
        alt={alt}
        decoding="async"
        loading="lazy"
        fetchPriority="low"
        onError={() => setHasFailed(true)}
        className="absolute inset-0 size-full object-cover"
      />
    </picture>
  );
}
