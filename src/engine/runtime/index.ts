import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  Timer,
  WebGPURenderer,
} from "three/webgpu";

import { colors } from "@/tokens/colors";

import { LIVE_PASSES } from "../story";
import { median } from "../tier/probe";
import type {
  ChapterId,
  FieldLook,
  PassCard,
  Runtime,
  RuntimeFactory,
  RuntimeOptions,
  Stage,
  Stages,
} from "../types";
import { nextResolution, startResolution } from "./adaptive";
import { packAtlas, type Atlas } from "./atlas";
import { liveBackend } from "./backend";
import { createField, viewFor } from "./field";
import { createHalftone, halftoneWorks } from "./halftone";
import {
  gridFor,
  halftoneLight,
  haloReach,
  heroLight,
  liveLook,
  sprinkle,
  stageToCss,
  worldToCss,
} from "./halftone-rules";
import { copyCards, layoutCards, sameCards, tierOf } from "./pass-rules";
import { createPasses } from "./passes";
import {
  FIELD_MARGIN,
  FORM_DRAG,
  FORM_PULL,
  createSimulation,
} from "./simulation";
import {
  AMBIENT,
  FLOW_SHARE,
  calmKey,
  calmProgress,
  chapterTargets,
  fitScale,
  follow,
  formationStage,
  formedArea,
  formedLight,
  releaseRankScale,
  stagedFrame,
  swirlShows,
  type StoryTargets,
} from "./story";

// A long pause (a hidden tab, a slow first frame) must not fling the field.
const MAX_STEP_SECONDS = 1 / 30;
// A still frame shows a field that has found its flow, not the even haze it
// starts as, or a formation that has gathered. Each step is MAX_STEP_SECONDS
// long, so this is three seconds.
const SETTLE_STEPS = 90;
// How many frame times the adaptive resolution looks back over, and how
// often it looks.
const FRAME_WINDOW = 90;
const ADAPT_EVERY_MS = 250;
// Homes reach a tenth past the frame (simulation.ts), so a still frame fits
// until the frame's shape has changed by more than that.
const RESEAT_BEYOND = 0.1;

// How far the camera pushes into the field across the work chapter, in
// world units (the camera stands 5 from the focus plane).
const PUSH_DEPTH = 1.6;
// The values the particles cannot smooth by their own inertia follow the
// story over these times: the release decides what is seen, the push moves
// the camera and the light changes every sprite at once. A jump to another
// chapter then glides instead of flashing.
const RELEASE_FOLLOW_SECONDS = 0.45;
const PUSH_FOLLOW_SECONDS = 0.6;
const LIGHT_FOLLOW_SECONDS = 0.5;
// The hero's dot breathes once in this time.
const PULSE_SECONDS = 2.8;
// The swirl at the pointer winds up and lets go over this time, and the
// lattice inside a work frame fades in and out over this one.
const SWIRL_FOLLOW_SECONDS = 0.3;
const FRAME_FOLLOW_SECONDS = 0.4;

// The stage follow (types.ts, setStage). A stage that moves by at most
// STAGE_STEP between two calls, in normalised device coordinates, is taken
// at once: the work stage arrives on every scroll frame while its row moves
// up the screen, and a shape must stay inside its frame. A longer move is a
// jump, a new row or a new layout, and glides (REQ-SCR-05). A fast wheel or
// a fling moves a frame well under a tenth of the screen between two
// frames; a new row moves its stage by most of the screen.
const STAGE_STEP = 0.2;
// The particles still fly to a stage taken at once with their own inertia,
// so they would trail a moving frame by about half a second of its motion.
// The runtime follows the formed particles' own centre with the spring a
// formed particle feels (simulation.ts FORM_PULL and FORM_DRAG), stepped
// the way the compute node steps a particle, and draws the formed
// particles ahead by the gap between it and the stage: the
// trail. Every formed particle feels the same linear spring toward its own
// point round the centre, so they all lag by the same amount, and the
// formation is drawn on its stage with no lag while its particles catch up
// unseen. Only the drawn place moves; the simulation is untouched, and
// every value stays the particle's own (REQ-ENG-05).

interface Loss {
  message: string | null;
  report: (() => void) | null;
}

interface Story {
  chapter: ChapterId;
  progress: number;
}

function sameTargets(a: StoryTargets, b: StoryTargets): boolean {
  return (Object.keys(a) as Array<keyof StoryTargets>).every(
    (key) => a[key] === b[key],
  );
}

