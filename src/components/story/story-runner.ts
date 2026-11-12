import type { ChapterId, Stages } from "@/engine/types";
import { calmStore, type CalmStore } from "@/lib/calm-store";
import { tierStore, type TierStore } from "@/lib/tier-store";
import type { Motion } from "@/lib/load-motion";
import {
  storyBridge,
  type StoryBridge,
  type StoryState,
} from "@/lib/story-bridge";

import {
  INTRO_REVEAL,
  REVEAL_START,
  TITLE_FADE,
  TITLE_REVEAL,
} from "./motion-timing";
import { readStoryElements } from "./story-dom";
import {
  isReached,
  resolveStory,
  rowInView,
  sameStory,
  type Span,
} from "./story-progress";
import {
  measureLayout,
  sameStages,
  stagesAt,
  type PageLayout,
} from "./story-stage";
import {
  PLATE_SOFT,
  VEIL_OPEN,
  clearAreas,
  plateClip,
  plateColour,
  plates,
  type ClearRect,
  type PageRect,
} from "./story-veil";

/**
 * The layer that holds the veil's plates (story-veil.ts): positioned at the
 * top of the page, so the plates scroll with the text, and stacked between
 * the field (-z-10) and the page. It is a child of body, outside header,
 * main and footer.
 */
function createPlateLayer(doc: Document): HTMLElement {
  const layer = doc.createElement("div");
  layer.dataset.part = "veil-plates";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "0",
    zIndex: "-5",
    pointerEvents: "none",
    // Its own compositing layer: the plates' soft shadows are drawn once,
    // not again with every repaint of the page around them.
    willChange: "transform",
  });
  doc.body.append(layer);
  return layer;
}

