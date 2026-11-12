import { ArrowIcon } from "@/components/site/arrow-icon";
import { cx, MONO_CAPS, RULE } from "@/components/site/class-names";
import { DashedBox } from "@/components/site/dashed-box";
import type { FullStudy } from "@/content/types";

type StudyDiagramProps = {
  diagram: FullStudy["diagram"];
};

function Connector({ via }: { via: string }) {
  return (
    <span
      className={cx(
        MONO_CAPS,
        "flex shrink-0 items-center gap-1.5 self-start ps-4 text-xs tracking-[0.08em] text-violet sm:self-auto sm:ps-0",
      )}
    >
      {via}
      <ArrowIcon direction="forward" className="hidden size-3.5 sm:block" />
      <ArrowIcon direction="down" className="size-3.5 sm:hidden" />
    </span>
  );
}

// Part 3's architecture as framed boxes joined in order by labelled arrows,
// across the panel on wide screens and down it on phones. The key box has a
// thicker lavender border, so it stands out in shape as well as colour. The
// group is named for what it shows. Until it is drawn, its place is a dashed
// box holding the marker (REQ-CNT-05).
export function StudyDiagram({ diagram }: StudyDiagramProps) {
  if (typeof diagram === "string") return <DashedBox>{diagram}</DashedBox>;

  return (
    <div
      role="group"
      aria-label={diagram.name}
      className={cx("rounded-2xl border bg-surface p-5 sm:p-7", RULE)}
    >
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {diagram.boxes.map((box, index) => (
          <li
            key={index}
            className={cx(
              "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4",
              box.isKey ? "sm:flex-[1.2]" : "sm:flex-1",
            )}
          >
            {"via" in box && <Connector via={box.via} />}
            <div
              data-key={box.isKey ? "true" : undefined}
              className={cx(
                "flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg p-4",
                box.isKey ? "border-2 border-glow" : "border border-edge",
              )}
            >
              <span className="font-semibold text-text">{box.title}</span>
              <span className="text-sm text-muted">{box.line}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
