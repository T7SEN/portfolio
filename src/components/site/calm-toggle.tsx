"use client";

import { useId, useSyncExternalStore } from "react";

import { calmStore } from "@/lib/calm-store";

import { cx } from "./class-names";
import { pillClassName } from "./pill";

/**
 * header: the bar's switch; below 640 px it shows "Calm" (its name stays
 * "Calm mode") so the bar's row holds at 320 px. pill: the hero's corner
 * switch. words: the footer's pill, which says its state in words.
 */
export type CalmToggleVariant = "header" | "pill" | "words";

type CalmToggleProps = {
  variant?: CalmToggleVariant;
  className?: string;
};

/**
 * Calm mode for anyone (REQ-A11Y-04): the field stops and smooth scroll goes.
 * Every form reads and writes the one calm store, so they always agree. The
 * OS reduced motion setting always wins, so while it asks for calm the switch
 * stays on and says why (REQ-A11Y-03).
 */
export function CalmToggle({ variant = "header", className }: CalmToggleProps) {
  const { calm, system } = useSyncExternalStore(
    calmStore.subscribe,
    calmStore.getSnapshot,
    calmStore.getServerSnapshot,
  );
  const noteId = useId();

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={calm}
        aria-describedby={system ? noteId : undefined}
        // Asks for the opposite of what the switch shows. Under the OS
        // setting that clears only the visitor's own choice.
        onClick={() => calmStore.setChosen(!calm)}
        className={cx(
          "group",
          pillClassName({ variant: "quiet", size: "sm", gap: false }),
          variant === "header" ? "gap-1.5 max-sm:px-2 sm:gap-2.5" : "gap-2.5",
          className,
        )}
      >
        <span>
          Calm
          <span className={variant === "header" ? "max-sm:sr-only" : undefined}>
            {" mode"}
          </span>
          {variant === "words" && (
            // The state as a word for sighted visitors; assistive technology
            // hears it from aria-checked, so the name stays "Calm mode".
            <span aria-hidden="true" className="group-aria-checked:text-glow">
              {calm ? " on" : " off"}
            </span>
          )}
        </span>
        {variant !== "words" && (
          // The state in place as well as in colour: the knob sits at the
          // start, muted, when off and at the end, glow, when on.
          <span
            aria-hidden="true"
            className="relative h-[18px] w-8 shrink-0 rounded-full bg-raised transition-shadow group-aria-checked:shadow-[inset_0_0_0_1px_var(--color-glow)]"
          >
            <span className="absolute start-[3px] top-[3px] size-3 rounded-full bg-muted transition-[inset-inline-start,background-color] group-aria-checked:start-[17px] group-aria-checked:bg-glow" />
          </span>
        )}
      </button>
      <span id={noteId} hidden>
        Your device asks for reduced motion, so calm stays on.
      </span>
    </>
  );
}
