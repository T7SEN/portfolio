import type { ChapterId } from "@/engine/types";
import { calmStore, type CalmStore } from "@/lib/calm-store";
import type { Motion } from "@/lib/load-motion";
import {
  storyBridge,
  type StoryBridge,
  type StoryState,
} from "@/lib/story-bridge";

import { REVEAL_START, TITLE_FADE, TITLE_REVEAL } from "./motion-timing";
import { readStoryElements } from "./story-dom";
import { isReached, resolveStory, sameStory } from "./story-progress";

/** The parts of GSAP the story uses. */
export type StoryMotion = {
  gsap: Pick<Motion["gsap"], "context" | "fromTo">;
  ScrollTrigger: Pick<
    Motion["ScrollTrigger"],
    "create" | "refresh" | "addEventListener" | "removeEventListener"
  >;
  SplitText: Pick<Motion["SplitText"], "create">;
};

export type StoryOptions = {
  /** The page's main element: every chapter and title sits inside it. */
  root: HTMLElement;
  bridge?: Pick<StoryBridge, "setStory">;
  calm?: Pick<CalmStore, "getSnapshot" | "subscribe">;
  view?: Pick<Window, "innerHeight">;
  fonts?: Pick<FontFaceSet, "ready"> | null;
};

type Trigger = ReturnType<StoryMotion["ScrollTrigger"]["create"]>;
type Split = ReturnType<StoryMotion["SplitText"]["create"]>;
type Context = ReturnType<StoryMotion["gsap"]["context"]>;

// gsap.context does not restore the page's current context when its
// function throws (gsap-core.js 3.15.1, Context.add), so every animation made
// later anywhere on the page would land in the failed one. The function
// given to it therefore never throws: the error is kept and thrown again once
// the context has returned.
function contained(run: () => void) {
  const state: { failure?: { error: unknown } } = {};
  const body = () => {
    try {
      run();
    } catch (error) {
      state.failure = { error };
    }
  };
  const rethrow = () => {
    if (state.failure) throw state.failure.error;
  };
  return { body, rethrow };
}

/**
 * Starts the scroll story on the home page and returns its teardown.
 *
 * One ScrollTrigger per chapter maps the scroll position to the chapter at
 * the middle of the viewport and how far through it the page is, and sends
 * that to the field through the story bridge (REQ-SCR-01). Nothing is
 * pinned or snapped, and scrolling keeps its native speed (REQ-SCR-02).
 * Chapter titles below the fold rise into view once; in calm mode or under
 * reduced motion they fade in whole instead (REQ-SCR-05, REQ-A11Y-03).
 *
 * The teardown reverts every animation and split, kills every trigger and
 * removes every listener (REQ-SCR-04). If setting up fails part way, the
 * same teardown runs before the error is passed on, so no text stays hidden
 * (REQ-CNT-01).
 */
