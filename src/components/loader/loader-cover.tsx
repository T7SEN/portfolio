"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cx, MONO_CAPS } from "@/components/site/class-names";
import { DotJoined } from "@/components/study/dot-joined";
import { loaderCopy, loaderLabel } from "@/content/loader";
import { calmStore } from "@/lib/calm-store";
import { loaderStore } from "@/lib/loader-store";
import { tierStore } from "@/lib/tier-store";

import {
  type CoverClock,
  type CoverView,
  startCoverSession,
} from "./cover-session";
import {
  COVER_SKIPS,
  type CoverSkip,
  LOADER_ATTRIBUTE,
  LOADER_OFF_ATTRIBUTE,
} from "./loader-config";
import type { CreateLoaderScene } from "./scene/types";

const HOME = "/";

// The scene loads only where a cover shows, so other routes, calm and
// reduced motion never download it.
const loadDefaultScene = (): Promise<CreateLoaderScene> =>
  import("./scene").then((module) => module.createLoaderScene);

/** What the inline script decided before the first paint (loader-script.ts). */
type Verdict = { show: true } | { show: false; reason: CoverSkip | null };

function readVerdict(html: HTMLElement): Verdict {
  const off = html.getAttribute(LOADER_OFF_ATTRIBUTE);
  const reason = COVER_SKIPS.find((skip) => skip === off);
  if (reason !== undefined) return { show: false, reason };
  if (html.getAttribute(LOADER_ATTRIBUTE) === "up") return { show: true };
  // The script never ran, so the cover was never painted.
  return { show: false, reason: null };
}

/**
 * Which cover is up. load: the full load's, in the static HTML of "/" and
 * timed from the page's first paint. move: one the island adds after a move
 * to "/" from inside the site, timed from its own first frame. Each new
 * cover gets a new id, so React mounts it afresh.
 */
type Shown = { id: number; from: CoverClock } | null;

const INITIAL_VIEW: CoverView = {
  owned: false,
  entering: true,
  leaving: false,
  exit: "ripple",
  drawn: false,
};

export type LoaderCoverProps = {
  /** Replaced by a fake scene in unit tests. */
  loadScene?: () => Promise<CreateLoaderScene>;
};

/**
 * The home page's loader (phase P4.5, REQ-LOAD-01): a cover over the whole
 * site while the engine loads and the field draws, on every full load of
 * "/" [T7SEN, 14 Nov 2026], and after a move to "/" from inside the site
 * while the field has not drawn. Calm mode and OS reduced motion show none,
 * nor does a document whose inline script never ran. The root layout
 * renders it once, first in body, so the rest of the page can be made inert
 * under it. Its markup is in the static HTML of "/" alone.
 */
export function LoaderCover({
  loadScene = loadDefaultScene,
}: LoaderCoverProps) {
  const pathname = usePathname();
  const isHome = pathname === HOME;
  const [shown, setShown] = useState<Shown>(() =>
    isHome ? { id: 0, from: "paint" } : null,
  );
  // Whether the inline script ran on this document, read once.
  const scriptRanRef = useRef<boolean | null>(null);
  const pathRef = useRef(pathname);
  const nextIdRef = useRef(1);

  // Leaving "/" takes its cover away at once (the visitor went back while
  // it was up), which frees the page.
  if (!isHome && shown !== null) setShown(null);

  const gone = useCallback(() => setShown(null), []);

  // After the cover's own layout effect, so a full load's verdict has been
  // written back on the html element.
  useLayoutEffect(() => {
    const html = document.documentElement;
    scriptRanRef.current ??=
      html.hasAttribute(LOADER_OFF_ATTRIBUTE) ||
      html.hasAttribute(LOADER_ATTRIBUTE);
  }, []);

  // A move to "/" from inside the site shows a cover only while the field
  // has not drawn, never once it is up, and never in calm mode or under
  // reduced motion [T7SEN, 14 Nov 2026]. Before the browser paints, so the
  // page under it never shows first.
  useLayoutEffect(() => {
    const previous = pathRef.current;
    pathRef.current = pathname;
    if (pathname === previous) return;
    const html = document.documentElement;
    if (pathname !== HOME) {
      // A cover taken away by leaving "/" is no longer up.
      if (html.getAttribute(LOADER_ATTRIBUTE) === "up") {
        html.setAttribute(LOADER_ATTRIBUTE, "done");
      }
      return;
    }
    if (scriptRanRef.current !== true) return;
    if (calmStore.getSnapshot().calm || tierStore.getSnapshot().ready) return;
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setShown({ id, from: "frame" });
  }, [pathname]);

  return isHome && shown !== null ? (
    <Cover
      key={shown.id}
      from={shown.from}
      loadScene={loadScene}
      onGone={gone}
    />
  ) : null;
}

