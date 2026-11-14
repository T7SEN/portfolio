"use client";

import { useEffect, useRef } from "react";

import { afterFirstContent } from "@/components/engine/after-first-content";
import { calmStore } from "@/lib/calm-store";
import { storyBridge } from "@/lib/story-bridge";

/**
 * The contact sky's easter egg on the page (D-146): the real sky over AlUla
 * is drawn by the field; this island names a constellation where the
 * pointer settles, or a finger taps, and tells the field what to draw
 * (contact-sky-session.ts). The name is decoration, as the field is, so it
 * is hidden from screen readers; the chapter's scene line says the sky.
 */
export function ContactSky() {
  const labelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const placeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const label = labelRef.current;
    const name = nameRef.current;
    const place = placeRef.current;
    const section = label?.closest("section") ?? null;
    if (label === null || name === null || place === null || section === null) {
      return;
    }

    let isCancelled = false;
    let stop: (() => void) | null = null;

    // Everything the sky needs comes after first content, the session and
    // the words with it, so none of it is in the first load (REQ-PERF-04).
    const cancel = afterFirstContent(() => {
      void Promise.all([
        import("@/engine/sky/catalogue"),
        import("@/engine/sky/sky"),
        import("./contact-sky-session"),
        import("@/content/sky"),
        import("@/lib/sky-message"),
      ]).then(([catalogue, maths, session, { sky }, { skyMessage }]) => {
        if (isCancelled) return;
        place.textContent = sky.place;
        stop = session.startContactSky({
          catalogue,
          maths,
          section,
          label,
          name,
          names: sky.constellations,
          // The sky band: the same horizon at every scroll (sky.ts).
          horizon: (width, height) => maths.skyFrame(width, height).horizon,
          covered: () => {
            const boxes: DOMRect[] = [];
            const panel = section.querySelector('[data-stage="contact"]');
            if (panel !== null) boxes.push(panel.getBoundingClientRect());
            // The story's plates behind text (story-runner.ts); none on
            // tier 3, where the layer is hidden.
            const plates = document.querySelector<HTMLElement>(
              '[data-part="veil-plates"]',
            );
            if (plates !== null && !plates.hidden) {
              for (const plate of plates.children) {
                boxes.push(plate.getBoundingClientRect());
              }
            }
            return boxes;
          },
          story: storyBridge.getStory,
          calm: () => calmStore.getSnapshot().calm,
          message: skyMessage.getSnapshot,
          send: storyBridge.setSky,
        });
      });
    });

    return () => {
      isCancelled = true;
      cancel();
      stop?.();
    };
  }, []);

  return (
    <div
      ref={labelRef}
      aria-hidden="true"
      data-part="sky-label"
      data-plate="none"
      className="pointer-events-none fixed start-0 top-0 z-10 -translate-x-1/2 text-center whitespace-nowrap opacity-0 transition-opacity duration-300 ease-out [text-shadow:0_0_2px_var(--color-void),0_0_6px_var(--color-void),0_0_12px_var(--color-void)] motion-reduce:transition-none"
    >
      <span ref={nameRef} className="block text-sm text-text" />
      <span
        ref={placeRef}
        className="mt-1 block font-mono text-[10px] tracking-[0.14em] text-muted uppercase"
      />
    </div>
  );
}
