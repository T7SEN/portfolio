import type { Text } from "./types";

/**
 * What the sound pill shows for: both settings off, both on (the background
 * starting or waiting for the first click counts as on), the background
 * only, the interface sounds only, and either one failed.
 */
export type SoundWordsKey =
  "off" | "on" | "background" | "interface" | "failed";

/** One of the panel's two switches: its words and the muted line under them. */
type SwitchWords = { label: Text; line: Text };

// The site's sound (phase P5, REQ-SND-01 to 03), from 15 Nov 2026 in two
// settings [T7SEN, 15 Nov 2026]. Each line says only what the sound does on
// this device: the pill names the state and opens the panel, the hint says
// nothing the pill does not, and the
// waveform's caption changes in calm mode, where the bars rest whatever
// plays (A14).
export const soundCopy = {
  toggle: {
    /** The words on the pill. */
    words: {
      off: "Sound off",
      on: "Sound on",
      background: "Background only",
      interface: "Interface only",
      failed: "Sound failed",
    },
    /**
     * The pill's accessible name: the words shown, then what it opens. It
     * starts with the words on the pill, so a visitor who speaks them is
     * understood (WCAG 2.5.3, axe's label-content-name-mismatch).
     */
    names: {
      off: "Sound off. Sound settings",
      on: "Sound on. Sound settings",
      background: "Background only. Sound settings",
      interface: "Interface only. Sound settings",
      failed: "Sound failed. Sound settings",
    },
  },
  /** The panel the pill opens: its name and its two switches. */
  panel: {
    name: "Sound settings",
    background: { label: "Background", line: "Rain at sea" },
    ticks: { label: "Interface sounds", line: "Clicks and hovers" },
    /** In a switch's muted line when its setting could not start. */
    failed: "Could not start. Press to try again",
  },
  /**
   * The one-time hint under the bar's pill (REQ-SND-02) [T7SEN, 15 Nov 2026]:
   * "The field has sound. Turn it on here, or any time from Ctrl K." keys is
   * the palette's keys as this keyboard names them (Ctrl K, or Command K on
   * Apple devices), or null on a touch screen, where the palette is the
   * search button.
   */
  hint: (keys: string | null): Text =>
    `The field has sound. Turn it on here, or any time from ${keys ?? "search"}.`,
  /**
   * In the hint's place, for a visitor who left the background on at an
   * earlier visit, while the page waits for the first click or key [T7SEN,
   * 15 Nov 2026].
   */
  note: "Sound starts on your first click or key.",
  waveform: {
    /** The caption beside the /about waveform; mono capitals on screen. */
    caption: "With the background sound on, this waveform follows it",
    /** The caption in calm mode or under reduced motion, where it rests. */
    calm: "In calm mode, this waveform stays still",
  },
} as const satisfies {
  toggle: {
    words: Record<SoundWordsKey, Text>;
    names: Record<SoundWordsKey, Text>;
  };
  panel: {
    name: Text;
    background: SwitchWords;
    ticks: SwitchWords;
    failed: Text;
  };
  hint: (keys: string | null) => Text;
  note: Text;
  waveform: { caption: Text; calm: Text };
};
