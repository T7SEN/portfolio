import type { ChapterId } from "@/engine/types";

import type { Text, Tier } from "./types";

// This file imports nothing at run time, so a client island may read it
// without bringing every study's text into the client bundle.

export type { TierLines } from "./types";

/** The six chapters of the home page's scroll story, in page order (REQ-SCR-01). */
export const chapterOrder = [
  "hero",
  "bloom",
  "work",
  "making-of",
  "about",
  "contact",
] as const satisfies readonly ChapterId[];

/** A chapter's mono label: its number in the story, then its name ("01 / Field"). */
export type ChapterLabel = { number: Text; name: Text };

/** Every chapter after the hero carries a label; the hero is the intro. */
export type LabelledChapter = Exclude<ChapterId, "hero">;

/** How the visitor can stir the field: a pointer that hovers, or a finger. */
export type FieldInput = "pointer" | "touch";

export type FieldNotes = Record<FieldInput, Text> & { still: Text };

export type Story = {
  /**
   * What the field draws in each chapter, for screen readers (REQ-A11Y-05).
   * Each line is true on every tier: a tier 3 visitor sees one still picture
   * of the field, so the live field is described only where it is drawn.
   * It is true of both looks too: a device that cannot draw the halftone
   * draws the soft field (D-076), which has no white dots, no rings round
   * the dot and no halo, so the lines name none of them.
   */
  scenes: Record<ChapterId, Text>;
  labels: Record<LabelledChapter, ChapterLabel>;
  field: {
    /** The note at the field chapter's foot, one per state. */
    notes: FieldNotes;
    /** The alt text of the tier 3 still of the field chapter, the wordmark. */
    wordmarkAlt: Text;
  };
};

export const story = {
  scenes: {
    hero: "Where your device draws the field live, a bright dot of violet light pulses beside the headline, or above it on a narrow screen. Otherwise one still picture of the field stays behind the page.",
    bloom:
      "Where your device draws the field live, the dot opens into a field of violet and lavender light; the light gathers into the T7SEN mark, the mark turns into the T7SEN wordmark, and the wordmark dissolves into flow lines that curve across the screen.",
    work: "Where your device draws the field live, each full study's shape forms inside its frame as its row comes into view: layered sheets for the making-of, five fanned cards for Coup Online and a chat bubble with three lines for ArcheLab.",
    "making-of":
      "Where your device draws the field live, the light flattens into one sheet behind the pass cards and the panel, and each card it draws live shows that pass of the frame as it is drawn.",
    about:
      "Where your device draws the field live, three thin strands of light, one bright and two faint, wave slowly across the full width of the screen.",
    contact:
      "Where your device draws the field live, the light settles into faint concentric rings behind the contact panel.",
  },
  labels: {
    bloom: { number: "01", name: "Field" },
    work: { number: "02", name: "Work" },
    "making-of": { number: "03", name: "Making-of" },
    about: { number: "04", name: "About" },
    contact: { number: "05", name: "Contact" },
  },
  field: {
    notes: {
      pointer: "Move the cursor to stir the field",
      touch: "Drag a finger to stir the field.",
      still: "Still frame on this device",
    },
    wordmarkAlt: "The T7SEN wordmark formed in the particle field",
  },
} satisfies Story;

export type FieldState = {
  tier: Tier | null;
  /** The chosen tier has drawn its first frame, or shows its still. */
  ready: boolean;
  calm: boolean;
  input: FieldInput;
};

/**
 * The field chapter's note for the visitor's state. Calm mode shows none.
 * Tier 3 says it is a still. The stir hint shows only while a tier 1 or 2
 * field is on screen, and nothing shows before the tier is ready (A14).
 */
export function fieldNote({
  tier,
  ready,
  calm,
  input,
}: FieldState): Text | null {
  if (calm || !ready || tier === null) return null;
  if (tier === 3) return story.field.notes.still;
  return story.field.notes[input];
}
