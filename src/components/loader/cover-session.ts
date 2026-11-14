import { calmStore, type CalmStore } from "@/lib/calm-store";
import {
  LIFT_LIMIT_MS,
  loaderStore,
  MIN_COVER_MS,
  type LoaderStore,
} from "@/lib/loader-store";

import { sceneProgress } from "./cover-progress";
import { firstPaintAt, watchFirstPaint } from "./first-paint";
import { holdPage } from "./hold-page";
import {
  CALM_FADE_MS,
  ENTRANCE_MS,
  EXIT_LIMIT_MS,
  LIGHT_DURING_TEST,
  LOADER_ATTRIBUTE,
  PHONE_QUERY,
  PIXEL_RATIO_CAP,
} from "./loader-config";
import type {
  CreateLoaderScene,
  LoaderScene,
  SceneEffort,
} from "./scene/types";

/** The exit the cover plays: the scene's ripple, or the plain fade. */
export type CoverExit = "ripple" | "fade";

/** What the cover's markup shows of the session (loader-cover.tsx). */
export type CoverView = {
  /** The script has taken the cover over, so the CSS failsafe stands down. */
  owned: boolean;
  /** The entrance is playing, about 1 s from the first paint. */
  entering: boolean;
  leaving: boolean;
  exit: CoverExit;
  /** The scene has painted its first frame, so the cover's own void can go. */
  drawn: boolean;
};

/**
 * What the cover's times count from. paint: the page's first paint, on a
 * full load of "/". frame: the cover's own first frame on screen, after a
 * move to "/" from inside the site, where the page painted long before.
 */
export type CoverClock = "paint" | "frame";

export type CoverSessionOptions = {
  cover: HTMLElement;
  canvas: HTMLCanvasElement;
  /** paint unless said otherwise. */
  from?: CoverClock;
  loadScene: () => Promise<CreateLoaderScene>;
  onView(view: CoverView): void;
  /** The cover has lifted and the page is free: remove the cover. */
  onDone(): void;
  /** Replaced by fakes in unit tests. */
  store?: Pick<LoaderStore, "getSnapshot" | "subscribe" | "begin" | "start">;
  calm?: Pick<CalmStore, "getSnapshot" | "subscribe">;
};

function logFailure(error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error("loader: no-scene", error);
  }
}

/** Calls back with the time of the cover's first frame on screen. */
function watchFirstFrame(win: Window, report: (at: number) => void) {
  const handle = win.requestAnimationFrame(report);
  return () => win.cancelAnimationFrame(handle);
}

function isPhone(win: Window): boolean {
  try {
    if (typeof win.matchMedia === "function") {
      return win.matchMedia(PHONE_QUERY).matches;
    }
  } catch {
    // Read from the width below.
  }
  return win.innerWidth < 640;
}

/**
 * The cover's life once the island has taken it over (phase P4.5,
 * REQ-LOAD-01): it holds the page still under it, starts the loader store
 * again from what the engine has reported and times its lift from the
 * first paint (from), draws the scene with the store's progress, and when
 * the store says it may go, plays the ripple on every outcome (a 0.3 s fade
 * in calm mode, under reduced motion or with no scene), then frees the page
 * and moves focus to the top. Nothing the visitor does lifts it. Returns
 * the teardown, for an unmount before the lift, as when the visitor goes
 * back from "/": it frees the page.
 */
