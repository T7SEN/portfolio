import {
  color,
  float,
  instanceIndex,
  mix,
  smoothstep,
  step,
  uniform,
  uv,
  vertexStage,
} from "three/tsl";
import {
  AdditiveBlending,
  Color,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
} from "three/webgpu";

import { colors } from "@/tokens/colors";

import { DOT_RADIUS, homeFor, releasedFor } from "./simulation";
import type { Simulation, View } from "./simulation";

const CAMERA_DISTANCE = 5;
const CAMERA_FOV_DEGREES = 50;
const HALF_HEIGHT =
  Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360) * CAMERA_DISTANCE;

// Sprite size is set for this many particles. Other counts scale it by the
// cube root of the ratio, the way the gaps between particles scale, so a
// larger field has a finer grain and the same texture.
const REFERENCE_COUNT = 100_000;
const SPRITE_SIZE = 0.018;
const MAX_SPRITE_GROWTH = 2;
// The share of its quad a sprite's soft disc covers: the falloff in the
// opacity node below, integrated over the quad.
const DISC_FILL = 0.31;
// How much light the sprites add to the frame on average, as a share of full
// violet. It stays the same for every count and every aspect, so the field
// is as calm behind text on a phone as on a desktop.
const COVERAGE = 0.06;
const MAX_SPRITE_OPACITY = 0.6;
const SPEED_FOR_GLOW = 0.8;
const POINTER_FORCE = 0.15;

// The hero's dot: the first DOT_PARTICLES particles are lit, the rest wait
// unseen inside it. The dot's sprites are larger than the field's so a few
// hundred make one soft disc, and their light is set so the disc adds about
// DOT_LIGHT of full violet: additive sprites that overlap past 1 would burn
// it to white.
export const DOT_PARTICLES = 400;
const DOT_SPRITE_SIZE = 0.022;
const DOT_LIGHT = 0.7;
const DOT_OPACITY =
  (DOT_LIGHT * Math.PI * DOT_RADIUS * DOT_RADIUS) /
  (DOT_PARTICLES * DOT_SPRITE_SIZE * DOT_SPRITE_SIZE * DISC_FILL);
const DOT_PULSE_LIGHT = 0.25;
// The dot's own light is gone by this point of the release.
const DOT_FADE = 0.5;
// While the bloom runs, a particle's light grows with the square of how far
// it has come from the dot toward its home. Particles a share g of the way
// out are packed into g squared of the area their homes cover, so the light
// per pixel stays the field's own and never piles up near the dot. The rule
// lifts as the release completes. Homes closer than ARRIVAL_NEAR to the
// centre count from that distance.
const BLOOM_LIFTS = 0.8;
const ARRIVAL_NEAR = 0.15;
// Particles crossing the frame fast, between two formations, are dimmed
// for the same reason. The ambient flow and a stirred field move slower
// than FLIGHT_SLOW.
const FLIGHT_SLOW = 1.2;
const FLIGHT_FAST = 3;
const FLIGHT_DIM = 0.8;

/** The frame at the camera's focus plane, where the pointer and shapes live. */
export function viewFor(aspect: number): View {
  return {
    halfWidth: HALF_HEIGHT * aspect,
    halfHeight: HALF_HEIGHT,
    cameraDistance: CAMERA_DISTANCE,
  };
}

export function createField(simulation: Simulation) {
  const growth = Math.min(
    Math.cbrt(REFERENCE_COUNT / simulation.count),
    MAX_SPRITE_GROWTH,
  );
  const spriteSize = SPRITE_SIZE * growth;
  const spriteOpacity = uniform(0);
  // Each sprite's share of its light while a formation packs the field
  // (runtime/story.ts, formedLight).
  const light = uniform(1);

  const position = simulation.positions.toAttribute();
  const speed = simulation.velocities.toAttribute().length();
  const seed = simulation.seeds.toAttribute();
  const { release, pulse } = simulation;

  const released = releasedFor(seed, release);
  const isDot = step(float(instanceIndex), DOT_PARTICLES - 0.5);
  const dotness = isDot.mul(smoothstep(0, DOT_FADE, release).oneMinus());
  const blooming = smoothstep(BLOOM_LIFTS, 1, release).oneMinus();
  const home = homeFor(seed, simulation.frame, CAMERA_DISTANCE);
  const arrival = position.xy
    .length()
    .div(home.xy.length().max(ARRIVAL_NEAR))
    .min(1);
  const arrived = mix(float(1), arrival.mul(arrival), blooming);
  const flight = smoothstep(FLIGHT_SLOW, FLIGHT_FAST, speed)
    .mul(FLIGHT_DIM)
    .oneMinus();
  const fieldAlpha = spriteOpacity
    .mul(light)
    .mul(released)
    .mul(arrived)
    .mul(flight);
  const dotAlpha = pulse.mul(DOT_PULSE_LIGHT).add(1).mul(DOT_OPACITY);
  const shown = step(1e-3, released.max(dotness));

  const material = new SpriteNodeMaterial();
  material.positionNode = position;
  material.colorNode = mix(
    color(new Color(colors.violet)),
    color(new Color(colors.glow)),
    smoothstep(0, SPEED_FOR_GLOW, speed),
  );
  material.opacityNode = smoothstep(0.1, 0.5, uv().sub(0.5).length())
    .oneMinus()
    .mul(vertexStage(mix(fieldAlpha, dotAlpha, dotness)));
  // A particle that is not seen has no size, so it costs no fragments: the
  // hero keeps nearly every particle hidden in the dot.
  material.scaleNode = mix(
    float(spriteSize),
    float(DOT_SPRITE_SIZE),
    dotness,
  ).mul(shown);
  material.blending = AdditiveBlending;
  material.depthTest = false;
  material.depthWrite = false;

  const particles = new Sprite(material);
  particles.count = simulation.count;
  particles.frustumCulled = false;

  const scene = new Scene();
  scene.add(particles);

  const camera = new PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 50);
  camera.position.z = CAMERA_DISTANCE;

  let view = viewFor(1);
  let pointerX = 0;
  let pointerY = 0;

  const placePointer = () => {
    simulation.pointer.value.set(
      pointerX * view.halfWidth,
      pointerY * view.halfHeight,
      simulation.focusZ.value,
    );
  };

  return {
    scene,
    camera,
    material,
    light,
    /** Keeps the camera, the homes and the light right for a frame. */
    setAspect(aspect: number): View {
      view = viewFor(aspect);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      simulation.frame.value.set(view.halfWidth, view.halfHeight);

      const frameArea = 4 * view.halfWidth * view.halfHeight;
      const spriteArea = simulation.count * spriteSize ** 2 * DISC_FILL;
      spriteOpacity.value = Math.min(
        (COVERAGE * frameArea) / spriteArea,
        MAX_SPRITE_OPACITY,
      );
      placePointer();
      return view;
    },
    /**
     * Moves the camera by depth (negative is into the field) and the focus
     * plane with it, so the formations stay the same size in the frame and
     * the pointer stays on them.
     */
    setFocus(depth: number) {
      camera.position.z = CAMERA_DISTANCE + depth;
      simulation.focusZ.value = depth;
      placePointer();
    },
    /** x and y in normalised device coordinates: -1 to 1, y up. */
    setPointer(x: number, y: number, active: boolean) {
      pointerX = x;
      pointerY = y;
      placePointer();
      simulation.pointerStrength.value = active ? POINTER_FORCE : 0;
    },
  };
}

export type Field = ReturnType<typeof createField>;
