"use client";

import { useRef, useSyncExternalStore } from "react";

import { cx, MONO_CAPS } from "@/components/site/class-names";
import { soundCopy } from "@/content/sound";
import { calmStore } from "@/lib/calm-store";
import { soundStore } from "@/lib/sound-store";

import { logBands } from "./levels";
import { bandOrder, useSpectrumBars } from "./spectrum-bars";

/** bright: violet. mid and dim: glow at 70% and 50%, as the artboard has them. */
type Tone = "bright" | "mid" | "dim";

/** The twelve bars of the /about artboard: drawn height in px and tone. */
export const WAVE_BARS: readonly { height: number; tone: Tone }[] = [
  { height: 30, tone: "dim" },
  { height: 70, tone: "mid" },
  { height: 100, tone: "bright" },
  { height: 54, tone: "mid" },
  { height: 110, tone: "bright" },
  { height: 80, tone: "mid" },
  { height: 40, tone: "dim" },
  { height: 96, tone: "bright" },
  { height: 60, tone: "mid" },
  { height: 24, tone: "dim" },
  { height: 88, tone: "bright" },
  { height: 46, tone: "mid" },
];

const TONES: Record<Tone, string> = {
  bright: "bg-violet",
  mid: "bg-glow/70",
  dim: "bg-glow/50",
};

const WAVE_BANDS = logBands(WAVE_BARS.length, 40, 8000);
const WAVE_ORDER = bandOrder(WAVE_BARS.map(({ height }) => height));

/**
 * The waveform's bars and caption, the one client island of the /about
 * panel. Its first render is the static HTML: the bars as drawn and the
 * caption. With sound on the bars follow the sound (REQ-SND-03); with sound
 * off, in calm mode or under reduced motion they rest as drawn, and in calm
 * mode the caption says so, since the bars then stay still whatever plays.
 */
export function WaveformCluster() {
  const { status } = useSyncExternalStore(
    soundStore.subscribe,
    soundStore.getSnapshot,
    soundStore.getServerSnapshot,
  );
  const { calm } = useSyncExternalStore(
    calmStore.subscribe,
    calmStore.getSnapshot,
    calmStore.getServerSnapshot,
  );
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useSpectrumBars(bars, WAVE_BANDS, WAVE_ORDER, status === "on" && !calm);

  return (
    <>
      <span
        aria-hidden="true"
        data-part="waveform-bars"
        className="flex h-28 shrink-0 items-center gap-1.5"
      >
        {WAVE_BARS.map(({ height, tone }, index) => (
          <span
            key={index}
            ref={(element) => {
              bars.current[index] = element;
            }}
            style={{ height }}
            className={cx(
              "block w-[5px] rounded-full transition-transform duration-150 ease-out motion-reduce:transition-none",
              TONES[tone],
            )}
          />
        ))}
      </span>
      <figcaption
        className={cx(
          MONO_CAPS,
          "text-center text-xs leading-relaxed tracking-[0.18em] text-muted sm:text-start",
        )}
      >
        {calm ? soundCopy.waveform.calm : soundCopy.waveform.caption}
      </figcaption>
    </>
  );
}
