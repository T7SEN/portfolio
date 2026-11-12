import { cx, HAIRLINE, LINK_HOVER, MONO_CAPS } from "@/components/site";
import { SiteAnchor } from "@/components/site/site-anchor";
import { studies, studyHref, studyNumber } from "@/content";
import { pages } from "@/content/pages";
import type { Study } from "@/content/types";

type StudyTableProps = {
  /** The id of the heading that names the table (the page's h1). */
  labelledBy: string;
  className?: string;
};

type Row = {
  key: string;
  number: string;
  title: string;
  what: string;
  builtWith: string;
  link: { label: string; href: string };
  inProgress: boolean;
};

const { headers, v1 } = pages.work.table;

// Five columns from 1024 px, the preview's widths. Below that a row is the
// number beside a stack of the other cells, so nothing is wider than the
// screen at 320 px. Every track can shrink to nothing (minmax(0, ...)), so a
// long word wraps instead of pushing the page sideways.
const COLUMNS =
  "lg:grid-cols-[4rem_minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1.4fr)_11.25rem]";

function rowOf(study: Study): Row {
  return {
    key: study.slug,
    number: studyNumber(study.slug),
    title: study.title,
    what: study.listing.what,
    builtWith: study.listing.builtWith,
    link: { label: study.listing.studyLabel, href: studyHref(study.slug) },
    inProgress: study.kind === "short" && study.inProgress,
  };
}

const ROWS: readonly Row[] = [
  ...studies.map(rowOf),
  {
    key: "v1",
    number: v1.number,
    title: v1.title,
    what: v1.what,
    builtWith: v1.builtWith,
    link: v1.link,
    inProgress: false,
  },
];

// Shown above a cell's words while the header row is out of sight. The cell
// keeps its column header for assistive technology, so this copy is hidden
// from it.
function PhoneLabel({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "mb-1 block text-[0.6875rem] leading-[1.4] tracking-[0.1em] text-muted lg:hidden",
        MONO_CAPS,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Every study in study order, then the v1 archive, as one table (REQ-CNT-02,
 * REQ-CNT-07). Each part carries its role, so the table keeps its meaning for
 * assistive technology when the rows stack on phones and the header row is
 * hidden from sight.
 */
export function StudyTable({ labelledBy, className }: StudyTableProps) {
  return (
    <table
      role="table"
      aria-labelledby={labelledBy}
      className={cx("block w-full border-t", HAIRLINE, className)}
    >
      <thead role="rowgroup" className="sr-only block lg:not-sr-only">
        <tr
          role="row"
          className={cx(
            "grid gap-x-6 border-b py-3.5 text-xs leading-[1.4] tracking-[0.12em] text-muted",
            HAIRLINE,
            MONO_CAPS,
            COLUMNS,
          )}
        >
          {[
            headers.number,
            headers.project,
            headers.what,
            headers.builtWith,
            headers.study,
          ].map((header) => (
            <th
              key={header}
              role="columnheader"
              scope="col"
              className="text-start font-normal"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="block">
        {ROWS.map((row) => (
          <tr
            key={row.key}
            role="row"
            data-study={row.key}
            className={cx(
              "grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3 border-b py-6 lg:gap-x-6 lg:py-6.5",
              HAIRLINE,
              COLUMNS,
            )}
          >
            <td
              role="cell"
              className="col-start-1 row-start-1 font-mono text-[0.8125rem] text-muted uppercase"
            >
              {row.number}
            </td>
            <th
              role="rowheader"
              scope="row"
              className="col-start-2 row-start-1 text-start text-xl leading-snug font-semibold wrap-break-word lg:text-[1.375rem]"
            >
              {row.title}
            </th>
            <td
              role="cell"
              className="col-start-2 text-base leading-relaxed wrap-break-word text-muted lg:col-start-3 lg:row-start-1"
            >
              <PhoneLabel>{headers.what}</PhoneLabel>
              {row.what}
            </td>
            <td
              role="cell"
              className="col-start-2 text-[0.9375rem] leading-normal wrap-break-word text-muted lg:col-start-4 lg:row-start-1"
            >
              <PhoneLabel>{headers.builtWith}</PhoneLabel>
              {row.builtWith}
            </td>
            <td
              role="cell"
              className="col-start-2 lg:col-start-5 lg:row-start-1"
            >
              {/* The words repeat down the column, so the name carries the
                  project too. A label, not hidden text: Chromium sets a
                  visually hidden span apart with a space before the comma. */}
              <SiteAnchor
                href={row.link.href}
                aria-label={`${row.link.label}, ${row.title}`}
                data-state={row.inProgress ? "in-progress" : undefined}
                className={cx(
                  "inline-flex min-h-11 items-center text-[0.9375rem] font-medium underline underline-offset-2",
                  // In progress keeps the glow, so a study that is not
                  // finished reads apart from the rest; the words say it too.
                  row.inProgress ? "text-glow" : "text-text",
                  LINK_HOVER,
                )}
              >
                {row.link.label}
                <span
                  aria-hidden="true"
                  className={cx(
                    "ms-1 inline-block rtl:-scale-x-100",
                    !row.inProgress && "text-glow",
                  )}
                >
                  →
                </span>
              </SiteAnchor>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
