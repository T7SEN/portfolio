import {
  Fn,
  cos,
  instanceIndex,
  instancedArray,
  mix,
  mx_noise_vec3,
  sin,
  uniform,
  vec3,
} from "three/tsl";
import { Vector2, Vector3 } from "three/webgpu";

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

// The one built-in shape until P3 brings the chapters their own targets.
const RING_RADIUS = 1.6;
const RING_THICKNESS = 0.5;
const SHAPE_PULL = 1.1;
// A formed shape keeps this share of the noise, so it still breathes.
const SHAPE_NOISE = 0.5;

export const SHAPE_HALF_WIDTH = RING_RADIUS + RING_THICKNESS / 2;

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

export function createSimulation(count: number, view: View) {
  const seedData = particleSeeds(count);

  // Every buffer comes from instancedArray: on WebGL2 instanceIndex is the
  // particle's index only then (three r187, WebGLBackend.compute).
  const positions = instancedArray(homePositions(seedData, view), "vec3");
  const velocities = instancedArray(count, "vec3");
  const seeds = instancedArray(seedData, "vec3").toReadOnly();

  const stepSeconds = uniform(0);
  const elapsedSeconds = uniform(0);
  const frame = uniform(new Vector2(view.halfWidth, view.halfHeight));
  const formation = uniform(0);
  const shapeScale = uniform(1);
  const pointer = uniform(new Vector3());
  const pointerStrength = uniform(0);
  // 1 for one step puts every particle back on its home with no speed. A
  // still frame uses it to fit a frame whose shape has changed; done here, on
  // the particle's own index, it needs no upload and works on both backends.
  const reseat = uniform(0);

  // WebGL2 runs this through transform feedback, so every read and write
  // stays on the particle's own index (REQ-ENG-05). The node is built with a
  // count only: r187 throws when a dispatch size is passed for such a node.
  const update = Fn(() => {
    const position = positions.element(instanceIndex);
    const velocity = velocities.element(instanceIndex);
    const seed = seeds.element(instanceIndex);

    // Homes fan out with distance from the camera, so the field fills the
    // view at every depth.
    const homeDepth = seed.z.mul(FIELD_DEPTH);
    const spread = homeDepth.div(-view.cameraDistance).add(1).mul(FIELD_MARGIN);
    const home = vec3(seed.xy.mul(frame).mul(spread), homeDepth);

    const angle = seed.x.mul(Math.PI);
    const radius = seed.y.mul(RING_THICKNESS / 2).add(RING_RADIUS);
    const shape = vec3(
      cos(angle).mul(radius),
      sin(angle).mul(radius),
      seed.z.mul(RING_THICKNESS / 2),
    ).mul(shapeScale);

    const pull = mix(home, shape, formation)
      .sub(position)
      .mul(formation.mul(SHAPE_PULL - HOME_PULL).add(HOME_PULL));
    const drift = mx_noise_vec3(
      position
        .mul(NOISE_FREQUENCY)
        .add(vec3(0, 0, elapsedSeconds.mul(NOISE_SPEED))),
    ).mul(
      formation
        .mul(SHAPE_NOISE - 1)
        .add(1)
        .mul(NOISE_FORCE),
    );
    const away = position.sub(pointer);
    // Falls off with the cube of the distance, so the cursor stirs the
    // particles near it and leaves the rest of the field alone.
    const reach = away.dot(away).add(POINTER_SOFTENING);
    const push = away.mul(pointerStrength.div(reach.mul(reach)));

    velocity.addAssign(drift.add(pull).add(push).mul(stepSeconds));
    velocity.mulAssign(stepSeconds.mul(DRAG_PER_SECOND).oneMinus());
    position.addAssign(velocity.mul(stepSeconds));

    velocity.mulAssign(reseat.oneMinus());
    position.assign(mix(position, home, reseat));
  })().compute(count);

  return {
    count,
    positions,
    velocities,
    seeds,
    stepSeconds,
    elapsedSeconds,
    frame,
    formation,
    shapeScale,
    pointer,
    pointerStrength,
    reseat,
    update,
  };
}

export type Simulation = ReturnType<typeof createSimulation>;
