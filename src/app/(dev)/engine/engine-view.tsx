"use client";

import { useEffect, useRef } from "react";

import { loadEngine } from "@/components/engine/load-engine";
import {
  SKY_CONSTELLATIONS,
  SKY_SEGMENTS,
  SKY_STARS,
} from "@/engine/sky/catalogue";
import {
  chooseTrace,
  constellationsInView,
  createPlaced,
  placeSky,
  prepareSky,
  skyFrame,
  traceProgress,
} from "@/engine/sky/sky";
import { PASSES, type PassId } from "@/engine/story";
import type {
  ChapterId,
  Engine,
  EngineEvent,
  EngineOptions,
  PassCard,
  Point,
  SkyView,
  Stage,
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

// The pass cards' test layouts: flat faces of 4:5, as the home page's
// making-of row lays its cards. ?pass=<id>: one face in the middle of the
// canvas, 320 by 400 CSS px, 208 by 260 below the md breakpoint, as the
// home page's middle card; its box goes as the making-of stage, so the T7
// mark forms inside it, and as the one card, so the face shows that pass of
// the mark one to one. A capture of the face is the tier 3 still of the
// pass. ?passes=1: one face per pass in a row across the middle, the middle
// one (MIDDLE_PASS) the making-of stage.
const MIDDLE_PASS: PassId = PASSES[Math.floor(PASSES.length / 2)] ?? "density";

// The contact sky's test view (D-146, D-147): ?when=<ISO time> fixes the
// moment (else the time the page opened), ?words=<n> traces that many lines
// of the brightest constellation wholly in view, ?reveal=<IAU abbreviation>
// shows one constellation's lines. The horizon is the sky band's, as the
// engine puts it with no horizon sent (sky.ts skyFrame).
interface SkyQuery {
  at: number;
  words: number;
  reveal: string | null;
}

function skyViewFor(host: HTMLElement, query: SkyQuery): SkyView {
  const box = host.getBoundingClientRect();
  const sky = prepareSky(
    {
      stars: SKY_STARS,
      segments: SKY_SEGMENTS,
      constellations: SKY_CONSTELLATIONS,
    },
    query.at,
  );
  const placed = placeSky(
    sky,
    query.at,
    skyFrame(box.width, box.height),
    { turn: 0, tilt: 0 },
    createPlaced(sky.count),
  );
  const traced =
    query.words > 0 ? chooseTrace(-1, constellationsInView(sky, placed)) : -1;
  const progress = traceProgress(
    query.words,
    0,
    traced < 0 ? 0 : (sky.segmentsOf[traced] ?? 0),
  );
  return {
    at: query.at,
    turn: 0,
    tilt: 0,
    horizon: null,
    reveal: SKY_CONSTELLATIONS.map((name) => (name === query.reveal ? 1 : 0)),
    trace: traced < 0 ? null : { constellation: traced, ...progress, flash: 0 },
  };
}

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
  const wholePass = PASSES.find((pass) => pass === params.get("pass")) ?? null;
  const when = Date.parse(params.get("when") ?? "");
  const words = Number(params.get("words") ?? 0);

  return {
    options,
    isCalm: params.get("calm") === "1",
    isBare: params.get("bare") === "1",
    split: params.get("stage") === "split" ? SPLIT_STAGES : null,
    // ?pass=<id> shows the making-of unless another chapter is asked for.
    chapter: chapter ?? (wholePass === null ? null : "making-of"),
    progress: Number.isFinite(progress)
      ? Math.min(Math.max(progress, 0), 1)
      : 0,
    hasPasses: params.get("passes") === "1",
    wholePass,
    sky: {
      at: Number.isFinite(when) ? when : Date.now(),
      words: Number.isInteger(words) && words > 0 ? words : 0,
      reveal: params.get("reveal"),
    } satisfies SkyQuery,
  };
}

/** What the test layout shows and sends, from the query. */
interface Layout {
  /** ?pass=<id>: the one face's pass; null for the row. */
  wholePass: PassId | null;
  /** ?passes=1. */
  hasPasses: boolean;
  /** ?stage=split. */
  split: Stages | null;
}

function isPressed(button: HTMLButtonElement) {
  return button.getAttribute("aria-pressed") === "true";
}

/**
 * The faces of the test layout as the screen shows them: each card, its
 * corner marks' places in normalised device coordinates of the host the
 * canvas fills and its face's own size, and the middle face's box as a
 * stage. ?pass=<id> lays out its one face, else the row.
 */
