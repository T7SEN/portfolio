// The contact chapter's sky (D-146): the real sky over AlUla at a moment,
// as numbers. No three.js and no imports, so the page (the names and what
// it sends with setSky) and the engine (the stars' places) work it out the
// same way; the catalogue (catalogue.ts) is passed in.

/** AlUla, Saudi Arabia: the place the sky is seen from. */
export const SKY_PLACE = { latitude: 26.6089, longitude: 37.9236 } as const;

export const SKY_VIEW = {
  /** The view faces south: the middle of the screen is this azimuth. */
  facing: 180,
  /**
   * The most degrees of sky across the frame, on a wide frame and a narrow
   * one; fewer where the band needs a larger scale (skyScale).
   */
  widthDegrees: 220,
  narrowWidthDegrees: 120,
  /** A frame narrower than this, in CSS pixels, is narrow. */
  narrowBelow: 640,
  /** The faintest stars drawn, besides every constellation's own stars. */
  magnitudeLimit: 5,
  /** The head turn's reach toward the pointer, in degrees. */
  turnDegrees: 3,
  tiltDegrees: 1.2,
  /** Stars this close to the horizon, in degrees, are dimmed by the air. */
  horizonDimDegrees: 10,
  /**
   * The sky band [T7SEN, 14 Nov 2026]: the horizon lies at this share of the
   * screen's height, the contact panel in front of the sky, and the top of
   * the screen is never more than bandAltitude degrees up, short of the
   * zenith (skyScale).
   */
  bandShare: 0.6,
  bandAltitude: 80,
} as const;

/** Time constants, in seconds, of the eased values. */
export const SKY_EASE = {
  /** The pointer the sky follows, and its presence as it comes and goes. */
  pointer: 0.27,
  /** A constellation's lines drawing in and fading. */
  reveal: 0.47,
} as const;

/**
 * The contact sky gathers over this share of the chapter's progress, as the
 * field forms it (runtime/story.ts); the page names nothing before.
 */
export const SKY_GATHER = 0.25;

/**
 * How far the sky has gathered at the contact chapter's progress, 0 to 1,
 * eased as the shaders' smoothstep is.
 */
export function skyGather(progress: number): number {
  const t = clamp(progress / SKY_GATHER, 0, 1);
  return Number.isFinite(t) ? t * t * (3 - 2 * t) : 0;
}

/** A constellation shows where the pointer settles within this many CSS px. */
export const REVEAL_NEAR = 30;
export const REVEAL_REACH = 110;

const DEG = Math.PI / 180;
const J2000 = 2451545;
const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;

export interface SkyCatalogue {
  readonly stars: readonly number[];
  readonly segments: readonly number[];
  readonly constellations: readonly string[];
}

export interface PreparedSky {
  count: number;
  /** Right ascension and declination in degrees, moved to the moment's year. */
  ra: Float64Array;
  dec: Float64Array;
  magnitude: Float32Array;
  constellation: Int16Array;
  /** The star's light by its magnitude (starLight). */
  light: Float32Array;
  /** 1 for a star some constellation line uses. */
  inFigure: Uint8Array;
  /** Four numbers a segment: star a, star b, constellation, order. */
  segments: Int32Array;
  segmentCount: number;
  /** How many segments each constellation has. */
  segmentsOf: Int32Array;
}

export interface SkyFrame {
  /** The frame in CSS pixels. */
  width: number;
  height: number;
  /** The horizon line's height from the frame's top, in CSS pixels. */
  horizon: number;
}

export interface SkyTurn {
  /** Degrees the view turns right (positive) and up (positive). */
  turn: number;
  tilt: number;
}

export interface PlacedSky {
  /** Each star's place in CSS pixels from the frame's top left. */
  x: Float32Array;
  y: Float32Array;
  altitude: Float32Array;
  /** 1 for a star drawn: above the horizon, on the frame, bright enough. */
  up: Uint8Array;
}

