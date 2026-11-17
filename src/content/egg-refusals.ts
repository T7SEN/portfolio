import type { Text } from "./types";

/** Why an easter egg did not play, as the page tells it (A14). */
export type EggRefusal =
  | "no-field-page"
  | "no-field-yet"
  | "still"
  | "still-chosen"
  | "calm"
  | "calm-system";

// Apart from the palette's words, so the bar's logo and the typed codes can
// say them without bringing the palette's text into every first load.
export const eggRefusals = {
  "no-field-page": "There is no field on this page. The home page plays it.",
  "no-field-yet": "The field has not drawn yet. Try again in a moment.",
  still: "This device shows a still frame of the field, so it cannot move.",
  "still-chosen":
    "You chose the still frame in Quality tier, so the field cannot move. Choose Auto to see it.",
  calm: "Calm mode is on, so the field holds still.",
  "calm-system":
    "Your device asks for reduced motion, so the field holds still.",
} as const satisfies Record<EggRefusal, Text>;
