import { cx } from "@/components/site/class-names";

type IconProps = { className?: string };

// The bar's icons in the preview's strokes. Each sits in a control that
// names it, so each is hidden from assistive technology.
function Icon({ className, path }: IconProps & { path: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
    >
      <path d={path} />
    </svg>
  );
}

/** Two lines, the lower one shorter, held at the start of a line of text. */
export function MenuIcon({ className }: IconProps) {
  return (
    <Icon
      path="M4 9h16M4 15h10"
      className={cx("rtl:-scale-x-100", className)}
    />
  );
}

export function CloseIcon({ className }: IconProps) {
  return <Icon path="M6 6l12 12M18 6 6 18" className={className} />;
}

/** A magnifying glass: the palette's button on phones. */
export function SearchIcon({ className }: IconProps) {
  return (
    <Icon
      path="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20"
      className={className}
    />
  );
}
