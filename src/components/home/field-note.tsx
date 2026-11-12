"use client";

import { useSyncExternalStore } from "react";

import { cx } from "@/components/site/class-names";
import { fieldNote } from "@/content/story";
import { calmStore } from "@/lib/calm-store";
import { tierStore } from "@/lib/tier-store";

import { useFinePointer } from "./use-fine-pointer";

type FieldNoteProps = {
  className?: string;
};

// The note at the field chapter's foot follows what the visitor can do: the
// stir hint for a mouse or for a finger while a tier 1 or 2 field is on
// screen, the still's own note on tier 3, and nothing in calm mode, where
// nothing stirs, or before the tier is ready (A14). The empty line keeps its
// height, so the words arriving move nothing.
export function FieldNote({ className }: FieldNoteProps) {
  const { tier, ready } = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );
  const { calm } = useSyncExternalStore(
    calmStore.subscribe,
    calmStore.getSnapshot,
    calmStore.getServerSnapshot,
  );
  const isFine = useFinePointer();
  const note = fieldNote({
    tier,
    ready,
    calm,
    input: isFine ? "pointer" : "touch",
  });

  return (
    <p
      className={cx(
        "min-h-[1.4em] font-mono text-xs leading-[1.4] tracking-[0.1em] text-muted",
        className,
      )}
    >
      {note}
    </p>
  );
}
