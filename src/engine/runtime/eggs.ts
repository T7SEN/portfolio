// The easter eggs (REQ-NAV-05) and the about strands' answer to the sound
// (REQ-SND-03) as numbers: each egg's timeline from its start, the share of
// the field it holds, its formation's place and light, the flip's rain and
// the strands' eased levels. No three.js here, so it is tested in Node;
// simulation.ts and field.ts mirror the per particle rules below in TSL, and
// every one of them reads only the particle's own seed and place
// (REQ-ENG-05).

import { EGGS, type AudioLevels, type EggId } from "../story";
import type { FieldLook } from "../types";
import { halftoneLight } from "./halftone-rules";
import type { MarkId } from "./shapes/marks";
import {
  FORMED_GAIN,
  MIN_LIGHT,
  STRANDS_SPEED,
  bloomStage,
  fitScale,
  follow,
  fract,
  lightArea,
  smoothstep,
  stagedFrame,
  type Frame,
  type ShapeExtent,
} from "./story";

/**
 * What an egg asks of the field at one moment. Every value is 0 while no egg
 * plays, and each egg starts and ends on those values, so the story takes the
 * field back with no jump.
 */
export interface EggFrame {
  /** 0 to 1: the share of each particle's target and pull that is the egg's formation, before the particle lets go. */
  form: number;
  /** 0 to 1: the let go clock; each particle lets go at its own moment across it (letGoShare). */
  free: number;
  /** World units a second squared on the particles that have let go: below 0 down. */
  gravity: number;
  /** 0 to 1: the share of the story's pull the particles that have let go lose. */
  loose: number;
  /**
   * 0 to 1: the share of the egg's light a particle that has let go keeps,
   * so it is seen falling or flying back, and fades as it returns.
   */
  trail: number;
  /**
   * 0 to 1: how much of the formation's look a particle that has let go
   * keeps as it falls: its outline, its share of the white, and its light at
   * any speed, where the field otherwise dims a fast particle (gg).
   */
  keep: number;
  /**
   * 0 to 1: how much harder the story calls back the particles that have let
   * go (EGG_RECALL_PULL), so they are home before the egg ends.
   */
  recall: number;
  /** 0 to 1: how much the egg shows the particles the hero's dot still holds. */
  shown: number;
  /**
   * Seconds since the flip's rain began, which each particle's rise reads
   * (rainAt); 0 while no rain falls. Every particle is home again well before
   * the flip ends, so the clock's drop to 0 at its end moves nothing.
   */
  rain: number;
}

export const EGG_REST: EggFrame = {
  form: 0,
  free: 0,
  gravity: 0,
  loose: 0,
  trail: 0,
  keep: 0,
  recall: 0,
  shown: 0,
  rain: 0,
};

/** Each egg's length in seconds of the field's own time. */
export const EGG_SECONDS: Readonly<Record<EggId, number>> = {
  gg: 4.8,
  mark: 4.4,
  flip: 4.8,
};

/**
 * The shape each egg forms in the atlas: the letters GG, the T7 mark; the
 * flip forms none.
 */
export const EGG_SHAPE: Readonly<Record<EggId, MarkId | null>> = {
  gg: "gg",
  mark: "logo",
  flip: null,
};

/** The moments each egg's formation is whole, in seconds from its start. */
export const EGG_HOLD: Readonly<
  Record<"gg" | "mark", { from: number; to: number }>
> = {
  // The formation's targets are whole at 0.6 s and its particles arrive about
  // 0.6 s later (simulation.ts FORM_PULL and FORM_DRAG); it holds 1.5 s.
  gg: { from: 1.2, to: 2.7 },
  mark: { from: 1.2, to: 2.7 },
};

/** The formation's targets gather over this many seconds. */
const GATHER_SECONDS = 0.6;
/** The hero's parked particles show or hide over this many seconds. */
const SHOW_SECONDS = 0.3;

/**
 * gg's crumble, in seconds from its start: from the end of its hold until
 * its last pieces have faded. Its middle is where the headed spec weighs its
 * light against the whole letters'.
 */
export const GG_CRUMBLE = { from: 2.7, to: 4.15 } as const;
/** gg lets go of its pieces over this many seconds from the end of its hold. */
export const GG_LET_GO_SECONDS = 1.1;

/**
 * gg's fall: gravity on the particles that have let go. Gentler than a drop
 * off the screen in half a second, so the pieces are seen falling: a piece
 * that lets go first is near the bottom of the screen (about 1.3 world units
 * below the letters' foot) by the middle of the crumble.
 */
export const FALL_GRAVITY = -10;

