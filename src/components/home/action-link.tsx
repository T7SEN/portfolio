import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/components/site/class-names";

type ActionLinkProps = {
  href: `/${string}`;
  children: ReactNode;
  variant?: "primary" | "secondary";
};

// Void on violet measures 5.08 and void on glow 7.39; light text on violet
// fails at 3.39 (visual-system.md section 2).
const VARIANTS = {
  primary: "bg-violet text-void hover:bg-glow focus-visible:bg-glow",
  secondary:
    "border border-edge text-text hover:border-glow hover:text-glow focus-visible:border-glow focus-visible:text-glow",
} as const;

// At least 44 by 44 CSS px, so the hero actions are easy targets on phones.
export function ActionLink({
  href,
  children,
  variant = "primary",
}: ActionLinkProps) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-5 font-medium transition-colors",
        VARIANTS[variant],
      )}
    >
      {children}
    </Link>
  );
}
