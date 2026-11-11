import {
  Fn,
  cos,
  float,
  fract,
  instanceIndex,
  instancedArray,
  int,
  ivec2,
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

import { ATLAS_WIDTH, POINTS_PER_SHAPE, ROWS_PER_SHAPE } from "./atlas";
import { SHEET_FIT, WAVE_AMPLITUDE, WAVE_REACH, WAVE_THICKNESS } from "./story";

// The ambient field: every particle has a home inside the camera's view and
// wanders around it on a slow noise flow.
const FIELD_DEPTH = 1.5;
// Homes reach a little past the frame, so the flow never bares an edge.
const FIELD_MARGIN = 1.1;
const HOME_PULL = 0.35;
const NOISE_FREQUENCY = 0.9;
const NOISE_SPEED = 0.12;
const NOISE_FORCE = 0.25;
const DRAG_PER_SECOND = 1.8;
const POINTER_SOFTENING = 0.1;
// A particle far from its target is called back harder, so the field comes
// back from a formation in about a second instead of drifting home for
// several. The field's own wander stays inside RECALL_NEAR, so the ambient
// flow is the one P2 drew.
const RECALL_NEAR = 1;
const RECALL_FAR = 2.5;
const RECALL_PULL = 2.4;
// Past critical damping for that pull, so a recalled particle never
// overshoots its home: overshoots bunch into bright rings as particles turn.
const RECALL_DRAG = 2.2;

// A formation holds its shape against the noise; the drag keeps the spring
// from ringing.
const FORM_PULL = 9;
const FORM_DRAG = 5.5;
// A formed shape keeps this share of the noise, so it still breathes.
const FORM_NOISE = 0.5;

// The hero's dot: a disc at the frame's centre that holds every particle
// the bloom has not let go. Its radius breathes with the pulse.
export const DOT_RADIUS = 0.05;
const DOT_PULSE_RADIUS = 0.1;
const DOT_PULL = 14;
const DOT_DRAG = 7.5;

// A released particle leaves the dot while the release passes its rank, the
// distance of its home from the centre; this is how wide that pass is.
const RELEASE_SOFTNESS = 0.15;

// Shapes are flat; their depth only keeps them from looking printed. More
// depth shows as streaks toward the centre, from the perspective.
const SHAPE_DEPTH = 0.04;
const SHEET_DEPTH = 0.04;
const WAVE_DEPTH = 0.3;
// Between two of the atlas's points, in the sample space of -1 to 1.
const SHAPE_JITTER = 0.012;
// The about wave: how many crests cross its reach, and how fast it travels.
const WAVE_CYCLES = 1.4;
const WAVE_SPEED = 0.35;

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
 * A particle's home in the ambient field, from its seed. Homes fan out with
 * distance from the camera, so the field fills the view at every depth. The
 * compute node pulls toward it; the material measures the bloom by it.
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
 * is seen exactly while it is free.
 */
export function releasedFor(seed: Node<"vec3">, release: Node<"float">) {
  const rank = seed.xy.length().mul(Math.SQRT1_2).min(1);
  const start = rank.mul(1 - RELEASE_SOFTNESS);
  return smoothstep(start, start.add(RELEASE_SOFTNESS), release);
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

  // The story (runtime/story.ts). Shape indices are atlas row bands, held
  // as floats and read as integers.
  const release = uniform(1);
  const shapeFrom = uniform(0);
  const shapeTo = uniform(0);
  const shapeMix = uniform(0);
  const shapeScaleFrom = uniform(1);
  const shapeScaleTo = uniform(1);
  const shapeWeight = uniform(0);
  const sheetWeight = uniform(0);
  const waveWeight = uniform(0);
  const noiseLevel = uniform(1);
  // The depth of the camera's focus plane, where the dot and the
  // formations sit while the camera pushes.
  const focusZ = uniform(0);
  // -1 to 1 from the elapsed time; 0 while the field is a still.
  const pulse = uniform(0);

  // WebGL2 runs this through transform feedback, so every read and write
  // stays on the particle's own index (REQ-ENG-05); the atlas is a read-only
  // texture, not a fourth buffer. The node is built with a count only: r187
  // throws when a dispatch size is passed for such a node.
  const update = Fn(() => {
    const position = positions.element(instanceIndex);
    const velocity = velocities.element(instanceIndex);
    const seed = seeds.element(instanceIndex);

    const home = homeFor(seed, frame, view.cameraDistance);

    // A particle's point in each shape comes from its own index, so a few
    // thousand points serve every particle, and its seed scatters it
    // between them.
    const point = int(instanceIndex).mod(int(POINTS_PER_SHAPE));
    const column = point.mod(int(ATLAS_WIDTH));
    const row = point.div(int(ATLAS_WIDTH));
    const pointIn = (shape: Node<"float">) =>
      textureLoad(
        atlas,
        ivec2(column, row.add(int(shape).mul(int(ROWS_PER_SHAPE)))),
      ).xy;
    const jitter = fract(seed.xy.mul(vec2(97.13, 61.71)))
      .mul(2)
      .sub(1)
      .mul(SHAPE_JITTER);
    const shapePoint = mix(
      pointIn(shapeFrom).add(jitter).mul(shapeScaleFrom),
      pointIn(shapeTo).add(jitter).mul(shapeScaleTo),
      shapeMix,
    );
    const shape = vec3(shapePoint, focusZ.add(seed.z.mul(SHAPE_DEPTH)));

    const sheet = vec3(
      seed.xy.mul(frame).mul(SHEET_FIT),
      focusZ.add(seed.z.mul(SHEET_DEPTH)),
    );

    const phase = seed.x
      .mul(WAVE_CYCLES * Math.PI)
      .sub(elapsedSeconds.mul(WAVE_SPEED));
    const crest = sin(phase)
      .mul(0.8)
      .add(sin(phase.mul(2.3).add(elapsedSeconds.mul(0.4))).mul(0.2));
    const wave = vec3(
      seed.x.mul(frame.x).mul(WAVE_REACH),
      crest.mul(WAVE_AMPLITUDE).add(seed.y.mul(WAVE_THICKNESS)).mul(frame.y),
      focusZ.add(seed.z.mul(WAVE_DEPTH)),
    );

    const form = shapeWeight.add(sheetWeight).add(waveWeight);
    const formed = home
      .mul(form.oneMinus())
      .add(shape.mul(shapeWeight))
      .add(sheet.mul(sheetWeight))
      .add(wave.mul(waveWeight));

    // An area-even disc, so the dot is lit evenly and never burns.
    const dotAngle = seed.x.mul(Math.PI);
    const dotRadius = sqrt(seed.y.mul(0.5).add(0.5)).mul(
      pulse.mul(DOT_PULSE_RADIUS).add(1).mul(DOT_RADIUS),
    );
    const dot = vec3(
      cos(dotAngle).mul(dotRadius),
      sin(dotAngle).mul(dotRadius),
      focusZ,
    );

    // A particle aims for its place in the field from the moment its release
    // begins, and only its light fades in. Aiming partway between the dot
    // and the home instead folds many particles onto one radius, a ring that
    // piles light to white.
    const released = releasedFor(seed, release);
    const leaving = step(1e-4, released);
    const target = mix(dot, formed, leaving);

    const offset = target.sub(position);
    const recall = smoothstep(RECALL_NEAR, RECALL_FAR, offset.length());
    const pull = mix(
      float(DOT_PULL),
      mix(recall.mul(RECALL_PULL).add(HOME_PULL), float(FORM_PULL), form),
      leaving,
    );
    const drag = mix(
      float(DOT_DRAG),
      mix(recall.mul(RECALL_DRAG).add(DRAG_PER_SECOND), float(FORM_DRAG), form),
      leaving,
    );

    const drift = mx_noise_vec3(
      position
        .mul(NOISE_FREQUENCY)
        .add(vec3(0, 0, elapsedSeconds.mul(NOISE_SPEED))),
    ).mul(
      form
        .mul(FORM_NOISE - 1)
        .add(1)
        .mul(noiseLevel)
        .mul(released)
        .mul(NOISE_FORCE),
    );
    const away = position.sub(pointer);
    // Falls off with the cube of the distance, so the cursor stirs the
    // particles near it and leaves the rest of the field alone.
    const reach = away.dot(away).add(POINTER_SOFTENING);
    const push = away.mul(pointerStrength.div(reach.mul(reach)));

    velocity.addAssign(drift.add(offset.mul(pull)).add(push).mul(stepSeconds));
    velocity.mulAssign(stepSeconds.mul(drag).oneMinus());
    position.addAssign(velocity.mul(stepSeconds));

    velocity.mulAssign(reseat.oneMinus());
    position.assign(mix(position, target, reseat));
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
    waveWeight,
    noiseLevel,
    focusZ,
    pulse,
    update,
  };
}

export type Simulation = ReturnType<typeof createSimulation>;
