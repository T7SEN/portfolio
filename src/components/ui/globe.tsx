"use client";

import React, { useEffect, useRef } from "react";
import createGlobe from "cobe";
import { useTheme } from "next-themes";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef(false);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(3.5);
  const { resolvedTheme } = useTheme();

  // 1. Always call hooks at the top level
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // 2. Internal Guard: If reduced motion is on, do not initialize Cobe
    if (prefersReducedMotion) return;

    let width = 0;
    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth;
      }
    };
    window.addEventListener("resize", onResize);
    onResize();

    // Safety check: If we returned null in render, this ref might be null
    if (!canvasRef.current) return;

    const isLight = resolvedTheme === "light";

    const baseColor = isLight ? [0.2, 0.2, 0.2] : [0.3, 0.3, 0.3];
    const glowColor = isLight ? [0.8, 0.8, 0.8] : [1, 1, 1];
    const markerColor = [0.6, 0.2, 1];

    let globe: ReturnType<typeof createGlobe> | null = null;
    let frameId = 0;

    try {
      globe = createGlobe(canvasRef.current, {
        devicePixelRatio: 2,
        width: width * 2,
        height: width * 2,
        phi: 0,
        theta: 0.2,
        dark: isLight ? 0 : 1,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: 6,
        baseColor: baseColor as [number, number, number],
        markerColor: markerColor as [number, number, number],
        glowColor: glowColor as [number, number, number],
        markers: [
          { location: [21.5433, 39.1728], size: 0.1 },
          { location: [21.5433, 39.1728], size: 0.2 },
        ],
      });

      // cobe v2 removed the `onRender` option. Per-frame state mutation
      // now goes through `globe.update(state)` from an external RAF loop.
      const tick = () => {
        if (!pointerInteracting.current) {
          phiRef.current += 0.003;
        }
        if (globe) {
          globe.update({
            phi: phiRef.current,
            width: width * 2,
            height: width * 2,
          });
        }
        frameId = requestAnimationFrame(tick);
      };
      frameId = requestAnimationFrame(tick);

      setTimeout(() => {
        if (canvasRef.current) {
          canvasRef.current.style.opacity = "1";
        }
      });
    } catch (e) {
      console.warn(
        "WebGL failed to initialize (likely CI or low-spec env):",
        e,
      );
      // Optional: Hide canvas if failed
      if (canvasRef.current) canvasRef.current.style.display = "none";
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (globe) globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, [resolvedTheme, prefersReducedMotion]);

  // 3. Render Guard: If reduced motion is preferred, render nothing.
  // This is placed AFTER all hooks to satisfy Rules of Hooks.
  if (prefersReducedMotion) return null;

  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          pointerInteracting.current = true;
          pointerInteractionMovement.current = e.clientX;
        }}
        onPointerUp={() => {
          pointerInteracting.current = false;
        }}
        onPointerOut={() => {
          pointerInteracting.current = false;
        }}
        onMouseMove={(e) => {
          if (pointerInteracting.current) {
            const delta = e.clientX - pointerInteractionMovement.current;
            pointerInteractionMovement.current = e.clientX;
            phiRef.current += delta * 0.005;
          }
        }}
        onTouchMove={(e) => {
          if (pointerInteracting.current && e.touches[0]) {
            const delta =
              e.touches[0].clientX - pointerInteractionMovement.current;
            pointerInteractionMovement.current = e.touches[0].clientX;
            phiRef.current += delta * 0.005;
          }
        }}
        style={{
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          aspectRatio: 1,
        }}
        className="cursor-none opacity-0 transition-opacity duration-1000"
      />
    </div>
  );
}
