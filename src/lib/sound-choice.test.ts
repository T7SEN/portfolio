import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hasSoundChoice,
  readSoundChoice,
  readTicksChoice,
  SOUND_KEY,
  TICKS_KEY,
  writeSoundChoice,
  writeTicksChoice,
} from "./sound-choice";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("sound choices", () => {
  it("REQ-SND-01 the background and the interface sounds are saved and read each on its own key", () => {
    expect(SOUND_KEY).toBe("portfolio:sound");
    expect(TICKS_KEY).toBe("portfolio:ticks");
    writeTicksChoice(window, "on");
    expect(readTicksChoice(window)).toBe("on");
    expect(readSoundChoice(window)).toBeNull();
    writeSoundChoice(window, "off");
    expect(readSoundChoice(window)).toBe("off");
    expect(readTicksChoice(window)).toBe("on");
    expect(window.localStorage.getItem(TICKS_KEY)).toBe("on");
    expect(window.localStorage.getItem(SOUND_KEY)).toBe("off");
  });

  it("REQ-SND-01 a value that is not ours reads as no choice", () => {
    window.localStorage.setItem(TICKS_KEY, "loud");
    expect(readTicksChoice(window)).toBeNull();
    expect(readSoundChoice(undefined)).toBeNull();
  });

  it("REQ-SND-02 either setting saved counts as a choice", () => {
    expect(hasSoundChoice(window)).toBe(false);
    window.localStorage.setItem(TICKS_KEY, "off");
    expect(hasSoundChoice(window)).toBe(true);
    window.localStorage.clear();
    window.localStorage.setItem(SOUND_KEY, "on");
    expect(hasSoundChoice(window)).toBe(true);
  });

  it("REQ-SND-01 with storage blocked nothing throws and nothing is read", () => {
    const blocked = {} as Window;
    Object.defineProperty(blocked, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
    expect(() => writeTicksChoice(blocked, "on")).not.toThrow();
    expect(() => writeSoundChoice(blocked, "on")).not.toThrow();
    expect(readTicksChoice(blocked)).toBeNull();
    expect(hasSoundChoice(blocked)).toBe(false);
  });
});
