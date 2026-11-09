import type { ShortStudy } from "../types";

// Built, not running: the page lists what is built and never claims a live
// feature (REQ-CNT-04).
export const systemseven = {
  kind: "short",
  slug: "systemseven",
  title: "SystemSeven",
  what: "Built features: Twitch go-live notifications (restart-safe, no double pings, optional role ping) and the slash commands /live, /watch add, remove and list, and /recent.",
  why: "[FILL: why SystemSeven exists, in T7SEN's words]",
  stack: ["TypeScript", "discord.js 14", "Sentry"],
  links: [
    {
      label: "Repository",
      href: "[FILL: the repo link]",
    },
  ],
  inProgress: true,
  status: "Built, not running: no live features yet.",
} satisfies ShortStudy;
