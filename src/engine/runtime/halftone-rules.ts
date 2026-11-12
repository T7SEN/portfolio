// The halftone look as plain numbers: the cell grid, the splat and its
// gather, how a cell's density becomes a dot's size and colour, the glow,
// the backdrop lattice and the hero's dot. No three.js here, so every rule
// is unit tested in Node; halftone.ts and field.ts build the same formulas
// in TSL from these constants, and each TSL line names the rule it mirrors.

import type { FieldLook, Stage } from "../types";

/** One halftone cell is this many CSS pixels a side, whatever the pixel ratio. */
export const CELL_PX = 8;
/**
 * Below this CSS width a cell is NARROW_CELL_PX a side instead: at 8 px the
 * wordmark is five cells tall on a phone and reads thin (a risk the P3.5
 * plan named, seen at 375 px in that build's screenshots).
 */
export const NARROW_BELOW_PX = 480;
export const NARROW_CELL_PX = 6;

/** The cell size for a canvas this many CSS pixels wide. */
export function cellFor(cssWidth: number): number {
  return Number.isFinite(cssWidth) && cssWidth < NARROW_BELOW_PX
    ? NARROW_CELL_PX
    : CELL_PX;
}

/**
 * The particles are splatted into a target this many texels a side per
 * cell, one texel per particle, and a gather pass sums each cell's tent
 * from it. A half-float target rounds every additive draw to 11 bits, so
 * summing a formation's thousands of light particles straight into one
 * texel per cell would stall long before the sum is reached; split over 16
 * texels, each holds about a sixteenth as many, well inside that precision.
 */
export const SPLAT_SUB = 4;

export interface Grid {
  /** CSS pixels a side of one cell. */
  cell: number;
  columns: number;
  rows: number;
  /**
   * The grid is a whole number of cells, a little larger than the canvas and
   * centred on it, so this much of it lies past each edge, in CSS pixels.
   */
  padX: number;
  padY: number;
}

/**
 * The cell grid for a canvas of this CSS size. It is sized from CSS pixels,
 * never from the drawing buffer, so the adaptive resolution's pixel-ratio
 * steps change how finely each dot is drawn and never the lattice.
 */
export function gridFor(cssWidth: number, cssHeight: number): Grid {
  const width = Number.isFinite(cssWidth) ? Math.max(cssWidth, 1) : 1;
  const height = Number.isFinite(cssHeight) ? Math.max(cssHeight, 1) : 1;
  const cell = cellFor(width);
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  return {
    cell,
    columns,
    rows,
    padX: (columns * cell - width) / 2,
    padY: (rows * cell - height) / 2,
  };
}

/**
 * The size of one splat sprite in world units at a view depth of 1. The
 * sprites are drawn without size attenuation, so at every depth a sprite is
 * one splat texel wide and lands on exactly one texel.
 */
export function splatSize(
  cssHeight: number,
  fovDegrees: number,
  cell: number = CELL_PX,
): number {
  const tanHalf = Math.tan((fovDegrees * Math.PI) / 360);
  const texelPx = cell / SPLAT_SUB;
  return (2 * texelPx * tanHalf) / Math.max(cssHeight, 1);
}

/**
 * The tent filter: a particle's weight in a cell whose centre is dx and dy
 * cells away from it. The four nearest cells always share exactly 1, so the
 * splat keeps every particle's light.
 */
export function tent(dx: number, dy: number): number {
  return Math.max(1 - Math.abs(dx), 0) * Math.max(1 - Math.abs(dy), 0);
}

/**
 * The gather's taps along one axis: the splat texels whose centres lie
 * within one cell of a cell's centre, as offsets from the cell's first
 * texel, each with its tent weight. A cell reads 2 x SPLAT_SUB of them on
 * each axis, so each texel is shared by the two cells either side of it,
 * and their weights add up to 1.
 */
export function gatherTaps(): Array<{ offset: number; weight: number }> {
  const taps: Array<{ offset: number; weight: number }> = [];
  for (let tap = 0; tap < 2 * SPLAT_SUB; tap += 1) {
    const offset = tap - SPLAT_SUB / 2;
    const cells = (tap + 0.5 - SPLAT_SUB) / SPLAT_SUB;
    taps.push({ offset, weight: 1 - Math.abs(cells) });
  }
  return taps;
}

