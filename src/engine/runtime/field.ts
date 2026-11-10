import { color, float, mix, smoothstep, uniform, uv } from "three/tsl";
import {
  AdditiveBlending,
  Color,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
} from "three/webgpu";

import { colors } from "@/tokens/colors";

import { SHAPE_HALF_WIDTH } from "./simulation";
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
// The built-in shape keeps this share of the frame's shorter half.
const SHAPE_FIT = 0.8;

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

  const material = new SpriteNodeMaterial();
  material.positionNode = simulation.positions.toAttribute();
  material.colorNode = mix(
    color(new Color(colors.violet)),
    color(new Color(colors.glow)),
    smoothstep(0, SPEED_FOR_GLOW, simulation.velocities.toAttribute().length()),
  );
  material.opacityNode = smoothstep(0.1, 0.5, uv().sub(0.5).length())
    .oneMinus()
    .mul(spriteOpacity);
  material.scaleNode = float(spriteSize);
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

  return {
    scene,
    camera,
    material,
    /** Keeps the camera, the homes, the shape and the light right for a frame. */
    setAspect(aspect: number) {
      view = viewFor(aspect);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      simulation.frame.value.set(view.halfWidth, view.halfHeight);
      simulation.shapeScale.value = Math.min(
        1,
        (Math.min(view.halfWidth, view.halfHeight) * SHAPE_FIT) /
          SHAPE_HALF_WIDTH,
      );

      const frameArea = 4 * view.halfWidth * view.halfHeight;
      const spriteArea = simulation.count * spriteSize ** 2 * DISC_FILL;
      spriteOpacity.value = Math.min(
        (COVERAGE * frameArea) / spriteArea,
        MAX_SPRITE_OPACITY,
      );
    },
    /** x and y in normalised device coordinates: -1 to 1, y up. */
    setPointer(x: number, y: number, active: boolean) {
      simulation.pointer.value.set(x * view.halfWidth, y * view.halfHeight, 0);
      simulation.pointerStrength.value = active ? POINTER_FORCE : 0;
    },
  };
}

export type Field = ReturnType<typeof createField>;
