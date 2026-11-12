"use client";

import { useEffect, useRef } from "react";

import { loadEngine } from "@/components/engine/load-engine";
import { SHEET_FIT } from "@/engine/runtime/story";
import { PASSES, type PassId } from "@/engine/story";
import type {
  ChapterId,
  Engine,
  EngineEvent,
  EngineOptions,
  PassCard,
  Point,
  Stages,
  Tier,
} from "@/engine/types";

const TIERS = [1, 2, 3] as const satisfies readonly Tier[];
const MAX_COUNT = 2_000_000;
const CHAPTERS = [
  "hero",
  "bloom",
  "work",
  "making-of",
  "about",
  "contact",
] as const satisfies readonly ChapterId[];

// ?stage=split: the stages the home page sends at a wide desktop size, the
// dot low in the frame and the study shapes in the inline-end half, so the
// headed specs can check off-centre formations on both backends.
const SPLIT_STAGES: Stages = {
  hero: { x: 0, y: -0.6, halfWidth: 0, halfHeight: 0 },
  work: { x: 0.45, y: 0, halfWidth: 0.45, halfHeight: 0.9 },
};

// ?passes=1: one card per pass in a test layout over the field, some flat
// and some turned in depth either way, as the making-of chapter turns its
// thumbnails. The turn in degrees, per pass in PASSES order.
const CARD_TURNS: Readonly<Record<PassId, number>> = {
  points: 0,
  velocity: -34,
  density: 0,
  glow: 34,
  final: -34,
};

// ?pass=<id>: one card over the making-of sheet's own box, the middle
// SHEET_FIT of the canvas, where every card takes its picture from
// (runtime/pass-rules.ts, sheetCrop). It shows that part of the frame at its
// own size, so a capture holds the pass as a card shows it (the tier 3 still
// of the pass), and the final pass there is the frame itself.
const SHEET_CARD: PassCard["corners"] = [
  { x: -SHEET_FIT, y: SHEET_FIT },
  { x: SHEET_FIT, y: SHEET_FIT },
  { x: SHEET_FIT, y: -SHEET_FIT },
  { x: -SHEET_FIT, y: -SHEET_FIT },
];

const BUTTON =
  "inline-flex min-h-11 items-center rounded-md border border-edge px-4 font-mono text-sm hover:border-glow hover:text-glow aria-pressed:border-glow aria-pressed:text-glow";

// Read in an effect, not with useSearchParams, so the page stays static.
function readOptions(search: string) {
  const params = new URLSearchParams(search);
  const options: EngineOptions = {};

  const tier = TIERS.find((value) => String(value) === params.get("tier"));
  if (tier !== undefined) options.forcedTier = tier;

  const count = Number(params.get("count"));
  if (Number.isInteger(count) && count > 0 && count <= MAX_COUNT) {
    options.particleCount = count;
  }

  // ?look=soft keeps the fallback field tested (rule A11); the engine draws
  // the halftone otherwise, where the device can.
  if (params.get("look") === "soft") options.look = "soft";

  const chapter = CHAPTERS.find((value) => value === params.get("chapter"));
  const progress = Number(params.get("progress") ?? 0);

  return {
    options,
    isCalm: params.get("calm") === "1",
    isBare: params.get("bare") === "1",
    stages: params.get("stage") === "split" ? SPLIT_STAGES : null,
    chapter: chapter ?? null,
    progress: Number.isFinite(progress)
      ? Math.min(Math.max(progress, 0), 1)
      : 0,
    hasPasses: params.get("passes") === "1",
    wholePass: PASSES.find((pass) => pass === params.get("pass")) ?? null,
  };
}

function isPressed(button: HTMLButtonElement) {
  return button.getAttribute("aria-pressed") === "true";
}

/**
 * The cards of the test layout as the screen shows them: each corner mark's
 * place, in normalised device coordinates of the host the canvas fills, and
 * each face's own size.
 */
