import type { FullStudy } from "../types";

const live = "https://coups.app/" as const;

// The line and the stack are T7SEN's own statements, accepted on 11 Nov 2026
// (phase P3.5, items 1 and 2). The live link, the figures and their source,
// the quote and its permission, the notice and the role line are his answers
// of 12 Nov 2026; the quote is credited by the nickname its writer gave in
// the feedback form, as the form's consent box promised. The rest is drawn
// from the public repository at commit
// cc7e9ac (12 Nov 2026), and the excerpt is verbatim from it. There is no
// Code link: the code is on request.
const FIGURES =
  "The coups.app admin page, counted since 25 May 2026 07:34 UTC, read on 12 Nov 2026";

export const coupOnline = {
  kind: "full",
  slug: "coup-online",
  title: "Coup Online",
  tag: "Real-time",
  leadAngle:
    "Real-time architecture: Durable Objects rooms, sync and reconnection",
  notice:
    "Coup Online is an unofficial fan version of Coup, the card game designed by Rikki Tahta.",
  listing: {
    kind: "Case study",
    studyLabel: "Full study",
    line: "Real-time Coup for 3 to 6 players. Each match lives in its own Durable Object room that keeps every client in sync and brings dropped players back mid-game.",
    stack: ["Next.js", "Cloudflare Workers", "Durable Objects", "TrueSkill"],
    what: "Real-time Coup for 3 to 6 players, with rooms that stay in sync and survive dropped connections.",
    builtWith: "Next.js, Cloudflare Workers, Durable Objects, TrueSkill",
    secondary: { label: "Play it", href: live },
    metrics: [
      { label: "Accounts", value: "6,713", source: FIGURES },
      { label: "Matches", value: "3,251", source: FIGURES },
    ],
  },
  roleLine: "Solo project: design, build and hosting.",
  screenshot: {
    src: "/work/coup-online.webp",
    width: 1168,
    height: 620,
    phone: { src: "/work/coup-online-phone.webp", width: 686, height: 364 },
    alt: "The Coup Online play page: a Quick match card marked Coming in v2, above two cards, Create a match and Join a match, with a field for a code or an invite link.",
    caption:
      "The play page on coups.app: start a private match, or join one by its code.",
  },
  summary: [
    "Real-time Coup for 3 to 6 players, in the browser.",
    "Each match code leads to one Durable Object that holds the game and sends every player their own view after each move.",
    "A player who drops has 30 seconds to rejoin the same seat; after that, both their cards are revealed and play goes on.",
  ],
  problem: {
    problem:
      "Coup is a game of hidden cards and bluffs: a player may claim a character they do not hold, and the others have 15 seconds to challenge. Online, that is only fair if the server alone knows every card and decides which challenge came first. Connections drop mid-match too, so the table has to play on and the player who dropped has to be able to return.",
    constraints: [
      "Free plans only: Vercel Hobby for the site, Cloudflare's free plan for the Worker, Durable Objects and D1.",
      "No browser may receive another player's face-down cards.",
      "3 to 6 signed-in players a match, with no guest play.",
      "Web only, on desktop and phone browsers, with no install.",
    ],
    role: "Solo project: I designed it, built it and host it. The repository holds the rules package and its tests, the Worker and its Durable Objects, the Next.js front end, sign-in, the D1 schema and the rating package.",
  },
  approach: [
    "The host's browser makes a six-character match code, and the Cloudflare Worker hands every WebSocket for that code to one Durable Object. That room keeps the whole game in its SQLite storage, and only it applies moves.",
    "Each message is checked against a shared Zod schema and a rate limit, then passed to pure rule functions. After each change the room saves its state, resets its alarm and sends every player a view built for them: their own cards, the others' hidden ones as blanks, the deck as a count.",
  ],
  diagram: {
    name: "How a match connects",
    boxes: [
      { title: "Players", line: "3 to 6 signed-in browsers" },
      {
        title: "Room",
        line: "One Durable Object per match",
        via: "WebSocket",
        isKey: true,
      },
      { title: "D1", line: "Matches and ratings", via: "game end" },
    ],
  },
  excerpt: {
    caption:
      "A Durable Object has one alarm, so the room sets it to the earliest deadline it holds.",
    path: "apps/game-server/src/do-game-room.ts",
    language: "TypeScript",
    code: `  private async scheduleAlarm(state: PersistedState): Promise<void> {
    const deadlines: number[] = []
    if (state.lobbyPhase === 'IN_GAME' && state.game?.timerEndsAt != null) {
      deadlines.push(state.game.timerEndsAt)
    }
    for (const d of Object.values(state.disconnects)) {
      deadlines.push(d)
    }
    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAlarm()
      return
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines))
  }`,
  },
  hardPart:
    "Telling a dropped player from a closed tab. A seated player who drops gets a 30 second deadline, and a Durable Object has one alarm, so the room sets it to the earliest of the 15 second phase timer and every deadline, then checks on each wake which are due. The client retries with a backoff from 0.5 to 5 seconds, up to 8 times, with a fresh token for every try, so a player back in time takes the same seat and receives the current view.",
  results: [
    { label: "Accounts", value: "6,713", source: FIGURES },
    { label: "Matches", value: "3,251", source: FIGURES },
  ],
  wouldChange: [
    "Public matchmaking. The queue is a stub that returns 501; the plan pairs 3 to 6 players by a conservative rating, in a band that widens the longer they wait.",
    "A registry for match codes. Codes are made in the browser with no collision check and no expiry; a registry would add both.",
    "Exchange with one card left. The protocol fixes the kept cards at two, so a player down to one card cannot exchange, though the card game allows it.",
  ],
  links: {
    live: { label: "Play it live", href: live },
  },
  quotes: [
    {
      text: "No download, no ads. I was in a game with friends in under a minute. Looks gorgeous, and calling out a fake Duke never gets old.",
      who: "Rafael Borges, Coup Online player",
      permission: {
        grantedBy:
          "Rafael Borges through the coups.app post-game feedback form",
        date: "12 Nov 2026",
      },
    },
  ],
} satisfies FullStudy;
