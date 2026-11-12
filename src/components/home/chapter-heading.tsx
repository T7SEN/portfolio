import { Label } from "@/components/site/label";
import type { ChapterLabel } from "@/content/story";

type ChapterHeadingProps = {
  /** The h2's id; the chapter's section is labelled by it. */
  id: string;
  label: ChapterLabel;
  /** The chapter's big title. Without one, the mono label is the heading. */
  title?: string;
};

// Every chapter after the hero carries its mono label ("02 / Work"). The
// number is for sighted readers only, so a label heading reads as the
// chapter's name alone. A chapter with a title sets it like a page's own
// (Unbounded at the title size), where the cinematic tone belongs, and the
// story reveals it as it scrolls into view (data-story-title).
export function ChapterHeading({ id, label, title }: ChapterHeadingProps) {
  if (title === undefined) {
    return <Label as="h2" id={id} number={label.number} parts={[label.name]} />;
  }

  return (
    <>
      <Label number={label.number} parts={[label.name]} />
      <h2
        id={id}
        data-story-title=""
        className="mt-4.5 font-display text-title"
      >
        {title}
      </h2>
    </>
  );
}
