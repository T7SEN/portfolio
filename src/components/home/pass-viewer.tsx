"use client";

import {
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { SECTION_GLIDE_EVENT } from "@/components/motion/scroll-to-section";
import { SectionLink } from "@/components/motion/section-link";
import { ArrowIcon } from "@/components/site/arrow-icon";
import { cx, HAIRLINE, MONO_CAPS } from "@/components/site/class-names";
import { Container } from "@/components/site/container";
import { passHint, passPosition, passViewer } from "@/content/passes";
import { LIVE_PASSES, PASSES, type PassId } from "@/engine/story";
import { calmStore } from "@/lib/calm-store";
import { overlayStore } from "@/lib/overlay-store";
import { tierStore, type TierSnapshot } from "@/lib/tier-store";
import { wheelSteps } from "@/lib/wheel-steps";

import { HeldPlate } from "./held-plate";
import { PassCard } from "./pass-card";
import { useFinePointer } from "./use-fine-pointer";
import {
  CATCH_HOLD_MS,
  catchRest,
  glideCard,
  isPageKey,
  keyStep,
  middleCard,
  NEW_TURN,
  pageRest,
  progressAt,
  restProgress,
  SETTLE_DELAY_MS,
  settleCard,
  sideKey,
  SLIDE_MOVED,
  SLIDE_ROOM,
  slideAt,
  isSwipe,
  MOMENTUM_QUIET_MS,
  SECTION_GLIDE_MS,
  stepRest,
  STRETCH_SCREENS,
  wheelStep,
} from "./pass-slide";

/**
 * A key the focused element takes for itself: Space presses a button and
 * types in a field; the arrows and page keys move inside a field. A link
 * answers Enter only, so Space on a link pages the screen, and in the slide
 * it steps a card like Space anywhere else (D-180).
 */
function keepsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.matches("input, textarea, select")) {
    return true;
  }
  return key === " " && target.matches("button, summary");
}

/** A finger's swipe in the slide (D-133, D-169, D-174). */
type Swipe = {
  /** Where the finger was when it touched. */
  fromX: number;
  fromY: number;
  /**
   * Where the swipe steps from: the rest a running glide is heading for,
   * or else where the page was.
   */
  origin: number;
  /** Where the finger is now. */
  x: number;
  y: number;
  /** Null until the first move says which way, then whether it is the row's. */
  owned: boolean | null;
  /** Which way the first move went: sideways (x) or up and down (y). */
  axis: "x" | "y" | null;
  /**
   * The card the swipe moves from, and the finger's pixels per card: the
   * row's width per card sideways, the page's scroll between two rests up
   * and down.
   */
  card: number;
  step: number;
};

/** A first move at least this long, in pixels, says which way a swipe goes. */
const AXIS_PX = 6;

/**
 * Whether the field draws a pass live in its card: only in a sliding row,
 * only in a card that holds the mark (the middle card, and while the row
 * glides the card the mark streams from or to), and only once a tier 1 or
 * 2 field has drawn the halftone, whose own steps the passes are, for a
 * pass its tier draws (LIVE_PASSES). The soft look has no passes. A middle
 * card that is not live shows its still, and so does every card of the
 * still grid; the row's other faces are empty frames (pass-card.tsx). No
 * card claims a live pass the device is not drawing (A14).
 */
export function isPassLive(
  pass: PassId,
  { tier, ready, look }: Pick<TierSnapshot, "tier" | "ready" | "look">,
  { isSliding, holdsMark }: { isSliding: boolean; holdsMark: boolean },
): boolean {
  if (!isSliding || !holdsMark) return false;
  if (!ready || look !== "halftone" || (tier !== 1 && tier !== 2)) {
    return false;
  }
  return LIVE_PASSES[tier].includes(pass);
}

