"use client";

import { useState } from "react";

import { cx } from "@/components/site/class-names";

/**
 * The tier 3 picture: one frame captured from the live field, wide or tall
 * to suit the screen. It shows the field between formations, no mark, and
 * sits inside an aria-hidden wrapper, so it is decoration and its alt is
 * empty. WebP, chosen by size (e2e/gpu/stills.spec.ts). A failed load
 * removes it and leaves the plain background.
 */
export function TierStill() {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );

  if (status === "failed") return null;

  return (
    <picture>
      <source media="(orientation: portrait)" srcSet="/still/field-tall.webp" />
      {/* A plain img: the site uses no image optimisation service. */}
      <img
        data-part="still"
        src="/still/field-wide.webp"
        alt=""
        decoding="async"
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