export function startStory(
  motion: StoryMotion,
  options: StoryOptions,
): () => void {
  const { gsap, ScrollTrigger, SplitText } = motion;
  const {
    root,
    bridge = storyBridge,
    calm = calmStore,
    view = window,
    fonts = "fonts" in document ? document.fonts : null,
  } = options;
  const { chapters, steps, titles } = readStoryElements(root);

  const chapterTriggers: Array<{ chapter: ChapterId; trigger: Trigger }> = [];
  const stepTriggers: Trigger[] = [];
  const revealTriggers: Trigger[] = [];
  const splits: Split[] = [];
  // Titles that need nothing more: revealed, or already in view at the start.
  const settled = new Set<HTMLElement>();
  let context: Context | null = null;
  let revealContext: Context | null = null;
  let unsubscribeCalm: (() => void) | null = null;
  let isCalm = false;
  let last: StoryState | null = null;
  // Each trigger measures itself as it is created, so nothing is sent until
  // every chapter has its trigger.
  let isReady = false;
  let isStopped = false;

  // Reads every trigger at once, so the order in which ScrollTrigger calls
  // them never matters. ScrollTrigger calls no onUpdate while it refreshes,
  // and announces the end of a refresh, so positions are never half updated.
  function report() {
    const first = chapterTriggers[0];
    if (!isReady || isStopped || first === undefined) return;
    const next = resolveStory(
      first.trigger.scroll(),
      chapterTriggers.map(({ chapter, trigger }) => ({
        chapter,
        start: trigger.start,
        end: trigger.end,
      })),
      stepTriggers.map(({ start, end }) => ({ start, end })),
    );
    if (next === null || sameStory(last, next)) return;
    last = next;
    bridge.setStory(next.chapter, next.progress);
  }

  // Both start hidden at once (lazy: false), not on GSAP's next tick, so a
  // reveal set up while calm changes can never miss its start.
  function rise(title: HTMLElement) {
    const split = SplitText.create(title, { type: "words", mask: "words" });
    splits.push(split);
    return gsap.fromTo(
      split.words,
      { yPercent: 100, opacity: 0 },
      { yPercent: 0, opacity: 1, ...TITLE_REVEAL, paused: true, lazy: false },
    );
  }

  function fade(title: HTMLElement) {
    return gsap.fromTo(
      title,
      { opacity: 0 },
      { opacity: 1, ...TITLE_FADE, paused: true, lazy: false },
    );
  }

  function clearReveals() {
    revealContext?.revert();
    revealContext = null;
    for (const trigger of revealTriggers.splice(0)) trigger.kill();
    for (const split of splits.splice(0)) split.revert();
  }

  // Run again when calm changes, for the titles still waiting. Reverting
  // first shows every waiting title whole, so a switch never leaves one
  // hidden.
  function buildReveals() {
    clearReveals();
    if (context === null) return;
    const pending = titles.filter((title) => {
      if (settled.has(title)) return false;
      if (isReached(title.getBoundingClientRect().top, view.innerHeight)) {
        settled.add(title);
        return false;
      }
      return true;
    });
    if (pending.length === 0) return;

    const reveals = contained(() => {
      for (const title of pending) {
        const reveal = isCalm ? fade(title) : rise(title);
        revealTriggers.push(
          ScrollTrigger.create({
            trigger: title,
            start: REVEAL_START,
            once: true,
            onEnter: () => {
              settled.add(title);
              reveal.play();
            },
          }),
        );
      }
    });
    // Made inside the main context, so reverting that reverts this too.
    context.add(() => {
      revealContext = gsap.context(reveals.body, root);
    });
    reveals.rethrow();
  }

  function stop() {
    if (isStopped) return;
    isStopped = true;
    unsubscribeCalm?.();
    unsubscribeCalm = null;
    ScrollTrigger.removeEventListener("refresh", report);
    clearReveals();
    context?.revert();
    context = null;
    for (const { trigger } of chapterTriggers.splice(0)) trigger.kill();
    for (const trigger of stepTriggers.splice(0)) trigger.kill();
  }

  try {
    const story = contained(() => {
      for (const { chapter, element } of chapters) {
        chapterTriggers.push({
          chapter,
          trigger: ScrollTrigger.create({
            trigger: element,
            start: "top center",
            end: "bottom center",
            onUpdate: report,
          }),
        });
      }
      for (const element of steps) {
        stepTriggers.push(
          ScrollTrigger.create({
            trigger: element,
            start: "top center",
            end: "bottom center",
          }),
        );
      }
    });
    context = gsap.context(story.body, root);
    story.rethrow();

    // Subscribing first: the store reads the system setting again when its
    // first listener arrives.
    unsubscribeCalm = calm.subscribe(() => {
      const next = calm.getSnapshot().calm;
      if (isStopped || next === isCalm) return;
      isCalm = next;
      try {
        buildReveals();
      } catch {
        // The titles still waiting stay whole and visible, with no reveal.
        clearReveals();
      }
    });
    isCalm = calm.getSnapshot().calm;
    buildReveals();

    ScrollTrigger.addEventListener("refresh", report);
    isReady = true;
    ScrollTrigger.refresh();
    // Whatever is in view now, sent at once.
    report();
  } catch (error) {
    stop();
    throw error;
  }

  // Late fonts change line heights, and with them every position.
  void fonts?.ready.then(() => {
    if (!isStopped) ScrollTrigger.refresh();
  });

  return stop;
}
