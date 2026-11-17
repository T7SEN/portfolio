"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import { cx } from "@/components/site/class-names";
import { pillClassName } from "@/components/site/pill";
import { soundCopy, type SoundWordsKey } from "@/content/sound";
import { calmStore } from "@/lib/calm-store";
import { overlayStore } from "@/lib/overlay-store";
import { soundPanelStore } from "@/lib/sound-panel-store";
import {
  type SoundStatus,
  soundStore,
  type TicksStatus,
} from "@/lib/sound-store";

import { logBands } from "./levels";
import { SoundHint } from "./sound-hint";
import { SoundPanelBody } from "./sound-panel";
import { bandOrder, useSpectrumBars } from "./spectrum-bars";

/**
 * bar: the bar's control, a pill from 640 px and a 44 px square icon button
 * below, with the one-time hint under it. menu: the same control for the
 * menu's own bar, without the hint. footer: the footer's pill, the same at
 * every width, its panel opening in place under it, in the page's flow, so it
 * covers no footer link on a narrow screen [T7SEN, 15 Nov 2026].
 */
export type SoundToggleVariant = "bar" | "menu" | "footer";

/** The five level bars' drawn heights in px, as they rest. */
export const LEVEL_BARS = [3, 6, 12, 8, 4] as const;

/** The least room kept between the panel and the screen's edges, in px. */
export const PANEL_GUTTER = 16;

const LEVEL_BANDS = logBands(LEVEL_BARS.length, 40, 6000);
const LEVEL_ORDER = bandOrder(LEVEL_BARS);

/** The pill's words for the two settings. */
export function wordsKey(
  status: SoundStatus,
  ticks: TicksStatus,
): SoundWordsKey {
  if (status === "failed" || ticks === "failed") return "failed";
  // Starting and waiting count as on: the visitor chose the background and
  // it is on its way.
  const hasBackground = status !== "off";
  const hasTicks = ticks === "on";
  if (hasBackground) return hasTicks ? "on" : "background";
  return hasTicks ? "interface" : "off";
}

/** A speaker: two waves while either setting is on, a cross when one failed. */
function SpeakerIcon({
  state,
  className,
}: {
  state: "off" | "on" | "failed";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("size-4 shrink-0", className)}
    >
      <path d="M2.5 6h2.4L8.5 3v10L4.9 10H2.5z" />
      {state === "on" && (
        <path
          d="M10.75 5.75a3.2 3.2 0 0 1 0 4.5M12.6 3.9a5.8 5.8 0 0 1 0 8.2"
          className="text-glow"
        />
      )}
      {state === "failed" && <path d="M11 6.25l3.5 3.5M14.5 6.25 11 9.75" />}
    </svg>
  );
}

// Keeps a floating panel inside the screen: it hangs from the pill's end
// (the bar's, the menu's), and where that would cross a gutter, as from the 44 px square about 120 px from the start at 320 px,
// it moves along by the overlap. Measured, so it holds in either direction.
function keepOnScreen(panel: HTMLElement) {
  panel.style.removeProperty("translate");
  const box = panel.getBoundingClientRect();
  const width = panel.ownerDocument.documentElement.clientWidth;
  let shift = 0;
  if (box.left < PANEL_GUTTER) shift = PANEL_GUTTER - box.left;
  else if (box.right > width - PANEL_GUTTER) {
    shift = width - PANEL_GUTTER - box.right;
  }
  if (shift !== 0) panel.style.setProperty("translate", `${shift}px 0`);
}

/**
 * The site's sound control [T7SEN, 15 Nov 2026]: a pill that opens a small
 * panel with two switches, Background and Interface sounds, each on or off
 * on its own (REQ-SND-01, REQ-SND-03). The pill holds a speaker, five small
 * level bars and the state in words ("Sound off", "Sound on", "Background
 * only", "Interface only"); the bars move only while the background plays,
 * and rest as drawn in calm mode or under reduced motion. It is a
 * disclosure button (aria-expanded, aria-controls) whose name starts with
 * its words, then "Sound settings". The panel is not a dialog: it takes no
 * page away, opening moves focus to its first switch, Tab moves through it,
 * Esc closes it and gives focus back to the pill, and a press outside or
 * focus leaving closes it. The pill and the switches are sound controls, so
 * while a returning visitor's background waits, pressing them never also
 * starts it (sound-store.ts).
 */