function measureCards(host: HTMLElement, layer: HTMLElement): PassCard[] {
  const box = host.getBoundingClientRect();
  const toDevice = (mark: Element): Point => {
    const at = mark.getBoundingClientRect();
    return {
      x: ((at.x - box.x) / box.width) * 2 - 1,
      y: 1 - ((at.y - box.y) / box.height) * 2,
    };
  };
  const cards: PassCard[] = [];
  for (const face of layer.querySelectorAll<HTMLElement>("[data-face]")) {
    const pass = PASSES.find((id) => id === face.dataset.face);
    const marks = ["0", "1", "2", "3"].map((corner) =>
      face.querySelector(`[data-corner="${corner}"]`),
    );
    const [a, b, c, d] = marks;
    if (pass === undefined || !a || !b || !c || !d) continue;
    // Its own size, which its turn does not change: the picture's width over
    // height. The test faces are square cornered, so no radius goes with it.
    cards.push({
      pass,
      corners: [toDevice(a), toDevice(b), toDevice(c), toDevice(d)],
      size: { width: face.clientWidth, height: face.clientHeight },
    });
  }
  return cards;
}

function chosenChapter(select: HTMLSelectElement): ChapterId | null {
  return CHAPTERS.find((value) => value === select.value) ?? null;
}

/**
 * Sends the chapter and progress the controls hold, and mirrors them on the
 * view as data-chapter and data-progress. None sends nothing new and empties
 * both: the engine keeps the last story it was sent, so the field is the
 * ambient one only until a chapter is first chosen.
 */
function sendStory(
  engine: Engine | null,
  view: HTMLElement,
  select: HTMLSelectElement,
  range: HTMLInputElement,
) {
  const chapter = chosenChapter(select);
  if (chapter === null) {
    view.dataset.chapter = "";
    view.dataset.progress = "";
    return;
  }
  const progress = Number(range.value);
  view.dataset.chapter = chapter;
  view.dataset.progress = String(progress);
  engine?.setStory(chapter, progress);
}

/**
 * Sends the pass cards: the sheet's box for ?pass=<id>, else the test
 * layout's cards while Passes is on, else none. Mirrors them on the view as
 * data-pass and data-cards (the cards as sent, in JSON; empty for none).
 */
function sendPasses(
  engine: Engine | null,
  view: HTMLElement,
  host: HTMLElement,
  layer: HTMLElement,
  wholePass: PassId | null,
  isOn: boolean,
) {
  const cards: PassCard[] | null =
    wholePass !== null
      ? [{ pass: wholePass, corners: SHEET_CARD }]
      : isOn
        ? measureCards(host, layer)
        : null;
  view.dataset.pass = wholePass ?? "";
  view.dataset.cards = cards === null ? "" : JSON.stringify(cards);
  engine?.setPasses(cards);
}

/**
 * The engine without the site's session and store (REQ-ENG-04). The page
 * still renders inside the root layout; ?bare=1 covers the window with the
 * host. State is written straight to the readout's data attributes, where
 * the browser tests read it, so no event renders React.
 */
