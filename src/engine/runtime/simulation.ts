import {
  Fn,
  abs,
  cos,
  float,
  fract,
  instanceIndex,
  instancedArray,
  int,
  ivec2,
  max,
  mix,
  mx_noise_vec3,
  sin,
  smoothstep,
  sqrt,
  step,
  textureLoad,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import { Vector2, Vector3, type DataTexture, type Node } from "three/webgpu";

import type { ShapeId } from "../story";
import { ATLAS_WIDTH, POINTS_PER_SHAPE, ROWS_PER_SHAPE } from "./atlas";
import {
  FLOW_DEPTH,
  FLOW_FROM,
  FLOW_LINES,
  FLOW_PERIOD,
  FLOW_REACH,
  FLOW_RELEASE_DONE,
  FLOW_SHARE,
  FLOW_WIDTH,
  NARROW_ASPECT,
  ORBIT_ASPECT,
  ORBIT_HEIGHT,
  ORBIT_WIDTH,
  ORBIT_WIDTH_NARROW,
  RINGS,
  RINGS_SPEED,
  RING_THICKNESS,
  SHEET_FIT,
  STRANDS,
  STRANDS_CENTRE,
  STRANDS_REACH,
  STRANDS_SPEED,
  STRAND_THICKNESS,
  TRAITS,
  flowClockStep,
  shareStarts,
  type StoryTargets,
} from "./story";

// The ambient field: every particle has a home inside the camera's view and
// wanders around it on a slow noise flow. Most particles (story.ts,
// FLOW_SHARE) leave their noise homes for the flow lines once the bloom's
// release is complete; the rest stay as the sparse backdrop.
const FIELD_DEPTH = 1.5;
// Homes reach a little past the frame, so the flow never bares an edge.
export const FIELD_MARGIN = 1.1;
const HOME_PULL = 0.35;
const NOISE_FREQUENCY = 0.9;
const NOISE_SPEED = 0.12;
const NOISE_FORCE = 0.25;
const DRAG_PER_SECOND = 1.8;
const POINTER_SOFTENING = 0.1;
// A particle far from its target is called back harder, so the field comes
// back from a formation in about a second instead of drifting home for
// several. The field's own wander stays inside RECALL_NEAR, where the recall
// adds nothing, so the ambient flow keeps HOME_PULL and DRAG_PER_SECOND.
const RECALL_NEAR = 1;
const RECALL_FAR = 2.5;
const RECALL_PULL = 2.4;
// Past critical damping for that pull, so a recalled particle never
// overshoots its home: overshoots bunch into bright rings as particles turn.
const RECALL_DRAG = 2.2;

// A particle on a flow line is held close to its moving place on the line,
// so the line stays a thin dotted curve; the drag is past critical damping
// for the pull, and it keeps a little of the noise so the line still
// breathes. Its place moves slowly enough that it trails it only along the
// line, where a lag does not show.
const FLOW_PULL = 4;
const FLOW_DRAG = 4.2;
const FLOW_NOISE = 0.35;

// A formation holds its shape against the noise; the drag keeps the spring
// from ringing. index.ts follows a moving stage with the same spring.
export const FORM_PULL = 9;
export const FORM_DRAG = 5.5;
// A formed shape keeps this share of the noise, so it still breathes.
const FORM_NOISE = 0.5;

// The hero's dot: a disc at the dot's stage that holds every particle the
// bloom has not let go. Its radius breathes with the pulse.
export const DOT_RADIUS = 0.05;
const DOT_PULSE_RADIUS = 0.1;
const DOT_PULL = 14;
const DOT_DRAG = 7.5;

// A released particle leaves the dot while the release passes its rank, the
// distance of its home from the dot; this is how wide that pass is.
const RELEASE_SOFTNESS = 0.15;

// Shapes are flat; their depth only keeps them from looking printed. More
// depth shows as streaks toward the centre, from the perspective.
const SHAPE_DEPTH = 0.04;
const SHEET_DEPTH = 0.04;
const LINE_DEPTH = 0.04;
// Between two of the atlas's points, in the sample space of -1 to 1.
const SHAPE_JITTER = 0.012;
// The rim of the making-of sheet: its outer share of each half size.
const SHEET_RIM = 0.06;

export interface View {
  /** Half the width of the frame at the camera's focus plane, in world units. */
  halfWidth: number;
  halfHeight: number;
  cameraDistance: number;
}

// A fixed seed, so every run starts from the same field and a captured
// still can be made again.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three numbers per particle, each from -1 to 1. */
function particleSeeds(count: number): Float32Array {
  const random = seededRandom(1);
  const data = new Float32Array(count * 3);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = random() * 2 - 1;
  }
  return data;
}