export function SoundToggle({ variant }: { variant: SoundToggleVariant }) {
  const { status, ticks } = useSyncExternalStore(
    soundStore.subscribe,
    soundStore.getSnapshot,
    soundStore.getServerSnapshot,
  );
  const { calm } = useSyncExternalStore(
    calmStore.subscribe,
    calmStore.getSnapshot,
    calmStore.getServerSnapshot,
  );
  const id = useId();
  const panelId = `${id}panel`;
  const isOpen =
    useSyncExternalStore(
      soundPanelStore.subscribe,
      soundPanelStore.getSnapshot,
      soundPanelStore.getServerSnapshot,
    ) === id;
  const inPlace = variant === "footer";
  const wrapper = useRef<HTMLSpanElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const firstSwitch = useRef<HTMLButtonElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useSpectrumBars(bars, LEVEL_BANDS, LEVEL_ORDER, status === "on" && !calm);

  // Placed before the first paint, and again as the screen changes size.
  useLayoutEffect(() => {
    const box = panel.current;
    if (!isOpen || box === null || inPlace) return;
    keepOnScreen(box);
    const place = () => keepOnScreen(box);
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isOpen, inPlace]);

  useEffect(() => {
    if (!isOpen) return;
    firstSwitch.current?.focus();
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && wrapper.current?.contains(target) === true;
    const close = () => soundPanelStore.close(id);
    // On the window, before the document hears it, so the menu's dialog
    // (Radix closes on Escape from the document) stays open: one Esc closes
    // one thing.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      pill.current?.focus();
    };
    const onPress = (event: PointerEvent) => {
      if (!isInside(event.target)) close();
    };
    const onFocus = (event: FocusEvent) => {
      if (!isInside(event.target)) close();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("focusin", onFocus);
    // The menu or the palette opening, or the menu closing round this pill,
    // takes the panel with it. An overlay opened from inside the panel (Ctrl
    // K on a switch) gives focus back to the pill, since the switch goes.
    const stopOverlay = overlayStore.subscribe(() => {
      const box = panel.current;
      const button = pill.current;
      if (box !== null && button !== null) {
        overlayStore.passReturnFocus(box, button);
      }
      close();
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("focusin", onFocus);
      stopOverlay();
    };
  }, [isOpen, id]);

  // Unmounted while open (the menu's pill as the menu goes): the store must
  // not keep a panel no pill shows.
  useEffect(() => () => soundPanelStore.close(id), [id]);

  const key = wordsKey(status, ticks);
  const hasBackground = status !== "off" && status !== "failed";
  const speaker = key === "failed" ? "failed" : key === "off" ? "off" : "on";
  // Below 640 px the bar and the menu show a square icon button.
  const square = variant !== "footer";
  return (
    // The footer's pill and panel join the footer's own row (contents), so
    // the panel can take a line of its own under both pills there and move
    // neither of them.
    <span
      ref={wrapper}
      className={inPlace ? "contents" : "relative inline-flex"}
    >
      <button
        ref={pill}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={soundCopy.toggle.names[key]}
        data-part="sound-pill"
        data-sound={status}
        data-ticks={ticks}
        data-background={hasBackground ? "" : undefined}
        data-sound-control=""
        onClick={() => {
          // A first click like any other: a background left on starts here,
          // inside the press, as the waiting note promises.
          soundStore.resumeWaiting();
          if (isOpen) soundPanelStore.close(id);
          else soundPanelStore.open(id);
        }}
        className={cx(
          "group",
          pillClassName({
            variant: "quiet",
            size: variant === "footer" ? "sm" : "bar",
            gap: false,
          }),
          "gap-2.5",
          square && "max-sm:size-11 max-sm:rounded-xl max-sm:px-0",
        )}
      >
        {/* The preview sets the speaker further from the bars than the bars
            from the words; alone in the square, it keeps to the middle. */}
        <SpeakerIcon
          state={speaker}
          className={cx("me-2", square && "max-sm:me-0")}
        />
        <span
          aria-hidden="true"
          className={cx(
            "flex h-3.5 shrink-0 items-center gap-[3px]",
            square && "max-sm:hidden",
          )}
        >
          {LEVEL_BARS.map((height, index) => (
            <span
              key={index}
              ref={(element) => {
                bars.current[index] = element;
              }}
              style={{ height }}
              className="block w-0.5 rounded-full bg-muted transition-[transform,background-color] duration-150 ease-out group-data-background:bg-violet motion-reduce:transition-none"
            />
          ))}
        </span>
        <span className={cx(square && "max-sm:hidden")}>
          {soundCopy.toggle.words[key]}
        </span>
      </button>

      {isOpen && !inPlace && (
        // Points at the pill's middle, joining the panel's edge.
        <svg
          aria-hidden="true"
          viewBox="0 0 12 6"
          className="absolute inset-x-0 top-full z-50 mx-auto mt-1 block h-1.5 w-3 fill-raised stroke-edge/40"
        >
          <path d="M0 6 6 0 12 6" />
        </svg>
      )}
      <div
        ref={panel}
        id={panelId}
        role="group"
        aria-label={soundCopy.panel.name}
        data-part="sound-panel"
        hidden={!isOpen}
        className={cx(
          "w-64 max-w-[calc(100vw-2rem)] rounded-[0.625rem] border border-edge/40 bg-raised p-1.5 text-start",
          "transition-opacity duration-150 ease-out motion-reduce:transition-none starting:opacity-0",
          // In place: last in the footer's row, its end margin filling the
          // rest of the line, so it wraps onto a line of its own under the
          // pills and pushes what follows down, covering nothing.
          inPlace
            ? "order-last me-[calc(100%-16rem)]"
            : "absolute end-0 top-full z-50 mt-2.5 shadow-[0_0.5rem_1.5rem_rgb(0_0_0/0.45)]",
        )}
      >
        {isOpen && (
          <SoundPanelBody
            status={status}
            ticks={ticks}
            firstRef={firstSwitch}
            onBackground={() => soundStore.toggleBackground()}
            onTicks={() => soundStore.toggleTicks()}
          />
        )}
      </div>
      {variant === "bar" && <SoundHint />}
    </span>
  );
}
