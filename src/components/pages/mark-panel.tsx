import { cx, Logo, Panel } from "@/components/site";

type MarkPanelProps = {
  className?: string;
};

// The /about panel: the purple T7SEN mark over a ring of violet and glow dots
// that fades towards the mark and the panel's edge, as the launch artboard
// draws it. The field keeps its own colours; the gradient mark lives here as
// a logo. Decoration only: the heading beside it names the page.
export function MarkPanel({ className }: MarkPanelProps) {
  return (
    <div aria-hidden="true" data-testid="mark-panel" className={className}>
      <Panel
        padding="none"
        className="relative isolate flex h-full items-center justify-center overflow-hidden"
      >
        <div
          className={cx(
            "absolute inset-0 -z-10",
            "bg-[image:radial-gradient(circle,color-mix(in_srgb,var(--color-violet)_85%,transparent)_1px,transparent_1.7px),radial-gradient(circle,color-mix(in_srgb,var(--color-glow)_55%,transparent)_0.8px,transparent_1.4px)]",
            "bg-[length:12px_12px,20px_20px]",
            "[mask-image:radial-gradient(circle_at_50%_50%,transparent_20%,var(--color-void)_28%,transparent_62%)]",
          )}
        />
        <Logo
          variant="purple"
          className="h-auto w-[8.75rem] sm:w-[11rem] lg:w-[13.125rem]"
        />
      </Panel>
    </div>
  );
}
