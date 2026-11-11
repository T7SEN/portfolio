import type { ChapterId } from "@/engine/types";

import { studyHref } from "./index";
import type { Text } from "./types";

/** The six chapters of the home page's scroll story, in page order (REQ-SCR-01). */
export const chapterOrder = [
  "hero",
  "bloom",
  "work",
  "making-of",
  "about",
  "contact",
] as const satisfies readonly ChapterId[];

/** A chapter's mono label: its number in the story, then its name. */
export type ChapterLabel = { number: Text; name: Text };

/** A chapter whose field is the content: a label and one plain line. */
export type SceneChapter = { label: ChapterLabel; line: Text };

/**
 * One line in two forms, keyed as the hero's headlines are. The still line is
 * true on every tier and is the one in the static HTML; the gpu line speaks
 * of the live field, so it shows only while a tier 1 or 2 field is on screen
 * (A14).
 */
export type TierLines = { gpu: Text; still: Text };

export type Story = {
  /**
   * What the field does in each chapter, for screen readers (REQ-A11Y-05).
   * Each line is true on every tier: a tier 3 visitor sees one still picture
   * of the field, so the live field is described only where it is drawn.
   */
  scenes: Record<ChapterId, Text>;
  bloom: { label: ChapterLabel; lines: TierLines };
  makingOf: SceneChapter & {
    link: { label: Text; href: ReturnType<typeof studyHref> };
  };
};

export const story = {
  scenes: {
    hero: "Where your device draws the field live, one violet dot pulses at the centre of a black screen. Otherwise one still picture of the field stays behind the page.",
    bloom:
      "Where your device draws the field live, the dot opens into a field of particles, the particles gather into the T7SEN mark, and the mark dissolves back into the flow.",
    work: "Where your device draws the field live, the particles form a simple mark for each study as its card passes, and the view moves forward through the field.",
    "making-of":
      "Where your device draws the field live, the particles flatten into one sheet the shape of the screen, facing you.",
    about:
      "Where your device draws the field live, the particles line up along a slow wave that travels across the screen.",
    contact:
      "Where your device draws the field live, the particles settle back to rest and drift gently.",
  },
  bloom: {
    label: { number: "02", name: "Bloom" },
    lines: {
      gpu: "One field becomes every project on this site.",
      still:
        "On a capable device, one field becomes every project on this site.",
    },
  },
  makingOf: {
    label: { number: "04", name: "Making-of" },
    line: "How the field is built, pass by pass.",
    link: { label: "Read the making-of", href: studyHref("making-of") },
  },
} satisfies Story;
