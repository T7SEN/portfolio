import type { Stage, Stages } from "@/engine/types";

import type { PageRect } from "./story-veil";

// What the scroll story measures from the page's layout for the field: the
// stages (where the dot sits and where the study shapes form, types.ts) and
// every line of the page's text, for the veil's plates (story-veil.ts). Measured when
// the story starts and again on every ScrollTrigger refresh, which follows a
// resize and late fonts.

/** Tailwind's lg breakpoint: from here the study cards keep to one column. */
export const BESIDE_QUERY = "(min-width: 64rem)";
/** Room left between the cards and their shape. */
export const BESIDE_GAP = 32;
/** A free side narrower than this is no stage: the shape stays centred. */
export const BESIDE_MIN_WIDTH = 240;
/** The work stage keeps its shapes off the top and bottom of the screen. */
const BESIDE_HALF_HEIGHT = 0.85;
/** The dot stays this far inside the screen's top and bottom. */
const DOT_LIMIT = 0.9;

export type PageLayout = {
  stages: Stages;
  /** Every visible line of text, in page coordinates. */
  lines: PageRect[];
};

export type LayoutView = Pick<
  Window,
  "scrollX" | "scrollY" | "innerHeight" | "matchMedia"
> & {
  document: Pick<Document, "documentElement" | "body" | "createRange">;
};

function clamp(value: number, limit: number) {
  return Math.min(Math.max(value, -limit), limit);
}

/**
 * The hero's dot: the middle of the band between the actions and Skip
 * intro, at the middle of the screen's width, as the screen shows it at the
 * top of the page. The field's canvas is fixed, so the dot keeps that place
 * while the hero scrolls away.
 */
function measureDot(root: ParentNode, view: LayoutView): Stage | undefined {
  const above = root.querySelector('[data-stage="dot-above"]');
  const below = root.querySelector('[data-stage="dot-below"]');
  if (above === null || below === null) return undefined;
  const top = above.getBoundingClientRect().bottom + view.scrollY;
  const bottom = below.getBoundingClientRect().top + view.scrollY;
  const height = view.innerHeight;
  if (!(bottom > top) || !(height > 0)) return undefined;
  return {
    x: 0,
    y: clamp(1 - (top + bottom) / height, DOT_LIMIT),
    halfWidth: 0,
    halfHeight: 0,
  };
}

/**
 * The work chapter's stage: from the lg breakpoint, the side of the content
 * that the card column leaves free, its inline end in either reading
 * direction, over most of the screen's height.
 */
function measureBeside(root: ParentNode, view: LayoutView): Stage | undefined {
  if (
    typeof view.matchMedia !== "function" ||
    !view.matchMedia(BESIDE_QUERY).matches
  ) {
    return undefined;
  }
  const column = root.querySelector<HTMLElement>('[data-stage="beside"]');
  const content = column?.parentElement;
  if (column === null || content === null || content === undefined) {
    return undefined;
  }
  const width = view.document.documentElement.clientWidth;
  if (!(width > 0)) return undefined;
  const cards = column.getBoundingClientRect();
  const room = content.getBoundingClientRect();
  const rtl = getComputedStyle(column).direction === "rtl";
  const start = rtl ? room.left : cards.right + BESIDE_GAP;
  const end = rtl ? cards.left - BESIDE_GAP : room.right;
  if (!(end - start >= BESIDE_MIN_WIDTH)) return undefined;
  return {
    x: (start + end) / width - 1,
    y: 0,
    halfWidth: (end - start) / width,
    halfHeight: BESIDE_HALF_HEIGHT,
  };
}

// The elements whose whole box counts as text, as the contrast spec counts
// them: a short last line still has its paragraph's width behind it.
const TEXT_ELEMENTS =
  "h1, h2, h3, h4, h5, h6, p, a, button, label, dt, dd, figcaption, blockquote";

/**
 * The box that holds a run of text: its outermost text element (a link in a
 * paragraph is covered by the paragraph, a title's split words by the
 * title), else the list item it sits in directly, else null for the run's
 * own line boxes.
 */
function holderOf(text: Node, body: Element): Element | null {
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
 * clipped to a single pixel.
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

/** Where the dot sits and where the study shapes form. */
export function measureStages(root: ParentNode, view: LayoutView): Stages {
  const stages: Stages = {};
  const dot = measureDot(root, view);
  if (dot !== undefined) stages.hero = dot;
  const beside = measureBeside(root, view);
  if (beside !== undefined) stages.work = beside;
  return stages;
}

/** Everything the field needs to know about the page's layout. */
export function measureLayout(root: ParentNode, view: LayoutView): PageLayout {
  return { stages: measureStages(root, view), lines: measureLines(view) };
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