/**
 * A fallen particle comes to rest once it is FALL_FLOOR of the half height
 * below the middle, just under the screen, slowed by FALL_REST_DRAG: the
 * story then calls it back from there, not from far below.
 */
export const FALL_FLOOR = 1.1;
export const FALL_REST_DRAG = 8;

/**
 * gg breaks into pieces: squares GG_CHUNK a side in the shape's sample space
 * (about 6 halftone cells across on a wide screen). Every particle of a
 * piece lets go at the piece's moment, over CHUNK_SOFT of the clock, short
 * so each row of pieces breaks off cleanly instead of the letters
 * stretching; the piece falls whole and keeps the letters' density and
 * light. CHUNK_SCATTER of each particle's moment is its own, so a piece
 * sheds a short trail as it goes.
 */
export const GG_CHUNK = 0.12;
export const CHUNK_SCATTER = 0.06;
export const CHUNK_SOFT = 0.08;

/** The piece size each egg breaks into, 0 for none: only gg crumbles in pieces. */
export const EGG_CHUNK: Readonly<Record<EggId, number>> = {
  gg: GG_CHUNK,
  mark: 0,
  flip: 0,
};

/**
 * While a let go particle is called back, the story's pull on it is
 * 1 + EGG_RECALL_PULL times itself and its drag 1 + EGG_RECALL_DRAG times:
 * the pull four times over and the drag twice, which keeps each spring's
 * damping as it was and halves the time it takes to come home.
 */
export const EGG_RECALL_PULL = 3;
export const EGG_RECALL_DRAG = 1;

/**
 * Each particle lets go at its own moment: its rank times LET_GO_SPREAD along
 * the let go clock, over LET_GO_SOFT of it. The two add to 1, so every
 * particle has let go once the clock reaches 1. Its rank mixes its trait
 * (story.ts TRAITS.egg, or its piece's, chunkTrait) with its height in the
 * egg's shape, 0 at the bottom and 1 at the top, by LET_GO_ORDER, so a
 * formation crumbles from the bottom up with some scatter.
 */
export const LET_GO_SPREAD = 0.7;
export const LET_GO_SOFT = 0.3;
export const LET_GO_ORDER = 0.6;

/**
 * The drag on a particle the story's pull has let go of, so gravity can move
 * it: the field's own drag would hold a falling particle at a crawl.
 */
export const EGG_DRAG = 1.2;

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/** True for one of the easter eggs, whatever a caller sends. */
export function isEgg(value: unknown): value is EggId {
  return EGGS.some((egg) => egg === value);
}

/**
 * What one egg asks of the field so many seconds after it began. Before 0
 * and from its length on, the rest values.
 *
 * gg: the field gathers into the letters GG and holds them, then breaks
 * from the bottom up into pieces that fall under gravity with the letters'
 * own light, fading over the last part of the fall as the story calls them
 * back. mark: the same with the T7 mark, released with no fall. flip: rain
 * falling up; each particle rises from its place in the story, hangs at its
 * own highest point and settles back (rainAt), with no pull of its own.
 */
export function eggFrame(egg: EggId, seconds: number): EggFrame {
  const t = seconds;
  if (!(t >= 0) || !(t < EGG_SECONDS[egg])) return EGG_REST;
  const up = (from: number, to: number) => smoothstep(from, to, t);
  const down = (from: number, to: number) => 1 - smoothstep(from, to, t);
  const clock = (from: number, length: number) =>
    clampUnit((t - from) / length);
  const shownFor = (hideFrom: number) =>
    up(0, SHOW_SECONDS) * down(hideFrom, hideFrom + 0.5);

  switch (egg) {
    case "gg": {
      const { to } = EGG_HOLD.gg;
      const falling = up(to - 0.1, to);
      // The pieces keep the letters' light until the last part of the fall,
      // and are dark before the story calls them back up the screen.
      const lit = falling * down(GG_CRUMBLE.to - 0.4, GG_CRUMBLE.to);
      return {
        form: up(0, GATHER_SECONDS),
        free: clock(to, GG_LET_GO_SECONDS),
        gravity: FALL_GRAVITY * falling * down(3.9, 4.2),
        loose: falling * down(3.95, 4.4),
        trail: lit,
        keep: lit,
        recall: up(3.95, 4.25) * down(4.5, 4.8),
        shown: shownFor(4.3),
        rain: 0,
      };
    }
    case "mark": {
      const { to } = EGG_HOLD.mark;
      return {
        ...EGG_REST,
        form: up(0, GATHER_SECONDS),
        free: clock(to, 1),
        trail: up(to - 0.1, to) * down(3, 3.8),
        recall: up(to, 3) * down(4, 4.4),
        shown: shownFor(3.9),
      };
    }
    case "flip":
      return { ...EGG_REST, rain: t };
  }
}