// Tone: how dense a cell is, on a scale where the ambient field sits at
// AMBIENT_TONE, a formation's fill at FILL_TONE and a full dot at TONE_FULL.
export const AMBIENT_TONE = 0.14;
export const FILL_TONE = 0.6;
export const TONE_FULL = 1;
// A formation lit any dimmer than this would vanish into the backdrop.
const MIN_LIGHT = 0.02;

/**
 * Homes reach 1.1 times past the frame on each axis (simulation.ts,
 * FIELD_MARGIN), and every home projects to the same share of the screen
 * whatever its depth, so this share of the particles is on screen.
 */
export const ON_SCREEN = 1 / (1.1 * 1.1);

/**
 * What a cell's summed weight is multiplied by to give its tone, so the
 * ambient field lands on AMBIENT_TONE at every particle count and size.
 */
export function densityScale(
  particleCount: number,
  cssWidth: number,
  cssHeight: number,
): number {
  return AMBIENT_TONE / perCell(particleCount, cssWidth, cssHeight);
}

/** How many particles of an even ambient field fall in one cell. */
function perCell(particleCount: number, cssWidth: number, cssHeight: number) {
  const cell = cellFor(cssWidth);
  const cells =
    (Math.max(cssWidth, 1) * Math.max(cssHeight, 1)) / (cell * cell);
  return (Math.max(particleCount, 1) * ON_SCREEN) / cells;
}

/**
 * Each formed particle's light while a formation holds. A formation packs
 * its particles into a share of the frame (story.ts, formedArea), all of it
 * on screen, so its cells hold 1 / (area x ON_SCREEN) times the ambient
 * density; this brings its fill down to FILL_TONE, the glow token, and
 * leaves only its edge and its densest cells to reach white. form is how
 * formed the field is, 0 to 1.
 */
export function halftoneLight(area: number, form: number): number {
  const weight = clampUnit(form);
  const share = Number.isFinite(area) ? Math.max(area, 0) : 1;
  const packed = Math.min(
    Math.max((share * ON_SCREEN * FILL_TONE) / AMBIENT_TONE, MIN_LIGHT),
    1,
  );
  return 1 + (packed - 1) * weight;
}

// The flow (story.ts, FLOW_SHARE) takes most particles onto a few lines once
// the bloom's release is complete, so a line's cells hold several times the
// ambient density. A line particle splats at LINE_GAIN times its line's
// light, so the lines read as small dim dots, one or two brighter than the
// rest, as the preview draws them.
export const LINE_GAIN = 0.25;

// The backdrop, the particles that keep their noise homes. On tier 1 about
// ten of them share each cell, so lit evenly they would put the same small
// dot in every cell, a screen door over the page. Once the lines have taken
// over, only a few of them are lit, each as one bright dot: the sparse
// sprinkle the preview shows. SPRINKLE_CELLS is the share of cells a lit one
// sits in, SPRINKLE_TONE the tone of one lit particle on its own. The soft
// look draws its backdrop BACKDROP_GAIN times brighter instead.
export const SPRINKLE_CELLS = 0.015;
export const SPRINKLE_TONE = 0.55;
export const BACKDROP_GAIN = 2.5;
/**
 * The mix of a particle's seed that picks the lit ones: the fract of its
 * dot with the seed, far from the mixes of story.ts's TRAITS.
 */
export const SPRINKLE_MIX = [29.71, 7.13, 83.37] as const;

/**
 * Which share of the backdrop is lit, and the weight a lit one splats at,
 * so a lit particle alone has SPRINKLE_TONE and SPRINKLE_CELLS of the cells
 * hold one, at every particle count and size. flowShare is story.ts's
 * FLOW_SHARE, the share not in the backdrop.
 */
