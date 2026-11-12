import type { ReactNode } from "react";

import { cx, Label } from "@/components/site";

type PageTitleProps = {
  /** The mono label over the title, in sentence case ("All work", "No 3D"). */
  label: readonly [string, ...string[]];
  /** The h1's id, so a table or section on the page can be named by it. */
  id: string;
  children: ReactNode;
  className?: string;
};

// The opening of /work, /about and /contact: a mono label, then the page's one
// h1 in Unbounded at the weight both previews set it.
export function PageTitle({ label, id, children, className }: PageTitleProps) {
  return (
    <div className={cx("flex flex-col gap-3.5", className)}>
      <Label parts={label} />
      <h1 id={id} className="font-display text-title font-bold">
        {children}
      </h1>
    </div>
  );
}
