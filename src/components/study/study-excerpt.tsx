import { cx, HAIRLINE } from "@/components/site/class-names";
import { DashedBox } from "@/components/site/dashed-box";
import type { FullStudy } from "@/content/types";

import { DotJoined } from "./dot-joined";

type StudyExcerptProps = {
  excerpt: FullStudy["excerpt"];
};

// A short excerpt of the real code in a raised panel, headed by its language
// and the file it comes from, with its caption under the panel. Until it is
// taken from the repo, its place is a dashed box holding the marker
// (REQ-CNT-05).
export function StudyExcerpt({ excerpt }: StudyExcerptProps) {
  if (typeof excerpt === "string") return <DashedBox>{excerpt}</DashedBox>;

  return (
    <figure>
      <div
        className={cx("overflow-hidden rounded-2xl border bg-raised", HAIRLINE)}
      >
        <p
          className={cx(
            "border-b px-5 py-3 font-mono text-xs text-muted",
            HAIRLINE,
          )}
        >
          <DotJoined parts={[excerpt.language, excerpt.path]} />
        </p>
        {/* It takes focus, so a keyboard can scroll a line wider than the
            panel (WCAG 2.1.1). */}
        <pre
          tabIndex={0}
          className="overflow-x-auto px-5 py-4 font-mono text-sm leading-[1.6] text-text"
        >
          <code>{excerpt.code}</code>
        </pre>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        {excerpt.caption}
      </figcaption>
    </figure>
  );
}
