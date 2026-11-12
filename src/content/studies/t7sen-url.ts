import type { ShortStudy } from "../types";

const repo = "https://github.com/T7SEN/t7sen-url" as const;

/** The project's live site, as its README names it; /about lists it too. */
export const t7senUrlSite = {
  label: "links.t7sen.com",
  href: "https://links.t7sen.com",
} as const;

// What, stack and links follow the project's public README as written. The
// short stack on the card and in the table is T7SEN's own statement,
// accepted on 11 Nov 2026 with his check still owed (phase P3.5, item 6).
// The why is drawn from the README's own features, for his check.
export const t7senUrl = {
  kind: "short",
  slug: "t7sen-url",
  title: "t7sen-url",
  tag: "Links",
  listing: {
    kind: "Short-form",
    studyLabel: "Short study",
    line: "A link-in-bio hub at links.t7sen.com, with /go short links that count clicks.",
    stack: ["Next.js 16", "React 19", "Tailwind 4"],
    what: "A link-in-bio hub at links.t7sen.com, with /go short links that count clicks.",
    builtWith: "Next.js 16, React 19, Tailwind 4",
    secondary: { label: "Repo", href: repo },
  },
  what: "A link-in-bio hub at links.t7sen.com: one static page with a profile, a live Twitch card with the next scheduled stream, links and a support card, plus a /go/<slug> short-link redirect that counts clicks.",
  why: "My links and stream in one place on my own domain, with short links that show what people click.",
  stack: [
    "Next.js 16 (App Router, Cache Components, React Compiler)",
    "React 19",
    "Tailwind CSS 4",
    "motion",
    "SWR",
    "PostHog",
    "Sentry",
    "Vercel Web Analytics",
    "Vercel Hobby, with the Vercel Firewall on /api",
  ],
  links: [t7senUrlSite, { label: "github.com/T7SEN/t7sen-url", href: repo }],
  inProgress: false,
} satisfies ShortStudy;
