"use client";

import { useSyncExternalStore } from "react";

import { cx } from "@/components/site/class-names";
import { DotJoined } from "@/components/study/dot-joined";
import { tierLabel, tierReadout } from "@/content/hero";
import { tierStore } from "@/lib/tier-store";

/**
 * hero: the phone hero's line under See the work, with the count the field
 * really draws ("Tier 2 · WebGL2 · 100K particles"). field: the field
 * chapter's readout at its top end, a small violet dot and the tier.
 */
export type TierReadoutVariant = "hero" | "field";

type TierReadoutProps = {
  variant: TierReadoutVariant;
  className?: string;
};

// Both read the tier the engine reported, and say nothing until it is ready,
// so nothing is claimed before the device has shown it (A14). The static
// HTML holds the empty line, which keeps its height, so the words arriving
// move nothing. Both are plain text, not live regions: a status would
// announce the tier at load wherever the reader is, and a reader who
// reaches the chapter or the hero finds the line there.
export function TierReadout({ variant, className }: TierReadoutProps) {
  const { tier, ready, particles } = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );

  if (variant === "hero") {
    const words = ready ? tierReadout(tier, particles) : null;
    return (
      <p
        data-part="tier-readout"
        className={cx(
          "min-h-[1.4em] font-mono text-[0.6875rem] leading-[1.4] tracking-[0.08em] text-muted uppercase",
          className,
        )}
      >
        {words !== null && <DotJoined parts={words.split(" · ")} />}
      </p>
    );
  }

  return (
    <p
      data-part="tier-readout"
      className={cx(
        "flex min-h-[1.4em] items-center gap-2.5 font-mono text-xs leading-[1.4] tracking-[0.08em] text-text",
        className,
      )}
    >
      {ready && tier !== null && (
        <>
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-violet"
          />
          <span>
            <DotJoined parts={tierLabel(tier).split(" · ")} />
          </span>
        </>
      )}
    </p>
  );
}
