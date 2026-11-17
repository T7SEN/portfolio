import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOADER_ATTRIBUTE } from "@/components/loader/loader-config";

import {
  hasSeenHint,
  HINT_DELAY_MS,
  HINT_KEY,
  HINT_SHOW_MS,
  resetHintForTests,
  type SoundNotice,
  watchHintMoment,
} from "./hint-moment";

type Watch = {
  firstContent(): void;
  cancelFirstContent: ReturnType<typeof vi.fn>;
  onShow: ReturnType<typeof vi.fn>;
  onHide: ReturnType<typeof vi.fn>;
  stop: () => void;
};

function watch(
  canShow: () => boolean = () => true,
  notice?: SoundNotice,
): Watch {
  let run: (() => void) | null = null;
  const cancelFirstContent = vi.fn();
  const onShow = vi.fn();
  const onHide = vi.fn();
  const stop = watchHintMoment({
    afterFirstContent: (next) => {
      run = next;
      return cancelFirstContent;
    },
    notice,
    canShow,
    onShow,
    onHide,
  });
  return {
    firstContent: () => run?.(),
    cancelFirstContent,
    onShow,
    onHide,
    stop,
  };
}

const html = () => document.documentElement;

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  resetHintForTests();
  html().removeAttribute(LOADER_ATTRIBUTE);
});

afterEach(() => {
  vi.useRealTimers();
  html().removeAttribute(LOADER_ATTRIBUTE);
});

describe("the sound hint's moment", () => {
  it("REQ-SND-02 shows once the hero settles: after first content and the delay, and is remembered at once", async () => {
    const hint = watch();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS * 4);
    expect(hint.onShow).not.toHaveBeenCalled();

    hint.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS - 1);
    expect(hint.onShow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hint.onShow).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(HINT_KEY)).not.toBeNull();
    hint.stop();
  });

  it("REQ-SND-02 REQ-LOAD-01 never shows while the home page's cover is up; the wait starts when it goes", async () => {
    html().setAttribute(LOADER_ATTRIBUTE, "up");
    const hint = watch();
    hint.firstContent();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(hint.onShow).not.toHaveBeenCalled();

    html().setAttribute(LOADER_ATTRIBUTE, "done");
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS - 1);
    expect(hint.onShow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hint.onShow).toHaveBeenCalledTimes(1);
    hint.stop();
  });

  it("REQ-SND-02 REQ-LOAD-01 a cover that comes up during the wait starts it again", async () => {
    const hint = watch();
    hint.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS - 100);
    html().setAttribute(LOADER_ATTRIBUTE, "up");
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS * 2);
    expect(hint.onShow).not.toHaveBeenCalled();
    html().setAttribute(LOADER_ATTRIBUTE, "done");
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    expect(hint.onShow).toHaveBeenCalledTimes(1);
    hint.stop();
  });

  it("REQ-SND-02 goes on the first scroll", async () => {
    const hint = watch();
    hint.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    window.dispatchEvent(new Event("scroll"));
    expect(hint.onHide).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(HINT_SHOW_MS);
    expect(hint.onHide).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-02 goes by itself after a few seconds", async () => {
    const hint = watch();
    hint.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS + HINT_SHOW_MS - 1);
    expect(hint.onHide).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hint.onHide).toHaveBeenCalledTimes(1);
    expect(HINT_SHOW_MS).toBe(6000);
  });

  it("REQ-SND-02 REQ-LOAD-01 goes when a cover comes up over the page", async () => {
    const hint = watch();
    hint.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    html().setAttribute(LOADER_ATTRIBUTE, "up");
    await vi.advanceTimersByTimeAsync(0);
    expect(hint.onHide).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-02 never shows when sound is no longer off at its moment", async () => {
    const hint = watch(() => false);
    hint.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS * 2);
    expect(hint.onShow).not.toHaveBeenCalled();
    expect(hasSeenHint(window)).toBe(false);
  });

  it("REQ-SND-02 never repeats for the same visitor", async () => {
    const first = watch();
    first.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    expect(first.onShow).toHaveBeenCalledTimes(1);
    first.stop();

    // A later visit: a new tab, the same browser storage.
    resetHintForTests();
    const later = watch();
    later.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS * 2);
    expect(later.onShow).not.toHaveBeenCalled();
  });

  it("REQ-SND-02 with storage blocked it shows once per tab", async () => {
    const own = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      const first = watch();
      first.firstContent();
      await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
      expect(first.onShow).toHaveBeenCalledTimes(1);
      first.stop();

      const again = watch();
      again.firstContent();
      await vi.advanceTimersByTimeAsync(HINT_DELAY_MS * 2);
      expect(again.onShow).not.toHaveBeenCalled();
    } finally {
      if (own === undefined) {
        Reflect.deleteProperty(window, "localStorage");
      } else {
        Object.defineProperty(window, "localStorage", own);
      }
    }
  });

  it("REQ-SND-02 the returning visitor's note shows once the hero settles, once per page load, and is never saved", async () => {
    const note = watch(() => true, "note");
    note.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS - 1);
    expect(note.onShow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(note.onShow).toHaveBeenCalledTimes(1);
    expect(window.localStorage.length).toBe(0);
    note.stop();

    // A move inside the site: the same load.
    const again = watch(() => true, "note");
    again.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS * 2);
    expect(again.onShow).not.toHaveBeenCalled();

    // A new load of the page.
    resetHintForTests();
    const reload = watch(() => true, "note");
    reload.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    expect(reload.onShow).toHaveBeenCalledTimes(1);
    reload.stop();
  });

  it("REQ-SND-02 REQ-LOAD-01 the note waits for the home page's cover, as the hint does", async () => {
    html().setAttribute(LOADER_ATTRIBUTE, "up");
    const note = watch(() => true, "note");
    note.firstContent();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(note.onShow).not.toHaveBeenCalled();
    html().setAttribute(LOADER_ATTRIBUTE, "done");
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    expect(note.onShow).toHaveBeenCalledTimes(1);
    note.stop();
  });

  it("REQ-SND-02 the note goes on the first scroll, or by itself after about 6 s", async () => {
    const scrolled = watch(() => true, "note");
    scrolled.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    window.dispatchEvent(new Event("scroll"));
    expect(scrolled.onHide).toHaveBeenCalledTimes(1);

    resetHintForTests();
    const timed = watch(() => true, "note");
    timed.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS + HINT_SHOW_MS - 1);
    expect(timed.onHide).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(timed.onHide).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-02 the note shows after the hint was seen, and never when the sound no longer waits at its moment", async () => {
    window.localStorage.setItem(HINT_KEY, "seen");
    const late = watch(() => false, "note");
    late.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS * 2);
    expect(late.onShow).not.toHaveBeenCalled();

    const note = watch(() => true, "note");
    note.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    expect(note.onShow).toHaveBeenCalledTimes(1);
    note.stop();
  });

  it("REQ-SND-02 the cancel ends every wait without calling onHide", async () => {
    const hint = watch();
    hint.firstContent();
    await vi.advanceTimersByTimeAsync(HINT_DELAY_MS);
    hint.stop();
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(HINT_SHOW_MS);
    expect(hint.onHide).not.toHaveBeenCalled();
    expect(hint.cancelFirstContent).toHaveBeenCalled();
  });
});
