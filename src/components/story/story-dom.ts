import type { ChapterId } from "@/engine/types";
import type { StoryState } from "@/lib/story-bridge";

import { resolveStory, type Span } from "./story-progress";

export type StoryElements = {
  /** Sections marked data-chapter, in page order. */
  chapters: Array<{ chapter: ChapterId; element: HTMLElement }>;
  /** The work chapter's data-work-step items, in study order. */
  steps: HTMLElement[];
  /** Chapter titles marked data-story-title. */
  titles: HTMLElement[];
};

// Every chapter id, checked against the type by the compiler. Kept here
// rather than read from src/content, whose study index would otherwise enter
// the page's first load with this file (REQ-PERF-04).
const CHAPTER_IDS: Record<ChapterId, true> = {
  hero: true,
  bloom: true,
  work: true,
  "making-of": true,
  about: true,
  contact: true,
};

function isChapterId(value: string | undefined): value is ChapterId {
  return value !== undefined && Object.hasOwn(CHAPTER_IDS, value);
}

// Read inside the page's main element only: the field's wrapper outside it
// mirrors the chapter as data-chapter too.
export function readStoryElements(root: ParentNode): StoryElements {
  const chapters = [
    ...root.querySelectorAll<HTMLElement>("[data-chapter]"),
  ].flatMap((element) => {
    const chapter = element.dataset.chapter;
    return isChapterId(chapter) ? [{ chapter, element }] : [];
  });
  const work = chapters.find(({ chapter }) => chapter === "work")?.element;
  const steps = work
    ? [...work.querySelectorAll<HTMLElement>("[data-work-step]")].sort(
        (a, b) => Number(a.dataset.workStep) - Number(b.dataset.workStep),
      )
    : [];
  const titles = [...root.querySelectorAll<HTMLElement>("[data-story-title]")];
  return { chapters, steps, titles };
}

/** The scroll positions over which an element crosses the viewport's middle. */
export function middleSpan(
  element: Element,
  scrollY: number,
  viewportHeight: number,
): Span {
  const { top, height } = element.getBoundingClientRect();
  const start = top + scrollY - viewportHeight / 2;
  return { start, end: start + height };
}

/**
 * The story at the current scroll position, read from the page's layout. It
 * gives the field the right chapter from the first frame, before the scroll
 * library has loaded.
 */
export function measureStory(
  root: ParentNode,
  view: Pick<Window, "scrollY" | "innerHeight">,
): StoryState | null {
  const { chapters, steps } = readStoryElements(root);
  const span = (element: Element) =>
    middleSpan(element, view.scrollY, view.innerHeight);
  return resolveStory(
    view.scrollY,
    chapters.map(({ chapter, element }) => ({ chapter, ...span(element) })),
    steps.map(span),
  );
}
