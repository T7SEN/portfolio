import {
  Fn,
  abs,
  clamp,
  float,
  floor,
  fract,
  ivec2,
  length,
  max,
  min,
  mix,
  screenCoordinate,
  screenUV,
  smoothstep,
  sqrt,
  step,
  texture,
  textureLoad,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  AdditiveBlending,
  Color,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  NodeMaterial,
  QuadMesh,
  RenderTarget,
  UnsignedByteType,
  Vector2,
  type Camera,
  type Node,
  type Object3D,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";

import { colors, type Hex } from "@/tokens/colors";

import {
  BACK_DIM,
  CELL_PX,
  CHECK_ALPHA,
  DENSE_WHITE_FROM,
  DENSE_WHITE_TO,
  DOT_DIM_FLOOR,
  DOT_DIM_FROM,
  DOT_DIM_TO,
  DOT_RADIUS_MAX,
  DOT_RADIUS_MIN,
  FRAME_FADE_CELLS,
  FRAME_LATTICE_ALPHA,
  GLOW_FROM,
  GLOW_GAIN,
  GLOW_TAPS,
  GLOW_TO,
  HALO_ALPHA,
  HERO_DOT_PX,
  LATTICE_ALPHA,
  LATTICE_RADIUS,
  NEAR_FROM,
  NEAR_TO,
  RIM_FRONT_FROM,
  RIM_FRONT_TO,
  RIM_TONE_FROM,
  RIM_TONE_TO,
  RIM_WHITE_FROM,
  RIM_WHITE_TO,
  RING_BREATH,
  RING_BREATH_LIGHT,
  RING_INNER_LIGHT,
  RING_INNER_PX,
  RING_OUTER_LIGHT,
  RING_OUTER_PX,
  RING_SOFTNESS_PX,
  SPEED_GLOW,
  SPLAT_SUB,
  TONE_FULL,
  TONE_GLOW,
  TONE_VIOLET,
  blurWeights,
  checkPassed,
  densityScale,
  gatherTaps,
  type Grid,
} from "./halftone-rules";

// The halftone look (phase P3.5). The particles are splatted, one texel
// each, into a target SPLAT_SUB texels a side per cell (field.ts, the splat
// material); a gather pass sums each cell's tent from it; two small passes
// blur the cells' density for the glow; one full-screen pass draws a dot
// per cell, the glow, the backdrop lattice and the hero's dot. Every pass is
// a plain render with additive blending or none, and reads its source with
// textureLoad or a filtered texture read: no compute, no storage texture, no
// atomics, so WebGL2 draws it exactly as WebGPU does (REQ-ENG-05).

export interface HeroDot {
  /** The dot's centre in CSS pixels from the canvas's top start corner. */
  x: number;
  y: number;
  /** The halo's reach in CSS pixels. */
  reach: number;
  /** 0 to 1: the dot fades while the bloom lets the field go. */
  light: number;
  /** -1 to 1; 0 in a still. */
  pulse: number;
}

export interface WorkFrame {
  /** The frame's centre and half sizes in CSS pixels, y down. */
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
  /** 0 to 1: how strongly its lattice shows. */
  light: number;
}

type Filter = typeof NearestFilter | typeof LinearFilter;

function halfFloatTarget(filter: Filter): RenderTarget {
  return new RenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: filter,
    magFilter: filter,
  });
}