/**
 * How far one particle has let go, 0 to 1, from the clock, its trait and
 * its height's share in the egg's shape, mixed by order (LET_GO_ORDER for a
 * shape, 0 for none), over soft of the clock (LET_GO_SOFT, or CHUNK_SOFT for
 * a piece). Its start is its rank times the rest of the clock, so every
 * particle has let go once the clock reaches 1.
 */
export function letGoShare(
  free: number,
  trait: number,
  height = trait,
  order = 0,
  soft = LET_GO_SOFT,
): number {
  const rank = clampUnit(trait) * (1 - order) + clampUnit(height) * order;
  const start = rank * (1 - soft);
  return smoothstep(start, start + soft, free);
}

/**
 * A piece's own number, 0 to 1, from its column and row: the fract of a
 * large multiple of a sine, as the shader hashes it. The GPU's sine is less
 * precise than this one, so the two may order the pieces differently; both
 * spread them evenly, which is all the crumble needs.
 */
export function chunkHash(column: number, row: number): number {
  return fract(Math.sin(column * 127.1 + row * 311.7) * 43758.5453);
}

/**
 * The piece a particle at x and y of the egg's sample space belongs to, for a
 * piece size: the trait it lets go by (its piece's number, with
 * CHUNK_SCATTER of its own trait) and the piece's height, the y of its
 * middle. With a size of 0 the particle is its own piece.
 */
export function chunkOf(
  x: number,
  y: number,
  size: number,
  trait: number,
): { trait: number; height: number } {
  if (!(size > 0)) return { trait, height: y };
  const column = Math.floor(x / size);
  const row = Math.floor(y / size);
  return {
    trait:
      chunkHash(column, row) * (1 - CHUNK_SCATTER) +
      clampUnit(trait) * CHUNK_SCATTER,
    height: (row + 0.5) * size,
  };
}

const SHARE_SAMPLES = 64;

/**
 * The mean share let go, over traits close to even from 0 to 1. A shape's
 * heights are close to even too, so the mix of the two is near it, and the
 * light it sets has no sharp edge for the difference to show at.
 */
function meanLetGo(free: number): number {
  let sum = 0;
  for (let sample = 0; sample < SHARE_SAMPLES; sample += 1) {
    sum += letGoShare(free, (sample + 0.5) / SHARE_SAMPLES);
  }
  return sum / SHARE_SAMPLES;
}

/**
 * The share of the field the egg's formation holds: its form times the mean
 * share not yet let go.
 */
export function heldShare(frame: EggFrame): number {
  if (!(frame.form > 0)) return 0;
  return clampUnit(frame.form) * (1 - meanLetGo(frame.free));
}

/**
 * The share of the field that keeps the formation's white: what it holds,
 * and the keep's part of the particles that have let go, so gg's falling
 * pieces stay as white in their densest cells as the letters were.
 */
export function formedShare(frame: EggFrame): number {
  if (!(frame.form > 0)) return 0;
  const free = meanLetGo(frame.free);
  return clampUnit(
    clampUnit(frame.form) * (1 - free) + clampUnit(frame.keep) * free,
  );
}

/**
 * The share of the field lit with the egg's light: the formation it holds,
 * and its trail, the particles that have let go and keep part of that light
 * (simulation.ts look, each particle's own share). The field's light leans
 * to the egg's by it. The flip's rain carries a light of its own
 * (rainLight), so it leaves the story's light as it is.
 */
export function litShare(frame: EggFrame): number {
  const free = meanLetGo(frame.free);
  return clampUnit(
    clampUnit(frame.form) * (1 - free) + clampUnit(frame.trail) * free,
  );
}

// The flip: rain falling up. Each particle rises from where the story holds
// it, decelerating to its highest point, hangs there a moment and settles
// back, eased at both ends so nothing snaps. The screen is cut into columns
// (RAIN_COLUMNS in each half height), and each column has its own start,
// highest point and pace, of which each particle takes most (rainColumn):
// so a column's particles leave their lines together and draw out into one
// thin streak, the lower ones quicker, gathering as they near their highest
// points, and the columns beside it rise at other moments to other heights,
// which reads as rain going up. The rest of each number is the particle's
// own (RAIN_SCATTER, RAIN_APEX_OWN, RAIN_PACE_OWN), so no two particles
// share a path. Heights are screen heights, -1 at the bottom and 1 at the
// top, as the projection gives them at the particle's depth.

