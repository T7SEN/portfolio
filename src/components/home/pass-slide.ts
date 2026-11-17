import { PASSES } from "@/engine/story";

// The making-of chapter's slide (REQ-ENG-09, REQ-SCR-02): a held screen
// whose row of pass cards moves sideways as the page scrolls down, at the
// page's own speed. Each card rests in the middle for a short stretch of
// scroll, then the row glides to the next. The row's place is a function of
// the scroll, and scrolling back runs it backwards. A swipe of a finger
// sideways or up and down (isSwipe, progressAt), a sideways arrow (sideKey)
// and a scroll key up or down (keyStep) each glide one card (decisions D-169
// and D-174), and the page leaves only from an end card. A turn of the
// wheel is one glide straight to the next card (wheelStep, D-132), and a
// flick's momentum stops on the first card it reaches (catchRest, D-168);
// once any other scroll stops with the row between two cards, the page
// settles on one of them (settleCard, D-131). Plain numbers, no DOM.

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
 * controls under it: from 1024 px, where the face sits beside its words,
 * 32rem; below it, where the words sit under the face, 46rem, and 50rem
 * under 360 px, where they wrap to more lines. Measured at 16 px text with
 * the 44 px previous and next buttons (D-169), the tallest card and the
 * controls take 400 px from 1024 px wide at 512 px high, 664 px from 360 px
 * wide at 736 px high and 731 px at 320 px wide and 800 px high (the face is
 * 32svh below 1024 px, so it grows with the screen), so each line leaves 68
 * px or more for a browser's bars (D-125). In rem, so larger text asks for a
 * taller screen, and a page zoomed in has a shorter one. Any other screen (a
 * short phone, a phone held sideways, a short window, large text, a high
 * zoom) keeps the still grid, where nothing is clipped (WCAG 1.4.4, 1.4.10).
 */
export const SLIDE_ROOM =
  "(min-width: 64rem) and (min-height: 32rem), (min-width: 22.5rem) and (min-height: 46rem), (min-height: 50rem)";

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
 * How long a glide to a part of the page (a skip link, the palette) may
 * run through the slide before the settle may act again, in
 * milliseconds: longer than the longest such glide, so a frame that
 * stalls part way cannot leave the page between two cards to be settled
 * there (D-180).
 */
export const SECTION_GLIDE_MS = 3_000;
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
 * Which way a scroll key points (D-133): Arrow Down, Page Down and Space
 * down the page (1), Arrow Up, Page Up and Shift with Space up (-1); any
 * other key, 0. Inside the slide such a key glides one card (D-174, as at
 * D-133; from D-169 to D-174 it moved nothing); at an end card it leaves the
 * slide as ever.
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

/**
 * Which way a sideways key moves the row a card [T7SEN, 15 Nov 2026]: the
 * arrow toward the next card, Arrow Right on a left-to-right page and Arrow
 * Left on a right-to-left one, goes on (1); the other arrow goes back
 * (-1); any other key, 0.
 */
export function sideKey(key: string, isRtl: boolean): -1 | 0 | 1 {
  const ahead = isRtl ? "ArrowLeft" : "ArrowRight";
  const behind = isRtl ? "ArrowRight" : "ArrowLeft";
  if (key === ahead) return 1;
  if (key === behind) return -1;
  return 0;
}

/**
 * The progress through the slide's scroll at which the row stands at a
 * place from slideAt, the inverse of slideAt: a whole card's rest at the
 * middle of its rest, a place between two cards on the glide between
 * them. A sideways drag moves the row to a place this way, through the
 * page's scroll like everything else that moves the row. Clamped to the
 * cards; a place that is not a number is the first card's.
 */
export function progressAt(place: number, count: number = PASSES.length) {
  const last = Math.max(count - 1, 0);
  const total = count * SLIDE_REST + last * SLIDE_MOVE;
  if (!(total > 0)) return 0;
  const at = Number.isFinite(place) ? Math.min(Math.max(place, 0), last) : 0;
  const card = Math.floor(at);
  const share = at - card;
  if (share === 0) return restProgress(card, count);
  // The inverse of the glide's ease, t * t * (3 - 2 * t).
  const t = 0.5 - Math.sin(Math.asin(1 - 2 * share) / 3);
  const span = SLIDE_REST + SLIDE_MOVE;
  return (card * span + SLIDE_REST + t * SLIDE_MOVE) / total;
}

/** A finger's swipe at least this long, in page pixels, moves the row a card. */
export const SWIPE_PX = 16;

/**
 * Whether a finger's swipe of this length, sideways or up and down, moves
 * the row (D-167, D-169, D-174): from SWIPE_PX on it moves one card, however
 * long or quick, since a swipe that moved a card for each card's length flew
 * past cards on a phone [T7SEN, 15 Nov 2026]. Less is a touch, which goes
 * back to its card.
 */