// The same home the compute node builds below, so the field fills the frame
// from its first frame.
function homePositions(seeds: Float32Array, view: View): Float32Array {
  const data = new Float32Array(seeds.length);
  for (let index = 0; index < seeds.length; index += 3) {
    const depth = (seeds[index + 2] ?? 0) * FIELD_DEPTH;
    const spread =
      ((view.cameraDistance - depth) / view.cameraDistance) * FIELD_MARGIN;
    data[index] = (seeds[index] ?? 0) * view.halfWidth * spread;
    data[index + 1] = (seeds[index + 1] ?? 0) * view.halfHeight * spread;
    data[index + 2] = depth;
  }
  return data;
}

/**
 * A particle's noise home in the ambient field, from its seed. Homes fan
 * out with distance from the camera, so the field fills the view at every
 * depth. The backdrop stays on it; a flow particle stays on it until the
 * bloom's release is complete, so the material can measure the bloom by it.
 */
export function homeFor(
  seed: Node<"vec3">,
  frame: Node<"vec2">,
  cameraDistance: number,
) {
  const depth = seed.z.mul(FIELD_DEPTH);
  const spread = depth.div(-cameraDistance).add(1).mul(FIELD_MARGIN);
  return vec3(seed.xy.mul(frame).mul(spread), depth);
}

/**
 * How far one particle has been let go of the dot, 0 to 1, from its seed and
 * the release. The compute node and the material both read it, so a particle
 * is seen exactly while it is free. Particles leave in order of how far their
 * home is from the dot (dotSeed, the dot in the seeds' own -1 to 1 square),
 * and rankScale makes the farthest corner 1 (story.ts, releaseRankScale).
 */
export function releasedFor(
  seed: Node<"vec3">,
  release: Node<"float">,
  dotSeed: Node<"vec2">,
  rankScale: Node<"float">,
) {
  const rank = seed.xy.sub(dotSeed).length().mul(rankScale).min(1);
  const start = rank.mul(1 - RELEASE_SOFTNESS);
  return smoothstep(start, start.add(RELEASE_SOFTNESS), release);
}

/**
 * A particle's point in one shape of the atlas: x and y in the sample space,
 * its edge weight for the rim light, and its layer's weight (1 for the
 * front layer). The point comes from the particle's own index, so a few
 * thousand points serve every particle; the compute node and the material
 * read the same texel.
 */
export function shapeTexel(atlas: DataTexture, shape: Node<"float">) {
  const point = int(instanceIndex).mod(int(POINTS_PER_SHAPE));
  const column = point.mod(int(ATLAS_WIDTH));
  const row = point.div(int(ATLAS_WIDTH));
  return textureLoad(
    atlas,
    ivec2(column, row.add(int(shape).mul(int(ROWS_PER_SHAPE)))),
  );
}

/** One of a particle's own random numbers (story.ts, TRAITS and trait). */
function traitOf(
  mixes: readonly [number, number, number],
  seed: Node<"vec3">,
): Node<"float"> {
  return fract(
    seed.x.mul(mixes[0]).add(seed.y.mul(mixes[1])).add(seed.z.mul(mixes[2])),
  );
}

