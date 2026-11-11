import type { ChapterLabel } from "@/content/story";

type ChapterHeadingProps = {
  id: string;
  label: ChapterLabel;
};

// The number is decoration for sighted visitors; the heading reads as the
// chapter's name alone.
export function ChapterHeading({ id, label }: ChapterHeadingProps) {
  return (
    <h2 id={id} className="font-mono text-label text-muted">
      <span aria-hidden="true">{`${label.number} · `}</span>
      {label.name}
    </h2>
  );
}