// Whether the screen is tall enough for the sliding row (SLIDE_ROOM): false
// in the static HTML and while React takes it over, so both draw the still
// grid, then read again whenever the screen crosses the line. A browser
// that cannot answer keeps the grid.
function subscribeToRoom(onChange: () => void) {
  const query = window.matchMedia?.(SLIDE_ROOM);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function hasRoom(): boolean {
  return window.matchMedia?.(SLIDE_ROOM).matches ?? false;
}

function noRoomYet(): boolean {
  return false;
}

/**
 * The buttons either side of the rail: 44 px round, the quiet pill's
 * hairline, the arrow brightening like every link; at an end the arrow is
 * faint. Off at an end through aria-disabled, not disabled, so a button
 * that reaches its end under the keyboard keeps its focus and its full
 * ring, where a disabled one would hand focus to the page's body.
 */
const CONTROL_CLASS = cx(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border text-text transition-colors focus-visible:text-paper motion-reduce:transition-none",
  "aria-disabled:cursor-default aria-disabled:[&>svg]:opacity-35",
  "not-aria-disabled:hover:border-edge not-aria-disabled:hover:text-paper",
  HAIRLINE,
);

/** The line under the title's gap above it, px (mt-4), lifted with it. */
const INTRO_GAP_PX = 16;

/** The stretch's height: STRETCH_SCREENS screens (a test keeps them equal). */
const STRETCH_CLASS = "h-[189svh]";

type PassViewerProps = {
  /** The chapter's label and title, with its scene line. */
  heading: ReactNode;
  /** The line under the title. */
  intro: string;
};

function unitOf(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/**
 * The making-of chapter's pass viewer (REQ-ENG-09): a card per pass of the
 * frame, in the frame's order, each with its breakdown. The static HTML
 * lays them out as a still grid, so all five read before any script runs and
 * with none (REQ-CNT-01). Once the page's script runs on a screen with room
 * for a whole card (SLIDE_ROOM), and unless calm mode or reduced motion is
 * on (REQ-A11Y-03, REQ-A11Y-04), they become a row that slides sideways
 * through a held screen as the page scrolls down: the page keeps its native
 * speed and its own scrollbar, and nothing is pinned by script (REQ-SCR-02).
 * The row rests at each card (pass-slide.ts). Every way steps one card
 * (D-169, D-174): a finger's swipe, sideways or up and down, moves the row
 * with the finger, never past the next card, and glides on to that card
 * when it lifts; Arrow Right and Arrow Left, the scroll keys, and the
 * previous and next buttons either side of the rail glide a card. Up and
 * down stopped the page while a card lay that way from 15 Nov 2026, and on
 * a phone the slide then looked like the end of the site, so they step a
 * card again [T7SEN, 16 Nov 2026]. The page leaves from the first card up
 * or the last card down. On a desktop the wheel steps the cards: a turn of it is
 * one glide straight to the next card (wheelStep, D-132, D-167, through the
 * smooth scroll's Lenis). A flick from outside the slide that carries the
 * page into it stops on its first or last card (the catch, D-168), as a
 * wheel input coming in does. Once any other scroll stops between two cards
 * the page glides on to one of them (settleCard, D-131), never while a
 * finger or a pressed pointer holds the page. The card in the middle is the
 * one the field forms the T7 mark in and draws live, and a rail of five
 * ticks under the row shows which it is. Each face is a button: a click or
 * Tab takes the page to where its card rests.
 *
 * The chapter's heading stays in view with the cards while they slide
 * [T7SEN, 16 Nov 2026]: it heads the held screen, the label, the title and
 * the line under it on a desktop. Below 1024 px the label and the title stay
 * and the line under them fades as the screen arrives, the cards rising into
 * its place, so a phone keeps the card whole. The heading is the same
 * element in the still grid and the sliding row, never mounted again, so the
 * story's reveal keeps it. It brings its own plates (held-plate.tsx).
 */
export function PassViewer({ heading, intro }: PassViewerProps) {
  const id = useId();
  const viewerRef = useRef<HTMLDivElement>(null);
  const stretchRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const [middle, setMiddle] = useState(0);
  const [glide, setGlide] = useState<number | null>(null);
  // The previous and next buttons' step, set while the row slides.
  const stepRef = useRef<((way: -1 | 1) => void) | null>(null);
  // The rest a glide of the row is heading for while it runs: a key's, a
  // swipe's, a button's, a face's click or the settle's, so the next key
  // or swipe goes on from it (D-180).
  const glideTargetRef = useRef<number | null>(null);
  const tier = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );
  const { calm } = useSyncExternalStore(
    calmStore.subscribe,
    calmStore.getSnapshot,
    calmStore.getServerSnapshot,
  );
  const hasSpace = useSyncExternalStore(subscribeToRoom, hasRoom, noRoomYet);
  const isSliding = hasSpace && !calm;
  const isFine = useFinePointer();
  const middlePass = PASSES[middle] ?? PASSES[0];
  const isMiddleLive = isPassLive(middlePass, tier, {
    isSliding,
    holdsMark: true,
  });
  // The field shows through a face it draws nothing in, as it does through
  // a work frame: where it is drawn live, the row's empty frames are open.
  const seesField =
    isSliding && tier.ready && (tier.tier === 1 || tier.tier === 2);

  // The row's place follows the page's scroll on every frame it moves,
  // written straight to the track's style, so React draws again only when a
  // new card reaches the middle. Set before the first paint of the row, so
  // a page opened part way down the slide never shows the first card.
  useLayoutEffect(() => {
    if (!isSliding) return;
    const viewer = viewerRef.current;
    const stretch = stretchRef.current;
    const track = trackRef.current;
    const screen = screenRef.current;
    const introLine = introRef.current;
    if (
      viewer === null ||
      stretch === null ||
      track === null ||
      screen === null ||
      introLine === null
    ) {
      return;
    }
    let frame = 0;
    // The settle (D-131): the direction the page was last scrolled, read
    // from the stretch's own box, and what holds the page still.
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTop = stretch.getBoundingClientRect().top;
    let direction = 0;
    let touches = 0;
    let isPressed = false;
    // The wheel's steps (D-132) and a finger's swipe (D-133).
    let turn = NEW_TURN;
    let swipe: Swipe | null = null;
    // A glide to a part of the page passing through the slide (D-180).
    let sectionTimer: ReturnType<typeof setTimeout> | null = null;
    // The catch (D-168): whether a finger's lift has left the page moving
    // under the browser's own momentum, where the finger started and is
    // now, whether the touch was the row's swipe, where the page was at the
    // last scroll, and the hold that stops the momentum on a card.
    let isMomentum = false;
    let momentumTimer: ReturnType<typeof setTimeout> | null = null;
    let fingerFrom = Number.NaN;
    let fingerAt = Number.NaN;
    let isRowTouch = false;
    let lastY = window.scrollY;
    const isRtl = () => document.documentElement.dir === "rtl";
    // The row's width per card: one card's start to the next card's.
    const cardStep = () => {
      const [first, second] = [...track.children] as HTMLElement[];
      const step = Math.abs(
        (second?.offsetLeft ?? 0) - (first?.offsetLeft ?? 0),
      );
      return step > 0 ? step : window.innerWidth;
    };
    let releaseHold: (() => void) | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    const rests = () => {
      const box = stretch.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      if (!(travel > 0)) return null;
      const top = window.scrollY + box.top;
      return PASSES.map((_, index) => top + restProgress(index) * travel);
    };
    const releaseWheel = wheelSteps.set((target, delta) => {
      const at = rests();
      if (at === null) return null;
      const step = wheelStep(target, delta, at, performance.now(), turn);
      turn = step.turn;
      return step.to;
    });

    // A glide to a card's rest, as a click on its face makes.
    const glideTo = (top: number) => {
      glideTargetRef.current = top;
      window.scrollTo({ top, behavior: "smooth" });
    };
    // The card nearest a page position inside the slide, or null away
    // from it.
    const cardAt = (position: number, at: readonly number[]) => {
      const first = at[0];
      const last = at.at(-1);
      if (first === undefined || last === undefined) return null;
      if (position < first - 2 || position > last + 2) return null;
      const span = at.length > 1 ? (last - first) / (at.length - 1) : 0;
      if (!(span > 0)) return 0;
      return Math.min(
        Math.max(Math.round((position - first) / span), 0),
        at.length - 1,
      );
    };
    // The previous and next buttons: a card on from the one the page rests
    // on or heads for, or from the card in the middle while the page is
    // above or below the slide.
    stepRef.current = (way) => {
      const at = rests();
      if (at === null) return;
      const from =
        cardAt(glideTargetRef.current ?? window.scrollY, at) ??
        middleCard(Number(track.style.getPropertyValue("--pass-at")));
      const to = at[from + way];
      if (to !== undefined) glideTo(to);
    };

    const place = () => {
      frame = 0;
      const box = stretch.getBoundingClientRect();
      const room = introLine.offsetHeight + INTRO_GAP_PX;
      const travel = box.height - window.innerHeight;
      const progress = travel > 0 ? -box.top / travel : 0;
      const at = slideAt(progress);
      track.style.setProperty("--pass-at", String(at));
      // Below 1024 px the screen's arrival keeps the label, the title and a
      // whole card: over the last two rooms of it (a room is what the line
      // under the title takes), the line fades out, then the cards rise by a
      // room into its place (the classes read all three). The line is gone
      // before the cards move, as the middle face is clear and would show
      // it through.
      const arrive = room > 0 ? unitOf(1 - box.top / (2 * room)) : 1;
      screen.style.setProperty("--pass-intro", `${room}px`);
      screen.style.setProperty("--pass-fade", String(unitOf(1 - 2 * arrive)));
      screen.style.setProperty("--pass-lift", String(unitOf(2 * arrive - 1)));
      setMiddle(middleCard(at));
      setGlide(glideCard(at));
      viewer.dispatchEvent(new Event(SLIDE_MOVED, { bubbles: true }));
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(place);
    };

    // Once the scroll has stopped with the row between two cards, the page
    // glides to where the card settleCard picks rests; the glide's own
    // scroll ends on that rest, so it settles once. A glide to a part of
    // the page is left to reach it: its scroll can stop for a stalled
    // frame or two between two cards on its way (D-180).
    const settle = () => {
      settleTimer = null;
      glideTargetRef.current = null;
      if (touches > 0 || isPressed || sectionTimer !== null) return;
      const box = stretch.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      if (!(travel > 0)) return;
      const card = settleCard(slideAt(-box.top / travel), direction);
      if (card === null) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
      const top = window.scrollY + box.top + restProgress(card) * travel;
      if (!reduce.matches) glideTargetRef.current = top;
      window.scrollTo({
        top,
        behavior: reduce.matches ? "instant" : "smooth",
      });
    };
    const endSectionGlide = () => {
      if (sectionTimer !== null) clearTimeout(sectionTimer);
      sectionTimer = null;
    };
    const onSectionGlide = () => {
      endSectionGlide();
      sectionTimer = setTimeout(() => {
        sectionTimer = null;
      }, SECTION_GLIDE_MS);
    };
    const waitToSettle = () => {
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, SETTLE_DELAY_MS);
    };
    // The catch (D-168). A swipe that starts outside the slide is the
    // browser's: the page followed the finger itself across two or three
    // cards on a big swipe, and its momentum ran through every card and out
    // the other side. While such a finger drags the page, and once its lift
    // leaves the page moving, the first card's rest the scroll crosses
    // (catchRest) holds the page: the root takes overflow hidden, as the
    // loader's hold does (hold-page.ts), which stops both the finger's
    // scroll and the browser's momentum, and the page glides back to that
    // rest. A page script cannot stop the momentum otherwise: in Chromium
    // setting the scroll went on under it, and neither CSS scroll snap with
    // scroll-snap-stop always nor a hold of 150 ms stopped flicks from more
    // than a screen away, the momentum going on once the page was let go.
    // So the hold lasts until CATCH_HOLD_MS after the finger lifts, longer
    // than the momentum runs, and a new touch, the wheel or a key lets go at
    // once. The touch is heard before the browser scrolls (not passive), so
    // its own scroll is never held.
    const letGo = () => {
      if (holdTimer !== null) clearTimeout(holdTimer);
      holdTimer = null;
      releaseHold?.();
      releaseHold = null;
    };
    const holdAt = (top: number) => {
      letGo();
      const html = document.documentElement;
      const overflow = html.style.getPropertyValue("overflow");
      const gutter = html.style.getPropertyValue("scrollbar-gutter");
      const hasScrollbar = window.innerWidth > html.clientWidth;
      html.style.setProperty("overflow", "hidden");
      if (hasScrollbar) html.style.setProperty("scrollbar-gutter", "stable");
      window.addEventListener("touchstart", letGo, { passive: false });
      window.addEventListener("wheel", letGo, { passive: true });
      window.addEventListener("keydown", letGo);
      releaseHold = () => {
        window.removeEventListener("touchstart", letGo);
        window.removeEventListener("wheel", letGo);
        window.removeEventListener("keydown", letGo);
        if (overflow === "") html.style.removeProperty("overflow");
        else html.style.setProperty("overflow", overflow);
        if (gutter === "") html.style.removeProperty("scrollbar-gutter");
        else html.style.setProperty("scrollbar-gutter", gutter);
      };
      // Held while the finger is down; from its lift, for CATCH_HOLD_MS.
      if (touches === 0) holdTimer = setTimeout(letGo, CATCH_HOLD_MS);
      glideTo(top);
    };
    const endMomentum = () => {
      if (momentumTimer !== null) clearTimeout(momentumTimer);
      momentumTimer = null;
      isMomentum = false;
    };
    const waitMomentum = () => {
      if (momentumTimer !== null) clearTimeout(momentumTimer);
      momentumTimer = setTimeout(endMomentum, MOMENTUM_QUIET_MS);
    };
    const onFingerMove = (event: TouchEvent) => {
      const finger = event.touches[0];
      if (finger !== undefined) fingerAt = finger.clientY;
    };
    // Every finger off the screen: when the finger swiped (isSwipe) and the
    // touch was not the row's swipe, whose glide is the page's own, any
    // scroll from here is the lift's momentum until the scroll is quiet. A
    // tap moves no finger, so a glide it starts (a link to a place on the
    // page, the palette) is never held. Read from the finger, not from the
    // page's scroll events, which a quick flick lifts before. Where the page
    // was at the last scroll stays as it is: the browser may have scrolled
    // the page across a rest since, and the next scroll must still see it.
    const onLift = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      isMomentum = isSwipe(fingerFrom - fingerAt) && !isRowTouch;
      isRowTouch = false;
      if (releaseHold !== null) {
        if (holdTimer !== null) clearTimeout(holdTimer);
        holdTimer = setTimeout(letGo, CATCH_HOLD_MS);
      }
      if (isMomentum) waitMomentum();
    };

    const onScroll = () => {
      const top = stretch.getBoundingClientRect().top;
      if (Math.abs(top - lastTop) > 0.5) direction = top < lastTop ? 1 : -1;
      lastTop = top;
      schedule();
      waitToSettle();
      const y = window.scrollY;
      // The browser's own scroll from a touch: a finger dragging the page
      // that is not the row's swipe, or a lift's momentum.
      const isTouchScroll = (touches > 0 && !isRowTouch) || isMomentum;
      if (isTouchScroll && releaseHold === null) {
        const at = rests();
        const to = at === null ? null : catchRest(lastY, y, at);
        if (to !== null) {
          endMomentum();
          holdAt(to);
        }
      }
      lastY = y;
      if (isMomentum) waitMomentum();
    };
    // A finger on the screen, or a mouse button held (a scrollbar drag),
    // holds the page where it is; letting go starts the wait again. A new
    // touch ends a lift's momentum.
    const onTouch = (event: TouchEvent) => {
      touches = event.touches.length;
      if (event.type === "touchstart") {
        endMomentum();
        endSectionGlide();
        fingerFrom = event.touches[0]?.clientY ?? Number.NaN;
        fingerAt = fingerFrom;
        isRowTouch = false;
      }
      if (touches === 0) waitToSettle();
    };
    const onPress = (event: PointerEvent) => {
      endSectionGlide();
      if (event.pointerType !== "touch") isPressed = true;
    };
    const onRelease = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !isPressed) return;
      isPressed = false;
      waitToSettle();
    };

    // In the slide the sideways arrows glide a card, toward the next card
    // and back (D-169), and so does a scroll key up or down while a card
    // lies its way (D-133, D-174), from the card the last key is heading for
    // while its glide runs. At an end, or with the focus on something that
    // takes the key, the key does as it always does. From outside, a key
    // that pages the screen stops on the end card it reaches (pageRest).
    // While the menu or the palette is open the keys are the dialog's, and
    // the page behind it stays where it is. A key held down steps once:
    // its repeats are taken and move nothing, so a held arrow never runs
    // through the row and out of the slide (pillar 7, D-180).
    const onKey = (event: KeyboardEvent) => {
      endSectionGlide();
      if (overlayStore.getSnapshot() !== null) return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
      if (event.metaKey || keepsKey(event.target, event.key)) return;
      const side = sideKey(event.key, isRtl());
      const way = side !== 0 ? side : keyStep(event.key, event.shiftKey);
      if (way === 0) return;
      const at = rests();
      if (at === null) return;
      const to = stepRest(glideTargetRef.current ?? window.scrollY, way, at);
      if (to === null) {
        const caught =
          side === 0 && isPageKey(event.key)
            ? pageRest(window.scrollY, way, window.innerHeight, at)
            : null;
        if (caught === null) return;
        event.preventDefault();
        if (!event.repeat) glideTo(caught);
        return;
      }
      event.preventDefault();
      if (!event.repeat) glideTo(to);
    };
    const onWheel = () => endSectionGlide();

    // A finger's swipe in the slide (D-133, D-169, D-174). The first move
    // says which way. Sideways on a card, or up and down with a card that
    // way, the swipe is the row's: the row follows the finger as far as the
    // next card (progressAt) and, when it lifts, glides on that one card
    // (isSwipe), or back for a touch. Sideways the row keeps under the
    // finger; up and down a card takes the page's scroll between two rests,
    // as the page would have moved. Any other swipe, and a second finger, is
    // the browser's, as ever: up from the last card or down from the first,
    // the page leaves the slide.
    const onSwipeStart = (event: TouchEvent) => {
      const finger = event.touches[0];
      if (event.touches.length !== 1 || finger === undefined) {
        if (swipe?.owned === true) endSwipe();
        swipe = null;
        return;
      }
      // A glide's target counts while the page is within a card of it, so
      // one left over from a glide the page has since left counts for
      // nothing.
      const at = rests();
      const span = (at?.[1] ?? 0) - (at?.[0] ?? 0);
      const heading = glideTargetRef.current;
      const isGliding =
        heading !== null && Math.abs(heading - window.scrollY) <= span;
      swipe = {
        fromX: finger.clientX,
        fromY: finger.clientY,
        origin: isGliding ? heading : window.scrollY,
        x: finger.clientX,
        y: finger.clientY,
        owned: null,
        axis: null,
        card: 0,
        step: 1,
      };
    };
    const onSwipeMove = (event: TouchEvent) => {
      const finger = event.touches[0];
      if (swipe === null || swipe.owned === false || finger === undefined) {
        return;
      }
      swipe.x = finger.clientX;
      swipe.y = finger.clientY;
      const pull = swipe.fromY - swipe.y;
      // The finger toward the next card: to the left, or to the right on a
      // right-to-left page.
      const push = (swipe.fromX - swipe.x) * (isRtl() ? -1 : 1);
      if (swipe.owned === null) {
        if (Math.max(Math.abs(pull), Math.abs(push)) < AXIS_PX) return;
        const at = rests();
        const card = at === null ? null : cardAt(swipe.origin, at);
        if (Math.abs(push) > Math.abs(pull)) {
          swipe.axis = "x";
          swipe.owned = event.cancelable && card !== null;
          if (!swipe.owned || card === null) return;
          swipe.step = cardStep();
        } else {
          swipe.axis = "y";
          swipe.owned =
            event.cancelable &&
            at !== null &&
            card !== null &&
            stepRest(swipe.origin, Math.sign(pull), at) !== null;
          if (!swipe.owned || at === null || card === null) return;
          swipe.step = Math.max((at[1] ?? 0) - (at[0] ?? 0), 1);
        }
        swipe.card = card;
        isRowTouch = true;
      }
      event.preventDefault();
      const box = stretch.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      if (!(travel > 0)) return;
      const toward = swipe.axis === "x" ? push : pull;
      const moved = Math.min(Math.max(toward / swipe.step, -1), 1);
      const top =
        window.scrollY + box.top + progressAt(swipe.card + moved) * travel;
      window.scrollTo({ top, behavior: "instant" });
    };
    const endSwipe = () => {
      const ended = swipe;
      swipe = null;
      if (ended === null || ended.owned === false) return;
      const at = rests();
      if (at === null) return;
      // A touch too short to say which way goes back to its card, as a
      // short swipe does.
      if (ended.owned === null) {
        const moved = ended.x !== ended.fromX || ended.y !== ended.fromY;
        const card = cardAt(ended.origin, at);
        const back = card === null ? undefined : at[card];
        if (moved && back !== undefined) glideTo(back);
        return;
      }
      const toward =
        ended.axis === "x"
          ? (ended.fromX - ended.x) * (isRtl() ? -1 : 1)
          : ended.fromY - ended.y;
      const on = isSwipe(toward)
        ? at[ended.card + Math.sign(toward)]
        : undefined;
      const back = at[ended.card];
      if (on !== undefined) glideTo(on);
      else if (back !== undefined) glideTo(back);
    };

    place();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("touchend", onTouch, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchcancel", onTouch, { passive: true });
    window.addEventListener("touchmove", onFingerMove, { passive: true });
    window.addEventListener("touchend", onLift, { passive: true });
    window.addEventListener("pointerdown", onPress, { passive: true });
    window.addEventListener("pointerup", onRelease, { passive: true });
    window.addEventListener("pointercancel", onRelease, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener(SECTION_GLIDE_EVENT, onSectionGlide);
    stretch.addEventListener("touchstart", onSwipeStart, { passive: true });
    stretch.addEventListener("touchmove", onSwipeMove, { passive: false });
    stretch.addEventListener("touchend", endSwipe, { passive: true });
    stretch.addEventListener("touchcancel", endSwipe, { passive: true });
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      if (settleTimer !== null) clearTimeout(settleTimer);
      releaseWheel();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchend", onTouch);
      window.removeEventListener("touchcancel", onTouch);
      window.removeEventListener("touchmove", onFingerMove);
      window.removeEventListener("touchend", onLift);
      endMomentum();
      letGo();
      window.removeEventListener("pointerdown", onPress);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener(SECTION_GLIDE_EVENT, onSectionGlide);
      endSectionGlide();
      glideTargetRef.current = null;
      stretch.removeEventListener("touchstart", onSwipeStart);
      stretch.removeEventListener("touchmove", onSwipeMove);
      stretch.removeEventListener("touchend", endSwipe);
      stretch.removeEventListener("touchcancel", endSwipe);
      track.style.removeProperty("--pass-at");
      stepRef.current = null;
    };
  }, [isSliding]);

  // A new card in the middle, a face turning live or back to its still, and
  // the switch between the row and the grid all move the faces the field
  // reads, after the scroll that caused them has reached the story: it is
  // told once they are drawn.
  useLayoutEffect(() => {
    viewerRef.current?.dispatchEvent(new Event(SLIDE_MOVED, { bubbles: true }));
  }, [isSliding, middle, glide, isMiddleLive]);

  // Takes the page to where a card rests in the middle. A click glides
  // there; Tab, which must show its card at once, jumps.
  const show = useCallback((pass: PassId, glide: boolean) => {
    const stretch = stretchRef.current;
    if (stretch === null) return;
    const box = stretch.getBoundingClientRect();
    const travel = box.height - window.innerHeight;
    if (!(travel > 0)) return;
    const top =
      window.scrollY + box.top + restProgress(PASSES.indexOf(pass)) * travel;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isGlide = glide && !reduce.matches;
    // A key or a button pressed while this glide runs goes on from its
    // card, as from any other glide's (D-180).
    glideTargetRef.current = isGlide ? top : null;
    window.scrollTo({ top, behavior: isGlide ? "smooth" : "instant" });
  }, []);

  const cards = PASSES.map((pass, index) => {
    const isMiddle = index === middle;
    const holdsMark = isMiddle || (isSliding && index === glide);
    return (
      <PassCard
        key={pass}
        pass={pass}
        position={passPosition(pass)}
        copy={passViewer.passes[pass]}
        isSliding={isSliding}
        isMiddle={isMiddle}
        isLive={isPassLive(pass, tier, { isSliding, holdsMark })}
        seesField={seesField}
        descriptionId={`${id}-${pass}`}
        onShow={show}
      />
    );
  });

  return (
    <div
      ref={viewerRef}
      data-pass-viewer=""
      data-sliding={isSliding ? "" : undefined}
      // The room above the stretch, here rather than on the stretch, so the
      // chapter's first child keeps its own margin (the still grid's room
      // is the heading's padding instead).
      className={isSliding ? "mt-16 lg:mt-22" : undefined}
    >
      {/* What each pass's picture shows, read as its button's description. */}
      <div hidden>
        {PASSES.map((pass) => (
          <span key={pass} id={`${id}-${pass}`}>
            {passViewer.passes[pass].shows}
          </span>
        ))}
      </div>
      {/* One tree in both modes, so the heading is never mounted again:
          the still grid lays it above the cards; the sliding row holds it
          at the top of the held screen. */}
      <div
        ref={stretchRef}
        data-part={isSliding ? "pass-stretch" : undefined}
        className={isSliding ? cx("relative", STRETCH_CLASS) : undefined}
      >
        <div
          ref={screenRef}
          data-part={isSliding ? "pass-screen" : undefined}
          className={
            isSliding
              ? "sticky top-0 isolate flex h-svh flex-col overflow-x-clip"
              : "isolate"
          }
        >
          <Container
            className={
              isSliding ? "relative shrink-0 pt-4 lg:pt-10" : "pt-20 lg:pt-32"
            }
          >
            <HeldPlate>{heading}</HeldPlate>
            <div
              ref={introRef}
              className={cx(
                "mt-4",
                isSliding && "max-lg:opacity-[var(--pass-fade,1)]",
              )}
            >
              <HeldPlate>
                <p
                  data-story-intro=""
                  className="max-w-[35rem] leading-[1.55] text-muted"
                >
                  {intro}
                </p>
              </HeldPlate>
            </div>
            {/* The way past the cards, on the label's row at its end, so it
                takes no room from them; before the cards in the reading and
                Tab order, so it skips them for a keyboard too (D-175). It
                scrolls to About rather than jumping (D-176). Its 24 px target
                is centred on the label's line: the container's top padding
                less 4 px. */}
            {isSliding && (
              <div className="absolute end-4 top-3 sm:end-6 lg:end-14 lg:top-9">
                <HeldPlate>
                  <SectionLink
                    href="#about"
                    data-part="pass-skip"
                    className={cx(
                      MONO_CAPS,
                      "flex min-h-6 items-center gap-1.5 text-xs leading-[1.4] tracking-[0.14em] text-muted transition-colors hover:text-paper focus-visible:text-paper motion-reduce:transition-none",
                    )}
                  >
                    {passViewer.skip}
                    <ArrowIcon
                      direction="down"
                      className="size-3.5 text-glow"
                    />
                  </SectionLink>
                </HeldPlate>
              </div>
            )}
          </Container>
          {isSliding ? (
            <div
              data-part="pass-row"
              className="flex min-h-0 flex-1 flex-col justify-center-safe pt-4 pb-4 max-lg:[translate:0_calc(var(--pass-lift,0)*var(--pass-intro,0px)*-1)] lg:pt-6 lg:pb-6"
            >
              <ol
                ref={trackRef}
                aria-label={passViewer.group}
                className={cx(
                  "flex items-stretch gap-(--pass-gap) [--pass-gap:1.25rem] [--pass-w:min(84vw,24rem)] lg:[--pass-gap:2.5rem] lg:[--pass-w:min(84vw,52rem)]",
                  "ps-[calc((100%-var(--pass-w))/2)] pe-[calc((100%-var(--pass-w))/2)]",
                  "[transform:translateX(calc(var(--pass-at,0)*(var(--pass-w)+var(--pass-gap))*-1))]",
                  "rtl:[transform:translateX(calc(var(--pass-at,0)*(var(--pass-w)+var(--pass-gap))))]",
                )}
              >
                {cards}
              </ol>
              <div
                data-part="pass-controls"
                className="mt-6 flex items-center justify-center gap-4 lg:mt-8"
              >
                <button
                  type="button"
                  data-part="pass-previous"
                  aria-label={passViewer.previous}
                  aria-disabled={middle === 0}
                  onClick={() => {
                    if (middle !== 0) stepRef.current?.(-1);
                  }}
                  className={CONTROL_CLASS}
                >
                  <ArrowIcon
                    direction="forward"
                    className="size-4 rotate-180"
                  />
                </button>
                <div className="flex min-w-0 flex-col items-center gap-2">
                  <PassRail middle={middle} />
                  {/* Seen, not read aloud: each card says its place, and a
                      screen reader moves by the buttons, not by swipes. */}
                  <HeldPlate>
                    <p
                      aria-hidden="true"
                      data-part="pass-hint"
                      className="text-center font-mono text-[0.6875rem] leading-[1.4] text-muted"
                    >
                      {passHint(middle, isFine)}
                    </p>
                  </HeldPlate>
                </div>
                <button
                  type="button"
                  data-part="pass-next"
                  aria-label={passViewer.next}
                  aria-disabled={middle === PASSES.length - 1}
                  onClick={() => {
                    if (middle !== PASSES.length - 1) stepRef.current?.(1);
                  }}
                  className={CONTROL_CLASS}
                >
                  <ArrowIcon direction="forward" className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <ol
              aria-label={passViewer.group}
              className="mx-auto mt-10 grid max-w-[78rem] gap-5 px-4 sm:grid-cols-2 sm:px-8 lg:mt-14 lg:grid-cols-3 lg:px-14"
            >
              {cards}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

type PassRailProps = {
  middle: number;
};

// Five ticks under the row, the middle card's lit, so a visitor sees where
// the slide stands and that it ends. Decorative: each card says "Pass 2 of
// 5" in words.
function PassRail({ middle }: PassRailProps) {
  return (
    <div
      aria-hidden="true"
      data-part="pass-rail"
      className="flex justify-center gap-2"
    >
      {PASSES.map((pass, index) => (
        <span
          key={pass}
          className={cx(
            "h-1 w-6 rounded-full transition-colors duration-300 motion-reduce:transition-none",
            index === middle ? "bg-glow" : "bg-edge/50",
          )}
        />
      ))}
    </div>
  );
}

/** For tests: the stretch's height in screens and its class. */
export const PASS_STRETCH = {
  screens: STRETCH_SCREENS,
  className: STRETCH_CLASS,
} as const;
