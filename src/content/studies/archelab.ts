import type { FullStudy } from "../types";

export const archelab = {
  kind: "full",
  slug: "archelab",
  title: "ArcheLab",
  leadAngle:
    "A product for a real community: the player need, live preview in game colours, shareable links",
  notice: "ArcheLab is unofficial fan work for The First Descendant.",
  summary: [
    "[FILL: summary line 1 of 3, written at P4]",
    "[FILL: summary line 2 of 3, written at P4]",
    "[FILL: summary line 3 of 3, written at P4]",
  ],
  problem: {
    problem: "[FILL: the player need, written at P4]",
    constraints: ["[FILL: the constraints, written at P4]"],
    role: "[FILL: T7SEN's role, written at P4]",
  },
  approach: ["[FILL: the approach and architecture, written at P4]"],
  hardPart: "[FILL: the hard part, written at P4]",
  results: [
    {
      label: "[FILL: usage figure, supplied by T7SEN at P4]",
      value: "[FILL: the figure]",
      source: "[FILL: its source, and the date T7SEN supplied it]",
    },
  ],
  wouldChange: ["[FILL: what T7SEN would change, written at P4]"],
  links: {
    live: {
      label: "Live site",
      href: "[FILL: live link, supplied by T7SEN at P4]",
    },
    repo: {
      label: "Repository",
      href: "[FILL: repo link at P4, or remove it if the repo stays private]",
    },
  },
} satisfies FullStudy;
