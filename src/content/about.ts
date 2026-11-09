import type { Link, Text } from "./types";

export type About = {
  thread: readonly [Text, Text, Text];
  threadText: Text;
  skills: Text;
  cv: { text: Text; link: Link & { href: "/contact" } };
};

// The CV carries the real name, so it is sent on request and never published:
// no file, no download link (REQ-CNT-08).
export const about = {
  thread: ["Live performance", "Real-time systems", "A sense for audiences"],
  threadText:
    "[FILL: the streamer thread in T7SEN's words, beyond these three points]",
  skills: "[FILL: the skills list, supplied by T7SEN]",
  cv: {
    text: "My CV is sent on request only.",
    link: { label: "Send a message to ask for it", href: "/contact" },
  },
} satisfies About;
