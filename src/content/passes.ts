import { PASSES, type PassId } from "@/engine/story";

import type { MonoLabel, Text } from "./types";

// Every word of the making-of chapter's pass viewer (REQ-ENG-09), but the
// link to the full study, which the chapter keeps with its title and intro
// (pages.ts). The viewer is a client island, so this file brings in nothing
// at run time but the pass order, from a file that itself imports nothing.

export type PassCopy = {
  /** The pass's name over its breakdown. */
  title: Text;
  /**
   * What a picture of the pass shows: the alt text of its still, and the
   * card's description for assistive technology.
   */
  shows: Text;
  /** The breakdown: two short paragraphs. */
  body: readonly [Text, Text];
};

/** A row of the tier table: the tier, then what a frame costs on it. */
export type TierRow = { tier: MonoLabel; value: Text };

export type PassViewerCopy = {
  /** The list of cards, for assistive technology. */
  group: Text;
  /** The words round the numbers in "Pass 2 of 5". */
  count: { pass: Text; of: Text };
  /** What the tier table lists, for assistive technology. */
  tiersName: Text;
  tiers: readonly [TierRow, TierRow, TierRow];
  passes: Record<PassId, PassCopy>;
};

// Each pass is a real step of the halftone frame (src/engine/runtime:
// halftone.ts, halftone-rules.ts, field.ts and simulation.ts). The field has
// no mesh and no lights, so there is no wireframe or lighting pass to show.
// Each card shows its pass on the T7 mark, which the field forms in the
// card in the middle of the row; its still shows the same.
export const passViewer = {
  group: "Render passes",
  count: { pass: "Pass", of: "of" },
  tiersName: "Frame time on each tier",
  // Measured on the production build on one PC with an RTX 4060 Ti, with
  // the P4 viewer in view, whose five cards were all live
  // (docs/results/2026-11-12-making-of.md); the sliding row draws one live
  // card, and the headed making-of run at the next gate measures it again
  // before these figures stand for it (A15). The row names that GPU, so no
  // visitor reads it as their own device's figure, and phones are not
  // measured. Both medians sit on the 240 Hz display's refresh, so the cap
  // is named, not shown as the cost.
  tiers: [
    {
      tier: ["Tier 1", "WebGPU"],
      value: "Under 4.2 ms on an RTX 4060 Ti, capped by a 240 Hz display",
    },
    {
      tier: ["Tier 2", "WebGL2"],
      value: "Under 4.2 ms on an RTX 4060 Ti, capped by a 240 Hz display",
    },
    { tier: ["Tier 3", "Still"], value: "Static image" },
  ],
  passes: {
    points: {
      title: "Point splat",
      shows:
        "The T7 mark as single points of light, one for each particle, before any dot is drawn.",
      body: [
        "Each particle is drawn as one texel into a target that holds four by four texels for every screen cell. Its colour channels carry the particle's speed, its place on a shape's rim and the depth of its layer.",
        "Nothing is shaded yet. The density, glow and final passes after it work on cells, not on single particles.",
      ],
    },
    velocity: {
      title: "Velocity buffer",
      shows:
        "The particles of the T7 mark coloured by their speed and direction.",
      body: [
        "Each particle's speed and direction, which the simulation writes every frame. The pull towards the current shape, a slow drift and the push of your pointer or finger all add to it.",
        "Fast particles lean towards lavender in the final frame, so a stirred field shows where it moved. Tier 2 shows a still of this pass: drawing it live costs a second draw of every particle.",
      ],
    },
    density: {
      title: "Density",
      shows:
        "The T7 mark summed into cells, each lit by how much of the mark it holds.",
      body: [
        "The points summed into cells 8 CSS pixels across, 6 on screens under 480 pixels wide. A tent-shaped weight shares each point between the cells it sits near, so nothing jumps as a particle crosses a cell's edge.",
        "The summed weight sets the size of each cell's dot. The speed, rim and layer sums set its colour.",
      ],
    },
    glow: {
      title: "Glow",
      shows: "The T7 mark's density blurred into a soft violet haze.",
      body: [
        "The density blurred at cell size in two passes, one across and one down, so bright areas spread a soft light round them.",
        "It lays the violet glow under formed shapes, and it tells the final pass where the faint lattice of cell centres should show.",
      ],
    },
    final: {
      title: "Final frame",
      shows:
        "The finished halftone T7 mark: one dot for each cell, sized by its density.",
      body: [
        "One full-screen pass draws a dot for every cell, sized by its density and coloured from violet through lavender to near white, over the glow and the lattice.",
        "The halftone's passes use no compute, storage textures or atomics, so WebGL2 draws this frame exactly as WebGPU does.",
      ],
    },
  },
} as const satisfies PassViewerCopy;

/** A pass's place in the frame's order, from 1. */
export function passNumber(pass: PassId): number {
  return PASSES.indexOf(pass) + 1;
}

/** "Pass 2 of 5": the label over a breakdown, set in capitals by its style. */
export function passPosition(pass: PassId): Text {
  const { count } = passViewer;
  return `${count.pass} ${passNumber(pass)} ${count.of} ${PASSES.length}`;
}
