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
  /**
   * The id of the footer's site links. With scripts off the bar's Menu is a
   * link to them, so the fast path needs no script.
   */
  siteLinksId: string;
  /** The words of the bar's and the footer's controls. */
  controls: {
    menu: Text;
    close: Text;
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
  siteLinksId: "site-links",
  controls: {
    menu: "Menu",
    close: "Close",
  },
} as const satisfies Site;

/** The footer's copyright line, for the year the site was built. */
export function copyright(year: number): Text {
  return `© ${year} ${site.name}`;
}

/**
 * The keys that open the command palette, as the visitor's keyboard labels
 * them: Ctrl K, or Command K on Apple platforms.
 */
export type ShortcutKeys = "Ctrl K" | "⌘ K";

/** The palette button's name; it holds the keys the pill shows (WCAG 2.5.3). */
export function paletteButtonName(keys: ShortcutKeys): Text {
  return `Open the command palette, ${keys}`;
}

/**
 * The footer's way into the palette. On touch, where no key opens it, it
 * names the search button the bar shows instead (null keys).
 */
export function paletteInvite(keys: ShortcutKeys | null): Text {
  return keys === null
    ? "Search for everything"
    : `Press ${keys} for everything`;
}
