"use client";

import { type Ref, useId } from "react";

import { cx } from "@/components/site/class-names";
import { soundCopy } from "@/content/sound";
import type { SoundStatus, TicksStatus } from "@/lib/sound-store";

type SwitchProps = {
  label: string;
  line: string;
  isChecked: boolean;
  isFailed: boolean;
  part: string;
  onPress: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
};

/**
 * One row of the panel: a switch named by its words alone, its muted line
 * read as its description, and the Calm switch's track drawn darker, since
 * it sits on the raised panel. A 44 px row (REQ-A11Y-02 targets).
 */
function SoundSwitch({
  label,
  line,
  isChecked,
  isFailed,
  part,
  onPress,
  buttonRef,
}: SwitchProps) {
  const labelId = useId();
  const lineId = useId();
  return (
    <button
      ref={buttonRef}
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-labelledby={labelId}
      aria-describedby={lineId}
      data-part={part}
      data-sound-control=""
      onClick={onPress}
      className="group flex min-h-11 w-full cursor-pointer items-center gap-4 rounded-md px-3 py-2 text-start transition-colors hover:bg-surface focus-visible:bg-surface"
    >
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm leading-snug text-text">
          {label}
        </span>
        <span
          id={lineId}
          className={cx(
            "block text-xs leading-snug",
            isFailed ? "text-danger" : "text-muted",
          )}
        >
          {isFailed ? soundCopy.panel.failed : line}
        </span>
      </span>
      {/* The state in place as well as in colour: the knob at the start,
          muted, when off, and at the end, glow, when on. */}
      <span
        aria-hidden="true"
        className="relative h-[18px] w-8 shrink-0 rounded-full bg-void shadow-[inset_0_0_0_1px_var(--color-edge)] transition-shadow group-aria-checked:shadow-[inset_0_0_0_1px_var(--color-glow)] motion-reduce:transition-none"
      >
        <span className="absolute start-[3px] top-[3px] size-3 rounded-full bg-muted transition-[inset-inline-start,background-color] group-aria-checked:start-[17px] group-aria-checked:bg-glow motion-reduce:transition-none" />
      </span>
    </button>
  );
}

export type SoundPanelBodyProps = {
  status: SoundStatus;
  ticks: TicksStatus;
  onBackground: () => void;
  onTicks: () => void;
  /** The first switch, which takes focus as the panel opens. */
  firstRef: Ref<HTMLButtonElement>;
};

/**
 * The panel's two switches [T7SEN, 15 Nov 2026]: Background (the bed) and
 * Interface sounds (the ticks), each on or off on its own. A background
 * waiting for the first click is on, as the pill says. A setting that could
 * not start says so in its line and, once, in a polite status region, since
 * a description that changes is not read out (WCAG 4.1.3).
 */
export function SoundPanelBody({
  status,
  ticks,
  onBackground,
  onTicks,
  firstRef,
}: SoundPanelBodyProps) {
  const failed = [
    status === "failed" ? soundCopy.panel.background.label : null,
    ticks === "failed" ? soundCopy.panel.ticks.label : null,
  ].filter((label) => label !== null);
  return (
    <>
      <p role="status" data-part="sound-panel-status" className="sr-only">
        {failed.length > 0
          ? `${failed.join(", ")}: ${soundCopy.panel.failed}`
          : null}
      </p>
      <SoundSwitch
        buttonRef={firstRef}
        part="sound-background"
        label={soundCopy.panel.background.label}
        line={soundCopy.panel.background.line}
        isChecked={status !== "off" && status !== "failed"}
        isFailed={status === "failed"}
        onPress={onBackground}
      />
      <SoundSwitch
        part="sound-ticks"
        label={soundCopy.panel.ticks.label}
        line={soundCopy.panel.ticks.line}
        isChecked={ticks === "on"}
        isFailed={ticks === "failed"}
        onPress={onTicks}
      />
    </>
  );
}
