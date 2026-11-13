import {
  Discard,
  Fn,
  clamp,
  float,
  floor,
  fract,
  ivec2,
  max,
  mix,
  positionGeometry,
  screenUV,
  smoothstep,
  texture,
  textureLoad,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NodeMaterial,
  OrthographicCamera,
  RenderTarget,
  Scene,
  Vector2,
  Vector3,
  type Camera,
  type Node,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";

import { colors, type Hex } from "@/tokens/colors";

import { PASSES, type PassId } from "../story";
import type { VelocityDraw } from "./field";
import type { Halftone } from "./halftone";
import {
  FILL_TONE,
  GLOW_FROM,
  GLOW_TO,
  SPLAT_SUB,
  TONE_FULL,
} from "./halftone-rules";
import {
  DENSITY_GAP_FROM_PX,
  DENSITY_GAP_TO_PX,
  DENSITY_VIOLET_AT,
  FINAL_SAMPLES,
  POINTS_FULL,
  VELOCITY_FULL,
  VELOCITY_SUB,
  type CardLayout,
} from "./pass-rules";

// The making-of pass viewer (REQ-ENG-09). After the halftone has drawn the
// frame, each live card is drawn on top of it: a mesh with the card's four
// corners as its outline, whose every pixel goes back through the inverse
// projective map to its place on the face (homography.ts), then to the part
// of the frame the face shows (pass-rules layoutCards), where it reads its
// pass: the part right behind the face, so a flat face reads the frame at
// its own pixel, one to one, and shows its pass of what it covers, the T7
// mark in the middle card. Nothing is drawn past the face's rounded
// corners. Every card draws in one render, so the frame is copied to the
// canvas once more, not once per card. Each pass reads the halftone's own
// targets as this frame left them; only the velocity pass draws anything
// new, and the runtime builds it on WebGPU alone. No compute, no storage
// texture and no atomics reach a card, so WebGL2 draws its four passes as
// WebGPU does (REQ-ENG-05).

type Colour = (point: Node<"vec2">, sharpness: Node<"float">) => Node<"vec3">;

/** A colour token as a linear vec3, as Color holds it. */
function token(hex: Hex) {
  const value = new Color(hex);
  return vec3(value.r, value.g, value.b);
}

/** A texel of a source, its index clamped inside it. */
function load(source: Texture, at: Node<"vec2">, size: Node<"vec2">) {
  return textureLoad(source, ivec2(clamp(at, vec2(0, 0), size.sub(1))));
}

/** A start that throws as a rejected promise, so one catch takes both. */
function attempt(start: () => Promise<void> | undefined): Promise<void> {
  try {
    return Promise.resolve(start());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/** The face's own square: the corner each vertex takes, and the two triangles. */
function faceGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

interface Drawer {
  mesh: Mesh;
  material: NodeMaterial;
  place(card: CardLayout): void;
}

function drawer(geometry: BufferGeometry, colourAt: Colour): Drawer {
  const corners = [
    uniform(new Vector2()),
    uniform(new Vector2()),
    uniform(new Vector2()),
    uniform(new Vector2()),
  ] as const;
  const rows = [
    uniform(new Vector3()),
    uniform(new Vector3()),
    uniform(new Vector3()),
  ] as const;
  const cropOrigin = uniform(new Vector2());
  const cropSize = uniform(new Vector2(1, 1));
  const radii = uniform(new Vector2(0, 0));
  const sharpness = uniform(1);

  const material = new NodeMaterial();
  // The vertex takes its corner of the face as the page sent it, straight
  // to the screen: the four corners bound the card exactly.
  const at = positionGeometry.xy;
  material.vertexNode = vec4(
    mix(
      mix(corners[0], corners[1], at.x),
      mix(corners[3], corners[2], at.x),
      at.y,
    ),
    0,
    1,
  );
  material.fragmentNode = Fn(() => {
    // This pixel in normalised device coordinates, y up, then on the face.
    const here = vec3(screenUV.x.mul(2).sub(1), screenUV.y.mul(-2).add(1), 1);
    const depth = rows[2].dot(here);
    const face = vec2(rows[0].dot(here), rows[1].dot(here)).div(depth).toVar();
    // Nothing outside the face, even where rounding lets a pixel through,
    // and nothing past its rounded corners (pass-rules onRoundedFace).
    const past = max(
      face.sub(0.5).abs().sub(vec2(0.5, 0.5).sub(radii)),
      vec2(0, 0),
    ).div(max(radii, vec2(1e-6, 1e-6)));
    Discard(
      face.x
        .lessThan(0)
        .or(face.x.greaterThan(1))
        .or(face.y.lessThan(0))
        .or(face.y.greaterThan(1))
        .or(past.length().greaterThan(1)),
    );
    return vec4(colourAt(cropOrigin.add(face.mul(cropSize)), sharpness), 1);
  })();
  material.depthTest = false;
  material.depthWrite = false;
  // A card the page turns past edge on shows its back, as CSS does.
  material.side = DoubleSide;

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;

  return {
    mesh,
    material,
    place(card) {
      card.corners.forEach((corner, index) => {
        corners[index]?.value.set(corner.x, corner.y);
      });
      const m = card.inverse;
      rows[0].value.set(m[0], m[1], m[2]);
      rows[1].value.set(m[3], m[4], m[5]);
      rows[2].value.set(m[6], m[7], m[8]);
      cropOrigin.value.set(card.crop.x, card.crop.y);
      cropSize.value.set(card.crop.width, card.crop.height);
      radii.value.set(card.radii.u, card.radii.v);
      sharpness.value = card.sharpness;
    },
  };
}

export function createPasses(
  halftone: Halftone,
  velocity: VelocityDraw | null,
) {
  const {
    splat,
    cells,
    glow: blurred,
    pad,
    cell,
    gridSize,
    splatTexels,
    scale,
    screenColour,
  } = halftone.sources;

  const ground = token(colors.void);
  const violet = token(colors.violet);
  const glow = token(colors.glow);
  const text = token(colors.text);

  // Sized with the grid when the velocity pass first draws.
  const velocityTarget = new RenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  const velocityTexels = uniform(new Vector2(1, 1));

  /** Where a point of the frame, in CSS pixels, sits on the cell grid. */
  const onGrid = (point: Node<"vec2">) => point.add(pad).div(cell);

  const looks: Record<PassId, Colour> = {
    // pass-rules pointLight: the splat's summed weight per texel. A card
    // that draws the splat finer than one texel a pixel shows each texel
    // as it is; a smaller one shows the brightest of the four round the
    // point, so a lone particle is not lost between the card's pixels.
    points: (point, sharpness) => {
      const at = onGrid(point).mul(SPLAT_SUB).toVar();
      const nearest = load(splat, floor(at), splatTexels).a;
      const first = floor(at.sub(0.5)).toVar();
      const brightest = max(
        max(
          load(splat, first, splatTexels).a,
          load(splat, first.add(vec2(1, 0)), splatTexels).a,
        ),
        max(
          load(splat, first.add(vec2(0, 1)), splatTexels).a,
          load(splat, first.add(vec2(1, 1)), splatTexels).a,
        ),
      );
      const texelsPerPixel = float(SPLAT_SUB).div(cell).div(sharpness);
      const weight = mix(
        nearest,
        brightest,
        smoothstep(0.5, 1.5, texelsPerPixel),
      );
      const tone = weight.mul(scale).mul(SPLAT_SUB * SPLAT_SUB);
      return mix(ground, glow, smoothstep(0, POINTS_FULL, tone));
    },
    // pass-rules velocityPresence: each texel's mean colour, the direction
    // wheel lit by the speed, where its particles are.
    velocity: (point) => {
      const at = onGrid(point).mul(VELOCITY_SUB);
      const sample = texture(
        velocityTarget.texture,
        at.div(velocityTexels),
      ).toVar();
      const tone = sample.a.mul(scale).mul(VELOCITY_SUB * VELOCITY_SUB);
      const mean = sample.rgb.div(max(sample.a, 1e-6));
      return mix(ground, mean, smoothstep(0, VELOCITY_FULL, tone));
    },
    // pass-rules densityShares, each cell flat, with a dark hairline
    // between cells drawn large enough to show one (DENSITY_GAP_FROM_PX).
    density: (point, sharpness) => {
      const at = onGrid(point).toVar();
      const tone = load(cells, floor(at), gridSize).a.mul(scale).toVar();
      const shaded = mix(
        mix(
          mix(ground, violet, smoothstep(0, DENSITY_VIOLET_AT, tone)),
          glow,
          smoothstep(DENSITY_VIOLET_AT, FILL_TONE, tone),
        ),
        text,
        smoothstep(FILL_TONE, TONE_FULL, tone),
      );
      const fromCentre = fract(at).sub(0.5).abs();
      const insetPx = float(0.5)
        .sub(max(fromCentre.x, fromCentre.y))
        .mul(cell)
        .mul(sharpness);
      const gaps = smoothstep(
        DENSITY_GAP_FROM_PX,
        DENSITY_GAP_TO_PX,
        cell.mul(sharpness),
      );
      return mix(ground, shaded, mix(1, smoothstep(0, 1, insetPx), gaps));
    },
    // pass-rules glowShares: the blurred density, read filtered as the
    // screen pass reads it, at full strength.
    glow: (point) => {
      const blurredTone = texture(blurred, onGrid(point).div(gridSize)).r.mul(
        scale,
      );
      const light = smoothstep(GLOW_FROM, GLOW_TO, blurredTone).toVar();
      return mix(mix(ground, violet, light), glow, light.mul(light));
    },
    // The halftone screen itself, worked out again at the card's own
    // pixels: the frame without the cards in it, with no copy of the frame
    // to keep or shrink. A card that draws the frame smaller than it is
    // averages four points across each of its pixels (pass-rules
    // finalSpread), or the lattice of dots would beat against the card's
    // own pixels; at the frame's own size the four are one point.
    final: (point, sharpness) => {
      const footprint = float(1).div(sharpness).toVar();
      const spread = clamp(footprint.sub(1), 0, 1).toVar();
      const reach = footprint.mul(spread).toVar();
      const fine = sharpness.mul(spread.add(1)).toVar();
      let sum: Node<"vec3"> = vec3(0, 0, 0);
      for (const [across, down] of FINAL_SAMPLES) {
        sum = sum.add(
          screenColour(point.add(vec2(across, down).mul(reach)), fine),
        );
      }
      return sum.mul(1 / FINAL_SAMPLES.length);
    },
  };

  const geometry = faceGeometry();
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const drawers = new Map<PassId, Drawer>();
  for (const pass of PASSES) {
    if (pass === "velocity" && velocity === null) continue;
    const made = drawer(geometry, looks[pass]);
    drawers.set(pass, made);
    scene.add(made.mesh);
  }
  const clearColour = new Color();
  // Set by dispose: a build still waiting then starts nothing.
  let released = false;

  return {
    /**
     * Draws the laid out cards over the frame on the canvas. Call it after
     * the halftone's render, in the same frame, so every pass reads this
     * frame's targets.
     */
    render(
      renderer: WebGPURenderer,
      cards: readonly CardLayout[],
      fieldCamera: Camera,
    ) {
      for (const each of drawers.values()) each.mesh.visible = false;
      let drawn = 0;
      let moving = false;
      for (const card of cards) {
        const target = drawers.get(card.pass);
        if (target === undefined) continue;
        target.place(card);
        target.mesh.visible = true;
        drawn += 1;
        if (card.pass === "velocity") moving = true;
      }
      if (drawn === 0) return;

      renderer.getClearColor(clearColour);
      const clearAlpha = renderer.getClearAlpha();
      const autoClear = renderer.autoClear;
      try {
        if (moving && velocity !== null) {
          const columns =
            Math.max(1, Math.round(gridSize.value.x)) * VELOCITY_SUB;
          const rows = Math.max(1, Math.round(gridSize.value.y)) * VELOCITY_SUB;
          if (
            velocityTarget.width !== columns ||
            velocityTarget.height !== rows
          ) {
            velocityTarget.setSize(columns, rows);
          }
          velocityTexels.value.set(columns, rows);
          // The velocity sums from nothing: render() clears its target.
          renderer.setClearColor(0x000000, 0);
          renderer.setRenderTarget(velocityTarget);
          renderer.render(velocity.scene, fieldCamera);
        }
        renderer.setRenderTarget(null);
        renderer.setClearColor(clearColour, clearAlpha);
        // The cards go on top of the frame already on the canvas.
        renderer.autoClear = false;
        renderer.render(scene, camera);
      } finally {
        renderer.autoClear = autoClear;
        renderer.setRenderTarget(null);
        renderer.setClearColor(clearColour, clearAlpha);
      }
    },
    /**
     * Builds every card's pipeline, and the velocity draw's, in the
     * background, so the first time each pass is drawn live costs no frame.
     * Built on first use, they held single frames for up to 92 ms on WebGL2
     * as the making-of row reached each card (D-124). Call it once, after
     * the halftone has drawn, with the canvas as the render target. A build
     * that fails here is left to the first draw, as before.
     */
    warm(renderer: WebGPURenderer, fieldCamera: Camera): void {
      const shown = [...drawers.values()];
      // compileAsync gathers what it builds before its first wait, so the
      // meshes are shown only for the call itself.
      const buildCards = () => {
        for (const each of shown) each.mesh.visible = true;
        try {
          return renderer.compileAsync(scene, camera);
        } finally {
          for (const each of shown) each.mesh.visible = false;
        }
      };
      // The velocity draw renders into its own target, which is set only
      // for the call. It waits for the cards: two builds at once break
      // three's own record of the build under way (r187), and the first
      // then fails.
      const buildVelocity = () => {
        if (velocity === null || released) return undefined;
        renderer.setRenderTarget(velocityTarget);
        try {
          return renderer.compileAsync(velocity.scene, fieldCamera);
        } finally {
          renderer.setRenderTarget(null);
        }
      };
      void attempt(buildCards)
        .catch(() => undefined)
        .then(() => attempt(buildVelocity))
        .catch(() => {
          // Left to the first draw.
        });
    },
    /**
     * Frees the card materials, their shared geometry and the velocity
     * target; the velocity draw belongs to the field.
     */
    dispose() {
      released = true;
      const parts: Array<() => void> = [
        ...[...drawers.values()].map((each) => () => each.material.dispose()),
        () => geometry.dispose(),
        () => velocityTarget.dispose(),
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

export type Passes = ReturnType<typeof createPasses>;
