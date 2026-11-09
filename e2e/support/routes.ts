import { studies, studyHref } from "../../src/content";
import { heroCopy, STATIC_TIER } from "../../src/content/hero";
import { pages } from "../../src/content/pages";
import type { ShortStudy } from "../../src/content/types";

export type SiteRoute = {
  path: string;
  // File-safe name for screenshots.
  name: string;
  h1: string;
  // One paragraph of the route's main text, as it appears in the static HTML.
  body: string;
};

const HERO = heroCopy(STATIC_TIER);

// The P1 routes. Study routes come from the content index, so a new study is
// checked without editing this list.
export const ROUTES: readonly SiteRoute[] = [
  { path: "/", name: "home", h1: HERO.headline, body: HERO.subLine },
  {
    path: "/work",
    name: "work",
    h1: pages.work.title,
    body: pages.work.intro,
  },
  ...studies.map((study) => ({
    path: studyHref(study.slug),
    name: `work-${study.slug}`,
    h1: study.title,
    body: study.kind === "full" ? study.leadAngle : study.what,
  })),
  {
    path: "/about",
    name: "about",
    h1: pages.about.title,
    body: pages.about.intro,
  },
  {
    path: "/contact",
    name: "contact",
    h1: pages.contact.title,
    body: pages.contact.intro,
  },
  { path: "/v1", name: "v1", h1: pages.v1.title, body: pages.v1.intro },
];

export const SHORT_STUDIES: readonly ShortStudy[] = studies.filter(
  (study): study is ShortStudy => study.kind === "short",
);
