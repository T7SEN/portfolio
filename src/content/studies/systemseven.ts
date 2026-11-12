import type { ShortStudy } from "../types";

// Built, not running: the page lists what is built and never claims a live
// feature (REQ-CNT-04). The line is T7SEN's own statement, accepted on
// 11 Nov 2026 with his check still owed (phase P3.5, item 5), and the why
// is the line he approved on 12 Nov 2026. The repository is private and
// nothing runs yet, so the study has no links [T7SEN, 12 Nov 2026].
export const systemseven = {
  kind: "short",
  slug: "systemseven",
  title: "SystemSeven",
  tag: "Discord",
  listing: {
    kind: "In progress",
    studyLabel: "In progress",
    line: "A custom Discord bot for my stream's server, starting with stream notifications.",
    stack: ["TypeScript", "discord.js 14", "Sentry"],
    what: "A Discord bot for my stream's server. Built, not running yet.",
    builtWith: "TypeScript, discord.js 14, Sentry",
  },
  what: "Built features: Twitch go-live notifications (restart-safe, no double pings, optional role ping) and the slash commands /live, /watch add, remove and list, and /recent.",
  why: "A bot of my own for my stream's Discord server, starting with stream notifications.",
  stack: ["TypeScript", "discord.js 14", "Sentry"],
  links: [],
  inProgress: true,
  status: "Built, not running: no live features yet.",
} satisfies ShortStudy;