export function startCoverSession({
  cover,
  canvas,
  from = "paint",
  loadScene,
  onView,
  onDone,
  store = loaderStore,
  calm = calmStore,
}: CoverSessionOptions): () => void {
  const doc = cover.ownerDocument;
  const win = doc.defaultView ?? window;
  const now = () => performance.now();
  // A cover brought by a move inside the site has no paint entry of its
  // own: the page's is long past.
  const reported = from === "paint" ? firstPaintAt() : null;
  let paintedAt = reported ?? now();

  function free() {
    doc.documentElement.setAttribute(LOADER_ATTRIBUTE, "done");
    // Focus goes to the top of the page, so the next Tab reaches the skip
    // link first.
    const active = doc.activeElement;
    if (active instanceof HTMLElement && cover.contains(active)) active.blur();
    onDone();
    // A link into the home page (/#work), on a first load or a move from
    // inside the site, was held at the top under the cover; it goes to its
    // part now the page is free.
    let id = "";
    try {
      id = decodeURIComponent(win.location.hash.slice(1));
    } catch {
      // A malformed hash names no part of the page.
    }
    if (id !== "") doc.getElementById(id)?.scrollIntoView();
  }

  // Too late to take over: the CSS failsafe has hidden the cover, or is
  // about to.
  if (now() - paintedAt >= LIFT_LIMIT_MS) {
    free();
    return () => undefined;
  }

  let isOver = false;
  let view: CoverView = {
    owned: true,
    entering: now() < paintedAt + ENTRANCE_MS,
    leaving: false,
    exit: "ripple",
    drawn: false,
  };
  const update = (part: Partial<CoverView>) => {
    view = { ...view, ...part };
    onView(view);
  };

  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(ms: number, run: () => void) {
    const handle = setTimeout(
      () => {
        timers.delete(handle);
        if (!isOver) run();
      },
      Math.max(0, ms),
    );
    timers.add(handle);
  }

  let scene: LoaderScene | null = null;
  let effort: SceneEffort = "full";
  let streamFrame = 0;
  let resizeFrame = 0;
  let isCalmTimed = false;

  const size = () => {
    const box = cover.getBoundingClientRect();
    return {
      width: box.width > 0 ? box.width : win.innerWidth,
      height: box.height > 0 ? box.height : win.innerHeight,
    };
  };
  const pixelRatio = () =>
    Math.min(
      win.devicePixelRatio > 0 ? win.devicePixelRatio : 1,
      PIXEL_RATIO_CAP,
    );

  function syncScene() {
    if (scene === null) return;
    const snapshot = store.getSnapshot();
    const wanted: SceneEffort =
      LIGHT_DURING_TEST && snapshot.test === "running" ? "light" : "full";
    if (wanted !== effort) {
      effort = wanted;
      scene.setEffort(wanted);
    }
    scene.setProgress(sceneProgress(snapshot, now()));
  }

  function stopFrames() {
    if (streamFrame !== 0) win.cancelAnimationFrame(streamFrame);
    if (resizeFrame !== 0) win.cancelAnimationFrame(resizeFrame);
    streamFrame = 0;
    resizeFrame = 0;
  }

  // The GPU test is the one step with a known length: its share goes to
  // the scene on every frame while it runs, and only then.
  function streamTest() {
    streamFrame = 0;
    if (isOver || view.leaving) return;
    syncScene();
    if (store.getSnapshot().test === "running") {
      streamFrame = win.requestAnimationFrame(streamTest);
    }
  }

  function close() {
    if (isOver) return;
    teardown();
    free();
  }

  function beginLift() {
    if (isOver || view.leaving) return;
    const live = scene;
    const kind: CoverExit =
      live === null || calm.getSnapshot().calm ? "fade" : view.exit;
    stopFrames();
    update({ leaving: true, exit: kind });
    if (live === null || kind === "fade") {
      later(CALM_FADE_MS, close);
      return;
    }
    // An exit that never resolves cannot keep the page covered.
    later(EXIT_LIMIT_MS, close);
    try {
      live.exit().then(close, (error) => {
        logFailure(error);
        close();
      });
    } catch (error) {
      logFailure(error);
      close();
    }
  }

  function onStore() {
    if (isOver || view.leaving) return;
    const snapshot = store.getSnapshot();
    syncScene();
    if (snapshot.test !== "running") {
      if (streamFrame !== 0) win.cancelAnimationFrame(streamFrame);
      streamFrame = 0;
    } else if (streamFrame === 0) {
      streamFrame = win.requestAnimationFrame(streamTest);
    }
    if (snapshot.lift) beginLift();
  }

  // Calm asks for no cover: one that comes on while the cover is up (the
  // OS setting; the page's toggle is inert under it) fades the cover at the
  // 2 s minimum instead of waiting for the field.
  function onCalm() {
    if (isOver || view.leaving || !calm.getSnapshot().calm) return;
    if (view.exit !== "fade") update({ exit: "fade" });
    if (isCalmTimed) return;
    isCalmTimed = true;
    later(paintedAt + MIN_COVER_MS - now(), beginLift);
  }

  function onResize() {
    if (resizeFrame !== 0) return;
    resizeFrame = win.requestAnimationFrame(() => {
      resizeFrame = 0;
      const { width, height } = size();
      scene?.resize(width, height, pixelRatio());
    });
  }

  onView(view);
  const releasePage = holdPage(cover);
  cover.focus({ preventScroll: true });

  store.begin();
  store.start(paintedAt);
  const onPainted = (at: number) => {
    paintedAt = Math.max(paintedAt, at);
    store.start(at);
  };
  const stopPaintWatch =
    from === "frame"
      ? watchFirstFrame(win, onPainted)
      : reported === null
        ? watchFirstPaint(onPainted)
        : () => undefined;
  if (view.entering) {
    later(paintedAt + ENTRANCE_MS - now(), () => update({ entering: false }));
  }

  const unsubscribeStore = store.subscribe(onStore);
  const unsubscribeCalm = calm.subscribe(onCalm);
  win.addEventListener("resize", onResize);

  // With no scene the cover stays the void with its label, and lifts with
  // the fade.
  function draw(create: CreateLoaderScene) {
    if (isOver || view.leaving) return;
    const { width, height } = size();
    let made: LoaderScene | null = null;
    try {
      made = create(canvas, {
        width,
        height,
        pixelRatio: pixelRatio(),
        phone: isPhone(win),
        onFirstFrame: () => {
          if (!isOver) update({ drawn: true });
        },
      });
      made.enter();
    } catch (error) {
      made?.dispose();
      if (view.drawn) update({ drawn: false });
      logFailure(error);
      return;
    }
    scene = made;
    onStore();
  }
  loadScene().then(draw, logFailure);

  // A state reached before the cover was taken over counts at once.
  onCalm();
  onStore();

  function teardown() {
    if (isOver) return;
    isOver = true;
    for (const handle of timers) clearTimeout(handle);
    timers.clear();
    stopFrames();
    unsubscribeStore();
    unsubscribeCalm();
    stopPaintWatch();
    win.removeEventListener("resize", onResize);
    scene?.dispose();
    scene = null;
    releasePage();
  }

  return teardown;
}