export function sprinkle(
  particleCount: number,
  cssWidth: number,
  cssHeight: number,
  flowShare: number,
): { share: number; gain: number } {
  const ambient = perCell(particleCount, cssWidth, cssHeight);
  const backdropPerCell = Math.max(ambient * (1 - flowShare), 1e-6);
  return {
    share: Math.min(SPRINKLE_CELLS / backdropPerCell, 1),
    gain: (SPRINKLE_TONE * ambient) / AMBIENT_TONE,
  };
}

/**
 * A backdrop particle's weight in the halftone: the ambient field's 1 while
 * the bloom lets the field go, then only the lit ones (sprinkled 1) at the
 * sprinkle's gain.
 */
export function backdropWeight(
  flowIn: number,
  sprinkled: number,
  gain: number,
): number {
  return 1 - flowIn + flowIn * sprinkled * gain;
}

/** A backdrop particle's weight in the soft look. */
export function softBackdropWeight(flowIn: number): number {
  return 1 + (BACKDROP_GAIN - 1) * flowIn;
}

/**
 * One particle's splat weight before the release and flight rules. form is
 * how much of a formation it takes and light the formation's light
 * (halftoneLight); isFlow is 1 for a flow particle, 0 for the backdrop;
 * flowIn how far the lines have taken over (0 during the bloom's release);
 * line its line's light as simulation.ts look() gives it, which already
 * carries flowIn and the share not in a formation; backdrop the backdrop's
 * weight for the look (backdropWeight or softBackdropWeight).
 */
export function particleWeight(
  form: number,
  light: number,
  isFlow: number,
  flowIn: number,
  line: number,
  backdrop: number,
): number {
  const free = (1 - isFlow) * backdrop + isFlow * (1 - flowIn);
  return form * light + (1 - form) * free + LINE_GAIN * line;
}

// A particle on a formation's outline splats this much heavier at a rim of
// 1, so each layer's outline reads as larger dots even inside another
// layer's fill, as the preview draws the sheets and cards.
export const RIM_WEIGHT = 0.5;

/** What a particle's splat weight is multiplied by for its rim. */
export function rimWeight(rim: number): number {
  return 1 + RIM_WEIGHT * clampUnit(rim);
}

// A cell's dot: its area follows the tone, so the radius follows the square
// root, up to DOT_RADIUS_MAX at TONE_FULL. Under DOT_RADIUS_MIN a dot fades
// out rather than show as a single bright pixel.
export const DOT_RADIUS_MAX = 2.7;
export const DOT_RADIUS_MIN = 0.4;
// A work shape's back layers are dimmed by this share of how far back they
// sit, on top of being sampled sparser (shapes/index.ts), so the front
// layer leads and the ones behind read as quieter sheets.
export const BACK_DIM = 0.75;
// A small dot is also a dim one: the lines and the sprinkle read as faint
// dots, as in the preview, and only a formation's fill reaches full colour.
export const DOT_DIM_FLOOR = 0.45;
export const DOT_DIM_FROM = 0.05;
export const DOT_DIM_TO = 0.4;

/** How bright a cell's dot is drawn, 0 to 1, for its tone. */
export function dotLight(tone: number): number {
  return (
    DOT_DIM_FLOOR +
    (1 - DOT_DIM_FLOOR) * smoothstep(DOT_DIM_FROM, DOT_DIM_TO, tone)
  );
}

/** A cell's tone from its summed weight and how far back its particles sit. */
export function cellTone(density: number, scale: number, back: number): number {
  return Math.max(density, 0) * scale * (1 - BACK_DIM * clampUnit(back));
}

/**
 * The dot's radius in CSS pixels for a tone; DOT_RADIUS_MAX is for an 8 px
 * cell, and a smaller cell scales it down with it.
 */
export function dotRadius(tone: number, cell: number = CELL_PX): number {
  return (
    ((DOT_RADIUS_MAX * cell) / CELL_PX) * Math.sqrt(clampUnit(tone / TONE_FULL))
  );
}

/**
 * How much of a pixel the antialiased disc covers: distance and radius in
 * CSS pixels, the edge one device pixel wide. A dot under DOT_RADIUS_MIN
 * fades out.
 */
