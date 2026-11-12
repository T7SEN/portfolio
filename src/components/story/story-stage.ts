import type { Stage, Stages } from "@/engine/types";

import { middleSpan, readStoryElements } from "./story-dom";
import { rowInView } from "./story-progress";
import type { ClearRect, PageRect } from "./story-veil";

// What the scroll story measures from the page's layout for the field: the
// stages (types.ts), the study frames and every line of the page's text, for
// the veil's plates (story-veil.ts). Measured when the story starts and again
// on every ScrollTrigger refresh, which follows a resize and late fonts.
//
// Boxes are kept in page coordinates. The field's canvas is fixed behind the
// page, so a stage is a place on the screen: a box moved by a scroll
// position, in normalised device coordinates with y up. Reading the box
// itself is direction free, so a layout mirrored right to left gives
// mirrored stages with nothing to swap. The page never scrolls sideways
// (story-veil.ts keeps the plates inside it), so only the vertical scroll
// moves a box on the screen.

/** The dot stays this far inside the screen's top and bottom. */
const DOT_LIMIT = 0.9;

export type PageLayout = {
  /**
   * The stages that keep one place on the screen: the hero's dot where the
   * screen shows it at the top of the page, and the contact panel where it
   * shows it at the page's end. The work stage moves with the scroll
   * (stagesAt).
   */
  stages: Stages;
  /**
   * Each study row's frame in page coordinates, in step order, with its
   * corner radius; null for a row without one.
   */
  frames: Array<ClearRect | null>;
  /** The width of the screen the field's canvas fills, px. */
  width: number;
  /** Every visible line of text, in page coordinates. */
  lines: PageRect[];
};

export type LayoutView = Pick<
  Window,
  "scrollX" | "scrollY" | "innerHeight" | "getComputedStyle"
> & {
  document: Pick<Document, "documentElement" | "body" | "createRange">;
};

/** Where the page is and what the field shows, for the work stage. */
export type StageScroll = {
  /** The scroll position, px. */
  position: number;
  /** The screen's height now, px. */
  height: number;
  /** The study row in view (story-progress.ts, rowInView). */
  row: number;
  /**
   * Calm mode or reduced motion. The field then draws one still per study,
   * so the work stage stays where the frame shows when its middle is at the
   * screen's middle and scrolling moves nothing (REQ-A11Y-03).
   */
  calm: boolean;
};

function clamp(value: number, limit: number) {
  return Math.min(Math.max(value, -limit), limit);
}

/** An element's box in page coordinates. */
export function pageRect(
  element: Element,
  view: Pick<LayoutView, "scrollX" | "scrollY">,
): PageRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + view.scrollY,
    bottom: rect.bottom + view.scrollY,
    left: rect.left + view.scrollX,
    right: rect.right + view.scrollX,
  };
}

/** A box with an area: an element that is not laid out has none. */
export function hasArea(box: PageRect) {
  return box.right - box.left > 0 && box.bottom - box.top > 0;
}

/**
 * A box on the page as the screen shows it with the page scrolled to
 * scrollY, as a stage: its centre and its halves, the whole screen being
 * 1 and 1. Undefined for a screen with no size.
 */
export function screenStage(
  box: PageRect,
  scrollY: number,
  width: number,
  height: number,
): Stage | undefined {
  if (!(width > 0) || !(height > 0)) return undefined;
  return {
    x: (box.left + box.right) / width - 1,
    y: 1 - (box.top + box.bottom - 2 * scrollY) / height,
    halfWidth: (box.right - box.left) / width,
    halfHeight: (box.bottom - box.top) / height,
  };
}

/**
 * The hero's dot: the centre of the empty box marked data-stage="dot", its
 * halves the halo's reach, as the screen shows it at the top of the page.
 * The canvas is fixed, so the dot keeps that place while the hero scrolls
 * away, and the bloom grows from there.
 */
function measureDot(
  root: ParentNode,
  view: LayoutView,
  width: number,
): Stage | undefined {
  const element = root.querySelector('[data-stage="dot"]');
  if (element === null) return undefined;
  const box = pageRect(element, view);
  if (!hasArea(box)) return undefined;
  const stage = screenStage(box, 0, width, view.innerHeight);
  return stage && { ...stage, y: clamp(stage.y, DOT_LIMIT) };
}

/**
 * The contact panel the rings centre on, marked data-stage="contact", as
 * the screen shows it at the page's end: the chapter is the last, so that
 * is where the panel comes to rest, and the rings wait for it there.
 */
function measureContact(
  root: ParentNode,
  view: LayoutView,
  width: number,
): Stage | undefined {
  const element = root.querySelector('[data-stage="contact"]');
  if (element === null) return undefined;
  const box = pageRect(element, view);
  if (!hasArea(box)) return undefined;
  const end = Math.max(
    view.document.documentElement.scrollHeight - view.innerHeight,
    0,
  );
  return screenStage(box, end, width, view.innerHeight);
}

/** Each study row's frame, data-stage="frame" inside its data-work-step. */
function measureFrames(
  root: ParentNode,
  view: LayoutView,
): Array<ClearRect | null> {
  return readStoryElements(root).steps.map((step) => {
    const frame = step.querySelector('[data-stage="frame"]');
    if (frame === null) return null;
    const box = pageRect(frame, view);
    if (!hasArea(box)) return null;
    const radius = Number.parseFloat(
      view.getComputedStyle(frame).borderTopLeftRadius,
    );
    return { ...box, radius: Number.isFinite(radius) ? radius : 0 };
  });
}

