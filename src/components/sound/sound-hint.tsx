"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useFinePointer } from "@/components/home/use-fine-pointer";
import { useShortcutKeys } from "@/components/interface/menu-shortcut";
import { cx } from "@/components/site/class-names";
import { soundCopy } from "@/content/sound";
import { hasSoundChoice, readSoundChoice } from "@/lib/sound-choice";
import { soundPanelStore } from "@/lib/sound-panel-store";
import { soundStore } from "@/lib/sound-store";

import { type SoundNotice, watchHintMoment } from "./hint-moment";

/** The hint's fade out, matched by its duration class. */
export const HINT_FADE_MS = 200;

/** The least room kept between the hint and the screen's edges, in px. */
export const HINT_GUTTER = 16;

/** Half the pointer's 12 px width, so its tip sits on the pill's middle. */
const POINTER_HALF = 6;

/**
 * Keeps the hint inside the screen at its full width and its pointer on the
 * pill's middle [T7SEN, 15 Nov 2026: on phones it "wraps to four lines"].
 * The box hangs from the pill's end; where that crosses a gutter, as from
 * the 44 px square about 120 px from the start at 320 px, it moves along by
 * the overlap, and the pointer moves back by as much. Measured, so it holds
 * in either direction of text.
 */
export function placeHint(
  box: HTMLElement,
  pointer: SVGElement,
  pill: HTMLElement,
): void {
  box.style.removeProperty("translate");
  const width = box.ownerDocument.documentElement.clientWidth;
  const rect = box.getBoundingClientRect();
  let shift = 0;
  if (rect.left < HINT_GUTTER) shift = HINT_GUTTER - rect.left;
  else if (rect.right > width - HINT_GUTTER) {
    shift = width - HINT_GUTTER - rect.right;
  }
  if (shift !== 0) box.style.setProperty("translate", `${shift}px 0`);
  const target = pill.getBoundingClientRect();
  const middle = target.left + target.width / 2;
  const left = rect.left + shift;
  const isRtl = getComputedStyle(box).direction === "rtl";
  const fromStart = isRtl ? left + rect.width - middle : middle - left;
  pointer.style.setProperty("inset-inline-end", "auto");
  pointer.style.setProperty(
    "inset-inline-start",
    `${Math.round(fromStart - POINTER_HALF)}px`,
  );
}

type Phase = "pending" | "shown" | "leaving" | "gone";

export type SoundHintProps = {
  /** Replaced by a fake in unit tests. */
  afterFirstContent?: (run: () => void) => () => void;
};

// Whether the words still have a part to play: the hint while both settings
// are off, the note while the background waits for the first click or key.
function stillFits(kind: SoundNotice): boolean {
  const { status, ticks } = soundStore.getSnapshot();
  if (kind === "note") return status === "waiting";
  return status === "off" && ticks === "off";
}

// Asked at the moment: the hint only while no choice of either setting is
// saved (one made since the page loaded counts too), and never over an open
// panel.
function canShow(kind: SoundNotice): boolean {
  if (soundPanelStore.getSnapshot() !== null || !stillFits(kind)) return false;
  return kind === "note" || !hasSoundChoice(window);
}

/**
 * The box under the bar's sound pill (REQ-SND-02). On a first visit, with
 * neither sound setting saved, the one-time hint in T7SEN's words, "The
 * field has sound. Turn it on here, or any time from Ctrl K." (Command K on
 * Apple devices, search on a touch screen); for a visitor who left the
 * background on, while the page waits for the first click or key, the note "Sound starts on your first
 * click or key." [T7SEN, 15 Nov 2026]; after any other saved choice,
 * nothing, since that visitor has met the pill. A raised box with a small
 * pointer at the pill. Not a dialog: it takes no focus, holds no control
 * and never catches a pointer. Its words land in a polite status region
 * that is in the page from the start, so they are announced once, as they
 * appear. It sits under the bar, never over the bar's other controls, and
 * goes when the pill's panel opens in its place.
 */
export function SoundHint({ afterFirstContent }: SoundHintProps) {
  const [phase, setPhase] = useState<Phase>("pending");
  const [notice, setNotice] = useState<SoundNotice>("hint");
  const keys = useShortcutKeys();
  const finePointer = useFinePointer();
  const status = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLParagraphElement>(null);
  const pointer = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Read in the effect, after hydration, as the sound store reads it.
    const kind: SoundNotice =
      readSoundChoice(window) === "on" ? "note" : "hint";
    if (kind === "hint" && hasSoundChoice(window)) return;
    let fade: ReturnType<typeof setTimeout> | null = null;
    let isShown = false;
    const leave = () => {
      if (!isShown) return;
      isShown = false;
      setPhase("leaving");
      fade = setTimeout(() => setPhase("gone"), HINT_FADE_MS);
    };
    const stopMoment = watchHintMoment({
      afterFirstContent,
      notice: kind,
      canShow: () => canShow(kind),
      onShow: () => {
        isShown = true;
        setNotice(kind);
        setPhase("shown");
      },
      onHide: leave,
    });
    // A setting turned on, or one that failed: the words have done their
    // part. The panel opening: it takes the box's place.
    const onChange = () => {
      if (soundPanelStore.getSnapshot() === null && stillFits(kind)) return;
      stopMoment();
      leave();
    };
    const stopSound = soundStore.subscribe(onChange);
    const stopPanel = soundPanelStore.subscribe(onChange);
    return () => {
      stopMoment();
      stopSound();
      stopPanel();
      if (fade !== null) clearTimeout(fade);
    };
  }, [afterFirstContent]);

  const isVisible = phase === "shown" || phase === "leaving";

  // Placed before the first paint of the box, and again as the screen
  // changes size; the words change with the keyboard and the pointer.
  useLayoutEffect(() => {
    const element = box.current;
    const tip = pointer.current;
    const pill = status.current?.parentElement?.querySelector<HTMLElement>(
      '[data-part="sound-pill"]',
    );
    if (!isVisible || element === null || tip === null || !pill) return;
    const place = () => placeHint(element, tip, pill);
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isVisible, notice, keys, finePointer]);

  return (
    <div
      ref={status}
      role="status"
      data-part="sound-hint"
      className="pointer-events-none absolute end-0 top-full z-40 mt-2.5"
    >
      {isVisible && (
        <p
          ref={box}
          data-notice={notice}
          data-leaving={phase === "leaving" ? "" : undefined}
          className={cx(
            "relative w-max max-w-[min(17rem,calc(100vw-2rem))] rounded-[0.625rem] border border-edge/40 bg-raised px-4 py-2.5 text-[0.8125rem] leading-snug text-text shadow-[0_0.5rem_1.5rem_rgb(0_0_0/0.45)]",
            "transition-opacity duration-200 ease-out data-leaving:opacity-0 motion-reduce:transition-none starting:opacity-0",
          )}
        >
          {/* Points at the pill's middle (placeHint), a 44 px square below
              640 px, the pill's speaker and bars from 640 px; the classes
              hold it near there until the first measure. */}
          <svg
            ref={pointer}
            aria-hidden="true"
            viewBox="0 0 12 6"
            className="absolute end-4 bottom-full block h-1.5 w-3 fill-raised stroke-edge/40 sm:end-10"
          >
            <path d="M0 6 6 0 12 6" />
          </svg>
          {notice === "hint"
            ? soundCopy.hint(finePointer ? keys : null)
            : soundCopy.note}
        </p>
      )}
    </div>
  );
}
