"use client";

import { useSyncExternalStore } from "react";

import type { TierLines } from "@/content/story";
import { tierStore } from "@/lib/tier-store";

type BloomLineProps = {
  lines: TierLines;
};

// The hero headline's rule (D-027, A14): the static HTML and the server
// snapshot carry the still line, which is true on every device, and the gpu
// line shows only while a tier 1 or 2 field is on screen. The still line
// returns while a tier changes and if it drops to 3.
//
// Both lines arrive as props: src/content/story.ts imports the study index,
// and importing it here would put every study's text in the client bundle.
// The other line is drawn by a hidden ::before in the same grid cell, so the
// cell is as tall as the longer line at any width and the heading above it
// never moves (REQ-PERF-03). The type sits on the cell for the line and the
// ::before to inherit, because the measure is in em and must be read at the
// lead size.
export function BloomLine({ lines }: BloomLineProps) {
  const { tier, ready } = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );
  const isLive = ready && (tier === 1 || tier === 2);
  const shown = isLive ? lines.gpu : lines.still;
  const reserved = isLive ? lines.still : lines.gpu;

  return (
    <div
      data-reserve={reserved}
      className="mt-3 grid max-w-measure grid-cols-1 text-lead before:invisible before:col-start-1 before:row-start-1 before:content-[attr(data-reserve)]"
    >
      <p className="col-start-1 row-start-1">{shown}</p>
    </div>
  );
}
