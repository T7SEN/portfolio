import { afterFirstContent } from "@/components/engine/after-first-content";
import { LOADER_ATTRIBUTE } from "@/components/loader/loader-config";

/** Where the hint is remembered as seen, for this visitor (REQ-SND-02). */
export const HINT_KEY = "portfolio:sound-hint";

/** From the hero settling to the hint. */
export const HINT_DELAY_MS = 1500;

/** The longest the hint stays when nothing sends it away sooner. */
export const HINT_SHOW_MS = 6000;

/**
 * The words a moment is for: the first visit's hint, remembered for the
 * visitor, or the note for a visitor who left sound on, once per page load.
 */
export type SoundNotice = "hint" | "note";

// With storage blocked the hint still shows only once in this tab: this
// flag outlives every move inside the site.
let seenInTab = false;

// The note is never saved: a new load of the page shows it again while the
// sound waits. This flag outlives every move inside the site.
let noteShownInLoad = false;

function localStorageOf(win: Window): Storage | null {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}

export function hasSeenHint(win: Window): boolean {
  if (seenInTab) return true;
  try {
    return (localStorageOf(win)?.getItem(HINT_KEY) ?? null) !== null;
  } catch {
    return false;
  }
}

export function markHintSeen(win: Window) {
  seenInTab = true;
  try {
    localStorageOf(win)?.setItem(HINT_KEY, "seen");
  } catch {
    // Blocked or full: the tab's flag keeps it to once.
  }
}

/** Forgets the tab's and the load's flags; storage is the test's own to clear. */
export function resetHintForTests() {
  seenInTab = false;
  noteShownInLoad = false;
}

export type HintMomentOptions = {
  win?: Window;
  /** Replaced by a fake in unit tests. */
  afterFirstContent?: (run: () => void) => () => void;
  /** Which words this moment is for; the hint when left out. */
  notice?: SoundNotice;
  /**
   * Asked at the moment the words would show: whether sound is still off
   * (the hint) or still waiting (the note).
   */
  canShow(): boolean;
  onShow(): void;
  onHide(): void;
};

/**
 * When the one-time sound hint, or the returning visitor's note, shows and
 * goes (REQ-SND-02). It waits for the hero to settle: first content, then no
 * loader cover up (the home page's cover lifts after first content), then
 * HINT_DELAY_MS. A cover that comes up while it waits (a move to "/" from
 * inside the site) starts the wait again. It shows only while canShow says
 * so; the hint is remembered at once for the visitor, the note for this page
 * load. It goes on the first scroll, after HINT_SHOW_MS, or when a cover
 * comes up. Returns the cancel, which ends it without onHide.
 */
export function watchHintMoment(options: HintMomentOptions): () => void {
  const win = options.win ?? window;
  const doc = win.document;
  const whenFirstContent = options.afterFirstContent ?? afterFirstContent;
  const isNote = options.notice === "note";
  const isDone = () => (isNote ? noteShownInLoad : hasSeenHint(win));
  if (isDone()) return () => undefined;

  let isOver = false;
  let isShown = false;
  let timer: number | null = null;
  let observer: MutationObserver | null = null;
  let cancelFirstContent: (() => void) | null = null;

  const isCoverUp = () =>
    doc.documentElement.getAttribute(LOADER_ATTRIBUTE) === "up";

  function clearTimer() {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  }

  function watchCover(onChange: () => void) {
    observer?.disconnect();
    observer = new MutationObserver(onChange);
    observer.observe(doc.documentElement, {
      attributes: true,
      attributeFilter: [LOADER_ATTRIBUTE],
    });
  }

  function stopWatchingCover() {
    observer?.disconnect();
    observer = null;
  }

  function cleanUp() {
    isOver = true;
    clearTimer();
    stopWatchingCover();
    cancelFirstContent?.();
    win.removeEventListener("scroll", hide);
  }

  function hide() {
    if (!isShown) return;
    isShown = false;
    cleanUp();
    options.onHide();
  }

  function show() {
    stopWatchingCover();
    if (isOver || isDone() || !options.canShow()) {
      cleanUp();
      return;
    }
    if (isNote) noteShownInLoad = true;
    else markHintSeen(win);
    isShown = true;
    options.onShow();
    win.addEventListener("scroll", hide, { passive: true });
    timer = win.setTimeout(hide, HINT_SHOW_MS);
    watchCover(() => {
      if (isCoverUp()) hide();
    });
  }

  function wait() {
    if (isOver) return;
    if (isCoverUp()) {
      watchCover(() => {
        if (!isCoverUp()) wait();
      });
      return;
    }
    clearTimer();
    timer = win.setTimeout(() => {
      timer = null;
      show();
    }, HINT_DELAY_MS);
    watchCover(() => {
      if (!isCoverUp()) return;
      clearTimer();
      wait();
    });
  }

  cancelFirstContent = whenFirstContent(wait);
  return cleanUp;
}