export function discCoverage(
  radius: number,
  distance: number,
  pixelRatio: number,
): number {
  const edge = clampUnit((radius - distance) * pixelRatio + 0.5);
  return edge * smoothstep(DOT_RADIUS_MIN, DOT_RADIUS_MIN * 2, radius);
}

// Colour: violet for sparse cells, the glow token from FILL_TONE, and the
// near-white text token only on rim cells and the densest cells of a
// formation. Fast particles lean toward glow, so a flight reads as light
// moving.
export const TONE_VIOLET = 0.1;
export const TONE_GLOW = 0.5;
/** World units a second at which a particle counts as fully fast. */
export const SPEED_FOR_GLOW = 0.8;
export const SPEED_GLOW = 0.7;
// A cell is a rim cell when its particles' mean rim weight passes these,
// and only once it holds a real share of a fill, so a lone particle in
// flight never flashes white.
export const RIM_WHITE_FROM = 0.25;
export const RIM_WHITE_TO = 0.6;
export const RIM_TONE_FROM = 0.2;
export const RIM_TONE_TO = 0.4;
// The densest cells of a formation, where layers cross or a shape pinches.
export const DENSE_WHITE_FROM = 1.05;
export const DENSE_WHITE_TO = 1.6;

// A layer behind the front keeps its outline out of white: only the front
// layer's edge turns white, as the preview draws the sheets and the cards,
// whose back layers have outlines in the accent. The mean depth of layer in
// a cell (cellTone's back) fades the rim's white out between these two.
export const RIM_FRONT_FROM = 0.06;
export const RIM_FRONT_TO = 0.14;

export interface DotColour {
  /** 0 is violet, 1 is the glow token. */
  glow: number;
  /** How far the dot leans to the near-white text token, 0 to 1. */
  white: number;
}

/**
 * The dot's colour for a cell. speed is the cell's mean speed share (0 to
 * 1), rim its mean rim weight (0 to 1), formed how formed the field is, back
 * its mean depth of layer (0 for the front layer, as cellTone takes it).
 */
export function dotColour(
  tone: number,
  speed: number,
  rim: number,
  formed: number,
  back = 0,
): DotColour {
  const glow = Math.max(
    smoothstep(TONE_VIOLET, TONE_GLOW, tone),
    clampUnit(speed) * SPEED_GLOW,
  );
  const rimWhite =
    smoothstep(RIM_WHITE_FROM, RIM_WHITE_TO, rim) *
    smoothstep(RIM_TONE_FROM, RIM_TONE_TO, tone) *
    (1 - smoothstep(RIM_FRONT_FROM, RIM_FRONT_TO, back));
  const denseWhite =
    smoothstep(DENSE_WHITE_FROM, DENSE_WHITE_TO, tone) * clampUnit(formed);
  return { glow, white: Math.max(rimWhite, denseWhite) };
}

/** A particle's speed, in world units a second, as its share of glow. */
export function speedShare(speed: number): number {
  return smoothstep(0, SPEED_FOR_GLOW, speed);
}

// The glow: a blurred copy of the density lays violet light under bright
// areas. GLOW_SIGMA is the blur's spread in cells, GLOW_TAPS how many cells
// it reads each side of the centre in each of its two passes.
export const GLOW_SIGMA = 3.5;
export const GLOW_TAPS = 10;
export const GLOW_FROM = 0.08;
export const GLOW_TO = 0.9;
export const GLOW_GAIN = 0.11;

/** The normalised weights of one blur pass, from the centre outward. */
export function blurWeights(): number[] {
  const raw = Array.from({ length: GLOW_TAPS + 1 }, (_, tap) =>
    Math.exp(-(tap * tap) / (2 * GLOW_SIGMA * GLOW_SIGMA)),
  );
  const total = raw.reduce(
    (sum, weight, tap) => sum + (tap === 0 ? weight : 2 * weight),
    0,
  );
  return raw.map((weight) => weight / total);
}

/** The glow's light, a share of the violet token, from the blurred tone. */
export function glowLight(blurredTone: number): number {
  return smoothstep(GLOW_FROM, GLOW_TO, blurredTone) * GLOW_GAIN;
}

