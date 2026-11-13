import { PASSES } from "@/engine/story";

// The making-of chapter's slide (REQ-ENG-09, REQ-SCR-02): a held screen
// whose row of pass cards moves sideways as the page scrolls down, at the
// page's own speed. Each card rests in the middle for a short stretch of
// scroll, then the row glides to the next. The row's place is a function of
// the scroll, and scrolling back runs it backwards. A wheel notch is one
// glide straight to the next card (wheelStep, decision D-132), and so is a
// scroll key or a swipe of a finger (keyStep, swipeCards, D-133); once any
// other scroll stops with the row between two cards, the page settles on
// one of them (settleCard, D-131). Plain numbers, no DOM.

const PASS_COUNT = PASSES.length;

/** Screens of scroll each card rests in the middle. */
export const SLIDE_REST = 0.05;
/** Screens of scroll the row takes to glide from one card to the next. */
export const SLIDE_MOVE = 0.16;
/** Screens of scroll the whole slide takes, from the first card to the last. */
export const SLIDE_SCREENS =
  PASSES.length * SLIDE_REST + (PASSES.length - 1) * SLIDE_MOVE;
/**
 * The stretch's height in screens: the held screen itself, then the slide's
 * scroll. The class in pass-viewer.tsx is this times 100 in svh (a test
 * keeps the two equal).
 */
export const STRETCH_SCREENS = 1 + SLIDE_SCREENS;

/**
 * The screens tall enough for the held screen to show a whole card and the
 * rail: from 1024 px, where the face sits beside its words, 32rem; below it,
 * where the words sit under the face, 40rem, and 45rem under 360 px, where
 * they wrap to more lines. Measured at 16 px text, the tallest card and the
 * rail take 360 px from 1024 px wide, 572 px from 360 px wide and 641 px at
 * 320 px (D-125), so each line leaves 68 px or more for a browser's bars. In
 * rem, so larger text asks for a taller screen, and a page zoomed in has a
 * shorter one. Any other screen (a phone held sideways, a short window,
 * large text, a high zoom) keeps the still grid, where nothing is clipped
 * (WCAG 1.4.4, 1.4.10).
 */
export const SLIDE_ROOM =
  "(min-width: 64rem) and (min-height: 32rem), (min-width: 22.5rem) and (min-height: 40rem), (min-height: 45rem)";

/**
 * The event the viewer sends from its root after the row has moved, and
 * again once the card in the middle or its live face has changed: the story
 * reads the faces then (story-runner.ts), since a scroll reaches the story
 * before the row has moved for it.
 */
export const SLIDE_MOVED = "pass-slide-moved";

function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/** 0 to 1, eased at both ends, so a glide starts and ends at rest. */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Where the row stands at a progress from 0 to 1 through the slide's
 * scroll, as a card index from 0: whole numbers while a card rests in the
 * middle, fractions while the row glides between two. Progress outside 0 to
 * 1, or not a number, is clamped.
 */
export function slideAt(progress: number, count: number = PASSES.length) {
  const last = Math.max(count - 1, 0);
  const screens = unit(progress) * (count * SLIDE_REST + last * SLIDE_MOVE);
  const span = SLIDE_REST + SLIDE_MOVE;
  const index = Math.min(Math.floor(screens / span), last);
  const local = screens - index * span;
  if (index >= last || local <= SLIDE_REST) return index;
  return index + ease((local - SLIDE_REST) / SLIDE_MOVE);
}

/**
 * The other card the mark streams between while the row glides: the card
 * it is leaving or the one it is reaching, beside the middle card. Null at
 * rest, where the row stands on a whole card, and for a place that is not a
 * number.
 */
export function glideCard(at: number, count: number = PASS_COUNT) {
  if (!Number.isFinite(at)) return null;
  const last = Math.max(count - 1, 0);
  const place = Math.min(Math.max(at, 0), last);
  const below = Math.floor(place);
  if (place === below) return null;
  return middleCard(place, count) === below ? below + 1 : below;
}

