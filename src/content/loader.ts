import { tierReadout } from "./hero";
import type { Text, Tier } from "./types";

/** The four loading steps the cover names, in order. */
export type LoaderStepNumber = 1 | 2 | 3 | 4;

const STEP_COUNT = 4;

// The home page's loader (phase P4.5). Mono label words, stored in sentence
// case: the style sets the capitals. Each line is true on every tier: a step
// is named only while it runs, "Field ready" only once a tier 1 or 2 field
// has drawn, and tier 3 says it is a still (A14).
export const loaderCopy = {
  /** The cover's accessible name: what it waits for. */
  name: "Loading the particle field",
  steps: {
    1: "Loading the engine",
    2: "Starting the renderer",
    3: "Testing your GPU",
    4: "Drawing the field",
  },
  ready: "Field ready",
  /** The field chapter's tier 3 note, word for word (story.ts). */
  still: "Still frame on this device",
  /** The time limit came first, or the device was lost: the page opens as it is. */
  open: "Opening the page",
} as const satisfies {
  name: Text;
  steps: Record<LoaderStepNumber, Text>;
  ready: Text;
  still: Text;
  open: Text;
};

/** A step's number as the label shows it: "03 / 04". */
export function loaderStepNumber(step: LoaderStepNumber): Text {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(step)} / ${pad(STEP_COUNT)}`;
}

export type LoaderLabelInput = {
  step: LoaderStepNumber | null;
  outcome: "field" | "still" | "lost" | "limit" | null;
  tier: Tier | null;
  particles: number | null;
};

export type LoaderLabel = {
  /** For sighted readers only, in violet: "01 / 04". */
  number: Text | null;
  words: Text;
  /** The tier readout under "Field ready", from the count the field draws. */
  detail: Text | null;
  /** "Field ready", shown in the glow colour. */
  isReady: boolean;
};

/** The words under the black hole for where loading stands. */
export function loaderLabel({
  step,
  outcome,
  tier,
  particles,
}: LoaderLabelInput): LoaderLabel {
  if (outcome === "field") {
    const detail = tierReadout(tier, particles);
    // Only a tier 1 or 2 field that reported its count is ready (A14).
    if (detail !== null) {
      return {
        number: loaderStepNumber(STEP_COUNT),
        words: loaderCopy.ready,
        detail,
        isReady: true,
      };
    }
  }
  if (outcome === "still") {
    return {
      number: null,
      words: loaderCopy.still,
      detail: null,
      isReady: false,
    };
  }
  if (outcome !== null || step === null) {
    return {
      number: null,
      words: loaderCopy.open,
      detail: null,
      isReady: false,
    };
  }
  return {
    number: loaderStepNumber(step),
    words: loaderCopy.steps[step],
    detail: null,
    isReady: false,
  };
}