// The elements whose whole box counts as text, as the contrast spec counts
// them: a short last line still has its paragraph's width behind it.
const TEXT_ELEMENTS =
  "h1, h2, h3, h4, h5, h6, p, a, button, label, dt, dd, figcaption, blockquote";

/**
 * The box that holds a run of text: an element marked data-plate="box"
 * round it, else its outermost text element (a link in a paragraph is
 * covered by the paragraph, a title's split words by the title), else the
 * list item it sits in directly, else null for the run's own line boxes.
 * A pass card is a button whose box also holds its face, where the field
 * draws, so its label marks its own box.
 */
function holderOf(text: Node, body: Element): Element | null {
  const marked = text.parentElement?.closest('[data-plate="box"]');
  if (marked) return marked;
  let outermost: Element | null = null;
  for (
    let element = text.parentElement;
    element !== null && element !== body;
    element = element.parentElement
  ) {
    if (element.matches(TEXT_ELEMENTS)) outermost = element;
  }
  return outermost ?? text.parentElement?.closest("li") ?? null;
}

/**
 * Every box of visible text on the page, in page coordinates. Visually
 * hidden text (the scene lines, sr-only) is left out by its size: it is
 * clipped to a single pixel. Text with its own plate is left out too.
 */
function measureLines(view: LayoutView): PageRect[] {
  const { body } = view.document;
  const lines: PageRect[] = [];
  const held = new Set<Element>();
  const walker = body.ownerDocument.createTreeWalker(
    body,
    NodeFilter.SHOW_TEXT,
  );
  const range = view.document.createRange();
  const add = (rect: Pick<DOMRect, "top" | "bottom" | "left" | "right">) => {
    if (rect.right - rect.left <= 1 || rect.bottom - rect.top <= 1) return;
    lines.push({
      top: rect.top + view.scrollY,
      bottom: rect.bottom + view.scrollY,
      left: rect.left + view.scrollX,
      right: rect.right + view.scrollX,
    });
  };
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.textContent ?? "").trim() === "") continue;
    const parent = node.parentElement;
    if (parent === null || parent.closest("[data-scene]") !== null) continue;
    // Text that holds on screen while the page scrolls brings its own plate
    // (home/held-plate.tsx): a plate laid in page coordinates could not
    // follow it.
    if (parent.closest('[data-plate="own"]') !== null) continue;
    const holder = holderOf(node, body);
    if (holder !== null) {
      if (held.has(holder)) continue;
      held.add(holder);
      add(holder.getBoundingClientRect());
      continue;
    }
    // A DOM without layout (a unit test) has no line boxes to read.
    if (typeof range.getClientRects !== "function") continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) add(rect);
  }
  return lines;
}

/**
 * The work stage: the frame of the study row in view, where the screen
 * shows it now, so the shape forms inside the frame and follows it as the
 * page scrolls (REQ-SCR-01). In calm, the frame where it shows with its
 * middle at the screen's middle. Undefined when the row has no frame.
 */
export function workStage(
  layout: Pick<PageLayout, "frames" | "width">,
  { position, height, row, calm }: StageScroll,
): Stage | undefined {
  const frame = layout.frames[row] ?? null;
  if (frame === null) return undefined;
  const scrollY = calm ? (frame.top + frame.bottom - height) / 2 : position;
  return screenStage(frame, scrollY, layout.width, height);
}

/** Every stage the field needs at a scroll position. */
export function stagesAt(
  layout: Pick<PageLayout, "stages" | "frames" | "width">,
  scroll: StageScroll,
): Stages {
  const work = workStage(layout, scroll);
  return work === undefined ? layout.stages : { ...layout.stages, work };
}

/** The page's layout for the field without its text, which costs most. */
function measureBoxes(
  root: ParentNode,
  view: LayoutView,
): Omit<PageLayout, "lines"> {
  const width = view.document.documentElement.clientWidth;
  const stages: Stages = {};
  const dot = measureDot(root, view, width);
  if (dot !== undefined) stages.hero = dot;
  const contact = measureContact(root, view, width);
  if (contact !== undefined) stages.contact = contact;
  return { stages, frames: measureFrames(root, view), width };
}

/** Everything the field needs to know about the page's layout. */
export function measureLayout(root: ParentNode, view: LayoutView): PageLayout {
  return { ...measureBoxes(root, view), lines: measureLines(view) };
}

/**
 * The stages at the page's scroll position now, with the study row the
 * story picks there, for the field's first frame before the scroll library
 * loads (story-driver.tsx).
 */
export function measureStages(
  root: ParentNode,
  view: LayoutView,
  calm = false,
): Stages {
  const position = view.scrollY;
  const height = view.innerHeight;
  const steps = readStoryElements(root).steps.map((step) =>
    middleSpan(step, position, height),
  );
  return stagesAt(measureBoxes(root, view), {
    position,
    height,
    row: rowInView(position, steps),
    calm,
  });
}

/** Whether two measures give the field the same stages. */
export function sameStages(a: Stages | null, b: Stages): boolean {
  if (a === null) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof Stages
  >;
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (left === undefined || right === undefined) {
      if (left !== right) return false;
      continue;
    }
    if (
      Math.abs(left.x - right.x) > 1e-4 ||
      Math.abs(left.y - right.y) > 1e-4 ||
      Math.abs(left.halfWidth - right.halfWidth) > 1e-4 ||
      Math.abs(left.halfHeight - right.halfHeight) > 1e-4
    ) {
      return false;
    }
  }
  return true;
}
