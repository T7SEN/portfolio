"use client";

import { useEffect, useState } from "react";

import { cx, LINK_HOVER } from "@/components/site/class-names";
import { Label } from "@/components/site/label";

export type ContentsPart = { id: string; title: string };

type StudyContentsProps = {
  /** The mono label over the list, which also names it. */
  label: string;
  /** The parts in page order, each with the id of its section. */
  parts: readonly ContentsPart[];
  className?: string;
};

// A part counts as the one being read while it crosses the top third of the
// window.
const READING_BAND = "0px 0px -65% 0px";

const LABEL_ID = "study-contents-label";

/**
 * The list of a study's parts, at the inline start and held in view from
 * 1024 px, with the part being read in glow. The static HTML is the plain
 * list of links, so it works with JavaScript off; the observer only marks
 * the current part, and it is disconnected on unmount.
 */
export function StudyContents({ label, parts, className }: StudyContentsProps) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = parts
      .map((part) => document.getElementById(part.id))
      .filter((section): section is HTMLElement => section !== null);
    const first = sections[0];
    if (first === undefined) return;

    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id);
          else inBand.delete(entry.target.id);
        }
        // The last part in the band is the one whose heading the reader has
        // reached; above every part, the first is next.
        let reading: string | null = null;
        for (const section of sections) {
          if (inBand.has(section.id)) reading = section.id;
        }
        if (reading === null && first.getBoundingClientRect().top > 0) {
          reading = first.id;
        }
        if (reading !== null) setCurrent(reading);
      },
      { rootMargin: READING_BAND },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [parts]);

  return (
    <nav
      aria-labelledby={LABEL_ID}
      className={cx("lg:sticky lg:top-8 lg:self-start", className)}
    >
      <Label id={LABEL_ID} parts={[label]} />
      <ol className="mt-2.5 grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-1">
        {parts.map((part, index) => {
          const isCurrent = part.id === current;
          return (
            <li key={part.id}>
              <a
                href={`#${part.id}`}
                aria-current={isCurrent ? "location" : undefined}
                className={cx(
                  "inline-flex min-h-11 items-center text-[0.9375rem]",
                  isCurrent ? "text-glow" : "text-text",
                  LINK_HOVER,
                )}
              >
                {`${index + 1}. ${part.title}`}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
