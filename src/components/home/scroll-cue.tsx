import { cx } from "@/components/site/class-names";

type ScrollCueProps = {
  label: string;
  className?: string;
};

// The mono word over a thin line at the foot of the hero. Skip intro and the
// page's own scroll already say there is more, so it is decoration. It never
// moves, so calm mode and reduced motion have nothing to stop.
export function ScrollCue({ label, className }: ScrollCueProps) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "flex flex-col items-center gap-2 font-mono text-[0.6875rem] leading-none tracking-[0.2em] text-muted uppercase",
        className,
      )}
    >
      {label}
      <span className="h-8 w-px bg-edge/55" />
    </div>
  );
}