/**
 * How long the scroll must have stopped, in milliseconds, before the page
 * settles the row on a card: longer than the gap between two wheel notches
 * of one turn, and Lenis's glide sends a scroll on every frame until it
 * ends.
 */
export const SETTLE_DELAY_MS = 160;
/**
 * How far the row must have glided from a card, as a share of the way to
 * the next, for the settle to go on to the next card in the scroll's
 * direction; less, and it settles back on the card it left.
 */
export const SETTLE_LEAN = 0.1;

/**
 * The card the page settles the row on once the scroll stops at a place
 * from slideAt: null while the row rests on a card, and for a place that is
 * not a number. Between two cards it goes on in the direction the page was
 * last scrolled (1 down, -1 up) once the row has glided SETTLE_LEAN of the
 * way from the card it left, and back to that card before then; with no
 * direction known, to the nearer card.
 */
export function settleCard(
  at: number,
  direction: number,
  count: number = PASS_COUNT,
): number | null {
  if (!Number.isFinite(at)) return null;
  const last = Math.max(count - 1, 0);
  const place = Math.min(Math.max(at, 0), last);
  const below = Math.floor(place);
  if (place === below) return null;
  const share = place - below;
  if (direction > 0) return share >= SETTLE_LEAN ? below + 1 : below;
  if (direction < 0) return 1 - share >= SETTLE_LEAN ? below : below + 1;
  return middleCard(place, count);
}

/**
 * Where a step of some cards from a page position goes, given the page
 * positions where the cards rest, in order: from the card the page rests
 * on, or between two from the one behind it in the step's way, on by that
 * many cards in the direction (1 down the page, -1 up). A step that runs
 * past an end stops on the end card. Null when the page is away from the
 * slide, already on the end card the step heads for, or for nothing to
 * step by: the page then scrolls as ever, so it leaves the slide.
 */
export function stepRest(
  position: number,
  direction: number,
  rests: readonly number[],
  cards = 1,
): number | null {
  const first = rests[0];
  const last = rests.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    !Number.isFinite(position) ||
    !Number.isFinite(direction) ||
    direction === 0 ||
    !(cards >= 1)
  ) {
    return null;
  }
  if (position < first - ON_REST_PX || position > last + ON_REST_PX) {
    return null;
  }
  const span = rests.length > 1 ? (last - first) / (rests.length - 1) : 0;
  if (!(span > 0)) return null;
  const place = (position - first) / span;
  const nearest = Math.round(place);
  const from =
    Math.abs(place - nearest) * span <= ON_REST_PX
      ? nearest
      : direction > 0
        ? Math.floor(place)
        : Math.ceil(place);
  const next = Math.min(
    Math.max(from + Math.sign(direction) * Math.round(cards), 0),
    rests.length - 1,
  );
  if (next === from) return null;
  return rests[next] ?? null;
}

/**
 * Which way a key moves the row a card (D-133): Arrow Down, Page Down and
 * Space down the page (1), Arrow Up, Page Up and Shift with Space up (-1);
 * any other key, 0.
 */
export function keyStep(key: string, shiftKey: boolean): -1 | 0 | 1 {
  switch (key) {
    case "ArrowDown":
    case "PageDown":
      return 1;
    case "ArrowUp":
    case "PageUp":
      return -1;
    case " ":
      return shiftKey ? -1 : 1;
    default:
      return 0;
  }
}

/** A finger's swipe at least this long, in page pixels, moves the row a card. */
export const SWIPE_PX = 16;

/**
 * How many cards a finger's swipe of this length moves the row (D-133),
 * given the scroll between two cards' rests: none for less than SWIPE_PX,
 * which is a touch, not a swipe; one for a short swipe, slow or quick; one
 * more for each whole card a long swipe crosses.
 */
export function swipeCards(distance: number, span: number): number {
  const length = Math.abs(distance);
  if (!Number.isFinite(length) || length < SWIPE_PX) return 0;
  if (!(span > 0)) return 1;
  return Math.max(1, Math.round(length / span));
}

