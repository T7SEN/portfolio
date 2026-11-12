import { site } from "./site";
import { t7senUrlSite } from "./studies/t7sen-url";
import type { Link, NonEmpty, Text } from "./types";

/** One group of skills under its mono label. */
export type SkillGroup = { label: Text; items: NonEmpty<Text> };

export type About = {
  heading: Text;
  /** The streamer thread, told in T7SEN's words (REQ-CNT-08). */
  paragraphs: readonly [Text, Text];
  /** GitHub, then the stream: the home chapter's outline pills. */
  links: readonly [Link, Link];
  /**
   * The /about page's Elsewhere list: the two links above, then t7sen-url's
   * live site, which its study has on record.
   */
  elsewhere: readonly [Link, Link, Link];
  cv: {
    text: Text;
    link: Link & { href: "/contact" };
    /** The short form: the home chapter's pill and the /about action. */
    ask: Link & { href: "/contact" };
  };
  skills: NonEmpty<SkillGroup>;
};

const links = [
  site.github,
  { label: "Stream", href: "[FILL: the stream channel URL]" },
] as const satisfies About["links"];

// The heading, both paragraphs and the skills are T7SEN's own statements,
// accepted on 11 Nov 2026 with his check still owed (phase P3.5, items 7 and
// 8). The CV carries the real name, so it is sent on request and never
// published: no file, no download link (REQ-CNT-08).
export const about = {
  heading: "Real time, on and off stream.",
  paragraphs: [
    "I'm T7SEN, a software developer who also streams competitive games. Streaming is real time with an audience: every frame has to land, and people leave the moment it stalls.",
    "I build for the web the same way.",
  ],
  links,
  elsewhere: [...links, t7senUrlSite],
  cv: {
    text: "My CV is sent on request only.",
    link: { label: "Send a message to ask for it", href: "/contact" },
    ask: { label: "Ask for my CV", href: "/contact" },
  },
  skills: [
    { label: "Graphics", items: ["WebGPU", "TSL", "three.js"] },
    { label: "Motion", items: ["GSAP", "Lenis"] },
    { label: "Product", items: ["Next.js", "React", "TypeScript"] },
    {
      label: "Real-time backends",
      items: ["Cloudflare Workers", "Durable Objects"],
    },
  ],
} satisfies About;
