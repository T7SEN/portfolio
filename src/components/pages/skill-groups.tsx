import { cx, Label } from "@/components/site";
import type { SkillGroup } from "@/content/about";

type SkillGroupsProps = {
  groups: readonly SkillGroup[];
  className?: string;
};

// Each group's mono label over its tools, joined by middle dots on screen. The
// tools are a list, so a screen reader hears them as separate items and never
// reads the dots.
export function SkillGroups({ groups, className }: SkillGroupsProps) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-5 sm:grid-cols-2", className)}>
      {groups.map((group) => (
        <div key={group.label}>
          <Label as="dt" size="xs" parts={[group.label]} />
          <dd className="mt-1.5">
            <ul className="flex flex-wrap text-base leading-relaxed">
              {group.items.map((item, index) => (
                <li key={item}>
                  {item}
                  {index < group.items.length - 1 && (
                    <span aria-hidden="true" className="mx-1.5 text-muted">
                      ·
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}
