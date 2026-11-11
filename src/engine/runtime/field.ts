import {
  abs,
  color,
  float,
  instanceIndex,
  max,
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

import { DOT_RADIUS, homeFor, releasedFor, shapeTexel } from "./simulation";
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
// lifts as the release completes. A home nearer the dot than ARRIVAL_NEAR
// counts from that distance, which only keeps the division sound: it is less
// than the dot's radius, so a particle resting at a home beside the dot is
// fully lit. (At 0.15 it left a dark hole around the dot early in the bloom.)
const BLOOM_LIFTS = 0.8;
const ARRIVAL_NEAR = 0.02;
// Particles crossing the frame fast, between two formations, are dimmed
// for the same reason. The ambient flow and a stirred field move slower
// than FLIGHT_SLOW.
const FLIGHT_SLOW = 1.2;
const FLIGHT_FAST = 3;
const FLIGHT_DIM = 0.8;

// The rim light: a formed particle on its shape's outline adds up to
// 1 + RIM_GAIN times the light of one inside, and its colour leans toward
// glow, so a formation reads as a lit edge around a quieter fill rather than
// a flat silhouette. Shapes carry their edge weight in the atlas (atlas.ts);
// the sheet lights the outer SHEET_RIM of its half size, and the wave the
// outer WAVE_RIM of its band's half thickness on each side. Every value is
// the particle's own, so WebGL2 runs it as WebGPU does (REQ-ENG-05).
const RIM_GAIN = 1.8;
const RIM_GLOW = 0.6;
const SHEET_RIM = 0.06;
const WAVE_RIM = 0.4;

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
  const {
    release,
    pulse,
    dotCentre,
    dotSeed,
    rankScale,
    shapeFrom,
    shapeTo,
    shapeMix,
    shapeWeight,
    sheetWeight,
    waveWeight,
  } = simulation;

  const released = releasedFor(seed, release, dotSeed, rankScale);
  const isDot = step(float(instanceIndex), DOT_PARTICLES - 0.5);
  const dotness = isDot.mul(smoothstep(0, DOT_FADE, release).oneMinus());
  const blooming = smoothstep(BLOOM_LIFTS, 1, release).oneMinus();
  const home = homeFor(seed, simulation.frame, CAMERA_DISTANCE);
  const arrival = position.xy
    .sub(dotCentre)
    .length()
    .div(home.xy.sub(dotCentre).length().max(ARRIVAL_NEAR))
    .min(1);
  const arrived = mix(float(1), arrival.mul(arrival), blooming);
  const flight = smoothstep(FLIGHT_SLOW, FLIGHT_FAST, speed)
    .mul(FLIGHT_DIM)
    .oneMinus();
  const shapeEdge = mix(
    shapeTexel(simulation.atlas, shapeFrom).z,
    shapeTexel(simulation.atlas, shapeTo).z,
    shapeMix,
  );
  const sheetEdge = smoothstep(1 - SHEET_RIM, 1, max(abs(seed.x), abs(seed.y)));
  const waveEdge = smoothstep(1 - WAVE_RIM, 1, abs(seed.y));
  const rim = shapeEdge
    .mul(shapeWeight)
    .add(sheetEdge.mul(sheetWeight))
    .add(waveEdge.mul(waveWeight))
    .min(1);
  const fieldAlpha = spriteOpacity
    .mul(light)
    .mul(released)
    .mul(arrived)
    .mul(flight)
    .mul(rim.mul(RIM_GAIN).add(1));
  const dotAlpha = pulse.mul(DOT_PULSE_LIGHT).add(1).mul(DOT_OPACITY);
  const shown = step(1e-3, released.max(dotness));

  const material = new SpriteNodeMaterial();
  material.positionNode = position;
  material.colorNode = mix(
    color(new Color(colors.violet)),
    color(new Color(colors.glow)),
    // The rim reads the atlas by the instance index, so it is worked out per
    // particle in the vertex stage and carried to the fragments.
    max(smoothstep(0, SPEED_FOR_GLOW, speed), vertexStage(rim).mul(RIM_GLOW)),
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
