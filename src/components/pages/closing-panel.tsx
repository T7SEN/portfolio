import { cx, Panel, PillLink } from "@/components/site";
import type { Link } from "@/content/types";

type ClosingPanelProps = {
  text: string;
  action: Link;
  className?: string;
};

// The last thing on /work: one line and the lavender action, stacked on
// phones and on one row from 640 px.
export function ClosingPanel({ text, action, className }: ClosingPanelProps) {
  return (
    <Panel
      padding="none"
      className={cx(
        "flex flex-col items-start gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7",
        className,
      )}
    >
      <p className="text-lead">{text}</p>
      <PillLink href={action.href} variant="primary" size="lg">
        {action.label}
      </PillLink>
    </Panel>
  );
}