function passMaterial(fragment: Node): NodeMaterial {
  const material = new NodeMaterial();
  material.fragmentNode = fragment;
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

/** A colour token as a linear vec3, as Color holds it. */
function token(hex: Hex) {
  const value = new Color(hex);
  return vec3(value.r, value.g, value.b);
}

/** The texel this fragment writes, as a whole number held in a vec2. */
const texelHere = () => floor(screenCoordinate);

/** A texel of a source, its index clamped inside it. */
function load(source: Texture, at: Node<"vec2">, size: Node<"vec2">) {
  return textureLoad(source, ivec2(clamp(at, vec2(0, 0), size.sub(1))));
}

/**
 * The gather (halftone-rules gatherTaps): a cell's tent-weighted sum of the
 * splat texels within one cell of its centre, every channel. A texel past
 * the target's edge holds nothing.
 */
function gatherPass(splat: Texture, splatTexels: Node<"vec2">) {
  const taps = gatherTaps();
  const fragment = Fn(() => {
    const first = texelHere().mul(SPLAT_SUB).toVar();
    let sum: Node<"vec4"> = vec4(0, 0, 0, 0);
    for (const across of taps) {
      for (const down of taps) {
        const at = first.add(vec2(across.offset, down.offset));
        const inside = step(0, at.x)
          .mul(step(at.x, splatTexels.x.sub(1)))
          .mul(step(0, at.y))
          .mul(step(at.y, splatTexels.y.sub(1)));
        sum = sum.add(
          load(splat, at, splatTexels).mul(
            inside.mul(across.weight * down.weight),
          ),
        );
      }
    }
    return sum;
  })();
  return passMaterial(fragment);
}

/**
 * One pass of the separable blur at cell resolution (halftone-rules
 * blurWeights): the density of the source (its alpha, or its red channel
 * for the second pass) spread over GLOW_TAPS cells each side.
 */
function blurPass(
  source: Texture,
  direction: Node<"vec2">,
  cells: Node<"vec2">,
  channel: "a" | "r",
) {
  const weights = blurWeights();
  const fragment = Fn(() => {
    const here = texelHere().toVar();
    const read = (offset: number) => {
      const texel = load(source, here.add(direction.mul(offset)), cells);
      return channel === "a" ? texel.a : texel.r;
    };
    let sum: Node<"float"> = read(0).mul(weights[0] ?? 0);
    for (let tap = 1; tap <= GLOW_TAPS; tap += 1) {
      sum = sum.add(
        read(tap)
          .add(read(-tap))
          .mul(weights[tap] ?? 0),
      );
    }
    return vec4(sum, 0, 0, 1);
  })();
  return passMaterial(fragment);
}

export function createHalftone(particleCount: number) {
  const splat = halfFloatTarget(NearestFilter);
  const cells = halfFloatTarget(NearestFilter);
  const blurAcross = halfFloatTarget(NearestFilter);
  const blurDown = halfFloatTarget(LinearFilter);

  const cssSize = uniform(new Vector2(1, 1));
  const pad = uniform(new Vector2());
  const gridSize = uniform(new Vector2(1, 1));
  const splatTexels = uniform(new Vector2(SPLAT_SUB, SPLAT_SUB));
  const cell = uniform(8);
  const pixelRatio = uniform(1);
  const scale = uniform(1);
  const formed = uniform(0);
  const heroCentre = uniform(new Vector2(-1e4, -1e4));
  const heroReach = uniform(150);
  const heroLight = uniform(0);
  const pulse = uniform(0);
  const frameCentre = uniform(new Vector2());
  const frameHalf = uniform(new Vector2());
  const frameLight = uniform(0);

  const gather = gatherPass(splat.texture, splatTexels);
  const across = blurPass(cells.texture, vec2(1, 0), gridSize, "a");
  const down = blurPass(blurAcross.texture, vec2(0, 1), gridSize, "r");

  const violet = token(colors.violet);
  const glow = token(colors.glow);
  const text = token(colors.text);
  const ground = token(colors.void);

  const screen = Fn(() => {
    // Where this pixel sits on the cell grid, in CSS pixels, y down.
    const position = screenUV.mul(cssSize).toVar();
    const gridPosition = position.add(pad).div(cell).toVar();
    const local = fract(gridPosition).sub(0.5).mul(cell);
    const distance = length(local).toVar();

    // The cell's gathered splat: speed share, rim and depth of layer in
    // rgb, each summed times the weight, and the summed weight in alpha.
    const sample = load(cells.texture, floor(gridPosition), gridSize).toVar();
    const density = sample.a;
    const mean = sample.rgb.div(max(density, 1e-6)).toVar();

    // halftone-rules: cellTone, dotRadius (scaled with the cell), discCoverage.
    const tone = density
      .mul(scale)
      .mul(clamp(mean.z, 0, 1).mul(-BACK_DIM).add(1))
      .toVar();
    const radius = sqrt(clamp(tone.div(TONE_FULL), 0, 1)).mul(
      cell.mul(DOT_RADIUS_MAX / CELL_PX),
    );
    const coverage = clamp(radius.sub(distance).mul(pixelRatio).add(0.5), 0, 1)
      .mul(smoothstep(DOT_RADIUS_MIN, DOT_RADIUS_MIN * 2, radius))
      .toVar();

    // halftone-rules: dotColour.
    const glowShare = max(
      smoothstep(TONE_VIOLET, TONE_GLOW, tone),
      clamp(mean.x, 0, 1).mul(SPEED_GLOW),
    );
    const rimWhite = smoothstep(RIM_WHITE_FROM, RIM_WHITE_TO, mean.y)
      .mul(smoothstep(RIM_TONE_FROM, RIM_TONE_TO, tone))
      .mul(smoothstep(RIM_FRONT_FROM, RIM_FRONT_TO, mean.z).oneMinus());
    const denseWhite = smoothstep(DENSE_WHITE_FROM, DENSE_WHITE_TO, tone).mul(
      formed,
    );
    // halftone-rules: dotLight.
    const dotLight = smoothstep(DOT_DIM_FROM, DOT_DIM_TO, tone)
      .mul(1 - DOT_DIM_FLOOR)
      .add(DOT_DIM_FLOOR);
    const dot = mix(
      mix(violet, glow, glowShare),
      text,
      max(rimWhite, denseWhite),
    ).mul(dotLight);

    // halftone-rules: glowLight and nearActivity, from the blurred density,
    // read with linear filtering so the glow has no cell edges.
    const blurred = texture(blurDown.texture, gridPosition.div(gridSize))
      .r.mul(scale)
      .toVar();
    const glowLight = smoothstep(GLOW_FROM, GLOW_TO, blurred).mul(GLOW_GAIN);
    const near = smoothstep(NEAR_FROM, NEAR_TO, blurred);

    // halftone-rules: frameLattice, over FRAME_FADE_CELLS live cells.
    const inset = min(
      frameHalf.x.sub(abs(position.x.sub(frameCentre.x))),
      frameHalf.y.sub(abs(position.y.sub(frameCentre.y))),
    );
    const inFrame = smoothstep(0, cell.mul(FRAME_FADE_CELLS), inset).mul(
      frameLight,
    );

    // halftone-rules: heroLight is the uniform; ringLight, heroCore and
    // haloAlpha.
    const heroDistance = length(position.sub(heroCentre)).toVar();
    const grow = pulse.mul(RING_BREATH).add(1);
    const inner = grow.mul(RING_INNER_PX);
    const outer = grow.mul(RING_OUTER_PX);
    const innerRing = smoothstep(
      inner.sub(RING_SOFTNESS_PX),
      inner.add(RING_SOFTNESS_PX),
      heroDistance,
    ).oneMinus();
    const outerRing = smoothstep(
      outer.sub(RING_SOFTNESS_PX),
      outer.add(RING_SOFTNESS_PX),
      heroDistance,
    ).oneMinus();
    const rings = pulse
      .mul(RING_BREATH_LIGHT)
      .add(1)
      .mul(innerRing.mul(RING_INNER_LIGHT).add(outerRing.mul(RING_OUTER_LIGHT)))
      .mul(heroLight);
    const haloFade = clamp(heroDistance.div(heroReach).oneMinus(), 0, 1);
    const halo = haloFade.mul(haloFade).mul(HALO_ALPHA).mul(heroLight);
    const heroCore = clamp(
      float(HERO_DOT_PX).sub(heroDistance).mul(pixelRatio).add(0.5),
      0,
      1,
    ).mul(heroLight);

    const lattice = clamp(
      float(LATTICE_RADIUS).sub(distance).mul(pixelRatio).add(0.5),
      0,
      1,
    ).mul(
      max(max(near.mul(LATTICE_ALPHA), inFrame.mul(FRAME_LATTICE_ALPHA)), halo),
    );

    // Laid from the back: the void, the glow and the rings' light, the
    // lattice, the cell's dot, then the hero's disc on top.
    const lit = ground.add(violet.mul(glowLight)).add(glow.mul(rings));
    const withLattice = mix(lit, glow, lattice);
    const withDot = mix(withLattice, dot, coverage);
    return vec4(mix(withDot, glow, heroCore), 1);
  })();

  const screenMaterial = passMaterial(screen);
  const gatherQuad = new QuadMesh(gather);
  const acrossQuad = new QuadMesh(across);
  const downQuad = new QuadMesh(down);
  const screenQuad = new QuadMesh(screenMaterial);
  const clearColour = new Color();

  return {
    /**
     * Sizes the targets to the cell grid and keeps the screen pass in step
     * with the canvas's CSS size and its pixel ratio.
     */
    resize(grid: Grid, width: number, height: number, ratio: number) {
      const sized: Array<[RenderTarget, number, number]> = [
        [splat, grid.columns * SPLAT_SUB, grid.rows * SPLAT_SUB],
        [cells, grid.columns, grid.rows],
        [blurAcross, grid.columns, grid.rows],
        [blurDown, grid.columns, grid.rows],
      ];
      for (const [target, columns, rows] of sized) {
        if (target.width !== columns || target.height !== rows) {
          target.setSize(columns, rows);
        }
      }
      cssSize.value.set(width, height);
      pad.value.set(grid.padX, grid.padY);
      gridSize.value.set(grid.columns, grid.rows);
      splatTexels.value.set(grid.columns * SPLAT_SUB, grid.rows * SPLAT_SUB);
      cell.value = grid.cell;
      pixelRatio.value = ratio;
      scale.value = densityScale(particleCount, width, height);
    },
    setHero(hero: HeroDot) {
      heroCentre.value.set(hero.x, hero.y);
      heroReach.value = hero.reach;
      heroLight.value = hero.light;
      pulse.value = hero.pulse;
    },
    setFrame(frame: WorkFrame) {
      frameCentre.value.set(frame.x, frame.y);
      frameHalf.value.set(frame.halfWidth, frame.halfHeight);
      frameLight.value = frame.light;
    },
    /**
     * How far a shape or the sheet has formed, 0 to 1: only their densest
     * cells turn white (the strands and the rings never do).
     */
    setFormed(value: number) {
      formed.value = value;
    },
    render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
      renderer.getClearColor(clearColour);
      const clearAlpha = renderer.getClearAlpha();
      // The splat sums from nothing: render() clears each target first.
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(splat);
      renderer.render(scene, camera);
      renderer.setRenderTarget(cells);
      gatherQuad.render(renderer);
      renderer.setRenderTarget(blurAcross);
      acrossQuad.render(renderer);
      renderer.setRenderTarget(blurDown);
      downQuad.render(renderer);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clearColour, clearAlpha);
      screenQuad.render(renderer);
    },
    /**
     * Frees the four targets and the four materials. The quads share one
     * geometry that three keeps for every QuadMesh (QuadMesh.js), so it is
     * left alone.
     */
    dispose() {
      const parts: Array<() => void> = [
        () => splat.dispose(),
        () => cells.dispose(),
        () => blurAcross.dispose(),
        () => blurDown.dispose(),
        () => gather.dispose(),
        () => across.dispose(),
        () => down.dispose(),
        () => screenMaterial.dispose(),
      ];
      for (const free of parts) {
        try {
          free();
        } catch {
          // One part that cannot be freed must not keep the rest alive.
        }
      }
    },
  };
}

