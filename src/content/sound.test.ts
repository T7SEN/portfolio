import { describe, expect, it } from "vitest";

import { soundCopy } from "./sound";

// An en dash, an em dash, an exclamation mark or a spaced hyphen.
const DASH_OR_BANG = /[\u2013\u2014!]|\x20-\x20/;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

const KEYS = ["off", "on", "background", "interface", "failed"] as const;

describe("sound words", () => {
  it("REQ-SND-01 the pill's four states in words, and its names start with them, then say what it opens", () => {
    expect(soundCopy.toggle.words).toEqual({
      off: "Sound off",
      on: "Sound on",
      background: "Background only",
      interface: "Interface only",
      failed: "Sound failed",
    });
    for (const key of KEYS) {
      // WCAG 2.5.3: the name starts with the words the pill shows.
      expect(soundCopy.toggle.names[key]).toBe(
        `${soundCopy.toggle.words[key]}. Sound settings`,
      );
    }
    expect(soundCopy.toggle.names.background).toBe(
      "Background only. Sound settings",
    );
  });

  it("REQ-SND-01 REQ-SND-03 the panel names its two switches and what each plays", () => {
    expect(soundCopy.panel.name).toBe("Sound settings");
    expect(soundCopy.panel.background).toEqual({
      label: "Background",
      line: "Rain at sea",
    });
    expect(soundCopy.panel.ticks).toEqual({
      label: "Interface sounds",
      line: "Clicks and hovers",
    });
    expect(soundCopy.panel.failed).toMatch(/try again/i);
  });

  it("REQ-SND-02 the hint has T7SEN's words, with the palette's keys as the keyboard names them, or search on a touch screen", () => {
    expect(soundCopy.hint("Ctrl K")).toBe(
      "The field has sound. Turn it on here, or any time from Ctrl K.",
    );
    expect(soundCopy.hint("⌘ K")).toBe(
      "The field has sound. Turn it on here, or any time from ⌘ K.",
    );
    expect(soundCopy.hint(null)).toBe(
      "The field has sound. Turn it on here, or any time from search.",
    );
  });

  it("REQ-SND-02 the returning visitor's note says when the sound starts, in T7SEN's words", () => {
    expect(soundCopy.note).toBe("Sound starts on your first click or key.");
  });

  it("REQ-SND-03 A14 the waveform's caption names its condition, and in calm mode says it stays still", () => {
    expect(soundCopy.waveform.caption).toBe(
      "With the background sound on, this waveform follows it",
    );
    expect(soundCopy.waveform.calm).toMatch(/calm mode/i);
    expect(soundCopy.waveform.calm).toMatch(/still/);
  });

  it("REQ-HYG-06 no dash as punctuation and no exclamation mark", () => {
    const texts = strings(soundCopy);
    expect(texts.length).toBeGreaterThan(5);
    for (const text of texts) expect(text).not.toMatch(DASH_OR_BANG);
  });
});
