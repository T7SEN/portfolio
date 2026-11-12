import { cx } from "@/components/site";

type DotFloorProps = {
  className?: string;
};

// The faint glow lattice along the foot of /contact, strongest at the centre
// of the bottom edge and gone well before the text above it. It sits behind
// its parent's content, which must be relative and isolate. Decoration only.
export function DotFloor({ className }: DotFloorProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="dot-floor"
      className={cx(
        "pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[26.25rem]",
        "bg-[image:radial-gradient(circle,color-mix(in_srgb,var(--color-glow)_50%,transparent)_0.9px,transparent_1.5px)]",
        "bg-[length:15px_15px]",
        "[mask-image:radial-gradient(ellipse_60%_50%_at_50%_100%,color-mix(in_srgb,var(--color-void)_70%,transparent),transparent_70%)]",
        className,
      )}
    />
  );
}
