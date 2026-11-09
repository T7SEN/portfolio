import { archelab } from "./studies/archelab";
import { coupOnline } from "./studies/coup-online";
import { makingOf } from "./studies/making-of";
import { systemseven } from "./studies/systemseven";
import { t7senUrl } from "./studies/t7sen-url";
import type { Study, StudySlug } from "./types";

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

export function getStudy(slug: string): Study | undefined {
  return studies.find((study) => study.slug === slug);
}

export function studyHref(slug: StudySlug): `/work/${StudySlug}` {
  return `/work/${slug}`;
}