// Each plate is cut where a study frame is (story-veil.ts, plateClip), so
// its soft edge never dims the field inside the frame.
function drawPlates(
  layer: HTMLElement,
  blocks: readonly PageRect[],
  clear: readonly ClearRect[],
) {
  const colour = plateColour();
  layer.replaceChildren(
    ...blocks.map((block) => {
      const plate = layer.ownerDocument.createElement("div");
      Object.assign(plate.style, {
        position: "absolute",
        top: `${block.top}px`,
        left: `${block.left}px`,
        width: `${block.right - block.left}px`,
        height: `${block.bottom - block.top}px`,
        background: colour,
        borderRadius: `${PLATE_SOFT / 2}px`,
        boxShadow: `0 0 ${PLATE_SOFT}px ${PLATE_SOFT / 2}px ${colour}`,
      });
      const clip = plateClip(block, clear);
      if (clip !== null) plate.style.clipPath = clip;
      return plate;
    }),
  );
}

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
  bridge?: Pick<StoryBridge, "setStory" | "setStage" | "setVeil">;
  calm?: Pick<CalmStore, "getSnapshot" | "subscribe">;
  /** The screen's height, read on every scroll frame. */
  view?: Pick<Window, "innerHeight">;
  fonts?: Pick<FontFaceSet, "ready"> | null;
  /** The page's layout for the field: stages and text (story-stage.ts). */
  measure?: () => PageLayout;
  /** The tier the field runs on: plates and the open veil need a live one. */
  tier?: Pick<TierStore, "getSnapshot" | "subscribe">;
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
 * that to the field through the story bridge (REQ-SCR-01). The stages go
 * the same way, through setStage only (REQ-ENG-03): measured from the
 * layout on every refresh, and while the work chapter is on screen the work
 * stage again on every scroll frame, so each study's shape forms inside its
 * row's frame and moves with it. Nothing is pinned or snapped, and
 * scrolling keeps its native speed (REQ-SCR-02).
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
    measure = () => measureLayout(root, window),
    tier = tierStore,
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
  let sentStages: Stages | null = null;
  let layout: PageLayout | null = null;
  let plateLayer: HTMLElement | null = null;
  let unsubscribeTier: (() => void) | null = null;
  let remeasureTimer: ReturnType<typeof setTimeout> | null = null;

  function currentPosition(): number {
    return chapterTriggers[0]?.trigger.scroll() ?? 0;
  }

  function stepSpans(): Span[] {
    return stepTriggers.map(({ start, end }) => ({ start, end }));
  }

  // The stages at a scroll position: the dot and the contact panel keep
  // their places, and the work stage is the frame of the row in view where
  // the screen shows it. Sent only when they moved (sameStages).
  function sendStages(position: number, steps: Span[] = stepSpans()) {
    if (layout === null || isStopped) return;
    const next = stagesAt(layout, {
      position,
      height: view.innerHeight,
      row: rowInView(position, steps),
      calm: isCalm,
    });
    if (sameStages(sentStages, next)) return;
    sentStages = next;
    bridge.setStage(next);
  }

  // Any part of the work chapter is on screen: its top is above the
  // screen's bottom and its bottom below the screen's top. A chapter span
  // runs from its top at the screen's middle to its bottom there.
  function isWorkInView(position: number): boolean {
    const work = chapterTriggers.find(({ chapter }) => chapter === "work");
    if (work === undefined) return false;
    const half = view.innerHeight / 2;
    return (
      position > work.trigger.start - half && position < work.trigger.end + half
    );
  }

  // Reads every trigger at once, so the order in which ScrollTrigger calls
  // them never matters. ScrollTrigger refreshes every trigger before it
  // updates any, and announces the end of a refresh, so positions are never
  // half updated.
  function report() {
    const first = chapterTriggers[0];
    if (!isReady || isStopped || first === undefined) return;
    const position = first.trigger.scroll();
    const steps = stepSpans();
    // While the work chapter is on screen every scroll frame moves its
    // stage, so the shape follows its frame; the engine takes a small move
    // at once and glides over a jump to the next row (REQ-SCR-05). The stage
    // goes first, so a new study already has its frame. In calm the stage
    // does not move with the scroll, so nothing is sent (REQ-A11Y-03).
    if (isWorkInView(position)) sendStages(position, steps);
    const next = resolveStory(
      position,
      chapterTriggers.map(({ chapter, trigger }) => ({
        chapter,
        start: trigger.start,
        end: trigger.end,
      })),
      steps,
    );
    if (next === null || sameStory(last, next)) return;
    last = next;
    bridge.setStory(next.chapter, next.progress);
  }

  // Tier 3's still keeps its own veil, so it shows no plates either.
  function showPlates() {
    const { tier: live } = tier.getSnapshot();
    if (plateLayer !== null) plateLayer.hidden = live !== 1 && live !== 2;
  }

  // A new layout moves the dot, the frames, the contact panel and the
  // page's text. The plates are laid before the veil opens, and again for
  // each new layout.
  function remeasure() {
    if (isStopped) return;
    layout = measure();
    sendStages(currentPosition());
    const blocks = plates(
      layout.lines,
      layout.width > 0 ? layout.width : undefined,
    );
    const frames = layout.frames.flatMap((frame) =>
      frame === null ? [] : [frame],
    );
    const clear = clearAreas(frames, layout.lines);
    if (plateLayer === null) {
      plateLayer = createPlateLayer(root.ownerDocument);
      showPlates();
      drawPlates(plateLayer, blocks, clear);
      bridge.setVeil(VEIL_OPEN);
    } else {
      drawPlates(plateLayer, blocks, clear);
    }
  }

  // After every refresh the layout is read again, then the story sent.
  function onRefresh() {
    remeasure();
    report();
  }

  // Some text arrives after the layout was read: the field's note and the
  // tier readouts get their words once the field is ready, and the note
  // comes and goes with calm. No refresh follows, so the plates are laid
  // again on the next task, once React has drawn the words; without it
  // that text would sit on the open veil (REQ-A11Y-06).
  function remeasureSoon() {
    if (isStopped || remeasureTimer !== null) return;
    remeasureTimer = setTimeout(() => {
      remeasureTimer = null;
      remeasure();
    }, 0);
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

  // The line under a title, marked data-story-intro in the same section. It
  // stays hidden while its title is, so it never shows first.
  function introOf(title: HTMLElement): HTMLElement | null {
    return (
      title
        .closest("section")
        ?.querySelector<HTMLElement>("[data-story-intro]") ?? null
    );
  }

  function introFade(intro: HTMLElement) {
    return gsap.fromTo(
      intro,
      { opacity: 0 },
      {
        opacity: 1,
        ...(isCalm ? TITLE_FADE : INTRO_REVEAL),
        paused: true,
        lazy: false,
      },
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
        const intro = introOf(title);
        const trailing = intro === null ? null : introFade(intro);
        revealTriggers.push(
          ScrollTrigger.create({
            trigger: title,
            start: REVEAL_START,
            once: true,
            onEnter: () => {
              settled.add(title);
              reveal.play();
              trailing?.play();
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
    ScrollTrigger.removeEventListener("refresh", onRefresh);
    unsubscribeTier?.();
    unsubscribeTier = null;
    if (remeasureTimer !== null) clearTimeout(remeasureTimer);
    remeasureTimer = null;
    // The field outside the story keeps its own veil, closed before the
    // plates go.
    if (plateLayer !== null) {
      bridge.setVeil(null);
      plateLayer.remove();
      plateLayer = null;
    }
    layout = null;
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
      // Calm holds the work stage still; motion lets it follow the frame.
      sendStages(currentPosition());
      remeasureSoon();
      try {
        buildReveals();
      } catch {
        // The titles still waiting stay whole and visible, with no reveal.
        clearReveals();
      }
    });
    isCalm = calm.getSnapshot().calm;
    buildReveals();

    ScrollTrigger.addEventListener("refresh", onRefresh);
    unsubscribeTier = tier.subscribe(() => {
      showPlates();
      remeasureSoon();
    });
    isReady = true;
    ScrollTrigger.refresh();
    // Whatever is in view now, sent at once.
    remeasure();
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
