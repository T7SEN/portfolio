"use client";

import { type RefObject, useEffect } from "react";

import { soundStore } from "@/lib/sound-store";

import { type Band, barScale, createBarMeter } from "./levels";

/**
 * The order in which bars of these drawn heights take bands: the tallest bar
 * the lowest band, the next tallest the next band and so on. The bed is
 * loudest low down, so the cluster keeps the drawn outline as it moves.
 */
export function bandOrder(heights: readonly number[]): number[] {
  const ranked = heights
    .map((height, index) => ({ height, index }))
    .sort((a, b) => b.height - a.height || a.index - b.index);
  const order = new Array<number>(heights.length).fill(0);
  ranked.forEach(({ index }, rank) => {
    order[index] = rank;
  });
  return order;
}

/**
 * Moves a row of drawn bars with the sound while active: each bar's height
 * scales, from its centre, with how its band moves around its own recent
 * level (levels.ts createBarMeter), from the store's frame loop. When
 * not active (sound off, calm mode, reduced motion) every bar rests at its
 * drawn height. The bars are plain elements, moved by style, so a frame
 * never renders React.
 */
export function useSpectrumBars(
  bars: RefObject<(HTMLElement | null)[]>,
  bands: readonly Band[],
  order: readonly number[],
  active: boolean,
) {
  useEffect(() => {
    const rest = () => {
      for (const bar of bars.current) bar?.style.removeProperty("transform");
    };
    if (!active) {
      rest();
      return;
    }
    const meter = createBarMeter(bands, order);
    const stop = soundStore.subscribeSpectrum((spectrum, elapsedMs) => {
      const levels = meter(spectrum, elapsedMs);
      bars.current.forEach((bar, index) => {
        bar?.style.setProperty(
          "transform",
          `scaleY(${barScale(levels[index] ?? 0).toFixed(3)})`,
        );
      });
    });
    return () => {
      stop();
      rest();
    };
  }, [bars, bands, order, active]);
}
