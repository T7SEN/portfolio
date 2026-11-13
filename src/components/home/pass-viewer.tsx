"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cx } from "@/components/site/class-names";
import { passPosition, passViewer } from "@/content/passes";
import { LIVE_PASSES, PASSES, type PassId } from "@/engine/story";
import { calmStore } from "@/lib/calm-store";
import { tierStore, type TierSnapshot } from "@/lib/tier-store";
import { wheelSteps } from "@/lib/wheel-steps";

import { PassCard } from "./pass-card";
import {
  glideCard,
  keyStep,
  middleCard,
  NEW_TURN,
  restProgress,
  SETTLE_DELAY_MS,
  settleCard,
  SLIDE_MOVED,
  SLIDE_ROOM,
  slideAt,
  stepRest,
  STRETCH_SCREENS,
  swipeCards,
  wheelStep,
} from "./pass-slide";

/**
 * A key the focused element takes for itself: Space presses a button or a
 * link and types in a field; the arrows and page keys move inside a field.
 */
function keepsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.matches("input, textarea, select")) {
    return true;
  }
  return key === " " && target.matches("button, a[href], summary");
}

/** A finger's swipe that the row takes as a step (D-133). */
type Swipe = {
  /** Where the finger and the page were when it touched. */
  fromY: number;
  fromScroll: number;
  /** Where the finger is now. */
  y: number;
  /** Null until the first move says which way, then whether it is the row's. */
  owned: boolean | null;
};

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

/** The stretch's height: STRETCH_SCREENS screens (a test keeps them equal). */
const STRETCH_CLASS = "h-[189svh]";

/**
 * The making-of chapter's pass viewer (REQ-ENG-09): a card per pass of the
 * frame, in the frame's order, each with its breakdown. The static HTML
 * lays them out as a still grid, so all five read before any script runs and
 * with none (REQ-CNT-01). Once the page's script runs on a screen with room
 * for a whole card (SLIDE_ROOM), and unless calm mode or reduced motion is
 * on (REQ-A11Y-03, REQ-A11Y-04), they become a row that slides sideways
 * through a held screen as the page scrolls down: the page keeps its native
 * speed and its own scrollbar, and nothing is pinned by script (REQ-SCR-02).
 * The row rests at each card (pass-slide.ts). A wheel notch is one glide
 * straight to the next card (wheelStep, D-132, through the smooth scroll's
 * Lenis), and so is a scroll key or a finger's swipe (D-133): a swipe that
 * starts in the slide, where a card lies its way, moves the page with the
 * finger and glides on a card when it lifts. Once any other scroll stops
 * between two cards the page glides on to one of them (settleCard, D-131),
 * never while a finger or a pressed pointer holds the page. The card in
 * the middle is the one the field forms the T7 mark in and draws live, and
 * a rail of five ticks under the row shows which it is. Each face is a
 * button: a click or Tab takes the page to where its card rests.
 */
