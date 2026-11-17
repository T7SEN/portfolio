import { studies, studyHref, studyNumber } from "@/content";
import { type MenuCopy, menuCopy } from "@/content/menu";
import type { MonoLabel, StudySlug, Text } from "@/content/types";
import { STUDY_STILLS } from "@/components/study/study-stills";

/** One project row of the menu, with what its preview shows. */
export type MenuRow = {
  slug: StudySlug;
  href: `/work/${StudySlug}`;
  /** Two digits, in study order: "01" to "05". */
  number: string;
  title: Text;
  /** Full studies are large and in the text colour; short ones smaller and muted. */
  full: boolean;
  /** The mono tags at the row's end: a full study's tag and kind, a short study's kind. */
  tags: MonoLabel;
  inProgress: boolean;
  /** The listing's line, under the preview's frame. */
  line: Text;
  /** A full study's shape as the field forms it (its tier 3 still); a short study has none. */
  still: `/still/${string}` | null;
  /** A short study's badge and stack, shown in its frame in place of a shape. */
  badge: Text;
  stack: MonoLabel;
};

const ROW_TITLES: MenuCopy["rowTitles"] = menuCopy.rowTitles;

/** The menu's rows, in study order (REQ-CNT-07). */
export const MENU_ROWS: readonly MenuRow[] = studies.map((study): MenuRow => {
  const { listing } = study;
  const full = study.kind === "full";
  return {
    slug: study.slug,
    href: studyHref(study.slug),
    number: studyNumber(study.slug),
    title: ROW_TITLES[study.slug] ?? study.title,
    full,
    tags: full ? [study.tag, listing.studyLabel] : [listing.studyLabel],
    inProgress: study.kind === "short" && study.inProgress,
    line: listing.line,
    still: study.kind === "full" ? STUDY_STILLS[study.slug] : null,
    badge: listing.kind,
    stack: listing.stack,
  };
});

/** The row of the study on screen, if the page is one; else none. */
export function rowForPath(pathname: string | null): MenuRow | undefined {
  return MENU_ROWS.find((row) => row.href === pathname);
}