/** Columns of the rain in each half height of the screen. */
export const RAIN_COLUMNS = 30;
/** The columns start over this many seconds. */
export const RAIN_START_SPREAD = 1.3;
/** The share of a particle's start, highest point and pace that is its own, not its column's. */
export const RAIN_SCATTER = 0.25;
export const RAIN_APEX_OWN = 0.2;
export const RAIN_PACE_OWN = 0.3;
/** Seconds to the highest point, from the quickest to the slowest. */
export const RAIN_RISE_MIN = 0.8;
export const RAIN_RISE_MAX = 1.3;
/** Seconds each particle hangs at its highest point. */
export const RAIN_HANG = 0.25;
/** Seconds it takes to fall back and settle. */
export const RAIN_FALL = 1.4;
/**
 * The highest points are picked evenly from RAIN_LOW, a third of the way up
 * the screen, to RAIN_HIGH, near the top: so the risen field is spread over
 * the height, never piled against the top edge. A particle whose place is
 * already above its highest point stays where the story holds it.
 */
export const RAIN_LOW = -1 / 3;
export const RAIN_HIGH = 0.85;
/**
 * A particle's light comes in over the first RAIN_LIT_IN of its rise and
 * goes over the fall after RAIN_LIT_OUT of it, and a particle that rises
 * less than RAIN_STILL is barely lit, so one that hardly moves keeps the
 * story's look.
 */
export const RAIN_LIT_IN = 0.16;
export const RAIN_LIT_OUT = 0.55;
export const RAIN_STILL = 0.06;
/**
 * A column's three numbers: the fract of the sine of its number times each
 * of RAIN_HASHES, times RAIN_HASH_SCALE, as the shader hashes them.
 */
export const RAIN_HASHES = [12.9898, 78.233, 37.719] as const;
export const RAIN_HASH_SCALE = 43758.5453;

/** When the last particle is home: the latest start, the slowest rise, the hang and the fall. */
export const RAIN_DONE =
  RAIN_START_SPREAD + RAIN_RISE_MAX + RAIN_HANG + RAIN_FALL;

/** A particle of the rain: its screen place and its own numbers, each 0 to 1. */
export interface RainDrop {
  /** Its place across the screen, in half heights from the middle. */
  x: number;
  /** Its height on the screen, -1 at the bottom and 1 at the top. */
  y: number;
  /** Its own start (story.ts TRAITS.egg). */
  start: number;
  /** Its own highest point (TRAITS.rise). */
  apex: number;
  /** Its own pace, 0 the quickest (TRAITS.pace). */
  pace: number;
}

/**
 * A column's start, highest point and pace, each 0 to 1, from a place across
 * the screen in half heights. The GPU's sine is less precise than this one,
 * so the two may give a column other numbers; both spread them evenly, which
 * is all the rain needs.
 */
export function rainColumn(x: number): {
  start: number;
  apex: number;
  pace: number;
} {
  const column = Math.floor(x * RAIN_COLUMNS);
  const hash = (mix: number) => fract(Math.sin(column * mix) * RAIN_HASH_SCALE);
  return {
    start: hash(RAIN_HASHES[0]),
    apex: hash(RAIN_HASHES[1]),
    pace: hash(RAIN_HASHES[2]),
  };
}

/**
 * One particle of the rain so many seconds after it began: rise, how far
 * above its place in the story it is drawn, in screen heights; lit, the
 * share of the rain's light it takes. Both 0 before it starts and after it
 * has settled.
 */
export function rainAt(
  seconds: number,
  drop: RainDrop,
): { rise: number; lit: number } {
  if (!(seconds > 0)) return { rise: 0, lit: 0 };
  const column = rainColumn(drop.x);
  const own = (of: number, mine: number, share: number) =>
    of * (1 - share) + clampUnit(mine) * share;
  const start = own(column.start, drop.start, RAIN_SCATTER) * RAIN_START_SPREAD;
  const pick =
    RAIN_LOW +
    (RAIN_HIGH - RAIN_LOW) * own(column.apex, drop.apex, RAIN_APEX_OWN);
  const height = Math.max(pick - drop.y, 0);
  const riseSeconds =
    RAIN_RISE_MIN +
    (RAIN_RISE_MAX - RAIN_RISE_MIN) *
      own(column.pace, drop.pace, RAIN_PACE_OWN);
  const rising = clampUnit((seconds - start) / riseSeconds);
  // Its speed falls evenly to nothing at the top: a throw upward.
  const risen = 1 - (1 - rising) * (1 - rising);
  const falling = clampUnit(
    (seconds - start - riseSeconds - RAIN_HANG) / RAIN_FALL,
  );
  const fallen = smoothstep(0, 1, falling);
  const lit =
    smoothstep(0, RAIN_LIT_IN, rising) *
    (1 - smoothstep(RAIN_LIT_OUT, 1, falling)) *
    smoothstep(0, RAIN_STILL, height);
  return { rise: height * risen * (1 - fallen), lit };
}