export type Halftone = ReturnType<typeof createHalftone>;

/**
 * Checks, before the first frame, that a half-float target can be drawn to
 * and blended (rule A11): two additive draws of CHECK_ALPHA must sum past 1
 * there. The sum less 1 is copied to an 8-bit target, which every backend
 * can read back. Any failure, or a value that says the sum was clamped or
 * not blended, means the soft field.
 */
export async function halftoneWorks(
  renderer: WebGPURenderer,
): Promise<boolean> {
  const sum = halfFloatTarget(NearestFilter);
  const out = new RenderTarget(1, 1, {
    type: UnsignedByteType,
    depthBuffer: false,
    generateMipmaps: false,
  });
  const add = passMaterial(vec4(1, 1, 1, CHECK_ALPHA));
  add.transparent = true;
  add.blending = AdditiveBlending;
  const summed = textureLoad(sum.texture, ivec2(0, 0));
  const read = passMaterial(
    vec4(clamp(summed.r.sub(1), 0, 1), clamp(summed.a.sub(1), 0, 1), 0, 1),
  );
  const quad = new QuadMesh(add);
  const clearColour = renderer.getClearColor(new Color());
  const clearAlpha = renderer.getClearAlpha();
  const autoClear = renderer.autoClear;

  try {
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(sum);
    renderer.clear();
    quad.render(renderer);
    quad.render(renderer);
    quad.material = read;
    renderer.setRenderTarget(out);
    renderer.clear();
    quad.render(renderer);
    const pixels = await renderer.readRenderTargetPixelsAsync(out, 0, 0, 1, 1);
    return checkPassed(pixels[0]) && checkPassed(pixels[1]);
  } catch {
    return false;
  } finally {
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColour, clearAlpha);
    for (const part of [sum, out, add, read]) {
      try {
        part.dispose();
      } catch {
        // A check target that cannot be freed changes nothing for the field.
      }
    }
  }
}