type CoverProps = {
  from: CoverClock;
  loadScene: () => Promise<CreateLoaderScene>;
  onGone: () => void;
};

function Cover({ from, loadScene, onGone }: CoverProps) {
  const coverRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const verdictRef = useRef<Verdict | null>(null);
  const [view, setView] = useState(INITIAL_VIEW);
  const progress = useSyncExternalStore(
    loaderStore.subscribe,
    loaderStore.getSnapshot,
    loaderStore.getServerSnapshot,
  );

  // Before the browser paints again: the page goes inert and the CSS
  // failsafe stands down in the frame after hydration, or in the cover's
  // first frame after a move.
  useLayoutEffect(() => {
    const cover = coverRef.current;
    const canvas = canvasRef.current;
    if (cover === null || canvas === null) return;
    const html = document.documentElement;
    if (from === "paint") {
      // Read once: React's development remount clears what the inline
      // script wrote on the html element, so the island writes it back.
      verdictRef.current ??= readVerdict(html);
      const verdict = verdictRef.current;
      if (!verdict.show) {
        if (verdict.reason !== null) {
          html.setAttribute(LOADER_OFF_ATTRIBUTE, verdict.reason);
        }
        onGone();
        return;
      }
    }
    html.setAttribute(LOADER_ATTRIBUTE, "up");
    return startCoverSession({
      cover,
      canvas,
      from,
      loadScene,
      onView: setView,
      onDone: onGone,
    });
  }, [from, loadScene, onGone]);

  const label = loaderLabel(progress);
  const hasEnded = progress.outcome !== null && progress.outcome !== "limit";
  const state = view.leaving
    ? "leaving"
    : hasEnded
      ? "ready"
      : view.entering
        ? "entering"
        : "loading";

  return (
    <div
      ref={coverRef}
      data-loader-cover=""
      data-loader-state={state}
      data-loader-step={progress.step ?? "end"}
      // Steps finished, 0 to 4: the label holds step 2's words past the
      // renderer's start, so this is where a test reads each step's end.
      data-loader-done={progress.done}
      data-loader-test={progress.test}
      data-loader-exit={view.exit}
      data-loader-outcome={progress.outcome ?? undefined}
      data-loader-owned={view.owned ? "" : undefined}
      data-loader-scene={view.drawn ? "drawn" : undefined}
      // Lenis leaves a wheel over the cover alone, so it never scrolls the
      // page under it.
      data-lenis-prevent=""
      role="dialog"
      aria-modal="true"
      aria-label={loaderCopy.name}
      // Takes focus while it is up; never a Tab stop, so the skip link stays
      // the first one.
      tabIndex={-1}
      className="group/loader fixed inset-0 z-100 touch-none overscroll-none bg-void outline-none data-[loader-scene=drawn]:bg-transparent"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 block size-full"
      />
      {/* Under the hole, as the scene lays it out (scene/world.ts): its
          centre 46 px above the screen's middle (40 px on phones), the
          label 178 px below that (150 px). The scene draws the label's dark
          patch. */}
      <div
        data-part="loader-label"
        data-plate="none"
        className="absolute inset-x-0 top-[calc(50%+8.25rem)] px-4 text-center transition-opacity duration-300 ease-out group-data-[loader-state=leaving]/loader:opacity-0 max-sm:top-[calc(50%+6.875rem)]"
      >
        <div role="status" className="flex flex-col items-center">
          <p
            className={cx(
              MONO_CAPS,
              "text-xs leading-[1.4] tracking-[0.16em] max-sm:text-[0.6875rem] max-sm:tracking-[0.14em]",
              label.isReady ? "text-glow" : "text-muted",
            )}
          >
            {label.number !== null && (
              <span aria-hidden="true" className="me-[0.9em] text-violet">
                {label.number}
              </span>
            )}
            {label.words}
          </p>
          {label.detail !== null && (
            <p
              className={cx(
                MONO_CAPS,
                "mt-2.5 text-[0.6875rem] leading-[1.4] tracking-[0.1em] text-muted",
              )}
            >
              <DotJoined parts={label.detail.split(" · ")} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
