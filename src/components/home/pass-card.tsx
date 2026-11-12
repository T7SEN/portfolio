"use client";

import { cx, HAIRLINE } from "@/components/site/class-names";
import { Label } from "@/components/site/label";
import { FACE_CORNERS, type FaceCorner } from "@/components/story/pass-face";
import type { PassCopy } from "@/content/passes";
import type { PassId } from "@/engine/story";

import { PassStill } from "./pass-still";

type PassCardProps = {
  pass: PassId;
  /** The pass's place in the frame, from 1. */
  number: number;
  copy: PassCopy;
  isChosen: boolean;
  /** The field draws this pass in the card's face (pass-viewer.tsx). */
  isLive: boolean;
  /** The element that says what the pass shows. */
  descriptionId: string;
  /** The breakdown the card chooses what to show in. */
  panelId: string;
  onChoose: (pass: PassId) => void;
};

const CORNER_PLACES: Record<FaceCorner, string> = {
  "top-start": "top-0 start-0",
  "top-end": "top-0 end-0",
  "bottom-end": "bottom-0 end-0",
  "bottom-start": "bottom-0 start-0",
};

// One pass of the frame: a toggle button whose face is a window the field
// draws the pass in, or a still of it, with its numbered label under it.
// From 1024 px the faces are portrait and turned, overlapping, as the
// preview sets them; below that they lie flat in a grid. The face has no
// fill while it is live, so the field shows through it, and four empty
// marks in its corners tell the field where to draw (pass-face.ts). The
// chosen face's border is drawn twice as thick from inside, so no face ever
// changes size and its corners stay where the field last read them. Only
// colours change, so calm and reduced motion have no movement to stop.
export function PassCard({
  pass,
  number,
  copy,
  isChosen,
  isLive,
  descriptionId,
  panelId,
  onChoose,
}: PassCardProps) {
  return (
    <button
      type="button"
      aria-pressed={isChosen}
      aria-controls={panelId}
      aria-describedby={descriptionId}
      data-pass={pass}
      onClick={() => onChoose(pass)}
      className={cx(
        "group/pass relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl text-start focus-visible:z-10",
        "max-sm:last:col-span-2",
        "lg:-me-6.5 lg:shrink-0 lg:items-center lg:gap-5.5 lg:text-center lg:last:me-0",
      )}
    >
      <span
        aria-hidden="true"
        data-pass-face={pass}
        data-live={isLive ? "" : undefined}
        className={cx(
          "relative block h-35 w-full overflow-hidden rounded-[0.625rem] border transition-[border-color,box-shadow] sm:h-45",
          "lg:h-67.5 lg:w-50 lg:[transform:rotateY(-34deg)] lg:rounded-xl lg:rtl:[transform:rotateY(34deg)]",
          !isLive && "bg-surface",
          isChosen
            ? "border-glow shadow-[0_0_40px_color-mix(in_srgb,var(--color-glow)_25%,transparent)]"
            : cx(HAIRLINE, "group-hover/pass:border-edge/70"),
        )}
      >
        {!isLive && <PassStill pass={pass} alt={copy.shows} />}
        <span
          className={cx(
            "absolute inset-0 rounded-[inherit] inset-ring transition-colors",
            isChosen ? "inset-ring-glow" : "inset-ring-transparent",
          )}
        />
        {FACE_CORNERS.map((corner) => (
          <span
            key={corner}
            data-corner={corner}
            className={cx("absolute size-0", CORNER_PLACES[corner])}
          />
        ))}
      </span>
      {/* The label's own box is its text's box for the veil's plates, so
          the plates never reach the face above it (story-stage.ts). */}
      <span data-plate="box" className="block">
        <Label
          as="span"
          size="xs"
          tone={isChosen ? "glow" : "muted"}
          parts={[String(number), copy.name]}
          className={cx(
            "transition-colors",
            !isChosen && "group-hover/pass:text-text",
          )}
        />
      </span>
    </button>
  );
}