function measureFaces(
  host: HTMLElement,
  layer: HTMLElement,
  wholePass: PassId | null,
): { cards: PassCard[]; middle: Stage | null } {
  const box = host.getBoundingClientRect();
  const toDevice = (mark: Element): Point => {
    const at = mark.getBoundingClientRect();
    return {
      x: ((at.x - box.x) / box.width) * 2 - 1,
      y: 1 - ((at.y - box.y) / box.height) * 2,
    };
  };
  const faces =
    wholePass === null
      ? [...layer.querySelectorAll<HTMLElement>("[data-row] [data-face]")]
      : [...layer.querySelectorAll<HTMLElement>("[data-single]")];
  const cards: PassCard[] = [];
  let middle: Stage | null = null;
  for (const face of faces) {
    const pass =
      wholePass ?? PASSES.find((id) => id === face.dataset.face) ?? null;
    const marks = ["0", "1", "2", "3"].map((corner) =>
      face.querySelector(`[data-corner="${corner}"]`),
    );
    const [a, b, c, d] = marks;
    if (pass === null || !a || !b || !c || !d) continue;
    const corners = [
      toDevice(a),
      toDevice(b),
      toDevice(c),
      toDevice(d),
    ] as const;
    // The test faces are square cornered, so no radius goes with them.
    cards.push({
      pass,
      corners,
      size: { width: face.clientWidth, height: face.clientHeight },
    });
    if (wholePass !== null || pass === MIDDLE_PASS) {
      const xs = corners.map((corner) => corner.x);
      const ys = corners.map((corner) => corner.y);
      const [left, right] = [Math.min(...xs), Math.max(...xs)];
      const [bottom, top] = [Math.min(...ys), Math.max(...ys)];
      middle = {
        x: (left + right) / 2,
        y: (bottom + top) / 2,
        halfWidth: (right - left) / 2,
        halfHeight: (top - bottom) / 2,
      };
    }
  }
  return { cards, middle };
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
 * Sends the test layout: the cards while Passes is on, else none, and the
 * middle face's box as the making-of stage, with ?stage=split's stages. With
 * ?pass or ?passes the stage stays while Passes is off, so a capture without
 * the cards holds the same field; without either it goes with the cards.
 * Mirrors them on the view as data-pass, data-cards (the cards as sent, in
 * JSON; empty for none) and data-making-of (the stage, likewise). Returns
 * the stages sent, in JSON, so an unchanged one is not sent again: a calm
 * field settles again for every stage it is sent.
 */
function sendLayout(
  engine: Engine | null,
  view: HTMLElement,
  host: HTMLElement,
  layer: HTMLElement,
  layout: Layout,
  isOn: boolean,
  sentStages: string,
): string {
  const { cards, middle } = measureFaces(host, layer, layout.wholePass);
  const staged = layout.wholePass !== null || layout.hasPasses || isOn;
  const stages: Stages = {
    ...layout.split,
    ...(staged && middle !== null ? { "making-of": middle } : {}),
  };
  const sent = isOn ? cards : null;
  view.dataset.pass = layout.wholePass ?? "";
  view.dataset.cards = sent === null ? "" : JSON.stringify(sent);
  const makingOf = stages["making-of"];
  view.dataset.makingOf =
    makingOf === undefined ? "" : JSON.stringify(makingOf);
  const text = JSON.stringify(stages);
  if (engine !== null && text !== sentStages) engine.setStage(stages);
  engine?.setPasses(sent);
  return engine === null ? sentStages : text;
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
  const engineRef = useRef<Engine | null>(null);
  // Sends the test layout again; set by the effect once the query is read.
  const sendLayoutRef = useRef<(() => void) | null>(null);

  const sendStoryNow = () => {
    const view = viewRef.current;
    const select = chapterRef.current;
    const range = progressRef.current;
    if (view === null || select === null || range === null) return;
    sendStory(engineRef.current, view, select, range);
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
      split,
      chapter,
      progress,
      hasPasses,
      wholePass,
      sky,
    } = readOptions(window.location.search);
    let engine: Engine | null = null;
    let isCancelled = false;
    let events = 0;
    let renderers = 0;
    let probes = 0;
    // The engine starts with no stages, so an empty set is never sent first.
    let sentStages = "{}";
    const layout: Layout = { wholePass, hasPasses, split };
    // ?pass=<id> lays out its one face, everything else the row; its cards
    // are on from the start, as with ?passes=1.
    for (const part of layer.querySelectorAll<HTMLElement>("[data-single]")) {
      part.hidden = wholePass === null;
    }
    for (const part of layer.querySelectorAll<HTMLElement>("[data-row]")) {
      part.hidden = wholePass !== null;
    }
    passes.setAttribute(
      "aria-pressed",
      String(hasPasses || wholePass !== null),
    );
    const send = () => {
      sentStages = sendLayout(
        engine,
        view,
        host,
        layer,
        layout,
        isPressed(passes),
        sentStages,
      );
    };
    sendLayoutRef.current = send;
    // The faces follow the layout, so a new window size measures them again.
    window.addEventListener("resize", send);

    Object.assign(view.dataset, {
      status: "loading",
      tier: "",
      tierReason: "",
      ready: "false",
      fps: "",
      events: "0",
      backend: "",
      renderers: "0",
      probes: "0",
      error: "",
      chapter: "",
      progress: "",
      stage: split === null ? "" : "split",
      look: options.look ?? "",
      particles: "",
      pass: "",
      cards: "",
      makingOf: "",
      sky: "",
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

      switch (event.type) {
        case "frameRate":
          view.dataset.fps = String(event.fps);
          break;
        case "tierChosen":
          view.dataset.tier = String(event.tier);
          view.dataset.tierReason = event.reason;
          view.dataset.ready = "false";
          view.dataset.status = "loading";
          break;
        case "ready":
          view.dataset.ready = "true";
          view.dataset.status = event.tier === 3 ? "still" : "running";
          view.dataset.particles = String(event.particles);
          break;
        // The loading signals (REQ-LOAD-01): data-backend is the backend of
        // the last renderer started, data-renderers and data-probes count
        // the renderers started and the probe windows opened.
        case "rendererStarted":
          renderers += 1;
          view.dataset.backend = event.backend;
          view.dataset.renderers = String(renderers);
          break;
        case "probeStarted":
          probes += 1;
          view.dataset.probes = String(probes);
          break;
      }

      const { status, tier, tierReason, fps, backend } = view.dataset;
      const started =
        renderers === 0
          ? "no renderer yet"
          : `${backend} renderer, ${renderers} started`;
      const probed =
        probes === 0
          ? "no probe window"
          : `${probes} probe window${probes === 1 ? "" : "s"}`;
      readout.textContent = `${status}: tier ${tier} (${tierReason}), ${started}, ${probed}, ${fps === "" ? "no frame rate yet" : `${fps} fps`}, ${events} events`;
    };

    void (async () => {
      const { createEngine } = await loadEngine();
      if (isCancelled) return;

      // The toggle may have been pressed while the engine was loading.
      engine = createEngine(host, { ...options, calm: isPressed(calm) });
      engineRef.current = engine;
      engine.on(onEvent);
      // The controls may have changed while the engine was loading too.
      send();
      // The sky's test view, mirrored as data-sky, sent once: it shows only
      // in the contact chapter.
      const skyView = skyViewFor(host, sky);
      view.dataset.sky = JSON.stringify(skyView);
      engine.setSky(skyView);
      sendStory(engine, view, select, range);
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
      sendLayoutRef.current = null;
      window.removeEventListener("resize", send);
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
      data-backend=""
      data-renderers="0"
      data-probes="0"
      data-error=""
      data-chapter=""
      data-progress=""
      data-stage=""
      data-look=""
      data-particles=""
      data-pass=""
      data-cards=""
      data-making-of=""
      data-sky=""
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
            sendLayoutRef.current?.();
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
        {/* The test layout's faces: unpainted boxes over the canvas whose
            corner marks give the engine each face, flat and 4:5. ?pass=<id>
            shows the one face (data-single), anything else the row
            (data-row); the effect hides the other. A face's corners are its
            own, not the reading direction's (types.ts, PassCard), so this
            layer is laid out left to right and its start marks are the
            faces' left corners. */}
        <div
          ref={layerRef}
          dir="ltr"
          aria-hidden="true"
          data-part="cards"
          className="pointer-events-none absolute inset-0 flex items-center justify-center group-data-[bare=true]:fixed group-data-[bare=true]:z-50"
        >
          <div
            data-single
            hidden
            className="relative h-[260px] w-[208px] shrink-0 md:h-[400px] md:w-[320px]"
          >
            <FaceCorners />
          </div>
          <div data-row className="flex shrink-0 gap-6">
            {PASSES.map((pass) => (
              <div
                key={pass}
                data-face={pass}
                className="relative h-[270px] w-[216px] shrink-0"
              >
                <FaceCorners />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A face's four corner marks, top left first, clockwise. */
function FaceCorners() {
  return (
    <>
      <span data-corner="0" className="absolute start-0 top-0 size-0" />
      <span data-corner="1" className="absolute end-0 top-0 size-0" />
      <span data-corner="2" className="absolute end-0 bottom-0 size-0" />
      <span data-corner="3" className="absolute start-0 bottom-0 size-0" />
    </>
  );
}
