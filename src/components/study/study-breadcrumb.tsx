import { cx, LINK_HOVER } from "@/components/site/class-names";
import { SiteAnchor } from "@/components/site/site-anchor";
import { studyPage } from "@/content/pages";

type StudyBreadcrumbProps = {
  /** The study's title: the page the visitor is on, so it is not a link. */
  title: string;
};

// Work, then the study, muted as the current page. The slash is for the eye
// only; the list already tells a screen reader there are two steps.
export function StudyBreadcrumb({ title }: StudyBreadcrumbProps) {
  const { name, work } = studyPage.breadcrumb;

  return (
    <nav aria-label={name} className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 text-muted">
        <li>
          <SiteAnchor
            href={work.href}
            className={cx(
              "inline-flex min-h-11 items-center text-text underline underline-offset-2",
              LINK_HOVER,
            )}
          >
            {work.label}
          </SiteAnchor>
        </li>
        <li className="flex items-center gap-x-2">
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </li>
      </ol>
    </nav>
  );
}
