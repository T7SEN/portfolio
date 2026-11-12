import type { FullStudy, Quote } from "../types";

const live = "https://arche-lab.tech" as const;

// The line, the chips and the table's Built with cell are T7SEN's own
// statements, accepted on 11 Nov 2026 (phase P3.5, items 3 and 4). The live
// link, the figure and its source, the quote and its permission and the role
// line are his answers of 12 Nov 2026. The rest describes the public
// version 1.2.0 only, from its repository. There is no Code link: the code
// is on request.
const VISITORS = "Cloudflare, last 30 days to 12 Nov 2026";

// The home row and the study show the same recorded quote.
const quote: Quote = {
  text: "Colored chat messages that actually fit, plus all the database pages and timers in one spot. Super handy.",
  who: "BunnyEnjoyer, ArcheLab player",
  permission: { grantedBy: "BunnyEnjoyer by email", date: "12 Nov 2026" },
};

export const archelab = {
  kind: "full",
  slug: "archelab",
  title: "ArcheLab",
  tag: "Product",
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
    secondary: { label: "arche-lab.tech", href: live },
    metrics: [{ label: "Unique visitors", value: "213", source: VISITORS }],
    quote,
  },
  roleLine: "Solo project: design, build and hosting.",
  // Only ArcheLab's own interface, never game art (REQ-CNT-12): the chat
  // colour behind the message is a flat colour sampled in game.
  screenshot: {
    src: "/work/archelab.webp",
    width: 1168,
    height: 827,
    phone: { src: "/work/archelab-phone.webp", width: 686, height: 486 },
    alt: "ArcheLab's message window: a shared sample message, Transcendent mods for trade, whisper me, in orange, yellow and green on the in-game chat colour, the markup panel open below it with the tags, and a counter at 75 of 100.",
    caption:
      "A sample message opened from a share link. Every tag counts toward the 100-character limit.",
  },
  summary: [
    "An unofficial tools hub for The First Descendant players, starting with a chat message builder.",
    "The builder previews a message in the game's chat colours and copies markup that fits the 100-character limit, tags included.",
    "Share links carry the message in the URL hash, so the page stays static and the site runs on free plans only.",
  ],
  problem: {
    problem:
      "The First Descendant's chat draws rich-text tags for colours, text sizes and icons. Every character of markup counts toward a 100-character limit, in UTF-16 units, and the input box cuts a longer paste. A cut inside a closing tag leaves the run unclosed, so the game shows the markup as typed.",
    constraints: [
      "One line of chat: 100 characters, every tag included.",
      "Zero running cost: no paid service, plan or add-on.",
      "Every page prerendered and served as a static file.",
      "No guess shown as a game fact: anything unchecked is marked provisional.",
      "Game data kept no longer than the 30 days the game's API terms allow.",
    ],
    role: "Solo project: I designed it, built it and host it. Every tag, size and icon in the builder is marked as tested in game.",
  },
  approach: [
    "The builder is one prerendered page. Its editor is the preview: a ProseMirror line drawn as the in-game chat line, with a switch that puts the chat colour sampled in game behind it.",
    "Under it sits an engine in plain TypeScript, with no React or DOM. It checks a registry of 52 style tags, 6 text sizes and 168 icons with Zod, parses markup on the pattern of Unreal Engine's standard rich-text parser and counts in UTF-16 units, as the input box does. Share links put the message in the URL hash as a versioned code, which the browser never sends to a server.",
  ],
  diagram: {
    name: "How a message is built and shared",
    boxes: [
      { title: "Engine", line: "Parse, count, optimise", isKey: true },
      { title: "Editor", line: "The preview, in game colours", via: "pieces" },
      { title: "Share link", line: "A code in the URL hash", via: "markup" },
    ],
  },
  excerpt: {
    caption:
      "A shorter candidate is kept only if it renders the same glyphs when parsed back.",
    path: "src/features/chat/engine/optimize.ts",
    language: "TypeScript",
    code: `export function optimize(
  pieces: readonly Piece[],
  registry: ChatRegistry,
): string {
  const target = render(pieces, registry);
  const simplified = simplify(pieces, registry);
  const fallback = serialize(pieces);
  for (const candidate of [
    emit(simplified, "minimal"),
    emit(simplified, "all"),
  ]) {
    const fits = candidate.length <= fallback.length;
    if (
      fits &&
      sameGlyphs(render(parse(candidate, registry), registry), target)
    ) {
      return candidate;
    }
  }
  return fallback;
}`,
  },
  hardPart:
    "Fitting a message into 100 characters when the tags count too, since a cut inside a closing tag leaves the whole run unclosed. The optimiser swaps each tag for its shortest form that looks the same, merges neighbouring runs of one style and escapes only what could open or close a tag. It keeps a candidate only if parsing it back renders the same glyphs, and property tests with fast-check hold the engine to that rule.",
  results: [{ label: "Unique visitors", value: "213", source: VISITORS }],
  wouldChange: [
    "Check the last two parser cases in game. That an unknown tag swallows the tags inside it, and that an image tag's content is ignored, are inferred, not tested in game.",
    "Cheaper motion effects. Drawn in software by a headless browser, an idle builder keeps 1.4 cores busy in Firefox, so the end-to-end suite runs one worker per four logical cores.",
    "The next tools the live site names: Descendant builds and weapon builds.",
  ],
  links: {
    live: { label: "Live site", href: live },
  },
  quotes: [quote],
} satisfies FullStudy;
