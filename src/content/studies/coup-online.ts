import type { FullStudy } from "../types";

const live = "[FILL: live link, supplied by T7SEN at P4]" as const;

// The line and the stack are T7SEN's own statements, accepted on 11 Nov 2026
// with his check still owed (phase P3.5, items 1 and 2).
export const coupOnline = {
  kind: "full",
  slug: "coup-online",
  title: "Coup Online",
  leadAngle:
    "Real-time architecture: Durable Objects rooms, sync and reconnection",
  listing: {
    kind: "Case study",
    studyLabel: "Full study",
    line: "Real-time Coup for 3 to 6 players. Each match lives in its own Durable Object room that keeps every client in sync and brings dropped players back mid-game.",
    stack: ["Next.js", "Cloudflare Workers", "Durable Objects", "TrueSkill"],
    what: "Real-time Coup for 3 to 6 players, with rooms that stay in sync and survive dropped connections.",
    builtWith: "Next.js, Cloudflare Workers, Durable Objects, TrueSkill",
    secondary: { label: "Play it", href: live },
    metrics: [
      {
        label: "Players",
        value: "[FILL: the player count, supplied by T7SEN at P4]",
        source: "[FILL: its source, and the date T7SEN supplied it]",
      },
      {
        label: "Matches",
        value: "[FILL: the match count, supplied by T7SEN at P4]",
        source: "[FILL: its source, and the date T7SEN supplied it]",
      },
    ],
  },
  summary: [
    "[FILL: summary line 1 of 3, written at P4]",
    "[FILL: summary line 2 of 3, written at P4]",
    "[FILL: summary line 3 of 3, written at P4]",
  ],
  problem: {
    problem: "[FILL: the problem, written at P4]",
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
      href: "[FILL: repo link, supplied by T7SEN at P4]",
    },
  },
} satisfies FullStudy;
