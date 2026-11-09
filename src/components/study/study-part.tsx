import type { ReactNode } from "react";

type StudyPartProps = {
  id: string;
  title: string;
  /** "compact" keeps a short study on one screen (REQ-CNT-04). */
  variant?: "full" | "compact";
  children: ReactNode;
};

// Each part of the outline is a section under its own heading, so a screen
// reader can jump between parts (REQ-CNT-03).
export function StudyPart({
  id,
  title,
  variant = "full",
  children,
}: StudyPartProps) {
  const isCompact = variant === "compact";

  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className={
          isCompact ? "font-mono text-label text-muted" : "text-heading"
        }
      >
        {title}
      </h2>
      <div className={isCompact ? "mt-2" : "mt-4"}>{children}</div>
    </section>
  );
}
