/**
 * Where the visitor's two sound settings are kept between visits, in this
 * browser's local storage, each "on" or "off": the background (the bed) and
 * the interface sounds (the ticks). No server ever reads them.
 */
export const SOUND_KEY = "portfolio:sound";
export const TICKS_KEY = "portfolio:ticks";

export type SoundChoice = "on" | "off";

function localStorageOf(win: Window): Storage | null {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}

function readChoice(win: Window | undefined, key: string): SoundChoice | null {
  if (win === undefined) return null;
  try {
    const value = localStorageOf(win)?.getItem(key) ?? null;
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

function writeChoice(
  win: Window | undefined,
  key: string,
  choice: SoundChoice,
): void {
  if (win === undefined) return;
  try {
    localStorageOf(win)?.setItem(key, choice);
  } catch {
    // Blocked or full: the choice lasts for this page only, as it always did.
  }
}

/**
 * The background's choice saved on an earlier visit, or null when there is
 * none, the value is not one of ours, or storage is blocked.
 */
export function readSoundChoice(win: Window | undefined): SoundChoice | null {
  return readChoice(win, SOUND_KEY);
}

export function writeSoundChoice(
  win: Window | undefined,
  choice: SoundChoice,
): void {
  writeChoice(win, SOUND_KEY, choice);
}

/** The interface sounds' choice, read the same way. */
export function readTicksChoice(win: Window | undefined): SoundChoice | null {
  return readChoice(win, TICKS_KEY);
}

export function writeTicksChoice(
  win: Window | undefined,
  choice: SoundChoice,
): void {
  writeChoice(win, TICKS_KEY, choice);
}

/**
 * Whether the visitor has chosen either setting, on this visit or an earlier
 * one: the first-visit hint shows only while neither is saved (REQ-SND-02).
 */
export function hasSoundChoice(win: Window | undefined): boolean {
  return readSoundChoice(win) !== null || readTicksChoice(win) !== null;
}
