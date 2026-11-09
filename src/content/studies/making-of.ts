import type { FullStudy } from "../types";

// Every number here comes from a measured run, never from an estimate
// (REQ-PERF-05, REQ-PERF-06, REQ-TIER-05).
export const makingOf = {
  kind: "full",
  slug: "making-of",
  title: "Making-of: this site",
  leadAngle:
    "Live render passes, the compute simulation and the three device tiers",
  summary: [
    "[FILL: summary line 1 of 3, written once the build is measured]",
    "[FILL: summary line 2 of 3, written once the build is measured]",
    "[FILL: summary line 3 of 3, written once the build is measured]",
  ],
  problem: {
    problem: "[FILL: the problem, in T7SEN's words]",
    constraints: ["[FILL: the constraints, in T7SEN's words]"],
    role: "[FILL: T7SEN's role]",
  },
  approach: [
    "[FILL: the approach and architecture, written as the engine is built]",
  ],
  hardPart: "[FILL: the hard part, written as the engine is built]",
  results: [
    {
      label: "Frame time on tier 1 (WebGPU)",
      value: "[FILL: measured on the real GPU]",
      source: "[FILL: the test log entry for the run]",
    },
    {
      label: "Frame time on tier 2 (WebGL2)",
      value: "[FILL: measured on the real GPU]",
      source: "[FILL: the test log entry for the run]",
    },
    {
      label: "3D payload on desktop",
      value: "[FILL: measured from the production build]",
      source: "[FILL: the budget check result for the build]",
    },
    {
      label: "3D payload on phones",
      value: "[FILL: measured from the production build]",
      source: "[FILL: the budget check result for the build]",
    },
  ],
  wouldChange: ["[FILL: what T7SEN would change, in T7SEN's words]"],
  links: {
    live: { label: "Live site", href: "[FILL: live link, supplied by T7SEN]" },
    repo: {
      label: "Repository",
      href: "[FILL: repo link, if the repo is public]",
    },
  },
} satisfies FullStudy;
