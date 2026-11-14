import type * as Catalogue from "@/engine/sky/catalogue";
import type * as SkyMaths from "@/engine/sky/sky";
import type { ChapterId, SkyView } from "@/engine/types";
import type { SkyMessage } from "@/lib/sky-message";

// The contact sky on the page (D-146, D-147): while the contact chapter is
// near, every frame works out the sky from the same maths the engine uses
// (src/engine/sky/sky.ts), shows a constellation's name where the pointer
// settles, and sends the view to the engine through the story bridge. The
// catalogue and the maths are loaded after first content and passed in, so
// none of it is in the first load (REQ-PERF-04).

/** A tap on the sky (a phone has no hover) holds its place this long, ms. */
export const TAP_HOLD_MS = 4000;
/** The name shows once a constellation's reveal passes this. */
export const LABEL_FROM = 0.35;
/** After Send the traced constellation's name shows this long, ms. */
export const SENT_NAME_MS = 6000;
/**
 * The name sits this far above its constellation's top star, CSS px, or
 * this far below its bottom star where less of it would be hidden there.
 */
const LABEL_ABOVE_PX = 34;
const LABEL_BELOW_PX = 14;
/** Its edges keep this far inside the screen's sides; its top this far down. */
const LABEL_SIDE_PX = 16;
const LABEL_TOP_PX = 14;
/** The flash after Send rises over this many ms and fades over this many. */
const FLASH_RISE_MS = 150;
const FLASH_FADE_MS = 1200;

// Elements a tap on means something else: the form, links, buttons.
const NOT_SKY = "a, button, input, textarea, select, label, [data-stage]";

/** A box in front of the sky, in the screen's CSS px. */
export type Cover = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ContactSkyOptions = {
  catalogue: typeof Catalogue;
  maths: typeof SkyMaths;
  /** The contact chapter: the sky runs while it is near the screen. */
  section: Element;
  /** The label and the element its name goes in. */
  label: HTMLElement;
  name: HTMLElement;
  /** The constellations' names by IAU abbreviation (src/content/sky.ts). */
  names: Readonly<Record<string, string>>;
  /**
   * The horizon's height from the screen's top on this frame, CSS px, for a
   * screen this size; null for the maths' own default (sky.ts skyFrame).
   */
  horizon(width: number, height: number): number | null;
  /**
   * What stands in front of the sky on this frame: the contact panel and
   * the plates behind text. A constellation whose middle is behind one is
   * not named, drawn or traced, since nobody would see its lines.
   */
  covered?: () => readonly Cover[];
  /**
   * The story in view (story-bridge.ts getStory). The field draws the sky
   * only in the contact chapter, gathering over its first quarter
   * (sky.ts skyGather), so names and lines wait for it there.
   */
  story(): { chapter: ChapterId; progress: number } | null;
  calm(): boolean;
  message(): SkyMessage;
  send(view: SkyView | null): void;
  /** Calls back with true while the section is near the screen. */
  near?: (section: Element, onChange: (near: boolean) => void) => () => void;
  target?: Window;
  /** The performance clock and the wall clock, in ms. */
  now?: () => number;
  clock?: () => number;
};

type Point = { x: number; y: number };

function nearByObserver(
  section: Element,
  onChange: (near: boolean) => void,
): () => void {
  // One screen beyond the section, so the sky is placed before it shows.
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries.at(-1);
      if (entry !== undefined) onChange(entry.isIntersecting);
    },
    { rootMargin: "100% 0px" },
  );
  observer.observe(section);
  return () => observer.disconnect();
}