// Float RGBA, read only with textureLoad: nearest filtering and no mipmaps,
// so WebGPU binds it without a sampler, as unfilterable-float, or as float
// where the device has float32-filterable (three r187, WebGPUBindingUtils),
// and WebGL2 reads it with texelFetch inside the transform feedback pass.
function atlasTexture(atlas: Atlas): DataTexture {
  const texture = new DataTexture(
    atlas.data,
    atlas.width,
    atlas.height,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** A stage's numbers with anything not finite replaced, kept as sent. */
function finiteStage(stage: Stage): Stage {
  const finite = (value: number) => (Number.isFinite(value) ? value : 0);
  return {
    x: finite(stage.x),
    y: finite(stage.y),
    halfWidth: Math.max(finite(stage.halfWidth), 0),
    halfHeight: Math.max(finite(stage.halfHeight), 0),
  };
}

function startRuntime(
  renderer: WebGPURenderer,
  options: RuntimeOptions,
  loss: Loss,
  look: FieldLook,
): Runtime {
  const { canvas } = options;
  const backend = liveBackend(renderer);
  const particleCount = Math.max(1, Math.floor(options.particleCount[backend]));

  const cssSize = () => ({
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
  });

  const firstSize = cssSize();
  let view = viewFor(firstSize.width / firstSize.height);
  const atlas = packAtlas();
  const shapes = atlasTexture(atlas);
  const simulation = createSimulation(particleCount, view, shapes);
  // The making-of's passes are the halftone's own, so the soft look has
  // none; the velocity draw is built only for a tier that shows it live.
  const tier = tierOf(backend);
  const field = createField(
    simulation,
    look,
    LIVE_PASSES[tier].includes("velocity"),
  );
  const halftone = look === "halftone" ? createHalftone(particleCount) : null;
  const passes =
    halftone === null ? null : createPasses(halftone, field.velocity);
  renderer.setClearColor(colors.void, 1);

  // The step comes from three's Timer, not the TSL deltaTime node, which
  // would hand the whole length of a pause to the first frame after it.
  const timer = new Timer();
  timer.connect(canvas.ownerDocument);

  let running = false;
  let disposal: Promise<void> | null = null;
  let frames = 0;
  let steps = 0;
  let elapsedSeconds = 0;
  let previousFrameTime: number | null = null;
  // True while the frame on screen is a settled still and not a paused loop.
  let still = false;
  // The aspect the particles were last seated for.
  let seatedAspect = firstSize.width / firstSize.height;

  // The latest story the page sent, and the targets the field is pulled to.
  // Null story: the ambient field, as before any chapter is known.
  let story: Story | null = null;
  let targets: StoryTargets = AMBIENT;
  // The still frame's own name (story.ts, calmKey); null while it runs.
  let stillKey: string | null = null;
  // True from the first story the field hears until its next step, which
  // puts every particle straight on its target, so the page never shows the
  // ambient field gathering into, say, the hero's dot.
  let seatPending = false;
  const followed = {
    release: 1,
    push: 0,
    light: 1,
    white: 0,
    swirl: 0,
    frame: 0,
    dotX: 0,
    dotY: 0,
    shapeX: 0,
    shapeY: 0,
  };
  let lightTarget = 1;
  let formTarget = 0;
  let whiteTarget = 0;
  // The formed particles' own centre and its speed, in world units (see
  // FORM_PULL).
  const trail = { x: 0, y: 0, speedX: 0, speedY: 0 };
  // Where the page puts the dot and the work chapter's shapes (types.ts,
  // Stage); none until the page has measured its layout.
  let stages: Stages = {};
  const centre = { dotX: 0, dotY: 0, shapeX: 0, shapeY: 0 };
  // The making-of's pass cards as the page last sent them (types.ts,
  // PassCard); null while none are on screen, and then no pass is drawn.
  let cards: PassCard[] | null = null;
  // The last pointer the page sent. It pushes the particles only while the
  // field runs: the page lets go of the pointer only after calm has frozen
  // the field, and a settle with the push on would press a hole at the
  // cursor into the still (REQ-A11Y-03).
  const pointer = { x: 0, y: 0, active: false };

  let resolution = startResolution(window.devicePixelRatio);
  let bufferWidth = 0;
  let bufferHeight = 0;
  let bufferRatio = 0;
  const frameTimes: number[] = [];
  let sinceAdaptMs = 0;
  // True while the canvas has no CSS size.
  let unseen = false;

  // Shapes are sized for the stage they form in, inside the frame, so a new
  // frame, a new stage or new targets size them again and move the centres
  // they are pulled to.
  const refit = () => {
    const dot = stagedFrame(stages.hero, view);
    const shapes = stagedFrame(
      formationStage(
        story?.chapter ?? null,
        stages,
        view.halfWidth / view.halfHeight,
      ),
      view,
    );
    centre.dotX = dot.centreX;
    centre.dotY = dot.centreY;
    centre.shapeX = shapes.centreX;
    centre.shapeY = shapes.centreY;
    simulation.shapeScaleFrom.value = fitScale(
      atlas.extents[targets.shapeFrom],
      shapes.frame,
    );
    simulation.shapeScaleTo.value = fitScale(
      atlas.extents[targets.shapeTo],
      shapes.frame,
    );
    formTarget = Math.min(
      targets.shape + targets.sheet + targets.strands + targets.rings,
      1,
    );
    // Only a shape or the sheet turns its densest cells white. The preview
    // draws the about strands and the contact rings in violet and glow
    // alone, and on a phone the strands' crossings reached white under the
    // about text, 3.18 to 1 for muted text through its plate (REQ-A11Y-06).
    whiteTarget = Math.min(targets.shape + targets.sheet, 1);
    // The halftone's fill lands on the glow token whatever the area the
    // formation packs into; the soft look keeps its own rule.
    lightTarget =
      look === "halftone"
        ? halftoneLight(
            formedArea(targets, atlas.extents, view, shapes.frame),
            formTarget,
          )
        : formedLight(targets, atlas.extents, view, shapes.frame);
  };

  // The halftone pass places the hero dot and the work frame's lattice in
  // CSS pixels: the dot where the simulation's dot is, the lattice exactly
  // on the frame the page measured, with no follow, so it moves with it.
  const showLook = () => {
    if (halftone === null) return;
    const dot = worldToCss(
      followed.dotX,
      followed.dotY,
      view.halfWidth,
      view.halfHeight,
      bufferWidth,
      bufferHeight,
    );
    halftone.setHero({
      x: dot.x,
      y: dot.y,
      reach: haloReach(stages.hero, bufferWidth, bufferHeight),
      light: heroLight(followed.release),
      pulse: simulation.pulse.value,
    });
    const frame =
      stages.work === undefined
        ? { x: 0, y: 0, halfWidth: 0, halfHeight: 0 }
        : stageToCss(finiteStage(stages.work), bufferWidth, bufferHeight);
    halftone.setFrame({ ...frame, light: followed.frame });
    halftone.setFormed(followed.white);
  };

  const showFollowed = () => {
    simulation.release.value = followed.release;
    field.light.value = followed.light;
    field.setFocus(-followed.push * PUSH_DEPTH);
    simulation.dotCentre.value.set(followed.dotX, followed.dotY);
    simulation.shapeCentre.value.set(followed.shapeX, followed.shapeY);
    // The dot in the seeds' square, where homes span -1 to 1 at the frame
    // and FIELD_MARGIN past it, for the order of the bloom.
    const seedX = followed.dotX / (view.halfWidth * FIELD_MARGIN);
    const seedY = followed.dotY / (view.halfHeight * FIELD_MARGIN);
    simulation.dotSeed.value.set(seedX, seedY);
    simulation.rankScale.value = releaseRankScale(seedX, seedY);
    field.setDrawOffset(followed.shapeX - trail.x, followed.shapeY - trail.y);
    field.setSwirl(followed.swirl);
    showLook();
  };

  /** Puts the formed particles' modelled centre on the stage, at rest. */
  const seatTrail = () => {
    trail.x = followed.shapeX;
    trail.y = followed.shapeY;
    trail.speedX = 0;
    trail.speedY = 0;
  };

  /** One step of the trail, as the compute node steps a formed particle. */
  const stepTrail = (seconds: number) => {
    trail.speedX += (followed.shapeX - trail.x) * FORM_PULL * seconds;
    trail.speedY += (followed.shapeY - trail.y) * FORM_PULL * seconds;
    trail.speedX *= 1 - seconds * FORM_DRAG;
    trail.speedY *= 1 - seconds * FORM_DRAG;
    trail.x += trail.speedX * seconds;
    trail.y += trail.speedY * seconds;
  };

  /** Puts the followed centres on their targets at once. */
  const jumpCentres = () => {
    followed.dotX = centre.dotX;
    followed.dotY = centre.dotY;
    followed.shapeX = centre.shapeX;
    followed.shapeY = centre.shapeY;
    seatTrail();
  };

  /**
   * A stage that moved a little since the last one is taken at once (see
   * STAGE_STEP): the followed centre moves by the same amount, so a glide
   * still under way keeps its course and the move is not slowed by it.
   */
  const takeSmallMoves = (before: typeof centre) => {
    const pairs = [
      ["dotX", "dotY"],
      ["shapeX", "shapeY"],
    ] as const;
    for (const [x, y] of pairs) {
      const moveX = centre[x] - before[x];
      const moveY = centre[y] - before[y];
      const moved = Math.hypot(moveX / view.halfWidth, moveY / view.halfHeight);
      if (moved > 0 && moved <= STAGE_STEP) {
        followed[x] += moveX;
        followed[y] += moveY;
      }
    }
  };

  /** Points the field at new targets; `now` skips the follow. */
  const aim = (next: StoryTargets, now: boolean) => {
    targets = next;
    simulation.applyTargets(next, atlas.index);
    refit();
    if (now) {
      followed.release = next.release;
      followed.push = next.push;
      followed.light = lightTarget;
      followed.white = whiteTarget;
      jumpCentres();
      showFollowed();
    }
  };

  // The swirl shows only while the pointer stirs a running field in the
  // field chapter (story.ts, swirlShows); a still has none (REQ-A11Y-03).
  const applyPointer = () => {
    field.setPointer(pointer.x, pointer.y, pointer.active && !still);
    if (still) {
      followed.swirl = 0;
      field.setSwirl(0);
    }
  };

  const liveTargets = () =>
    story === null ? AMBIENT : chapterTargets(story.chapter, story.progress);

  const calmTargets = () =>
    story === null
      ? AMBIENT
      : chapterTargets(
          story.chapter,
          calmProgress(story.chapter, story.progress),
        );

  const currentCalmKey = () =>
    story === null ? "ambient" : calmKey(story.chapter, story.progress);

  // Sizing the drawing buffer clears the canvas and makes WebGPU configure
  // its context again, even when nothing changed (three r187, CanvasTarget),
  // so unchanged values stop here. The canvas is sized by CSS; this call
  // never writes its style.
  const applySize = (): boolean => {
    // A canvas with no CSS size is hidden, not small: its wrapper is display
    // none on every route but the home page. It keeps its buffer and its
    // seat. Only the first sizing takes the clamped size, so a runtime built
    // on a hidden host still starts.
    unseen = canvas.clientWidth === 0 || canvas.clientHeight === 0;
    if (unseen && bufferWidth > 0) return false;

    const { width, height } = cssSize();
    // An unseen first buffer is one pixel at a ratio of 1: a ratio under 1
    // would floor it to no pixels at all. The frame loop puts the real ratio
    // back once the canvas is shown.
    const ratio = unseen ? 1 : resolution.pixelRatio;
    if (
      width === bufferWidth &&
      height === bufferHeight &&
      ratio === bufferRatio
    ) {
      return false;
    }

    bufferWidth = width;
    bufferHeight = height;
    bufferRatio = ratio;
    renderer.setDrawingBufferSize(width, height, ratio);
    view = field.setAspect(width / height);
    // The cell grid comes from the CSS size alone, so a new pixel ratio
    // draws each dot more or less finely and never moves the lattice.
    const grid = gridFor(width, height);
    field.setGrid(grid, width, height);
    halftone?.resize(grid, width, height, ratio);
    const lit = sprinkle(particleCount, width, height, FLOW_SHARE);
    field.setSprinkle(lit.share, lit.gain);
    refit();
    showFollowed();
    return true;
  };

  const step = (seconds: number) => {
    elapsedSeconds += seconds;
    followed.release = follow(
      followed.release,
      targets.release,
      seconds,
      RELEASE_FOLLOW_SECONDS,
    );
    followed.push = follow(
      followed.push,
      targets.push,
      seconds,
      PUSH_FOLLOW_SECONDS,
    );
    followed.light = follow(
      followed.light,
      lightTarget,
      seconds,
      LIGHT_FOLLOW_SECONDS,
    );
    followed.white = follow(
      followed.white,
      whiteTarget,
      seconds,
      LIGHT_FOLLOW_SECONDS,
    );
    followed.swirl = follow(
      followed.swirl,
      swirlShows(story?.chapter ?? null, pointer.active, still) ? 1 : 0,
      seconds,
      SWIRL_FOLLOW_SECONDS,
    );
    followed.frame = follow(
      followed.frame,
      story?.chapter === "work" && stages.work !== undefined ? 1 : 0,
      seconds,
      FRAME_FOLLOW_SECONDS,
    );
    // The centres move like the camera, so a jump to a new layout or the
    // change from the work chapter's stage to the whole frame glides
    // (REQ-SCR-05).
    for (const key of ["dotX", "dotY", "shapeX", "shapeY"] as const) {
      followed[key] = follow(
        followed[key],
        centre[key],
        seconds,
        PUSH_FOLLOW_SECONDS,
      );
    }
    stepTrail(seconds);
    // A still holds the dot at rest (REQ-A11Y-03).
    simulation.pulse.value = still
      ? 0
      : Math.sin((2 * Math.PI * elapsedSeconds) / PULSE_SECONDS);
    showFollowed();
    simulation.stepSeconds.value = seconds;
    simulation.elapsedSeconds.value = elapsedSeconds;
    // The flow clock runs only once the release this step simulates is
    // complete (story.ts, flowClockStep).
    simulation.advanceFlow(seconds, followed.release);
    void renderer.compute(simulation.update);
    steps += 1;
  };

  // One step of no length with reseat on puts every particle on its target
  // with no speed; the settle steps after it start from there. The flow
  // clock starts again with it, so a still is the same each time.
  const seat = () => {
    seatPending = false;
    elapsedSeconds = 0;
    simulation.resetFlow();
    seatTrail();
    simulation.reseat.value = 1;
    step(0);
    simulation.reseat.value = 0;
    steps = 0;
  };

  const draw = () => {
    if (halftone === null) {
      renderer.render(field.scene, field.camera);
    } else {
      halftone.render(renderer, field.scene, field.camera);
      // Laid out at every draw, from the canvas's size at that moment.
      const laid =
        passes === null || cards === null
          ? []
          : layoutCards(cards, tier, bufferWidth, bufferHeight, bufferRatio);
      if (laid.length > 0) passes?.render(renderer, laid, field.camera);
    }
    frames += 1;
  };

  const bufferAspect = () => bufferWidth / bufferHeight;

  // What a calm field still owes the screen from the commands of this task:
  // a seat on a new stage, a settle toward a new still, and a plain redraw
  // for pass cards that moved. The page sends the work stage and the story
  // together, so all wait for one microtask and the field is settled and
  // drawn once for the lot (REQ-A11Y-03).
  const owed = { reseat: false, settle: false, redraw: false };
  let owedQueued = false;

  /** Puts a calm field on the stage it owes, before it is settled. */
  const payReseat = () => {
    if (!owed.reseat) return;
    owed.reseat = false;
    jumpCentres();
    showFollowed();
    seat();
  };

  // A frozen field cannot flow to the homes of a new frame shape, so it is
  // put on its targets and settled again, the way a fresh load at that shape
  // starts.
  const fitStill = () => {
    const aspect = bufferAspect();
    if (seatPending || Math.abs(aspect / seatedAspect - 1) > RESEAT_BEYOND) {
      seat();
      seatedAspect = aspect;
    }
    while (steps < SETTLE_STEPS) step(MAX_STEP_SECONDS);
  };

  /**
   * Calm shows one still per chapter, and per study in the work chapter.
   * When that still changes, the field is aimed at the new one and settled
   * from where it is; nothing else redraws it.
   */
  const aimStill = () => {
    const key = currentCalmKey();
    if (key === stillKey) return false;
    const next = calmTargets();
    const changed = !sameTargets(next, targets);
    aim(next, true);
    stillKey = key;
    if (changed) steps = 0;
    return changed;
  };

  /**
   * Settles and draws a calm field once for what this task's commands owe
   * it. A field that something else settled in the meantime (a resize, a
   * still drawn) owes nothing more and is not drawn again.
   */
  const payStill = () => {
    owedQueued = false;
    const isOwed = owed.reseat || owed.settle || owed.redraw;
    const redraw = owed.redraw;
    owed.settle = false;
    owed.redraw = false;
    if (!isOwed || !still || disposal !== null || loss.message !== null) {
      owed.reseat = false;
      return;
    }
    try {
      payReseat();
      const settling = steps < SETTLE_STEPS;
      // Cards that moved over a settled still redraw it as it is: the
      // particles do not step, so only the cards change (REQ-A11Y-03).
      if (!settling && !redraw) return;
      if (settling) fitStill();
      // A hidden canvas is drawn when it is shown again (the observer).
      if (!unseen) draw();
    } catch (error) {
      fail(error);
    }
  };

  const owe = (part: keyof typeof owed) => {
    owed[part] = true;
    if (owedQueued) return;
    owedQueued = true;
    queueMicrotask(payStill);
  };

  // A throw from the renderer ends this runtime the way a lost device does:
  // the loop would otherwise throw again on every frame with nobody told.
  const fail = (error: unknown) => {
    if (loss.message !== null) return;
    loss.message = error instanceof Error ? error.message : String(error);
    loss.report?.();
  };

  const adapt = (frameMs: number) => {
    frameTimes.push(frameMs);
    if (frameTimes.length > FRAME_WINDOW) frameTimes.shift();

    sinceAdaptMs += frameMs;
    if (sinceAdaptMs < ADAPT_EVERY_MS) return;

    const next = nextResolution(resolution, {
      medianFrameMs: median(frameTimes),
      elapsedMs: sinceAdaptMs,
      devicePixelRatio: window.devicePixelRatio,
    });
    sinceAdaptMs = 0;
    // Frame times from the old ratio say nothing about the new one.
    if (next.pixelRatio !== resolution.pixelRatio) frameTimes.length = 0;
    resolution = next;
  };

  const frame = (time: number) => {
    try {
      // A new ratio waits for the next frame, so the buffer is never cleared
      // between a draw and the browser showing it.
      if (resolution.pixelRatio !== bufferRatio) applySize();

      timer.update(time);
      if (seatPending) seat();
      step(Math.min(Math.max(timer.getDelta(), 0), MAX_STEP_SECONDS));
      draw();
    } catch (error) {
      fail(error);
      return;
    }
    // A running field follows its homes by itself.
    seatedAspect = bufferAspect();

    // Read before onFrame runs: the caller may pause, run or dispose in it.
    const previous = previousFrameTime;
    previousFrameTime = time;
    if (previous === null) return;

    const frameMs = time - previous;
    adapt(frameMs);
    options.onFrame(frameMs);
  };

  const pause = () => {
    if (!running) return;
    running = false;
    // Clears the callback only: three keeps its own idle frame loop until
    // the renderer is disposed (r187, Animation).
    void renderer.setAnimationLoop(null);
  };

  const observer = new ResizeObserver(() => {
    try {
      const wasUnseen = unseen;
      const resized = applySize();
      // A canvas that is shown again at its old size keeps its buffer, but
      // nothing draws on it while the loop is off.
      const shownAgain = wasUnseen && !unseen && !running;
      // A frame that was on screen is drawn again at once, because the new
      // buffer is blank: a paused or calm field would otherwise stay empty.
      if (!resized && !shownAgain) return;
      if (frames === 0 || loss.message !== null) return;
      if (still) fitStill();
      draw();
    } catch (error) {
      fail(error);
    }
  });

  // Each part is freed even when the one before it throws, and the renderer
  // goes last, because the parts above belong to it.
  const releaseParts = () => {
    const parts: Array<() => void> = [
      pause,
      () => simulation.update.dispose(),
      () => field.material.dispose(),
      () => field.velocity?.dispose(),
      () => halftone?.dispose(),
      () => passes?.dispose(),
      () => simulation.positions.value.dispose(),
      () => simulation.velocities.value.dispose(),
      () => simulation.seeds.value.dispose(),
      () => shapes.dispose(),
      () => timer.dispose(),
      () => observer.disconnect(),
    ];
    for (const free of parts) {
      try {
        free();
      } catch {
        // A part that cannot be freed must not keep the rest alive.
      }
    }
  };

  try {
    observer.observe(canvas);
    applySize();
  } catch (error) {
    releaseParts();
    throw error;
  }

  const release = async () => {
    releaseParts();
    await renderer.dispose();
  };

  loss.report = () => {
    if (disposal !== null) return;
    pause();
    options.onLost(loss.message ?? "");
  };

  return {
    backend,
    particleCount,
    look,
    run() {
      if (running || disposal !== null || loss.message !== null) return;
      running = true;
      // Leaving a still: the field glides from the calm frame to wherever
      // the page is now.
      if (still) aim(liveTargets(), false);
      still = false;
      applyPointer();
      stillKey = null;
      previousFrameTime = null;
      // The time spent paused is not simulated.
      timer.reset();
      void renderer.setAnimationLoop(frame);
    },
    pause,
    drawStill() {
      if (disposal === null && loss.message === null) {
        applySize();
        still = true;
        applyPointer();
        // The still pays what the field owes, so the microtask finds nothing.
        // It draws the pass cards with it.
        payReseat();
        owed.settle = false;
        owed.redraw = false;
        aimStill();
        fitStill();
        draw();
      }
      // Nothing above waits, so the frame is drawn in the caller's own task.
      return Promise.resolve();
    },
    setPointer(x, y, active) {
      pointer.x = x;
      pointer.y = y;
      pointer.active = active;
      applyPointer();
    },
    setStory(chapter, progress) {
      if (disposal !== null || loss.message !== null) return;
      // The first chapter a field hears is where it starts: nothing of it is
      // on screen to glide from. The controller sends it before the first
      // frame, or, after the tier 1 probe, while the probe's frames of the
      // ambient field are still on a hidden canvas (controller.ts, adopt).
      const fresh = story === null || seatPending;
      story = { chapter, progress };
      if (!still) {
        aim(liveTargets(), fresh);
        if (fresh) seatPending = true;
        return;
      }
      // A calm field is drawn again only for a new chapter or study, never
      // for a scroll inside one (REQ-A11Y-03), and once for a stage and a
      // story sent together.
      if (aimStill()) owe("settle");
    },
    setStage(next) {
      if (disposal !== null || loss.message !== null) return;
      stages = next;
      const before = { ...centre };
      refit();
      takeSmallMoves(before);
      // Before its first story a field has nothing on screen to glide from.
      if (story === null || seatPending) {
        jumpCentres();
        showFollowed();
        return;
      }
      if (!still) return;
      // A calm field cannot glide: it is put where the new stage wants it
      // and drawn again once (REQ-A11Y-03), with any story sent with it.
      owe("reseat");
    },
    setPasses(next) {
      if (disposal !== null || loss.message !== null) return;
      const copied = copyCards(next);
      if (sameCards(copied, cards)) return;
      cards = copied;
      // A running field draws them with its next frame; a still is drawn
      // again as it is, once for every command of this task, so its cards
      // keep to the page while it scrolls.
      if (still) owe("redraw");
    },
    dispose() {
      disposal ??= release();
      return disposal;
    },
  };
}

export const createRuntime: RuntimeFactory = async (options) => {
  // A fresh options object for every renderer: the constructor writes its
  // WebGL2 fallback into the object it is given. powerPreference reaches the
  // WebGPU adapter request only.
  const renderer = new WebGPURenderer({
    canvas: options.canvas,
    antialias: false,
    forceWebGL: options.backend === "webgl2",
    powerPreference: "high-performance",
  });

  const loss: Loss = { message: null, report: null };

  // A lost device or context ends this renderer for good: r187 has no way
  // back. The default handler sets the flag that stops its render and
  // compute calls, so it still runs, as a method of the renderer.
  const markLost = renderer.onDeviceLost;
  renderer.onDeviceLost = (info) => {
    markLost.call(renderer, info);
    if (loss.message !== null) return;
    loss.message = info.message;
    loss.report?.();
  };

  // init() falls back to WebGL2 by itself when WebGPU fails to start and
  // rejects only when WebGL2 fails too. Nothing of ours exists yet, and
  // dispose() would only wait on the same rejected promise, so a rejection
  // passes straight to the caller.
  await renderer.init();

  try {
    if (loss.message !== null) throw new Error(loss.message);
    // The halftone needs a half-float target it can draw to and blend; a
    // device that cannot gets the soft field, never an empty one (rule A11).
    const works =
      options.look === "halftone" && (await halftoneWorks(renderer));
    if (loss.message !== null) throw new Error(loss.message);
    return startRuntime(renderer, options, loss, liveLook(options.look, works));
  } catch (error) {
    await renderer.dispose();
    throw error;
  }
};
