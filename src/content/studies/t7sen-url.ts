import type { ShortStudy } from "../types";

// What, stack and links follow the project's public README as written.
export const t7senUrl = {
  kind: "short",
  slug: "t7sen-url",
  title: "t7sen-url",
  what: "A link-in-bio hub at links.t7sen.com: one static page with a profile, a live Twitch card with the next scheduled stream, links and a support card, plus a /go/<slug> short-link redirect that counts clicks.",
  why: "[FILL: why t7sen-url exists, in T7SEN's words]",
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
  links: [
    { label: "links.t7sen.com", href: "https://links.t7sen.com" },
    {
      label: "github.com/T7SEN/t7sen-url",
      href: "https://github.com/T7SEN/t7sen-url",
    },
  ],
  inProgress: false,
} satisfies ShortStudy;