/** Starts the page's side of the contact sky. Returns the stop. */
export function startContactSky(options: ContactSkyOptions): () => void {
  const {
    catalogue,
    maths,
    section,
    label,
    name,
    names,
    target = window,
    now = () => target.performance.now(),
    clock = () => Date.now(),
  } = options;
  const near = options.near ?? nearByObserver;
  const sky = maths.prepareSky(
    {
      stars: catalogue.SKY_STARS,
      segments: catalogue.SKY_SEGMENTS,
      constellations: catalogue.SKY_CONSTELLATIONS,
    },
    clock(),
  );
  const placed = maths.createPlaced(sky.count);
  const reveal = new Float32Array(catalogue.SKY_CONSTELLATIONS.length);
  const shown = new Set<number>();

  let isNear = false;
  let isRunning = false;
  let frame = 0;
  let lastTime: number | null = null;
  let mouse: Point | null = null;
  let tap: (Point & { until: number }) | null = null;
  let eased: SkyMaths.EasedPointer | null = null;
  let frozenAt: number | null = null;
  let traced = -1;
  let sentNull = true;

  const hideLabel = () => {
    label.style.opacity = "0";
  };

  const showLabel = (
    index: number,
    constellation: { x: number; top: number; bottom: number },
    level: number,
    covers: readonly Cover[],
  ) => {
    const abbreviation = catalogue.SKY_CONSTELLATIONS[index] ?? "";
    const text = names[abbreviation] ?? abbreviation;
    if (name.textContent !== text) name.textContent = text;
    // The label is centred on x: its half width keeps a long name clear of
    // the side and the scrollbar.
    const width =
      target.document.documentElement?.clientWidth ?? target.innerWidth;
    const half = Math.max(label.offsetWidth, 1) / 2;
    const height = Math.max(label.offsetHeight, 1);
    const x = Math.min(
      Math.max(constellation.x, half + LABEL_SIDE_PX),
      width - half - LABEL_SIDE_PX,
    );
    const above = Math.max(LABEL_TOP_PX, constellation.top - LABEL_ABOVE_PX);
    const below = constellation.bottom + LABEL_BELOW_PX;
    // How much of the label the boxes in front of the sky would hide.
    const hidden = (top: number) =>
      covers.reduce(
        (sum, box) =>
          sum +
          Math.max(
            0,
            Math.min(x + half, box.right) - Math.max(x - half, box.left),
          ) *
            Math.max(
              0,
              Math.min(top + height, box.bottom) - Math.max(top, box.top),
            ),
        0,
      );
    label.style.left = `${x}px`;
    label.style.top = `${hidden(below) < hidden(above) ? below : above}px`;
    label.style.opacity = String(
      Math.min(Math.max((level - LABEL_FROM) / 0.4, 0), 1),
    );
  };

  const step = () => {
    frame = 0;
    if (!isRunning) return;
    const time = now();
    const seconds = lastTime === null ? 0 : (time - lastTime) / 1000;
    lastTime = time;
    const calm = options.calm();
    if (calm) frozenAt ??= clock();
    else frozenAt = null;
    const at = frozenAt ?? clock();

    // The canvas's own width, which leaves out a classic scrollbar, so the
    // names sit on the stars the field draws.
    const width =
      target.document.documentElement?.clientWidth ?? target.innerWidth;
    const height = target.innerHeight;
    const horizon = options.horizon(width, height);
    const view =
      horizon === null
        ? maths.skyFrame(width, height)
        : { width, height, horizon };
    if (tap !== null && time > tap.until) tap = null;
    eased = maths.easePointer(eased, mouse ?? tap, seconds);
    const turn = calm ? { turn: 0, tilt: 0 } : maths.headTurn(eased, view);
    maths.placeSky(sky, at, view, turn, placed);
    // How much of the sky the field shows: none before the contact chapter,
    // all of it in calm's still of the chapter (runtime/story.ts
    // calmProgress), else as it gathers.
    const story = options.story();
    const gathered =
      story?.chapter !== "contact"
        ? 0
        : calm
          ? 1
          : maths.skyGather(story.progress);
    const covers = options.covered?.() ?? [];
    const views = maths
      .constellationsInView(sky, placed)
      .filter(
        ({ x, y }) =>
          !covers.some(
            (box) =>
              x >= box.left &&
              x <= box.right &&
              y >= box.top &&
              y <= box.bottom,
          ),
      );

    shown.clear();
    let best = -1;
    let bestLevel = 0;
    for (const constellation of views) {
      shown.add(constellation.index);
      const value = maths.easeToward(
        reveal[constellation.index] ?? 0,
        maths.revealTarget(constellation, eased) * gathered,
        seconds,
        maths.SKY_EASE.reveal,
      );
      reveal[constellation.index] = value;
      if (value > bestLevel) {
        bestLevel = value;
        best = constellation.index;
      }
    }
    for (let index = 0; index < reveal.length; index += 1) {
      if (!shown.has(index)) reveal[index] = 0;
    }

    const message = options.message();
    traced = message.words > 0 ? maths.chooseTrace(traced, views) : -1;
    const lines = traced < 0 ? 0 : (sky.segmentsOf[traced] ?? 0);
    const progress = maths.traceProgress(message.words, message.letters, lines);
    const since = message.sentAt === null ? Infinity : time - message.sentAt;
    const flash =
      since >= 0 && since < SENT_NAME_MS
        ? Math.min(since / FLASH_RISE_MS, 1) * Math.exp(-since / FLASH_FADE_MS)
        : 0;

    options.send({
      at,
      turn: turn.turn,
      tilt: turn.tilt,
      horizon: view.horizon,
      // Calm draws no lines in the field: it holds one still (REQ-A11Y-03).
      reveal: calm ? new Array<number>(reveal.length).fill(0) : [...reveal],
      // Calm draws no lines in the field, traced ones neither.
      trace:
        traced < 0 || calm
          ? null
          : { constellation: traced, ...progress, flash },
    });
    sentNull = false;

    // The traced constellation's name once its last line is drawn or after
    // Send; else the one the pointer has settled on.
    const named =
      traced >= 0 && (progress.done >= lines || since < SENT_NAME_MS)
        ? traced
        : bestLevel > LABEL_FROM
          ? best
          : -1;
    const view0 = views.find((constellation) => constellation.index === named);
    if (view0 === undefined || gathered === 0) hideLabel();
    else
      showLabel(named, view0, named === traced ? gathered : bestLevel, covers);

    frame = target.requestAnimationFrame(step);
  };

  const start = () => {
    if (isRunning || !isNear || target.document.hidden) return;
    isRunning = true;
    lastTime = null;
    frame = target.requestAnimationFrame(step);
  };

  const halt = () => {
    isRunning = false;
    if (frame !== 0) target.cancelAnimationFrame(frame);
    frame = 0;
  };

  const away = () => {
    halt();
    hideLabel();
    if (!sentNull) options.send(null);
    sentNull = true;
  };

  const stopNear = near(section, (next) => {
    isNear = next;
    if (next) start();
    else away();
  });

  // Every listener is passive and none prevents anything: a finger still
  // scrolls at once (REQ-SCR-06).
  const passive = { passive: true } as const;
  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    mouse = { x: event.clientX, y: event.clientY };
  };
  const onOut = (event: PointerEvent) => {
    if (event.relatedTarget === null) mouse = null;
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest(NOT_SKY)) return;
    tap = { x: event.clientX, y: event.clientY, until: now() + TAP_HOLD_MS };
  };
  const onVisibility = () => {
    if (target.document.hidden) halt();
    else start();
  };
  target.addEventListener("pointermove", onMove, passive);
  target.addEventListener("pointerout", onOut, passive);
  target.addEventListener("pointerdown", onDown, passive);
  target.document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopNear();
    away();
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerout", onOut);
    target.removeEventListener("pointerdown", onDown);
    target.document.removeEventListener("visibilitychange", onVisibility);
  };
}
