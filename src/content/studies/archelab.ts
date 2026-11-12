import type { FullStudy } from "../types";

const live = "[FILL: live link, supplied by T7SEN at P4]" as const;

// The line, the chips and the table's Built with cell are T7SEN's own
// statements, accepted on 11 Nov 2026 with his check still owed (phase P3.5,
// items 3 and 4). The table's What it is cell shortens the accepted line.
export const archelab = {
  kind: "full",
  slug: "archelab",
  title: "ArcheLab",
  leadAngle:
    "A product for a real community: the player need, live preview in game colours, shareable links",
  notice: "ArcheLab is unofficial fan work for The First Descendant.",
  listing: {
    kind: "Case study",
    studyLabel: "Full study",
    line: "An unofficial tools hub for The First Descendant players. Its first tool builds chat messages with a live preview in game colours and links you can share.",
    stack: ["Next.js", "Static", "Zero cost"],
    what: "An unofficial tools hub for The First Descendant players, with a live preview in game colours.",
    builtWith: "Next.js 16, static, Vercel",
    secondary: { label: "Live site", href: live },
    metrics: [
      {
        label: "Users",
        value: "[FILL: the user count, supplied by T7SEN at P4]",
        source: "[FILL: its source, and the date T7SEN supplied it]",
      },
    ],
    quote: "[FILL: a player quote with permission, supplied by T7SEN at P4]",
  },
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
    live: { label: "Live site", href: live },
    repo: {
      label: "Repository",
      href: "[FILL: repo link at P4, or remove it if the repo stays private]",
    },
  },
} satisfies FullStudy;
