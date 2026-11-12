import { archelab } from "./studies/archelab";
import { coupOnline } from "./studies/coup-online";
import { makingOf } from "./studies/making-of";
import { systemseven } from "./studies/systemseven";
import { t7senUrl } from "./studies/t7sen-url";
import type { FullStudy, ShortStudy, Study, StudySlug } from "./types";

// Home, /work, the menu and the palette all list the studies in this order
// (REQ-CNT-07).
export const studies: readonly Study[] = [
  makingOf,
  coupOnline,
  archelab,
  t7senUrl,
  systemseven,
];

export const studySlugs: readonly StudySlug[] = studies.map(
  (study) => study.slug,
);

/** The full studies in study order: the home page's framed rows. */
export const fullStudies: readonly FullStudy[] = [
  makingOf,
  coupOnline,
  archelab,
];

/** The short studies in study order: the home page's short cards. */
export const shortStudies: readonly ShortStudy[] = [t7senUrl, systemseven];

export function getStudy(slug: string): Study | undefined {
  return studies.find((study) => study.slug === slug);
}

export function studyHref(slug: StudySlug): `/work/${StudySlug}` {
  return `/work/${slug}`;
}

/** A study's place in the study order, two digits: "01" to "05". */
export function studyNumber(slug: StudySlug): string {
  return String(studySlugs.indexOf(slug) + 1).padStart(2, "0");
}
