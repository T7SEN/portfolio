import { cx, HAIRLINE } from "@/components/site/class-names";
import { DashedBox } from "@/components/site/dashed-box";
import type { FullStudy } from "@/content/types";

/** Below the small breakpoint, 640 px: the phone layout. */
const PHONE_MEDIA = "(max-width: 639.98px)";

type StudyScreenshotProps = {
  screenshot: FullStudy["screenshot"];
  className?: string;
};

// The product in its own colours, full width, with its caption under the
// frame. Until a picture is supplied its place is a dashed box holding the
// marker, never an empty frame or a broken image (REQ-CNT-05).
export function StudyScreenshot({
  screenshot,
  className,
}: StudyScreenshotProps) {
  if (typeof screenshot === "string") {
    return (
      <DashedBox
        className={cx(
          "h-40 justify-center text-center sm:aspect-[83/35] sm:h-auto",
          className,
        )}
      >
        {screenshot}
      </DashedBox>
    );
  }

  return (
    <figure className={className}>
      <div
        className={cx(
          "overflow-hidden rounded-2xl border bg-surface",
          HAIRLINE,
        )}
      >
        <picture>
          {/* Phones take the smaller file, so on a slow network the picture
              never holds back the page's first paint (REQ-PERF-01). Both
              files are the same picture, so one aspect ratio holds. */}
          <source
            media={PHONE_MEDIA}
            srcSet={screenshot.phone.src}
            width={screenshot.phone.width}
            height={screenshot.phone.height}
          />
          {/* A plain img: the site uses no image optimisation service. Its
              width and height hold its place while it loads, and it loads
              lazily at low priority, after the text it sits under. */}
          <img
            src={screenshot.src}
            alt={screenshot.alt}
            width={screenshot.width}
            height={screenshot.height}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="block h-auto w-full"
          />
        </picture>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        {screenshot.caption}
      </figcaption>
    </figure>
  );
}
