import {
  color,
  cos,
  exp,
  float,
  fract,
  instanceIndex,
  max,
  mix,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  vertexStage,
} from "three/tsl";
import {
  AdditiveBlending,
  Color,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  type Node,
} from "three/webgpu";

import { colors } from "@/tokens/colors";

import type { FieldLook } from "../types";
import {
  BACKDROP_GAIN,
  LINE_GAIN,
  RIM_WEIGHT,
  SPEED_FOR_GLOW,
  SPLAT_SUB,
  SPRINKLE_MIX,
  SWIRL_BREATH,
  SWIRL_GLOW,
  SWIRL_RADIUS,
  SWIRL_TURN,
  splatSize,
  type Grid,
} from "./halftone-rules";
import { DIRECTIONS, VELOCITY_FLOOR, VELOCITY_SUB } from "./pass-rules";
import { DOT_RADIUS, homeFor, releasedFor } from "./simulation";
import type { Simulation, View } from "./simulation";
import { PASS_STREAM, PASS_STREAM_SECONDS, TRAITS } from "./story";

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
const POINTER_FORCE = 0.15;

// The hero's dot: the first DOT_PARTICLES particles are lit, the rest wait
// unseen inside it. The dot's sprites are larger than the field's so a few
// hundred make one soft disc, and their light is set so the disc adds about
// DOT_LIGHT of full violet: additive sprites that overlap past 1 would burn
// it to white. The halftone look draws the dot as a disc of its own
// (halftone.ts) and keeps every parked particle out of the splat.
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

// The rim light of the soft look: a formed particle on its shape's outline
// adds up to 1 + RIM_GAIN times the light of one inside, and its colour
// leans toward glow, so a formation reads as a lit edge around a quieter
// fill rather than a flat silhouette. The rim is the simulation's own per
// particle value (simulation.ts look), so WebGL2 runs it as WebGPU does
// (REQ-ENG-05). The halftone look carries the rim to its cells instead,
// where it turns the edge white.
const RIM_GAIN = 1.8;
const RIM_GLOW = 0.6;

/** The frame at the camera's focus plane, where the pointer and shapes live. */
export function viewFor(aspect: number): View {
  return {
    halfWidth: HALF_HEIGHT * aspect,
    halfHeight: HALF_HEIGHT,
    cameraDistance: CAMERA_DISTANCE,
  };
}

/** The fract of a mix of the seed: one of the particle's own numbers, 0 to 1. */
function mixOf(
  mixes: readonly [number, number, number],
  seed: Node<"vec3">,
): Node<"float"> {
  const [x, y, z] = mixes;
  return fract(seed.x.mul(x).add(seed.y.mul(y)).add(seed.z.mul(z)));
}

/** The velocity pass's own draw of the particles (passes.ts renders it). */
export interface VelocityDraw {
  scene: Scene;
  dispose(): void;
}

/**
 * velocityPass builds the making-of's velocity draw as well. The runtime
 * asks for it on the WebGPU backend only, so it never reaches WebGL2
 * (story.ts LIVE_PASSES, REQ-ENG-05).
 */