/**
 * The light a particle that rains takes at its full share, on the
 * halftone: about the light of a formation's particle, so a streak's cells
 * reach the glow tone where it gathers. The soft look draws it as bright as
 * one ambient particle.
 */
export const RAIN_LIGHT = 1.5;
export const RAIN_SOFT_LIGHT = 1;

/**
 * Where an egg's formation sits: centred on the screen and fitted to the
 * field chapter's stage for the frame's width over height, as the bloom's
 * mark is (story.ts bloomStage and fitScale). scale is world units per unit
 * of sample space; area, the share of the frame the formation covers for its
 * particles, sets its light.
 */
export function eggPlacement(
  extent: ShapeExtent,
  view: Frame,
): { scale: number; area: number } {
  const aspect = view.halfWidth / Math.max(view.halfHeight, 1e-6);
  const { frame } = stagedFrame(bloomStage(aspect), view);
  const scale = fitScale(extent, frame);
  const frameArea = 4 * view.halfWidth * view.halfHeight;
  const area = (lightArea(extent) * scale * scale) / Math.max(frameArea, 1e-6);
  return { scale, area: Math.min(Math.max(area, 0), 1) };
}

/**
 * What each particle of a whole egg formation's light is multiplied by: the
 * halftone's rule, so its fill lands on the glow tone, or the soft look's.
 */
export function eggLight(area: number, look: FieldLook): number {
  if (look === "halftone") return halftoneLight(area, 1);
  const share = Number.isFinite(area) ? Math.max(area, 0) : 1;
  return Math.min(Math.max(share * FORMED_GAIN, MIN_LIGHT), 1);
}

/** What a particle that rains is lit by, at its full share (rainAt lit). */
export function rainLight(look: FieldLook): number {
  return look === "halftone" ? RAIN_LIGHT : RAIN_SOFT_LIGHT;
}

// The about strands follow the sound, one band each in STRANDS order: a
// level of 1 lifts a strand's amplitude by AUDIO_LIFT of itself and its wave
// speed by AUDIO_SPEED. The levels are eased inside the engine, quick to
// rise and slower to fall, so a frame without new levels never jumps.
export const AUDIO_LIFT = 1.2;
export const AUDIO_SPEED = 0.6;
export const AUDIO_ATTACK_SECONDS = 0.06;
export const AUDIO_RELEASE_SECONDS = 0.3;

export type Levels = [number, number, number];

export const SILENT: Readonly<Levels> = [0, 0, 0];

/** The levels as the engine keeps them: each 0 to 1, anything not finite 0; null is silence. */
export function cleanLevels(levels: AudioLevels | null): Levels {
  if (levels === null) return [0, 0, 0];
  return [clampUnit(levels[0]), clampUnit(levels[1]), clampUnit(levels[2])];
}

/** One step of the eased levels toward the latest ones. */
export function easeLevels(
  current: Readonly<Levels>,
  target: Readonly<Levels>,
  seconds: number,
): Levels {
  const ease = (from: number, to: number) =>
    follow(
      from,
      to,
      seconds,
      to > from ? AUDIO_ATTACK_SECONDS : AUDIO_RELEASE_SECONDS,
    );
  return [
    ease(current[0], target[0]),
    ease(current[1], target[1]),
    ease(current[2], target[2]),
  ];
}

/** Each strand's amplitude, as a multiple of the one drawn, at its level. */
export function strandLifts(levels: Readonly<Levels>): Levels {
  return [
    1 + AUDIO_LIFT * levels[0],
    1 + AUDIO_LIFT * levels[1],
    1 + AUDIO_LIFT * levels[2],
  ];
}

const TAU = 2 * Math.PI;

/**
 * One step of each strand's wave phase, in radians: STRANDS_SPEED a second,
 * faster with its level. With no sound it is the elapsed time times
 * STRANDS_SPEED, as the strands were drawn before. It wraps at a whole turn,
 * where the wave is the same, so it stays small for the GPU's precision.
 */
export function stepPhases(
  phases: Readonly<Levels>,
  levels: Readonly<Levels>,
  seconds: number,
): Levels {
  const step = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const next = (phase: number, level: number) =>
    (phase + step * STRANDS_SPEED * (1 + AUDIO_SPEED * level)) % TAU;
  return [
    next(phases[0], levels[0]),
    next(phases[1], levels[1]),
    next(phases[2], levels[2]),
  ];
}
