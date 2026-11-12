import type { Text } from "./types";

export type Offer = { title: Text; description: Text };

export type Services = {
  offers: readonly [Offer, Offer];
  also: Text;
  /** The line for recruiters, under the offers in the contact chapter. */
  hiring: Text;
};

// The two headline offers carry the pitch; everything else fits on one line
// (REQ-CNT-11). The descriptions and the hiring line are T7SEN's own
// statements, accepted on 11 Nov 2026 with his check still owed (phase P3.5,
// item 9).
export const services = {
  offers: [
    {
      title: "3D and WebGPU hero scenes",
      description:
        "Interactive centrepieces for a brand or product, with a fallback for every device.",
    },
    {
      title: "Interactive campaigns and web games",
      description: "Playable, shareable and built to load fast.",
    },
  ],
  also: "Also: full sites with motion, creator tools and Discord bots.",
  hiring: "Hiring for a creative or WebGPU frontend role? Same form.",
} satisfies Services;
