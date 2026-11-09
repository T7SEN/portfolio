// Held above the viewport until it takes focus, so the first Tab on every page
// shows it (WCAG 2.4.1).
export function SkipLink() {
  return (
    <a
      href="#main"
      className="fixed start-4 top-4 z-50 inline-flex min-h-11 -translate-y-[200%] items-center rounded-md bg-raised px-4 font-mono text-sm text-text focus:translate-y-0"
    >
      Skip to content
    </a>
  );
}