// The backdrop lattice: a small faint dot in the glow token at each cell
// centre, shown only near activity (from the blurred tone), across a work
// frame while a shape forms in it, and as the hero dot's round halo. The
// near rule starts above what a flow line leaves in the blur, so the
// lattice gathers round formations and not along every line.
export const LATTICE_RADIUS = 0.8;
export const LATTICE_ALPHA = 0.16;
export const NEAR_FROM = 0.05;
export const NEAR_TO = 0.35;
export const FRAME_LATTICE_ALPHA = 0.12;
/** The frame's lattice fades in over this many cells inside its edge. */
export const FRAME_FADE_CELLS = 2;

/** How strongly the lattice shows near activity, 0 to 1. */
export function nearActivity(blurredTone: number): number {
  return smoothstep(NEAR_FROM, NEAR_TO, blurredTone);
}

/**
 * The lattice inside a work frame: 1 well inside it, 0 outside, fading over
 * FRAME_FADE_CELLS of the live cells inside its edge. inset is how far
 * inside the nearer edge the point is, and cell the live cell's side
 * (cellFor), both in CSS pixels; the pass reads the same cell.
 */
export function frameLattice(inset: number, cell: number = CELL_PX): number {
  return smoothstep(0, FRAME_FADE_CELLS * cell, inset);
}

// The hero's dot (the P3.5 look's small details): a solid glow disc in two
// soft rings of lower light, at the centre of a round dot-grid halo that
// fades with distance. Sizes in CSS pixels and lights as shares of the glow
// token, measured on the preview's hero at twice the pixel density: about
// 0.085 of glow inside the inner ring, 0.028 between the rings; halo dots in
// glow at about 0.31 at 25 px, 0.17 at 62 px and gone by about 170 px.
export const HERO_DOT_PX = 7;
export const RING_INNER_PX = 19;
export const RING_OUTER_PX = 37;
export const RING_INNER_LIGHT = 0.057;
export const RING_OUTER_LIGHT = 0.028;
/** How soft each ring's edge is, in CSS pixels. */
export const RING_SOFTNESS_PX = 5;
// The pulse (-1 to 1) breathes the rings' size and light.
export const RING_BREATH = 0.08;
export const RING_BREATH_LIGHT = 0.25;
/**
 * The halo's reach on a window HALO_REACH_WIDTH_PX wide, and its reach when
 * the page sends a hero stage with no size. The preview's halo is a mask on
 * a box half the window wide, so its reach grows with the window: about 170
 * px at 1440 and 160 at 1280.
 */
export const HALO_REACH_PX = 170;
export const HALO_REACH_WIDTH_PX = 1440;
export const HALO_ALPHA = 0.42;
/** The dot's own light is gone by this point of the bloom's release. */
export const HERO_FADE = 0.5;

/** The hero dot and its halo's light while the bloom lets the field go. */
export function heroLight(release: number): number {
  return 1 - smoothstep(0, HERO_FADE, release);
}

/** The soft rings' light at a distance from the dot's centre, in CSS pixels. */
export function ringLight(distance: number, pulse: number): number {
  const grow = 1 + RING_BREATH * pulse;
  const light = 1 + RING_BREATH_LIGHT * pulse;
  const inner = RING_INNER_PX * grow;
  const outer = RING_OUTER_PX * grow;
  const soft = RING_SOFTNESS_PX;
  return (
    light *
    (RING_INNER_LIGHT * (1 - smoothstep(inner - soft, inner + soft, distance)) +
      RING_OUTER_LIGHT * (1 - smoothstep(outer - soft, outer + soft, distance)))
  );
}

/** The solid disc's coverage of a pixel, as discCoverage with no fade. */
export function heroCore(distance: number, pixelRatio: number): number {
  return clampUnit((HERO_DOT_PX - distance) * pixelRatio + 0.5);
}

/**
 * The halo lattice's alpha at a distance from the dot, both in CSS pixels:
 * the square of a straight fade, as the preview's halo falls off.
 */
export function haloAlpha(distance: number, reach: number): number {
  const fade = clampUnit(1 - distance / Math.max(reach, 1));
  return HALO_ALPHA * fade * fade;
}