/**
 * Which share a number falls in, as a whole number held in a float: how
 * many of the starts after the first it has reached (story.ts, chooseShare).
 */
function chosen(starts: readonly number[], value: Node<"float">) {
  let index: Node<"float"> = float(0);
  for (const start of starts.slice(1)) index = index.add(step(start, value));
  return index;
}

/**
 * A table read at a whole number held in a float. Built from steps, so it
 * needs no array indexing and reads the same in WGSL and in GLSL.
 */
function lookup(values: readonly number[], index: Node<"float">) {
  let out: Node<"float"> = float(values[0] ?? 0);
  for (let at = 1; at < values.length; at += 1) {
    const change = (values[at] ?? 0) - (values[at - 1] ?? 0);
    if (change !== 0) out = out.add(step(at - 0.5, index).mul(change));
  }
  return out;
}

const LINE_STARTS = shareStarts(FLOW_LINES.map((line) => line.share));
const STRAND_STARTS = shareStarts(STRANDS.map((strand) => strand.share));
const RING_STARTS = shareStarts(RINGS.map((ring) => ring.share));
const TAU = 2 * Math.PI;

/** A line's number from the table, read at the particle's line. */
function lineValue(
  read: (line: (typeof FLOW_LINES)[number]) => number,
  line: Node<"float">,
) {
  return lookup(FLOW_LINES.map(read), line);
}

/** What a particle is from its seed alone: the same on every frame. */
function traitsFor(seed: Node<"vec3">) {
  const pick = traitOf(TRAITS.pick, seed);
  return {
    pick,
    along: traitOf(TRAITS.along, seed),
    // Two even numbers added make a peaked spread from -1 to 1, so a line
    // has a dense core and a few strays.
    across: traitOf(TRAITS.acrossA, seed)
      .add(traitOf(TRAITS.acrossB, seed))
      .sub(1),
    keepPick: traitOf(TRAITS.keep, seed),
    isFlow: float(1).sub(step(FLOW_SHARE, pick)),
    line: chosen(LINE_STARTS, pick.div(FLOW_SHARE)),
    strand: chosen(STRAND_STARTS, pick),
    ring: chosen(RING_STARTS, pick),
  };
}

