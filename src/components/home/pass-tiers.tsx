import { cx, RULE } from "@/components/site/class-names";
import { DotJoined } from "@/components/study/dot-joined";
import { passViewer } from "@/content/passes";

// Beside the link in the panel under the pass viewer: what a frame costs on
// each tier, as measured, with the machine it was measured on (rules A1 and
// A15); tier 3 draws no frame, so its row says it shows a static image. The
// tier names are muted mono, the values in the text colour, with a hairline
// rule between rows.
export function PassTiers() {
  const { tiers, tiersName } = passViewer;

  return (
    <div className="min-w-0 flex-[2_1_20rem]">
      <p className="sr-only">{tiersName}</p>
      <dl>
        {tiers.map((row, index) => (
          <div
            key={row.tier.join(" ")}
            className={cx(
              "flex flex-wrap items-baseline justify-between gap-3 py-3.5",
              index < tiers.length - 1 && cx("border-b", RULE),
            )}
          >
            <dt className="font-mono text-xs text-muted">
              <DotJoined parts={row.tier} />
            </dt>
            <dd className="text-sm text-text">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