/**
 * The halo's reach in CSS pixels. The hero stage's halves give the dot box's
 * size in normalised device coordinates, and a round halo reaches at least
 * half the box's smaller side; on a wide window it reaches as far as the
 * preview's, HALO_REACH_PX at HALO_REACH_WIDTH_PX and in proportion below,
 * never more. The reach is not tied to the box from 1024 px, where the box
 * stays 16rem beside the headline so its text plate never covers the dot.
 */
export function haloReach(
  stage: Stage | undefined,
  cssWidth: number,
  cssHeight: number,
): number {
  if (stage === undefined) return HALO_REACH_PX;
  const across = Math.min(
    (Number.isFinite(stage.halfWidth) ? stage.halfWidth : 0) * cssWidth,
    (Number.isFinite(stage.halfHeight) ? stage.halfHeight : 0) * cssHeight,
  );
  if (!(across > 0)) return HALO_REACH_PX;
  const width = Number.isFinite(cssWidth) ? Math.max(cssWidth, 0) : 0;
  const preview = HALO_REACH_PX * Math.min(width / HALO_REACH_WIDTH_PX, 1);
  return Math.max(across / 2, preview);
}

/**
 * A point at the camera's focus plane, in world units from the frame's
 * centre with y up, as CSS pixels from the canvas's top start corner, y
 * down, which is how the halftone pass places the hero dot and the frame.
 */
export function worldToCss(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  cssWidth: number,
  cssHeight: number,
): { x: number; y: number } {
  return {
    x: (x / Math.max(halfWidth, 1e-6) + 1) * 0.5 * cssWidth,
    y: (1 - y / Math.max(halfHeight, 1e-6)) * 0.5 * cssHeight,
  };
}

/** A stage in normalised device coordinates as a box in CSS pixels. */
export function stageToCss(
  stage: Stage,
  cssWidth: number,
  cssHeight: number,
): { x: number; y: number; halfWidth: number; halfHeight: number } {
  return {
    x: (stage.x + 1) * 0.5 * cssWidth,
    y: (1 - stage.y) * 0.5 * cssHeight,
    halfWidth: stage.halfWidth * 0.5 * cssWidth,
    halfHeight: stage.halfHeight * 0.5 * cssHeight,
  };
}

// The swirl at the pointer (the P3.5 look's small details): while the
// pointer stirs the field chapter, the particles round it are drawn turned
// about it, most at its centre and fading over SWIRL_RADIUS world units, so
// the flow's dots curl into a spiral (story.ts, swirlShows). Only where they
// are drawn: the simulation's push still clears the space under the pointer
// in every chapter. The turn breathes a little, outward.
export const SWIRL_RADIUS = 0.45;
export const SWIRL_TURN = 1.4;
export const SWIRL_BREATH = 0.3;
export const SWIRL_GLOW = 0.8;

/**
 * How far a particle is turned about the pointer, in radians: distance in
 * world units, amount how strongly the swirl shows (0 to 1), wave the
 * breathing term from -1 to 1.
 */
export function swirlTurn(distance: number, amount: number, wave: number) {
  const reach = distance / SWIRL_RADIUS;
  const closeness = Math.exp(-reach * reach) * clampUnit(amount);
  return closeness * SWIRL_TURN * (1 + SWIRL_BREATH * wave);
}

// The start check (rule A11): two additive draws of CHECK_ALPHA into a
// half-float target must sum past 1 without clamping. The sum less 1 is
// written to an 8-bit target and read back.
export const CHECK_ALPHA = 0.75;

/** The 8-bit value the check reads back when blending summed in half float. */
export function checkPassed(value: number | undefined): boolean {
  if (value === undefined || !Number.isFinite(value)) return false;
  const expected = (2 * CHECK_ALPHA - 1) * 255;
  return Math.abs(value - expected) <= 16;
}

/** The look the runtime draws: halftone only when asked for and it works. */
export function liveLook(asked: FieldLook, halfFloatWorks: boolean): FieldLook {
  return asked === "halftone" && halfFloatWorks ? "halftone" : "soft";
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/** 0 at edge0, 1 at edge1, eased; the GLSL and WGSL smoothstep. */
export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clampUnit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
