import type { Text } from "./types";

export type Services = {
  offers: readonly [Text, Text];
  also: Text;
};

// The two headline offers carry the pitch; everything else fits on one line
// (REQ-CNT-11).
export const services = {
  offers: ["3D and WebGPU hero scenes", "Interactive campaigns and web games"],
  also: "Also: full sites with motion, creator tools and Discord bots.",
} satisfies Services;
