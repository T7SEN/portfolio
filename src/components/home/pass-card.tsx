"use client";

import { useRef } from "react";

import { cx, HAIRLINE } from "@/components/site/class-names";
import { Panel } from "@/components/site/panel";
import { FACE_CORNERS, type FaceCorner } from "@/components/story/pass-face";
import type { PassCopy } from "@/content/passes";
import type { PassId } from "@/engine/story";

import { PassStill } from "./pass-still";

type PassCardProps = {
  pass: PassId;
  /** "Pass 2 of 5", over the pass's name. */
  position: string;
  copy: PassCopy;
  /** The row slides (pass-viewer.tsx); otherwise the cards lie still in a grid. */
  isSliding: boolean;
  /** The card in the middle of a sliding row: the field forms the mark in it. */
  isMiddle: boolean;
  /** The field draws this pass in the card's face (pass-viewer.tsx). */
  isLive: boolean;
  /**
   * The row slides over a field drawn live, so a face that shows nothing of
   * its own is open to the field behind it.
   */
  seesField: boolean;
  /** The element that says what the pass's picture shows. */
  descriptionId: string;
  /** Takes the row to this card: gliding, or at once. */
  onShow: (pass: PassId, glide: boolean) => void;
};

const CORNER_PLACES: Record<FaceCorner, string> = {
  "top-start": "top-0 start-0",
  "top-end": "top-0 end-0",
  "bottom-end": "bottom-0 end-0",
  "bottom-start": "bottom-0 start-0",
};

/**
 * Why a sliding card's button is taking focus, where its focus ring cannot
 * tell: the click's own call, which glides; the window coming back, which
 * hands focus back to the button that had it; or nothing known.
 */
type FocusCause = "pointer" | "return" | null;

// One pass of the frame: a face the field draws the pass in, or a still of
// it, with the pass's number, name and breakdown under it. The face is a
// window with no fill while it is live, so the field shows through it, and
// four empty marks in its corners tell the field where to draw
// (pass-face.ts). In a sliding row the face is a button that takes the row
// to this card, beside its words from 1024 px; the card in the middle has
// the lavender border and glow, and the other faces are dimmed, while every
// card's words keep their full colour (REQ-A11Y-06). The breakdown sits on
// its own surface (data-plate="own"), since it moves sideways with the row
// and the veil's plates cannot follow it. In the still grid the face sits
// above its words at the size phones give it, so three columns fit from
// 1024 px, and its still is read with its alt text.
export function PassCard({
  pass,
  position,
  copy,
  isSliding,
  isMiddle,
  isLive,
  seesField,
  descriptionId,
  onShow,
}: PassCardProps) {
  const cause = useRef<FocusCause>(null);
  const isMarked = isSliding && isMiddle;
  // In the sliding row only the middle card shows the mark: drawn live by
  // the field, or its still where its pass is not drawn live. The other
  // faces are empty frames, as a work frame is before its shape forms, so a
  // card the particles have left keeps nothing of them; over a field drawn
  // live they are open, so the particles streaming from card to card show
  // as they pass. The still grid shows every still.
  const showsStill = !isLive && (!isSliding || isMiddle);
  const hasFill = !isLive && (showsStill || !seesField);
  const face = (
    <span
      aria-hidden={isSliding ? "true" : undefined}
      data-pass-face={pass}
      data-live={isLive ? "" : undefined}
      data-middle={isMarked ? "" : undefined}
      className={cx(
        "relative block aspect-[4/5] h-[32svh] max-h-65 overflow-hidden rounded-xl border",
        isSliding &&
          "transition-[border-color,box-shadow,opacity] duration-500 motion-reduce:transition-none lg:h-[min(52svh,25rem)] lg:max-h-none",
        isSliding && !isMiddle && "opacity-35",
        hasFill && "bg-surface",
        isMarked
          ? "border-glow shadow-[0_0_40px_color-mix(in_srgb,var(--color-glow)_25%,transparent)]"
          : HAIRLINE,
      )}
    >
      {showsStill && <PassStill pass={pass} alt={copy.shows} />}
      {FACE_CORNERS.map((corner) => (
        <span
          key={corner}
          data-corner={corner}
          className={cx("absolute size-0", CORNER_PLACES[corner])}
        />
      ))}
    </span>
  );

  return (
    <li
      data-pass={pass}
      aria-current={isMarked ? "step" : undefined}
      className={cx(
        "flex min-w-0 flex-col items-center gap-4",
        isSliding &&
          "w-(--pass-w) shrink-0 lg:flex-row lg:items-center lg:gap-10",
      )}
    >
      {isSliding ? (
        <button
          type="button"
          aria-label={`${position}: ${copy.title}`}
          aria-describedby={descriptionId}
          onClick={(event) => {
            // Safari and Firefox on macOS give a clicked button no focus.
            // Taking it here keeps Tab going on from the card shown, on
            // every browser, and its focus ends a wheel glide first
            // (smooth-scroll-session.ts), which would cut this glide short.
            // A pointer's click on the button that already has focus takes
            // it again, so that glide ends then too.
            const target = event.currentTarget;
            if (
              event.detail > 0 &&
              target.ownerDocument.activeElement === target
            ) {
              target.blur();
            }
            cause.current = "pointer";
            target.focus({ preventScroll: true });
            cause.current = null;
            onShow(pass, true);
          }}
          // Tab shows its card at once. A pointer's own focus shows no ring
          // and waits for its click, which glides; so does the focus taken
          // above. The focus the window hands back on its return leaves the
          // page where the visitor scrolled it.
          onFocus={(event) => {
            const why = cause.current;
            cause.current = null;
            if (why === null && event.currentTarget.matches(":focus-visible")) {
              onShow(pass, false);
            }
          }}
          onBlur={(event) => {
            cause.current = event.currentTarget.ownerDocument.hasFocus()
              ? null
              : "return";
          }}
          className="shrink-0 cursor-pointer rounded-xl"
        >
          {face}
        </button>
      ) : (
        <span className="shrink-0">{face}</span>
      )}
      <Panel
        padding="md"
        className={cx(
          "w-full min-w-0",
          isSliding && "lg:max-w-[28rem] lg:flex-1",
        )}
      >
        <div data-plate="own">
          <p className="font-mono text-[0.6875rem] leading-[1.4] tracking-[0.14em] text-violet uppercase">
            {position}
          </p>
          <h3 className="mt-2 font-display text-[1.25rem] leading-tight font-semibold sm:text-[1.5rem]">
            {copy.title}
          </h3>
          <p className="mt-3 text-[0.9375rem] leading-[1.55] text-muted lg:text-base">
            {copy.body[0]}
          </p>
          <p className="mt-2.5 text-[0.9375rem] leading-[1.55] text-muted lg:text-base">
            {copy.body[1]}
          </p>
        </div>
      </Panel>
    </li>
  );
}
