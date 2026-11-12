import type { ReactNode } from "react";

import { cx } from "./class-names";

/**
 * page: the preview's column, 1280 px at most with 56 px gutters from 1024 px.
 * full: the same gutters across the whole window, for the bar and the
 * hero's corner pills.
 */
export type ContainerWidth = "page" | "full";

type ContainerProps = {
  children: ReactNode;
  width?: ContainerWidth;
  className?: string;
};

export function Container({
  children,
  width = "page",
  className,
}: ContainerProps) {
  return (
    <div
      className={cx(
        "w-full px-4 sm:px-6 lg:px-14",
        width === "page" && "mx-auto max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
