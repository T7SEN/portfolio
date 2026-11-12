import { cx, RULE } from "@/components/site/class-names";
import type { FullSlug } from "@/content/types";

import { FrameStill } from "./frame-still";

type StudyFrameProps = {
  slug: FullSlug;
};

// The frame a full study's shape forms in. It has no fill, so on tiers 1 and
// 2 the field behind the page shows inside it; the story measures it
// (data-stage="frame") and the field forms the study's shape there as the
// row scrolls. Tier 3 shows the shape's still instead. It holds no text, so
// it is decoration to assistive technology. The faint lattice across it is
// the preview's, in the violet token, fading out from the middle.
export function StudyFrame({ slug }: StudyFrameProps) {
  return (
    <div
      aria-hidden="true"
      data-stage="frame"
      className={cx(
        "relative h-56 overflow-hidden rounded-2xl border sm:h-72 lg:h-[27.5rem]",
        RULE,
      )}
    >
      <FrameStill slug={slug} />
      <div className="absolute inset-0 bg-[radial-gradient(circle,var(--color-violet)_1px,transparent_1.5px)] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,var(--color-void),transparent_75%)] bg-size-[14px_14px] opacity-20" />
    </div>
  );
}
