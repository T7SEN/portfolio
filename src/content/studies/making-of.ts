import type { FullStudy } from "../types";

// Every number here comes from a measured run, never from an estimate
// (REQ-PERF-05, REQ-PERF-06, REQ-TIER-05).
export const makingOf = {
  kind: "full",
  slug: "making-of",
  title: "Making-of: this site",
  leadAngle:
    "Live render passes, the compute simulation and the three device tiers",
  // The line and the chips describe this site and its pinned stack; the
  // table cells say the same facts as the lead angle.
  listing: {
    kind: "Case study",
    studyLabel: "Full study",
    line: "A compute particle field that re-forms into each full study, with a fallback for every device. One shader codebase runs on WebGPU and WebGL2.",
    stack: ["WebGPU", "TSL", "three.js r187", "GSAP"],
    what: "A live GPU particle field, its render passes, and three device tiers.",
    builtWith: "Next.js 16, three.js r187, WebGPU and TSL",
    metrics: [
      {
        label: "Frame time per tier",
        value: "[FILL: frame time per tier, measured on the real GPU]",
        source: "[FILL: the test log entry for the run]",
      },
      {
        label: "3D payload",
        value: "[FILL: the 3D payload, measured from the production build]",
        source: "[FILL: the budget check result for the build]",
      },
    ],
  },
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