export function createSimulation(
  count: number,
  view: View,
  atlas: DataTexture,
) {
  const seedData = particleSeeds(count);

  // Every buffer comes from instancedArray: on WebGL2 instanceIndex is the
  // particle's index only then (three r187, WebGLBackend.compute).
  const positions = instancedArray(homePositions(seedData, view), "vec3");
  const velocities = instancedArray(count, "vec3");
  const seeds = instancedArray(seedData, "vec3").toReadOnly();

  const stepSeconds = uniform(0);
  const elapsedSeconds = uniform(0);
  const frame = uniform(new Vector2(view.halfWidth, view.halfHeight));
  const pointer = uniform(new Vector3());
  const pointerStrength = uniform(0);
  // 1 for one step puts every particle on its target with no speed. A still
  // frame uses it to fit a frame whose shape has changed, and a runtime uses
  // it to start where the story already is; done here, on the particle's own
  // index, it needs no upload and works on both backends.
  const reseat = uniform(0);

  // The story (runtime/story.ts), set by applyTargets. Shape indices are
  // atlas row bands, held as floats and read as integers.
  const release = uniform(1);
  const shapeFrom = uniform(0);
  const shapeTo = uniform(0);
  const shapeMix = uniform(0);
  const shapeScaleFrom = uniform(1);
  const shapeScaleTo = uniform(1);
  const shapeWeight = uniform(0);
  const sheetWeight = uniform(0);
  const strandsWeight = uniform(0);
  const ringsWeight = uniform(0);
  const keep = uniform(0);
  const noiseLevel = uniform(1);
  // The flow clock (story.ts, flowClockStep) and how far it ran in the last
  // step, which tells each particle whether its line wrapped.
  const flowClock = uniform(0);
  const flowDelta = uniform(0);
  // The depth of the camera's focus plane, where the dot and the
  // formations sit while the camera pushes.
  const focusZ = uniform(0);
  // -1 to 1 from the elapsed time; 0 while the field is a still.
  const pulse = uniform(0);
  // Where the page puts the dot, and the centre of the formation's stage
  // (types.ts, Stage), in world units at the focus plane; the dot also in
  // the seeds' square, for the order in which the bloom lets particles go.
  const dotCentre = uniform(new Vector2());
  const dotSeed = uniform(new Vector2());
  const rankScale = uniform(Math.SQRT1_2);
  const shapeCentre = uniform(new Vector2());

  /**
   * How much of each formation a particle takes, and whether its line
   * keeps it out of them: a kept particle streams on through a formation.
   */
  const formsFor = (traits: ReturnType<typeof traitsFor>) => {
    const kept = traits.isFlow
      .mul(lineValue((line) => line.keeps, traits.line))
      .mul(float(1).sub(step(keep, traits.keepPick)));
    const free = float(1).sub(kept);
    const shape = shapeWeight.mul(free);
    const sheet = sheetWeight.mul(free);
    const strands = strandsWeight.mul(free);
    const rings = ringsWeight.mul(free);
    return {
      shape,
      sheet,
      strands,
      rings,
      form: shape.add(sheet).add(strands).add(rings).min(1),
    };
  };

  /** How far the flow lines have taken over from the noise homes. */
  const flowIn = smoothstep(FLOW_FROM, FLOW_RELEASE_DONE, release);

  /** A place along a line at a clock: 0 to 1, from the particle's own along. */
  const placeAt = (
    traits: ReturnType<typeof traitsFor>,
    clock: Node<"float">,
  ) =>
    fract(
      traits.along.add(
        clock.mul(lineValue((line) => line.passes / FLOW_PERIOD, traits.line)),
      ),
    );

  /** A particle's place on its flow line, in world units. */
  const flowHomeFor = (
    seed: Node<"vec3">,
    traits: ReturnType<typeof traitsFor>,
    place: Node<"float">,
  ) => {
    const { line, across } = traits;
    const width = frame.x.min(frame.y).mul(FLOW_WIDTH);
    const wave = (index: 0 | 1, at: Node<"float">) =>
      sin(
        at
          .mul(lineValue((entry) => entry.waves[index].frequency, line))
          .add(lineValue((entry) => entry.waves[index].phase, line))
          .add(
            flowClock.mul(
              lineValue(
                (entry) => (TAU * entry.waves[index].drift) / FLOW_PERIOD,
                line,
              ),
            ),
          ),
      ).mul(lineValue((entry) => entry.waves[index].amplitude, line));

    // An open line runs across the frame and past both sides.
    const x = place.mul(2).sub(1).mul(FLOW_REACH);
    const y = lineValue((entry) => entry.centre, line)
      .add(wave(0, x))
      .add(wave(1, x));
    const depth = seed.z.mul(FLOW_DEPTH);
    const spread = depth.div(-view.cameraDistance).add(1);
    const open = vec3(
      x.mul(frame.x).mul(spread),
      y.mul(frame.y).mul(spread).add(across.mul(width)),
      depth,
    );

    // The ellipse closes round the formation's stage, at the focus plane;
    // wider on a narrow frame (story.ts, orbitAxes).
    const angle = place.mul(TAU);
    const radial = vec2(cos(angle), sin(angle));
    const narrow = float(1).sub(step(NARROW_ASPECT, frame.x.div(frame.y)));
    const a = frame.x.mul(
      mix(float(ORBIT_WIDTH), float(ORBIT_WIDTH_NARROW), narrow),
    );
    const b = frame.y.mul(ORBIT_HEIGHT).min(a.mul(ORBIT_ASPECT));
    const wobble = wave(0, angle).add(1);
    const ellipse = vec3(
      radial
        .mul(vec2(a, b))
        .mul(wobble)
        .add(radial.mul(across.mul(width)))
        .add(shapeCentre),
      focusZ.add(seed.z.mul(LINE_DEPTH)),
    );

    const closed = lineValue((entry) => (entry.closed ? 1 : 0), line);
    return { home: mix(open, ellipse, closed), closed };
  };

  // WebGL2 runs this through transform feedback, so every read and write
  // stays on the particle's own index (REQ-ENG-05); the atlas is a read-only
  // texture, not a fourth buffer. The node is built with a count only: r187
  // throws when a dispatch size is passed for such a node.
  const update = Fn(() => {
    const position = positions.element(instanceIndex);
    const velocity = velocities.element(instanceIndex);
    const seed = seeds.element(instanceIndex);
    const traits = traitsFor(seed);
    const forms = formsFor(traits);
    const short = frame.x.min(frame.y);

    // The ambient home: the noise home, or for a flow particle its place on
    // its line once the release is complete.
    const onLine = traits.isFlow.mul(flowIn);
    const place = placeAt(traits, flowClock);
    const flow = flowHomeFor(seed, traits, place);
    const home = mix(
      homeFor(seed, frame, view.cameraDistance),
      flow.home,
      onLine,
    );

    // An open line that wrapped puts its particle back at the start, outside
    // the frame, in one step: the particle's own place before and after
    // tells it, so no other particle is read.
    const before = placeAt(traits, flowClock.sub(flowDelta));
    const wrapped = step(0.5, abs(place.sub(before)))
      .mul(float(1).sub(flow.closed))
      .mul(traits.isFlow)
      .mul(step(0.5, flowIn));

    // A particle's point in each shape comes from its own index, and its
    // seed scatters it between the points.
    const pointIn = (shape: Node<"float">) => shapeTexel(atlas, shape).xy;
    const jitter = fract(seed.xy.mul(vec2(97.13, 61.71)))
      .mul(2)
      .sub(1)
      .mul(SHAPE_JITTER);
    const shapePoint = mix(
      pointIn(shapeFrom).add(jitter).mul(shapeScaleFrom),
      pointIn(shapeTo).add(jitter).mul(shapeScaleTo),
      shapeMix,
    );
    const shape = vec3(
      shapePoint.add(shapeCentre),
      focusZ.add(seed.z.mul(SHAPE_DEPTH)),
    );

    const sheet = vec3(
      seed.xy.mul(frame).mul(SHEET_FIT),
      focusZ.add(seed.z.mul(SHEET_DEPTH)),
    );

    // The about strands: each particle has a fixed place across the frame,
    // and the waves travel through the strands. Their sizes are shares of
    // the half height (story.ts, strandPoint).
    const strand = traits.strand;
    const strandX = traits.along.mul(2).sub(1).mul(STRANDS_REACH).mul(frame.x);
    const strandWave = sin(
      strandX
        .div(frame.y)
        .mul(
          lookup(
            STRANDS.map((entry) => (2 * Math.PI) / entry.wavelength),
            strand,
          ),
        )
        .add(
          lookup(
            STRANDS.map((entry) => entry.phase),
            strand,
          ),
        )
        .sub(elapsedSeconds.mul(STRANDS_SPEED)),
    );
    const strands = vec3(
      strandX,
      strandWave
        .mul(
          lookup(
            STRANDS.map((entry) => entry.amplitude),
            strand,
          ),
        )
        .add(traits.across.mul(STRAND_THICKNESS))
        .add(STRANDS_CENTRE)
        .mul(frame.y),
      focusZ.add(seed.z.mul(LINE_DEPTH)),
    );

    // The contact rings, round the formation's stage, turning slowly.
    const ringAngle = traits.along
      .mul(TAU)
      .add(elapsedSeconds.mul(RINGS_SPEED));
    const ringRadius = lookup(
      RINGS.map((entry) => entry.radius),
      traits.ring,
    )
      .add(traits.across.mul(RING_THICKNESS))
      .mul(short);
    const rings = vec3(
      vec2(cos(ringAngle), sin(ringAngle)).mul(ringRadius).add(shapeCentre),
      focusZ.add(seed.z.mul(LINE_DEPTH)),
    );

    const formed = home
      .mul(forms.form.oneMinus())
      .add(shape.mul(forms.shape))
      .add(sheet.mul(forms.sheet))
      .add(strands.mul(forms.strands))
      .add(rings.mul(forms.rings));

    // An area-even disc, so the dot is lit evenly and never burns.
    const dotAngle = seed.x.mul(Math.PI);
    const dotRadius = sqrt(seed.y.mul(0.5).add(0.5)).mul(
      pulse.mul(DOT_PULSE_RADIUS).add(1).mul(DOT_RADIUS),
    );
    const dot = vec3(
      cos(dotAngle).mul(dotRadius).add(dotCentre.x),
      sin(dotAngle).mul(dotRadius).add(dotCentre.y),
      focusZ,
    );

    // A particle aims for its place in the field from the moment its release
    // begins, and only its light fades in. Aiming partway between the dot
    // and the home instead folds many particles onto one radius, a ring that
    // piles light to white.
    const released = releasedFor(seed, release, dotSeed, rankScale);
    const leaving = step(1e-4, released);
    const target = mix(dot, formed, leaving);

    const offset = target.sub(position);
    const recall = smoothstep(RECALL_NEAR, RECALL_FAR, offset.length());
    const ambientPull = mix(
      recall.mul(RECALL_PULL).add(HOME_PULL),
      float(FLOW_PULL),
      onLine,
    );
    const ambientDrag = mix(
      recall.mul(RECALL_DRAG).add(DRAG_PER_SECOND),
      float(FLOW_DRAG),
      onLine,
    );
    const pull = mix(
      float(DOT_PULL),
      mix(ambientPull, float(FORM_PULL), forms.form),
      leaving,
    );
    const drag = mix(
      float(DOT_DRAG),
      mix(ambientDrag, float(FORM_DRAG), forms.form),
      leaving,
    );

    const noiseShare = mix(
      mix(float(1), float(FLOW_NOISE), onLine),
      float(FORM_NOISE),
      forms.form,
    );
    const drift = mx_noise_vec3(
      position
        .mul(NOISE_FREQUENCY)
        .add(vec3(0, 0, elapsedSeconds.mul(NOISE_SPEED))),
    ).mul(noiseShare.mul(noiseLevel).mul(released).mul(NOISE_FORCE));
    const away = position.sub(pointer);
    // Falls off with the cube of the distance, so the cursor stirs the
    // particles near it and leaves the rest of the field alone.
    const reach = away.dot(away).add(POINTER_SOFTENING);
    const push = away.mul(pointerStrength.div(reach.mul(reach)));

    velocity.addAssign(drift.add(offset.mul(pull)).add(push).mul(stepSeconds));
    velocity.mulAssign(stepSeconds.mul(drag).oneMinus());
    position.addAssign(velocity.mul(stepSeconds));

    const snap = max(reseat, wrapped);
    velocity.mulAssign(snap.oneMinus());
    position.assign(mix(position, target, snap));
  })().compute(count);

  return {
    count,
    positions,
    velocities,
    seeds,
    stepSeconds,
    elapsedSeconds,
    frame,
    pointer,
    pointerStrength,
    reseat,
    release,
    shapeFrom,
    shapeTo,
    shapeMix,
    shapeScaleFrom,
    shapeScaleTo,
    shapeWeight,
    sheetWeight,
    strandsWeight,
    ringsWeight,
    keep,
    noiseLevel,
    flowClock,
    flowDelta,
    focusZ,
    pulse,
    dotCentre,
    dotSeed,
    rankScale,
    shapeCentre,
    atlas,
    update,

    /**
     * Points the field at a chapter's targets: the shapes and their morph,
     * the four formation weights, what the lines keep and the noise. The
     * release and the camera's push are not set here: the runtime follows
     * them over time and writes release itself.
     */
    applyTargets(
      targets: StoryTargets,
      shapeIndex: Record<ShapeId, number>,
    ): void {
      shapeFrom.value = shapeIndex[targets.shapeFrom];
      shapeTo.value = shapeIndex[targets.shapeTo];
      shapeMix.value = targets.shapeMix;
      shapeWeight.value = targets.shape;
      sheetWeight.value = targets.sheet;
      strandsWeight.value = targets.strands;
      ringsWeight.value = targets.rings;
      keep.value = targets.keep;
      noiseLevel.value = targets.noise;
    },

    /**
     * Moves the flow clock by one step. It runs only once the release is
     * complete (story.ts, flowClockStep), so call it with the release the
     * step simulates, before the step's compute.
     */
    advanceFlow(seconds: number, releaseNow: number): void {
      const next = flowClockStep(flowClock.value, seconds, releaseNow);
      flowClock.value = next.clock;
      flowDelta.value = next.delta;
    },

    /** Puts the flow clock back to its start, so a still is the same each time. */
    resetFlow(): void {
      flowClock.value = 0;
      flowDelta.value = 0;
    },

    /**
     * Per particle values for the material, read from the particle's seed
     * and its own index (use them in the vertex stage, as the rim is used
     * today). rim: 0 to 1, how near the particle sits to its formation's
     * outline. layer: 0 to 1, how far forward its layer sits, 1 for the
     * front layer, the logo, the wordmark, the sheet, the bright strand,
     * the inner ring and every particle not in a formation. line: 0 to 1,
     * the light of the flow line the particle is streaming on, times flowIn
     * and the share not in a formation; 0 for the backdrop. form: how much
     * of a formation the particle takes, 0 to 1. isFlow: 1 for a flow
     * particle, 0 for the backdrop. flowIn: how far the lines have taken
     * over from the noise homes, 0 until the bloom's release nears its end.
     */
    look(seed: Node<"vec3">) {
      const traits = traitsFor(seed);
      const forms = formsFor(traits);
      const texelFrom = shapeTexel(atlas, shapeFrom);
      const texelTo = shapeTexel(atlas, shapeTo);
      const shapeRim = mix(texelFrom.z, texelTo.z, shapeMix);
      const shapeLayer = mix(texelFrom.w, texelTo.w, shapeMix);
      const sheetRim = smoothstep(
        1 - SHEET_RIM,
        1,
        max(abs(seed.x), abs(seed.y)),
      );
      const strandLight = lookup(
        STRANDS.map((entry) => entry.light),
        traits.strand,
      );
      const ringLight = lookup(
        RINGS.map((entry) => entry.light),
        traits.ring,
      );
      const rim = shapeRim
        .mul(forms.shape)
        .add(sheetRim.mul(forms.sheet))
        .min(1);
      const layer = shapeLayer
        .mul(forms.shape)
        .add(forms.sheet)
        .add(strandLight.mul(forms.strands))
        .add(ringLight.mul(forms.rings))
        .add(forms.form.oneMinus());
      const line = traits.isFlow
        .mul(flowIn)
        .mul(forms.form.oneMinus())
        .mul(lineValue((entry) => entry.light, traits.line));
      return {
        rim,
        layer,
        line,
        form: forms.form,
        isFlow: traits.isFlow,
        flowIn,
      };
    },
  };
}

export type Simulation = ReturnType<typeof createSimulation>;
