import type { Link, Text } from "./types";

export type Site = {
  name: Text;
  /** The footer's line under the wordmark. */
  tagline: Text;
  /** The one public address: the contact page, the form's recipient, the palette. */
  email: `${string}@${string}`;
  github: Link & { href: `https://${string}` };
  /** Accessible names for landmarks and the logo link. */
  names: {
    logoLink: Text;
    siteControls: Text;
    intro: Text;
    field: Text;
    footer: Text;
  };
};

// The tagline is T7SEN's own statement, accepted on 11 Nov 2026 with his
// check still owed (phase P3.5, item 10).
export const site = {
  name: "T7SEN",
  tagline: "Real-time worlds, built in the browser.",
  email: "hello@t7sen.com",
  github: { label: "GitHub", href: "https://github.com/T7SEN" },
  names: {
    logoLink: "T7SEN, home",
    siteControls: "Site controls",
    intro: "Intro",
    field: "The particle field",
    footer: "Footer",
  },
} as const satisfies Site;

/** The footer's copyright line, for the year the site was built. */
export function copyright(year: number): Text {
  return `© ${year} ${site.name}`;
}