export function createField(
  simulation: Simulation,
  look: FieldLook,
  velocityPass = false,
) {
  const growth = Math.min(
    Math.cbrt(REFERENCE_COUNT / simulation.count),
    MAX_SPRITE_GROWTH,
  );
  const spriteSize = SPRITE_SIZE * growth;
  const spriteOpacity = uniform(0);
  // Each formed particle's share of its light while a formation packs the
  // field (runtime/story.ts formedLight for the soft look, halftone-rules.ts
  // halftoneLight for the halftone).
  const light = uniform(1);
  // How far the formed particles are drawn ahead of where they are
  // simulated, in world units: the lag of the particles behind a stage that
  // moves, which the runtime works out and takes off (index.ts, trail).
  const drawOffset = uniform(new Vector2());
  // The making-of's stream from card to card (story.ts, streamShare): how
  // far back toward the card it left the mark is drawn when the stream
  // begins, in world units, and the seconds since it began.
  const streamFrom = uniform(new Vector2());
  const streamSeconds = uniform(PASS_STREAM_SECONDS);
  // The pointer as drawn, and how strongly the swirl shows, 0 to 1.
  const swirlCentre = uniform(new Vector2());
  const swirl = uniform(0);
  // One splat sprite's size at a view depth of 1 (halftone-rules splatSize).
  const splatScale = uniform(0);
  // The share of the backdrop that is lit and the weight of a lit one
  // (halftone-rules sprinkle), set with the canvas's size.
  const sprinkleShare = uniform(0);
  const sprinkleGain = uniform(1);

  const position = simulation.positions.toAttribute();
  const motion = simulation.velocities.toAttribute();
  const speed = motion.length();
  const seed = simulation.seeds.toAttribute();
  const { release, pulse, dotCentre, dotSeed, rankScale, elapsedSeconds } =
    simulation;

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

  // The particle's own values from the simulation: rim, layer, line, form,
  // the sky's gain, whether it streams on a flow line and how far the lines have taken over
  // (simulation.ts look). They read the atlas by the instance index, so
  // they are worked out in the vertex stage and carried to the fragments.
  const traits = simulation.look(seed);
  const back = traits.layer.oneMinus().clamp(0, 1);

  // halftone-rules particleWeight: a formed particle at the formation's
  // light, a line particle at its line's, and the backdrop by the look's
  // own rule once the lines have taken the rest (backdropWeight, the
  // sprinkle, or softBackdropWeight).
  const { isFlow, flowIn } = traits;
  const sprinkled = float(1).sub(
    step(sprinkleShare, mixOf(SPRINKLE_MIX, seed)),
  );
  const backdrop =
    look === "halftone"
      ? flowIn.oneMinus().add(flowIn.mul(sprinkled).mul(sprinkleGain))
      : flowIn.mul(BACKDROP_GAIN - 1).add(1);
  const free = isFlow
    .oneMinus()
    .mul(backdrop)
    .add(isFlow.mul(flowIn.oneMinus()));
  // The contact sky's gain (simulation.ts look): a star's light by its
  // magnitude, a line's shown light, the dust dimmed between; 1 elsewhere.
  const share = traits.form
    .mul(light)
    .add(traits.form.oneMinus().mul(free))
    .add(traits.line.mul(LINE_GAIN))
    .mul(traits.gain);
  const weight = share.mul(released).mul(arrived).mul(flight);

  // The drawn place: formed particles carried by the stage follow's offset,
  // then every particle turned about the pointer (halftone-rules swirlTurn).
  const leaving = step(1e-4, released);
  // story.ts streamShare: each formed particle leaves the card at its own
  // moment and is drawn back toward it by the share of its way to go.
  const streamed = streamSeconds
    .sub(mixOf(TRAITS.leave, seed).mul(PASS_STREAM.spread))
    .div(PASS_STREAM.each)
    .clamp(0, 1);
  const left = streamed.oneMinus();
  const toGo = left.mul(left).mul(left);
  const carried = position.xy.add(
    drawOffset.add(streamFrom.mul(toGo)).mul(traits.form.mul(leaving)),
  );
  const around = carried.sub(swirlCentre);
  const reach = around.length().div(SWIRL_RADIUS);
  const closeness = exp(reach.mul(reach).negate()).mul(swirl);
  const turn = closeness.mul(SWIRL_TURN).mul(
    sin(elapsedSeconds.mul(2.1).sub(reach.mul(5)))
      .mul(SWIRL_BREATH)
      .add(1),
  );
  const turned = vec2(
    around.x.mul(cos(turn)).sub(around.y.mul(sin(turn))),
    around.x.mul(sin(turn)).add(around.y.mul(cos(turn))),
  );
  const drawn = vec3(turned.add(swirlCentre), position.z);

  // halftone-rules speedShare, with the swirl leaning toward glow.
  const fast = max(
    smoothstep(0, SPEED_FOR_GLOW, speed),
    closeness.mul(SWIRL_GLOW),
  );

  let material: SpriteNodeMaterial;
  if (look === "halftone") {
    // The splat: each particle a sprite one splat texel wide, so it lands on
    // exactly one texel, summed with additive blending into the half-float
    // splat target; halftone.ts gathers each cell's tent from there. The
    // blending multiplies rgb by alpha (three r187, AdditiveBlending without
    // premultiplied alpha: source factor SrcAlpha for colour, One for
    // alpha), so rgb sums the speed share, the rim and the depth of layer
    // each times the weight, and alpha sums the weight, and halftone.ts
    // reads means.
    // halftone-rules rimWeight: each layer's outline splats heavier.
    const splatWeight = weight.mul(traits.rim.mul(RIM_WEIGHT).add(1));
    const channels = vertexStage(vec4(fast, traits.rim, back, splatWeight));
    material = new SpriteNodeMaterial();
    material.positionNode = drawn;
    material.sizeAttenuation = false;
    material.fragmentNode = channels;
    // Parked particles, the dot's own among them, are never drawn: the
    // halftone pass draws the dot as one disc.
    material.scaleNode = splatScale.mul(step(1e-3, released));
  } else {
    const fieldAlpha = spriteOpacity
      .mul(weight)
      .mul(traits.rim.mul(RIM_GAIN).add(1));
    const dotAlpha = pulse.mul(DOT_PULSE_LIGHT).add(1).mul(DOT_OPACITY);
    const shown = step(1e-3, released.max(dotness));
    material = new SpriteNodeMaterial();
    material.positionNode = drawn;
    material.colorNode = mix(
      color(new Color(colors.violet)),
      color(new Color(colors.glow)),
      max(fast, vertexStage(traits.rim).mul(RIM_GLOW)),
    );
    material.opacityNode = smoothstep(0.1, 0.5, uv().sub(0.5).length())
      .oneMinus()
      .mul(vertexStage(mix(fieldAlpha, dotAlpha, dotness)));
    // A particle that is not seen has no size, so it costs no fragments:
    // the hero keeps nearly every particle hidden in the dot.
    material.scaleNode = mix(
      float(spriteSize),
      float(DOT_SPRITE_SIZE),
      dotness,
    ).mul(shown);
  }
  material.blending = AdditiveBlending;
  material.depthTest = false;
  material.depthWrite = false;
  material.fog = false;

  const particles = new Sprite(material);
  particles.count = simulation.count;
  particles.frustumCulled = false;

  const scene = new Scene();
  scene.add(particles);

  // The velocity pass (REQ-ENG-09): every particle drawn again where the
  // splat draws it, one velocity texel each (VELOCITY_SUB texels a side per
  // cell), summed with the same additive blending, so each texel holds its
  // particles' colour times their weight and the weight. The colour is the
  // direction wheel's tokens (pass-rules directionWeights) lit by the speed
  // (velocityLight). A plain render that reads the velocities as a vertex
  // attribute, as the splat already reads the speed.
  let velocity: VelocityDraw | null = null;
  if (velocityPass && look === "halftone") {
    const planar = motion.xy;
    const length = planar.length();
    const along = planar.mul(step(1e-6, length)).div(max(length, 1e-6));
    const leans = DIRECTIONS.map((direction) => {
      const lean = along.dot(vec2(direction.x, direction.y)).add(1).div(2);
      return { lean: lean.mul(lean), token: direction.token };
    });
    let total: Node<"float"> = float(0);
    let tint: Node<"vec3"> = vec3(0, 0, 0);
    for (const { lean, token } of leans) {
      total = total.add(lean);
      tint = tint.add(color(new Color(colors[token])).mul(lean));
    }
    const lit = smoothstep(0, SPEED_FOR_GLOW, speed)
      .mul(1 - VELOCITY_FLOOR)
      .add(VELOCITY_FLOOR);
    const velocityMaterial = new SpriteNodeMaterial();
    velocityMaterial.positionNode = drawn;
    velocityMaterial.sizeAttenuation = false;
    velocityMaterial.fragmentNode = vertexStage(
      vec4(tint.div(total).mul(lit), weight),
    );
    velocityMaterial.scaleNode = splatScale
      .mul(SPLAT_SUB / VELOCITY_SUB)
      .mul(step(1e-3, released));
    velocityMaterial.blending = AdditiveBlending;
    velocityMaterial.depthTest = false;
    velocityMaterial.depthWrite = false;
    velocityMaterial.fog = false;

    const moving = new Sprite(velocityMaterial);
    moving.count = simulation.count;
    moving.frustumCulled = false;
    const velocityScene = new Scene();
    velocityScene.add(moving);
    velocity = {
      scene: velocityScene,
      dispose: () => velocityMaterial.dispose(),
    };
  }

  const camera = new PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 50);
  camera.position.z = CAMERA_DISTANCE;

  let view = viewFor(1);
  let pointerX = 0;
  let pointerY = 0;

  // The pointer stirs the ambient field, which is drawn where it is
  // simulated, so the push and the swirl share one place.
  const placePointer = () => {
    const x = pointerX * view.halfWidth;
    const y = pointerY * view.halfHeight;
    swirlCentre.value.set(x, y);
    simulation.pointer.value.set(x, y, simulation.focusZ.value);
  };

  return {
    scene,
    camera,
    material,
    /** The velocity pass's draw; null unless it was asked for. */
    velocity,
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
     * The halftone look draws into the cell grid, which is a whole number of
     * cells centred on the canvas: the camera's view is widened by the
     * grid's padding, so the splat target covers the grid exactly and each
     * splat sprite is one of its texels. The soft look draws to the canvas
     * as it is. Call it after setAspect, with the same CSS size.
     */
    setGrid(grid: Grid, cssWidth: number, cssHeight: number) {
      if (look !== "halftone") return;
      camera.setViewOffset(
        cssWidth,
        cssHeight,
        -grid.padX,
        -grid.padY,
        grid.columns * grid.cell,
        grid.rows * grid.cell,
      );
      splatScale.value = splatSize(cssHeight, CAMERA_FOV_DEGREES, grid.cell);
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
    /** Draws the formed particles this far ahead, in world units. */
    setDrawOffset(x: number, y: number) {
      drawOffset.value.set(x, y);
    },
    /**
     * The making-of's stream: the mark is drawn this far back toward the
     * card it left, in world units, as each particle's share of the way
     * still to go, so many seconds after the stream began.
     */
    setStream(x: number, y: number, seconds: number) {
      streamFrom.value.set(x, y);
      streamSeconds.value = seconds;
    },
    /** How strongly the swirl shows round the pointer, 0 to 1. */
    setSwirl(amount: number) {
      swirl.value = amount;
    },
    /** The lit share of the backdrop and a lit particle's weight. */
    setSprinkle(share: number, gain: number) {
      sprinkleShare.value = share;
      sprinkleGain.value = gain;
    },
  };
}

export type Field = ReturnType<typeof createField>;
