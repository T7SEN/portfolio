"use client";

import { useId, useSyncExternalStore } from "react";

import { calmStore } from "@/lib/calm-store";

/**
 * Calm mode for anyone, from the bar (REQ-A11Y-04): the field stops and
 * smooth scroll goes. The OS reduced motion setting always wins, so while it
 * asks for calm the button stays pressed and says why (REQ-A11Y-03).
 */
export function CalmToggle() {
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
        aria-pressed={calm}
        aria-describedby={system ? noteId : undefined}
        // Asks for the opposite of what the button shows. Under the OS
        // setting that clears only the visitor's own choice.
        onClick={() => calmStore.setChosen(!calm)}
        className="group inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 px-3 font-mono text-sm text-text transition-colors hover:text-glow focus-visible:text-glow"
      >
        {/* The pressed state in shape as well as in name: a ring when off, a
            filled dot when on. */}
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full border border-current group-aria-pressed:bg-current"
        />
        Calm
      </button>
      <span id={noteId} hidden>
        Your device asks for reduced motion, so calm stays on.
      </span>
    </>
  );
}