export function isSwipe(distance: number): boolean {
  const length = Math.abs(distance);
  return Number.isFinite(length) && length >= SWIPE_PX;
}

/**
 * How long the page stays held after it catches a flick on a card, in
 * milliseconds, unless a touch, the wheel or a key comes first: longer than
 * the browser's own momentum runs (about 1.3 s in Chromium for the quickest
 * flick), which would carry the page on again were it let go sooner.
 */
export const CATCH_HOLD_MS = 1_500;
/**
 * How long the page's scroll must have been quiet after a finger lifts
 * before the lift's momentum counts as over, in milliseconds: a flick
 * scrolls on every frame until it stops.
 */
export const MOMENTUM_QUIET_MS = 120;

/**
 * The card's rest where the browser's momentum is caught (D-168), as it
 * moves the page from one position to the next between two scrolls: the
 * first rest it crosses in its way, or null when it crosses none. A flick
 * from above the slide is caught on its first card, one from below on its
 * last, and one inside it on the next card it reaches. A page that starts
 * on a rest, or within ON_REST_PX of it, has not crossed it, so a scroll
 * leaving the slide from its first or last card goes on.
 */
export function catchRest(
  from: number,
  to: number,
  rests: readonly number[],
): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
    return null;
  }
  if (to > from) {
    return rests.find((rest) => rest > from + ON_REST_PX && rest <= to) ?? null;
  }
  return (
    rests.findLast((rest) => rest < from - ON_REST_PX && rest >= to) ?? null
  );
}

/** Keys that move the page about a screen: Page Down, Page Up and Space. */
export function isPageKey(key: string): boolean {
  return key === "PageDown" || key === "PageUp" || key === " ";
}

/**
 * Where a key that pages the screen, pressed outside the slide, stops: on
 * the end card it reaches, as the wheel (D-132) and a flick (D-168) do
 * [T7SEN, 16 Nov 2026], else null and the key pages as ever. Counted as a
 * whole screen, a little more than the browser's own page step, so a card
 * the key would reach is never passed.
 */
export function pageRest(
  position: number,
  way: number,
  screen: number,
  rests: readonly number[],
): number | null {
  if (!(screen > 0) || (way !== 1 && way !== -1)) return null;
  return catchRest(position, position + way * screen, rests);
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
/**
 * After a step, the rest of its turn holds the page this long while the
 * card glides in: a quick spin of several notches moves one card, and a
 * spin that goes on walks on a card at a time, never faster [T7SEN, 15 Nov
 * 2026]. Lenis's glide is about nine tenths done by then.
 */
export const STEP_HOLD_MS = 450;
/** How close, in page pixels, a target is to a rest to count as on it. */
const ON_REST_PX = 2;

/**
 * What one turn of the wheel has done so far: the inputs gathered toward a
 * step (a trackpad's), when its last input came and when it last stepped.
 */
export type WheelTurn = {
  gathered: number;
  last: number;
  stepped: number;
};

export const NEW_TURN: WheelTurn = {
  gathered: 0,
  last: Number.NEGATIVE_INFINITY,
  stepped: Number.NEGATIVE_INFINITY,
};

/**
 * Where a wheel input sends the page in the making-of slide (D-132), from
 * Lenis's target and the input's delta, in page pixels, given the page
 * positions where the cards rest, in order: so each turn of the wheel is
 * one glide to the next card. Null lets the wheel scroll as ever: away from
 * the slide, and past its first card going up or its last going down, so
 * the page leaves it. An input that reaches the slide from above or below
 * lands on its first or last card. Inside it, a notch (NOTCH_PX or more,
 * NOTCH_GAP_MS or more after the input before it) moves the row a card on
 * from Lenis's target; smaller inputs, and a trackpad's close stream,
 * gather until they make half the way to the next card. After a step,
 * every input of the same turn within STEP_HOLD_MS is held, the end cards
 * included, so a quick spin glides one card and never flings the page out
 * of the slide. A held input returns the target unchanged, which holds the
 * page still.
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
  const stepped: WheelTurn = { ...turn, gathered: 0, stepped: now };
  if (target < first - ON_REST_PX) {
    return down && target + delta >= first
      ? { to: first, turn: stepped }
      : { to: null, turn };
  }
  if (target > last + ON_REST_PX) {
    return !down && target + delta <= last
      ? { to: last, turn: stepped }
      : { to: null, turn };
  }
  if (now - turn.stepped < STEP_HOLD_MS) {
    return { to: target, turn: { ...turn, gathered: 0 } };
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
  return { to, turn: stepped };
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
