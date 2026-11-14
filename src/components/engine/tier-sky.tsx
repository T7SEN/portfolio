"use client";

import { useEffect, useRef } from "react";

import { calmStore } from "@/lib/calm-store";
import { colors } from "@/tokens/colors";

import { afterFirstContent } from "./after-first-content";

/** A star's dot radius in CSS px: the faintest, and how much light adds. */
const DOT_PX = 0.9;
const DOT_LIGHT_PX = 1.1;
/** Light past this draws a star in white, past the other in lavender. */
const WHITE_FROM = 1.6;
const GLOW_FROM = 0.6;
/** How often the still is drawn again, ms, while calm is off. */
const REDRAW_MS = 60_000;

/**
 * The tier 3 contact sky (D-146): where no GPU field runs, the real sky over
 * AlUla at the moment the page opened, drawn once on a 2D canvas and again
 * on a resize, the horizon on the sky band, as the live field draws it
 * (src/engine/sky/sky.ts). It shows over the
 * tier 3 picture only while the story is in the contact chapter (the
 * wrapper's data-chapter); the names still fade in over it (ContactSky).
 * Loaded after first content; a failed load leaves the picture.
 */
export function TierSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let isCancelled = false;
    let draw: (() => void) | null = null;
    let timer: number | null = null;

    const cancel = afterFirstContent(() => {
      void Promise.all([
        import("@/engine/sky/catalogue"),
        import("@/engine/sky/sky"),
      ])
        .then(([catalogue, maths]) => {
          if (isCancelled) return;
          const sky = maths.prepareSky(
            {
              stars: catalogue.SKY_STARS,
              segments: catalogue.SKY_SEGMENTS,
              constellations: catalogue.SKY_CONSTELLATIONS,
            },
            Date.now(),
          );
          const placed = maths.createPlaced(sky.count);
          draw = () => {
            const at = Date.now();
            const width = document.documentElement.clientWidth;
            const height = window.innerHeight;
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            const context = canvas.getContext("2d");
            if (context === null) return;
            const frame = maths.skyFrame(width, height);
            maths.placeSky(sky, at, frame, { turn: 0, tilt: 0 }, placed);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            context.fillStyle = colors.void;
            context.fillRect(0, 0, width, height);
            for (let star = 0; star < sky.count; star += 1) {
              if (placed.up[star] !== 1) continue;
              const light =
                (sky.light[star] ?? 0) *
                maths.horizonDim(placed.altitude[star] ?? 0);
              context.fillStyle =
                light > WHITE_FROM
                  ? colors.text
                  : light > GLOW_FROM
                    ? colors.glow
                    : colors.violet;
              context.globalAlpha = Math.min(0.45 + light * 0.4, 1);
              context.beginPath();
              context.arc(
                placed.x[star] ?? 0,
                placed.y[star] ?? 0,
                DOT_PX + DOT_LIGHT_PX * Math.min(light, 2.5),
                0,
                Math.PI * 2,
              );
              context.fill();
            }
            context.globalAlpha = 1;
            canvas.dataset.drawn = "true";
          };
          draw();
          window.addEventListener("resize", draw);
          // The sky turns about a quarter of a degree a minute: drawn again
          // each minute, the names (ContactSky, on the live clock) stay on
          // its stars. Calm keeps the still it has (REQ-A11Y-03).
          timer = window.setInterval(() => {
            if (!calmStore.getSnapshot().calm) draw?.();
          }, REDRAW_MS);
        })
        .catch(() => undefined);
    });

    return () => {
      isCancelled = true;
      cancel();
      if (draw !== null) window.removeEventListener("resize", draw);
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-part="tier-sky"
      className="absolute inset-0 size-full opacity-0 transition-opacity duration-700 ease-out group-data-[chapter=contact]/field:opacity-100 motion-reduce:transition-none"
    />
  );
}