/** A pointer eased toward the hand: presence goes 0 to 1 as it comes. */
export interface EasedPointer {
  x: number;
  y: number;
  presence: number;
}

export interface ConstellationView {
  index: number;
  /** The segments wholly in view. */
  segments: number[];
  /** The centre, top and bottom of its stars in view, in CSS pixels. */
  x: number;
  y: number;
  top: number;
  bottom: number;
  /** The summed light of its stars in view. */
  light: number;
  /** Every one of its segments is in view. */
  whole: boolean;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

/** A star's light from its visual magnitude: about 1 at magnitude 1. */
export function starLight(magnitude: number): number {
  return clamp(0.9 * 10 ** (-0.4 * (magnitude - 1)), 0.07, 3.2);
}

/** Days since J2000.0 at a moment in milliseconds since 1970. */
function daysSinceJ2000(atMs: number): number {
  return atMs / DAY_MS + UNIX_EPOCH_JD - J2000;
}

/** Local sidereal time in degrees, 0 to 360, at a longitude east. */
export function siderealDegrees(atMs: number, longitude: number): number {
  const gmst = 280.46061837 + 360.98564736629 * daysSinceJ2000(atMs);
  return (((gmst + longitude) % 360) + 360) % 360;
}

/**
 * The catalogue made ready for a moment: each star moved from J2000 to the
 * moment's year by the usual first-order precession, which is good to a
 * small part of a degree over this century.
 */
export function prepareSky(catalogue: SkyCatalogue, atMs: number): PreparedSky {
  const count = Math.floor(catalogue.stars.length / 4);
  const years = daysSinceJ2000(atMs) / 365.25;
  const sky: PreparedSky = {
    count,
    ra: new Float64Array(count),
    dec: new Float64Array(count),
    magnitude: new Float32Array(count),
    constellation: new Int16Array(count),
    light: new Float32Array(count),
    inFigure: new Uint8Array(count),
    segments: Int32Array.from(catalogue.segments),
    segmentCount: Math.floor(catalogue.segments.length / 4),
    segmentsOf: new Int32Array(catalogue.constellations.length),
  };
  for (let star = 0; star < count; star += 1) {
    const ra = (catalogue.stars[star * 4] ?? 0) * 15;
    const dec = catalogue.stars[star * 4 + 1] ?? 0;
    const magnitude = catalogue.stars[star * 4 + 2] ?? 9;
    // Seconds of right ascension and arcseconds of declination a year.
    const raSeconds =
      (3.075 + 1.336 * Math.sin(ra * DEG) * Math.tan(dec * DEG)) * years;
    const decSeconds = 20.04 * Math.cos(ra * DEG) * years;
    sky.ra[star] = ra + (raSeconds * 15) / 3600;
    sky.dec[star] = dec + decSeconds / 3600;
    sky.magnitude[star] = magnitude;
    sky.constellation[star] = catalogue.stars[star * 4 + 3] ?? -1;
    sky.light[star] = starLight(magnitude);
  }
  for (let segment = 0; segment < sky.segmentCount; segment += 1) {
    const a = sky.segments[segment * 4] ?? 0;
    const b = sky.segments[segment * 4 + 1] ?? 0;
    const constellation = sky.segments[segment * 4 + 2] ?? 0;
    sky.inFigure[a] = 1;
    sky.inFigure[b] = 1;
    sky.segmentsOf[constellation] = (sky.segmentsOf[constellation] ?? 0) + 1;
  }
  return sky;
}

export function createPlaced(count: number): PlacedSky {
  return {
    x: new Float32Array(count),
    y: new Float32Array(count),
    altitude: new Float32Array(count),
    up: new Uint8Array(count),
  };
}

/** Whether the frame is narrow: a phone's narrower panorama. */
export function isNarrow(frame: SkyFrame): boolean {
  return frame.width < SKY_VIEW.narrowBelow;
}

/**
 * CSS pixels a degree of sky takes on this frame: the frame's width over
 * its most degrees, or more where the sky above the horizon would reach
 * past bandAltitude at the screen's top. A tall phone so shows about 60
 * degrees across, as a phone held up to the sky does, its stars as dense
 * on the screen as a desktop's.
 */
export function skyScale(frame: SkyFrame): number {
  const across = isNarrow(frame)
    ? SKY_VIEW.narrowWidthDegrees
    : SKY_VIEW.widthDegrees;
  return Math.max(frame.width / across, frame.horizon / SKY_VIEW.bandAltitude);
}

/**
 * The sky's frame on a screen this size, in CSS pixels: the band's horizon
 * at SKY_VIEW.bandShare of the height, whatever the scroll, so the page,
 * the engine and the tier 3 still all agree.
 */
export function skyFrame(width: number, height: number): SkyFrame {
  return { width, height, horizon: height * SKY_VIEW.bandShare };
}

/**
 * Every star's place at a moment: altitude and azimuth over AlUla, then a
 * panorama facing south, east on the left, the horizon on the frame's
 * horizon line, turned by the head turn. Fills out and returns it.
 */
export function placeSky(
  sky: PreparedSky,
  atMs: number,
  frame: SkyFrame,
  view: SkyTurn,
  out: PlacedSky,
): PlacedSky {
  const scale = skyScale(frame);
  const limit = SKY_VIEW.magnitudeLimit;
  const lst = siderealDegrees(atMs, SKY_PLACE.longitude);
  const latitude = SKY_PLACE.latitude * DEG;
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  for (let star = 0; star < sky.count; star += 1) {
    const hour = (lst - (sky.ra[star] ?? 0)) * DEG;
    const dec = (sky.dec[star] ?? 0) * DEG;
    const sinAlt =
      sinLat * Math.sin(dec) + cosLat * Math.cos(dec) * Math.cos(hour);
    const altitude = Math.asin(clamp(sinAlt, -1, 1)) / DEG;
    const azimuth =
      Math.atan2(
        -Math.sin(hour) * Math.cos(dec),
        cosLat * Math.sin(dec) - sinLat * Math.cos(dec) * Math.cos(hour),
      ) / DEG;
    let off = azimuth - SKY_VIEW.facing - view.turn;
    off -= 360 * Math.round(off / 360);
    const x = frame.width / 2 + off * scale;
    const y = frame.horizon - (altitude - view.tilt) * scale;
    out.x[star] = x;
    out.y[star] = y;
    out.altitude[star] = altitude;
    const bright =
      (sky.magnitude[star] ?? 9) <= limit || sky.inFigure[star] === 1;
    out.up[star] =
      altitude > 0 &&
      y < frame.horizon &&
      y > -8 &&
      x > -8 &&
      x < frame.width + 8 &&
      bright
        ? 1
        : 0;
  }
  return out;
}

/** How much the air dims a star at this altitude: 0.35 at the horizon to 1. */
export function horizonDim(altitude: number): number {
  return 0.35 + 0.65 * clamp(altitude / SKY_VIEW.horizonDimDegrees, 0, 1);
}

/** Moves a value toward a target with a time constant, frame rate free. */
export function easeToward(
  value: number,
  target: number,
  seconds: number,
  timeConstant: number,
): number {
  if (!(seconds > 0)) return value;
  return target + (value - target) * Math.exp(-seconds / timeConstant);
}

/**
 * The pointer the sky follows: it glides toward the hand, and when the hand
 * leaves it stays where it was and its presence fades. null once gone.
 */
export function easePointer(
  previous: EasedPointer | null,
  pointer: { x: number; y: number } | null,
  seconds: number,
): EasedPointer | null {
  if (pointer === null) {
    if (previous === null) return null;
    const presence = easeToward(
      previous.presence,
      0,
      seconds,
      SKY_EASE.pointer,
    );
    return presence < 0.02 ? null : { ...previous, presence };
  }
  if (previous === null) return { x: pointer.x, y: pointer.y, presence: 0 };
  return {
    x: easeToward(previous.x, pointer.x, seconds, SKY_EASE.pointer),
    y: easeToward(previous.y, pointer.y, seconds, SKY_EASE.pointer),
    presence: easeToward(previous.presence, 1, seconds, SKY_EASE.pointer),
  };
}

/**
 * The head turn: the view turns toward the eased pointer, so the sky swings
 * against the hand, up to SKY_VIEW's reach. None with no pointer.
 */
export function headTurn(
  pointer: EasedPointer | null,
  frame: SkyFrame,
): SkyTurn {
  if (pointer === null) return { turn: 0, tilt: 0 };
  const across = clamp(
    (pointer.x - frame.width / 2) / (frame.width / 2),
    -1,
    1,
  );
  const half = frame.horizon / 2;
  const up = half > 0 ? clamp((half - pointer.y) / half, -1, 1) : 0;
  return {
    turn: across * SKY_VIEW.turnDegrees * pointer.presence,
    tilt: up * SKY_VIEW.tiltDegrees * pointer.presence,
  };
}

/** The constellations with at least one segment wholly in view. */
export function constellationsInView(
  sky: PreparedSky,
  placed: PlacedSky,
): ConstellationView[] {
  const views = new Map<number, ConstellationView & { stars: number }>();
  for (let segment = 0; segment < sky.segmentCount; segment += 1) {
    const a = sky.segments[segment * 4] ?? 0;
    const b = sky.segments[segment * 4 + 1] ?? 0;
    if (placed.up[a] !== 1 || placed.up[b] !== 1) continue;
    const index = sky.segments[segment * 4 + 2] ?? 0;
    let view = views.get(index);
    if (view === undefined) {
      view = {
        index,
        segments: [],
        x: 0,
        y: 0,
        top: Infinity,
        bottom: -Infinity,
        light: 0,
        whole: false,
        stars: 0,
      };
      views.set(index, view);
    }
    view.segments.push(segment);
    for (const star of [a, b]) {
      const y = placed.y[star] ?? 0;
      view.x += placed.x[star] ?? 0;
      view.y += y;
      view.top = Math.min(view.top, y);
      view.bottom = Math.max(view.bottom, y);
      view.light += sky.light[star] ?? 0;
      view.stars += 1;
    }
  }
  return [...views.values()].map(({ stars, ...view }) => ({
    ...view,
    x: view.x / stars,
    y: view.y / stars,
    whole: view.segments.length === (sky.segmentsOf[view.index] ?? -1),
  }));
}

/** How far a constellation's lines should show for the eased pointer, 0 to 1. */
export function revealTarget(
  view: { x: number; y: number },
  pointer: EasedPointer | null,
): number {
  if (pointer === null) return 0;
  const distance = Math.hypot(pointer.x - view.x, pointer.y - view.y);
  return (
    clamp(1 - (distance - REVEAL_NEAR) / REVEAL_REACH, 0, 1) * pointer.presence
  );
}

/**
 * The constellation the words trace: the one already traced while it stays
 * wholly in view, else the brightest whole one with three lines or more;
 * -1 for none.
 */
export function chooseTrace(
  previous: number,
  views: readonly ConstellationView[],
): number {
  if (views.some((view) => view.index === previous && view.whole)) {
    return previous;
  }
  let chosen = -1;
  let best = -1;
  for (const view of views) {
    if (!view.whole || view.segments.length < 3) continue;
    if (view.light > best) {
      best = view.light;
      chosen = view.index;
    }
  }
  return chosen;
}

/**
 * How far the words have traced: each finished word draws one more line,
 * and the word being typed draws the next as its letters come (three
 * letters draw a whole line). words counts the word being typed.
 */
export function traceProgress(
  words: number,
  letters: number,
  segmentCount: number,
): { done: number; partial: number } {
  const typing = letters > 0 && words > 0;
  const done = clamp(words - (typing ? 1 : 0), 0, segmentCount);
  const partial = typing && done < segmentCount ? clamp(letters / 3, 0, 1) : 0;
  return { done, partial };
}