export function PassViewer() {
  const id = useId();
  const viewerRef = useRef<HTMLDivElement>(null);
  const stretchRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const [middle, setMiddle] = useState(0);
  const [glide, setGlide] = useState<number | null>(null);
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
    if (viewer === null || stretch === null || track === null) return;
    let frame = 0;
    // The settle (D-131): the direction the page was last scrolled, read
    // from the stretch's own box, and what holds the page still.
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTop = stretch.getBoundingClientRect().top;
    let direction = 0;
    let touches = 0;
    let isPressed = false;
    // The wheel's steps (D-132), the keys' last target while their glide
    // runs, so a second key goes on from it, and a finger's swipe (D-133).
    let turn = NEW_TURN;
    let keyTarget: number | null = null;
    let swipe: Swipe | null = null;

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
      window.scrollTo({ top, behavior: "smooth" });
    };

    const place = () => {
      frame = 0;
      const box = stretch.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      const progress = travel > 0 ? -box.top / travel : 0;
      const at = slideAt(progress);
      track.style.setProperty("--pass-at", String(at));
      setMiddle(middleCard(at));
      setGlide(glideCard(at));
      viewer.dispatchEvent(new Event(SLIDE_MOVED, { bubbles: true }));
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(place);
    };

    // Once the scroll has stopped with the row between two cards, the page
    // glides to where the card settleCard picks rests; the glide's own
    // scroll ends on that rest, so it settles once.
    const settle = () => {
      settleTimer = null;
      keyTarget = null;
      if (touches > 0 || isPressed) return;
      const box = stretch.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      if (!(travel > 0)) return;
      const card = settleCard(slideAt(-box.top / travel), direction);
      if (card === null) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
      window.scrollTo({
        top: window.scrollY + box.top + restProgress(card) * travel,
        behavior: reduce.matches ? "instant" : "smooth",
      });
    };
    const waitToSettle = () => {
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, SETTLE_DELAY_MS);
    };
    const onScroll = () => {
      const top = stretch.getBoundingClientRect().top;
      if (Math.abs(top - lastTop) > 0.5) direction = top < lastTop ? 1 : -1;
      lastTop = top;
      schedule();
      waitToSettle();
    };
    // A finger on the screen, or a mouse button held (a scrollbar drag),
    // holds the page where it is; letting go starts the wait again.
    const onTouch = (event: TouchEvent) => {
      touches = event.touches.length;
      if (touches === 0) waitToSettle();
    };
    const onPress = (event: PointerEvent) => {
      if (event.pointerType !== "touch") isPressed = true;
    };
    const onRelease = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !isPressed) return;
      isPressed = false;
      waitToSettle();
    };

    // A scroll key in the slide glides a card (D-133), from the card the
    // last key is heading for while its glide runs. At an end, or with the
    // focus on something that takes the key, the key does as it always does.
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
      if (event.metaKey || keepsKey(event.target, event.key)) return;
      const way = keyStep(event.key, event.shiftKey);
      if (way === 0) return;
      const at = rests();
      if (at === null) return;
      const to = stepRest(keyTarget ?? window.scrollY, way, at);
      if (to === null) return;
      event.preventDefault();
      keyTarget = to;
      glideTo(to);
    };

    // A finger's swipe in the slide (D-133). The first move says which way:
    // up or down the page, with a card that way, the swipe is the row's, so
    // the page follows the finger and, when it lifts, glides on as many
    // cards as swipeCards says, or back to where it was for a touch. Any
    // other swipe, and a second finger, is the browser's, as ever.
    const onSwipeStart = (event: TouchEvent) => {
      const finger = event.touches[0];
      if (event.touches.length !== 1 || finger === undefined) {
        if (swipe?.owned === true) endSwipe();
        swipe = null;
        return;
      }
      swipe = {
        fromY: finger.clientY,
        fromScroll: window.scrollY,
        y: finger.clientY,
        owned: null,
      };
    };
    const onSwipeMove = (event: TouchEvent) => {
      const finger = event.touches[0];
      if (swipe === null || swipe.owned === false || finger === undefined) {
        return;
      }
      swipe.y = finger.clientY;
      const pull = swipe.fromY - swipe.y;
      if (swipe.owned === null) {
        if (Math.abs(pull) < 2) return;
        const at = rests();
        swipe.owned =
          event.cancelable &&
          at !== null &&
          stepRest(swipe.fromScroll, Math.sign(pull), at) !== null;
        if (!swipe.owned) return;
      }
      event.preventDefault();
      window.scrollTo({ top: swipe.fromScroll + pull, behavior: "instant" });
    };
    const endSwipe = () => {
      const ended = swipe;
      swipe = null;
      if (ended?.owned !== true) return;
      const at = rests();
      if (at === null) return;
      const pull = ended.fromY - ended.y;
      const span = (at[1] ?? 0) - (at[0] ?? 0);
      const cards = swipeCards(pull, span);
      const on =
        cards > 0
          ? stepRest(ended.fromScroll, Math.sign(pull), at, cards)
          : null;
      const back = at.reduce((nearest, rest) =>
        Math.abs(rest - ended.fromScroll) < Math.abs(nearest - ended.fromScroll)
          ? rest
          : nearest,
      );
      glideTo(on ?? back);
    };

    place();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchend", onTouch, { passive: true });
    window.addEventListener("touchcancel", onTouch, { passive: true });
    window.addEventListener("pointerdown", onPress, { passive: true });
    window.addEventListener("pointerup", onRelease, { passive: true });
    window.addEventListener("pointercancel", onRelease, { passive: true });
    window.addEventListener("keydown", onKey);
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
      window.removeEventListener("pointerdown", onPress);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      window.removeEventListener("keydown", onKey);
      stretch.removeEventListener("touchstart", onSwipeStart);
      stretch.removeEventListener("touchmove", onSwipeMove);
      stretch.removeEventListener("touchend", endSwipe);
      stretch.removeEventListener("touchcancel", endSwipe);
      track.style.removeProperty("--pass-at");
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
    window.scrollTo({
      top,
      behavior: glide && !reduce.matches ? "smooth" : "instant",
    });
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
    >
      {/* What each pass's picture shows, read as its button's description. */}
      <div hidden>
        {PASSES.map((pass) => (
          <span key={pass} id={`${id}-${pass}`}>
            {passViewer.passes[pass].shows}
          </span>
        ))}
      </div>
      {isSliding ? (
        <div
          ref={stretchRef}
          data-part="pass-stretch"
          className={cx("relative", STRETCH_CLASS)}
        >
          <div
            data-part="pass-screen"
            className="sticky top-0 flex h-svh flex-col justify-center-safe overflow-x-clip"
          >
            <ol
              ref={trackRef}
              aria-label={passViewer.group}
              className={cx(
                "flex items-center gap-(--pass-gap) [--pass-gap:1.25rem] [--pass-w:min(84vw,24rem)] lg:[--pass-gap:2.5rem] lg:[--pass-w:min(84vw,52rem)]",
                "ps-[calc((100%-var(--pass-w))/2)] pe-[calc((100%-var(--pass-w))/2)]",
                "[transform:translateX(calc(var(--pass-at,0)*(var(--pass-w)+var(--pass-gap))*-1))]",
                "rtl:[transform:translateX(calc(var(--pass-at,0)*(var(--pass-w)+var(--pass-gap))))]",
              )}
            >
              {cards}
            </ol>
            <PassRail middle={middle} />
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
      className="mt-6 flex justify-center gap-2 lg:mt-8"
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