/** A wheel input at least this large is one notch: it moves the row a card. */
export const NOTCH_PX = 40;
/**
 * Wheel inputs closer together than this are one stream, a trackpad's or
 * its inertia, not separate notches: they gather like small ones.
 */
export const NOTCH_GAP_MS = 20;
/** A pause this long between wheel inputs ends a turn of the wheel. */
export const TURN_GAP_MS = 250;
/** How close, in page pixels, a target is to a rest to count as on it. */
const ON_REST_PX = 2;

/**
 * What one turn of the wheel has done so far: the inputs gathered toward a
 * step (a trackpad's) and when its last input came.
 */
export type WheelTurn = {
  gathered: number;
  last: number;
};

export const NEW_TURN: WheelTurn = {
  gathered: 0,
  last: Number.NEGATIVE_INFINITY,
};

/**
 * Where a wheel input sends the page in the making-of slide (D-132), from
 * Lenis's target and the input's delta, in page pixels, given the page
 * positions where the cards rest, in order: so each notch is one glide to
 * the next card. Null lets the wheel scroll as ever: away from the slide,
 * and past its first card going up or its last going down, so the page
 * leaves it. An input that reaches the slide from above or below lands on
 * its first or last card. Inside it, a notch (NOTCH_PX or more, NOTCH_GAP_MS
 * or more after the input before it) moves the row a card on from Lenis's
 * target, so a quick spin of three notches glides three cards; smaller
 * inputs, and a trackpad's close stream, gather until they make half the
 * way to the next card, and meanwhile the target is returned unchanged,
 * which holds the page still.
 */
export function wheelStep(
  target: number,
  delta: number,
  rests: readonly number[],
  now: number,
  previous: WheelTurn,
): { to: number | null; turn: WheelTurn } {
  const first = rests[0];
  const last = rests.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    !Number.isFinite(target) ||
    !Number.isFinite(delta) ||
    delta === 0
  ) {
    return { to: null, turn: previous };
  }
  const isNotch =
    Math.abs(delta) >= NOTCH_PX && now - previous.last >= NOTCH_GAP_MS;
  const turn: WheelTurn =
    now - previous.last > TURN_GAP_MS
      ? { ...NEW_TURN, last: now }
      : { ...previous, last: now };
  const down = delta > 0;
  if (target < first - ON_REST_PX) {
    return { to: down && target + delta >= first ? first : null, turn };
  }
  if (target > last + ON_REST_PX) {
    return { to: !down && target + delta <= last ? last : null, turn };
  }
  const span = rests.length > 1 ? (last - first) / (rests.length - 1) : 0;
  const to = stepRest(target, down ? 1 : -1, rests);
  if (to === null) return { to: null, turn };
  if (!isNotch) {
    const gathered =
      Math.sign(turn.gathered) === Math.sign(delta)
        ? turn.gathered + delta
        : delta;
    if (Math.abs(gathered) < span / 2) {
      return { to: target, turn: { ...turn, gathered } };
    }
  }
  return { to, turn: { ...turn, gathered: 0 } };
}

/** The card nearest the middle at a place from slideAt. */
export function middleCard(at: number, count: number = PASSES.length) {
  if (!Number.isFinite(at)) return 0;
  return Math.min(Math.max(Math.round(at), 0), Math.max(count - 1, 0));
}

/**
 * The progress through the slide's scroll at which a card rests in the
 * middle, halfway through its rest: where Tab or a click on it takes the
 * page.
 */
export function restProgress(index: number, count: number = PASSES.length) {
  const last = Math.max(count - 1, 0);
  const card = Math.min(Math.max(Math.round(index), 0), last);
  const total = count * SLIDE_REST + last * SLIDE_MOVE;
  if (!(total > 0)) return 0;
  return (card * (SLIDE_REST + SLIDE_MOVE) + SLIDE_REST / 2) / total;
}