export function EngineView() {
  const viewRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLParagraphElement>(null);
  const calmRef = useRef<HTMLButtonElement>(null);
  const chapterRef = useRef<HTMLSelectElement>(null);
  const progressRef = useRef<HTMLInputElement>(null);
  const passesRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const wholePassRef = useRef<PassId | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const sendStoryNow = () => {
    const view = viewRef.current;
    const select = chapterRef.current;
    const range = progressRef.current;
    if (view === null || select === null || range === null) return;
    sendStory(engineRef.current, view, select, range);
  };

  const sendPassesNow = () => {
    const view = viewRef.current;
    const host = hostRef.current;
    const layer = layerRef.current;
    const button = passesRef.current;
    if (view === null || host === null || layer === null || button === null) {
      return;
    }
    sendPasses(
      engineRef.current,
      view,
      host,
      layer,
      wholePassRef.current,
      isPressed(button),
    );
  };

  useEffect(() => {
    const view = viewRef.current;
    const host = hostRef.current;
    const readout = readoutRef.current;
    const calm = calmRef.current;
    const select = chapterRef.current;
    const range = progressRef.current;
    const passes = passesRef.current;
    const layer = layerRef.current;
    if (
      view === null ||
      host === null ||
      readout === null ||
      calm === null ||
      select === null ||
      range === null ||
      passes === null ||
      layer === null
    ) {
      return;
    }

    const {
      options,
      isCalm,
      isBare,
      stages,
      chapter,
      progress,
      hasPasses,
      wholePass,
    } = readOptions(window.location.search);
    let engine: Engine | null = null;
    let isCancelled = false;
    let events = 0;
    wholePassRef.current = wholePass;
    passes.setAttribute("aria-pressed", String(hasPasses));
    // The cards follow the layout, so a new window size measures them again.
    const onResize = () =>
      sendPasses(engine, view, host, layer, wholePass, isPressed(passes));
    window.addEventListener("resize", onResize);

    Object.assign(view.dataset, {
      status: "loading",
      tier: "",
      tierReason: "",
      ready: "false",
      fps: "",
      events: "0",
      error: "",
      chapter: "",
      progress: "",
      stage: stages === null ? "" : "split",
      look: options.look ?? "",
      particles: "",
      pass: "",
      cards: "",
    });
    // A bare view covers the window, so the page under it must not scroll:
    // its scrollbar would take its width from the host and the canvas.
    const root = document.documentElement;
    const rootOverflow = root.style.overflow;
    if (isBare) {
      view.dataset.bare = "true";
      root.style.overflow = "hidden";
    }
    select.value = chapter ?? "";
    range.value = String(progress);
    calm.setAttribute("aria-pressed", String(isCalm));
    readout.textContent = "Loading the engine.";

    const onEvent = (event: EngineEvent) => {
      if (isCancelled) return;
      events += 1;
      view.dataset.events = String(events);

      if (event.type === "frameRate") {
        view.dataset.fps = String(event.fps);
      } else if (event.type === "tierChosen") {
        view.dataset.tier = String(event.tier);
        view.dataset.tierReason = event.reason;
        view.dataset.ready = "false";
        view.dataset.status = "loading";
      } else {
        view.dataset.ready = "true";
        view.dataset.status = event.tier === 3 ? "still" : "running";
        view.dataset.particles = String(event.particles);
      }

      const { status, tier, tierReason, fps } = view.dataset;
      readout.textContent = `${status}: tier ${tier} (${tierReason}), ${fps === "" ? "no frame rate yet" : `${fps} fps`}, ${events} events`;
    };

    void (async () => {
      const { createEngine } = await loadEngine();
      if (isCancelled) return;

      // The toggle may have been pressed while the engine was loading.
      engine = createEngine(host, { ...options, calm: isPressed(calm) });
      engineRef.current = engine;
      engine.on(onEvent);
      if (stages !== null) engine.setStage(stages);
      // The controls may have changed while the engine was loading too.
      sendStory(engine, view, select, range);
      sendPasses(engine, view, host, layer, wholePass, isPressed(passes));
      await engine.start();
    })().catch((error: unknown) => {
      if (isCancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      view.dataset.error = message;
      view.dataset.status = "error";
      readout.textContent = `The engine failed: ${message}`;
    });

    return () => {
      isCancelled = true;
      engineRef.current = null;
      window.removeEventListener("resize", onResize);
      delete view.dataset.bare;
      root.style.overflow = rootOverflow;
      // Disposed at once, not after start: start resolves only when the field
      // has drawn, and a field that has left the page never draws.
      void engine?.dispose();
    };
  }, []);

  return (
    <div
      ref={viewRef}
      data-testid="engine-view"
      data-status="loading"
      data-tier=""
      data-tier-reason=""
      data-ready="false"
      data-fps=""
      data-events="0"
      data-error=""
      data-chapter=""
      data-progress=""
      data-stage=""
      data-look=""
      data-particles=""
      data-pass=""
      data-cards=""
      className="group mt-4"
    >
      <div className="flex flex-wrap gap-3 group-data-[bare=true]:hidden">
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            className={BUTTON}
            onClick={() => engineRef.current?.setTier(tier)}
          >
            Tier {tier}
          </button>
        ))}
        <button
          ref={calmRef}
          type="button"
          aria-pressed="false"
          className={BUTTON}
          onClick={(event) => {
            const isCalm = !isPressed(event.currentTarget);
            event.currentTarget.setAttribute("aria-pressed", String(isCalm));
            engineRef.current?.setCalm(isCalm);
          }}
        >
          Calm
        </button>
        <button
          ref={passesRef}
          type="button"
          aria-pressed="false"
          className={BUTTON}
          onClick={(event) => {
            event.currentTarget.setAttribute(
              "aria-pressed",
              String(!isPressed(event.currentTarget)),
            );
            sendPassesNow();
          }}
        >
          Passes
        </button>
        <label className="inline-flex min-h-11 items-center gap-2 font-mono text-sm">
          Chapter
          <select
            ref={chapterRef}
            defaultValue=""
            className="min-h-11 rounded-md border border-edge bg-void px-2"
            onChange={() => sendStoryNow()}
          >
            <option value="">None</option>
            {CHAPTERS.map((chapter) => (
              <option key={chapter} value={chapter}>
                {chapter}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 font-mono text-sm">
          Progress
          {/* No step: a range input rounds its value to the step, and
              ?progress must reach the engine as given. */}
          <input
            ref={progressRef}
            type="range"
            min="0"
            max="1"
            step="any"
            defaultValue="0"
            onChange={() => sendStoryNow()}
          />
        </label>
      </div>
      <p
        ref={readoutRef}
        className="mt-4 font-mono text-sm text-muted group-data-[bare=true]:hidden"
      >
        Loading the engine.
      </p>
      <div className="relative mt-4 group-data-[bare=true]:mt-0">
        {/* The engine owns this element and its canvas. With ?bare=1 it
            covers the whole window, so a capture holds the field and
            nothing else. */}
        <div
          ref={hostRef}
          data-part="host"
          className="h-[70svh] w-full bg-void group-data-[bare=true]:fixed group-data-[bare=true]:inset-0 group-data-[bare=true]:z-40 group-data-[bare=true]:h-auto"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            engineRef.current?.setPointer(
              ((event.clientX - box.x) / box.width) * 2 - 1,
              1 - ((event.clientY - box.y) / box.height) * 2,
              true,
            );
          }}
          onPointerLeave={() => engineRef.current?.setPointer(0, 0, false)}
        />
        {/* The test layout's cards (?passes=1): unpainted boxes over the
            canvas whose corner marks give the engine each face. A face's
            corners are its own, not the reading direction's (types.ts,
            PassCard), so this layer is laid out left to right and its
            start marks are the faces' left corners. */}
        <div
          ref={layerRef}
          dir="ltr"
          aria-hidden="true"
          data-part="cards"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-10 group-data-[bare=true]:fixed group-data-[bare=true]:z-50"
        >
          {PASSES.map((pass) => (
            <div
              key={pass}
              data-face={pass}
              className="relative h-[243px] w-[180px] shrink-0"
              style={{
                transform: `perspective(1600px) rotateY(${CARD_TURNS[pass]}deg)`,
              }}
            >
              <span data-corner="0" className="absolute start-0 top-0 size-0" />
              <span data-corner="1" className="absolute end-0 top-0 size-0" />
              <span
                data-corner="2"
                className="absolute end-0 bottom-0 size-0"
              />
              <span
                data-corner="3"
                className="absolute start-0 bottom-0 size-0"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
