"use client";

import React, { useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bug, ServerCrash } from "lucide-react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

import { Button } from "@/components/ui/button";
import { useSfx } from "@/hooks/use-sfx";
import { HackerText } from "@/components/ui/hacker-text";
import { MagneticWrapper } from "@/components/ui/magnetic-wrapper";
import { useAchievements } from "@/hooks/use-achievements";
import { HudHeader } from "@/components/ui/hud-header";

gsap.registerPlugin(useGSAP);

export default function NotFound() {
  const { play } = useSfx();
  const { unlock } = useAchievements();
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Logic: Unlock achievement with stability delay
  useEffect(() => {
    const timer = setTimeout(() => {
      unlock("VOID_WALKER");
    }, 500);
    return () => clearTimeout(timer);
  }, [unlock]);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        ".floating-header",
        { y: -30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, delay: 0.2 },
      );

      tl.fromTo(
        ".fracture-line",
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 1.2, ease: "expo.out" },
        "-=0.4",
      );

      tl.fromTo(
        ".glitch-top",
        { x: -50, opacity: 0, clipPath: "inset(0 0 100% 0)" },
        { x: 0, opacity: 1, clipPath: "inset(0 0 50% 0)", duration: 1 },
        "-=1.0",
      );
      tl.fromTo(
        ".glitch-bottom",
        { x: 50, opacity: 0, clipPath: "inset(100% 0 0 0)" },
        { x: 0, opacity: 1, clipPath: "inset(50% 0 0 0)", duration: 1 },
        "<",
      );

      tl.fromTo(
        ".content-item",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.1 },
        "-=0.5",
      );

      gsap.to(".glitch-top", {
        x: -5,
        duration: 3,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      gsap.to(".glitch-bottom", {
        x: 5,
        duration: 3,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    },
    { scope: containerRef },
  );

  return (
    <div
      ref={containerRef}
      className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden text-foreground bg-transparent"
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-1 bg-red-500/20 animate-scanline" />
      </div>

      {/* --- FLOATING HEADER (HUD) --- */}
      <HudHeader
        title="SIGNAL_LOST"
        icon={AlertTriangle}
        telemetry={
          <>
            <span>ERR: 404</span>
            <span>::</span>
            {/* Logic Upgrade: Show the actual broken path */}
            <span className="max-w-25 truncate">{pathname}</span>
          </>
        }
        dotColor="bg-red-500"
      />

      {/* --- CENTERED CONTENT --- */}
      <div className="z-10 flex flex-col items-center justify-center relative w-full max-w-4xl px-4">
        {/* Giant Glitch Text */}
        <div className="relative font-black text-[25vw] md:text-[20rem] leading-none tracking-tighter select-none">
          <div className="invisible" aria-hidden="true">
            404
          </div>

          <div
            className="glitch-top absolute top-0 left-0 right-0 text-center text-red-500/20 blur-sm md:blur-md"
            style={{ clipPath: "inset(0 0 50% 0)" }}
          >
            404
          </div>

          <div
            className="glitch-bottom absolute top-0 left-0 right-0 text-center text-red-500/60"
            style={{ clipPath: "inset(50% 0 0 0)" }}
          >
            404
          </div>

          <div className="fracture-line absolute top-1/2 left-0 right-0 h-0.5 bg-red-500/50 w-full transform -translate-y-1/2" />
        </div>

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center space-y-6 w-full">
          <div className="content-item bg-black/80 backdrop-blur-md border border-red-500/20 p-4 rounded-full mb-4 shadow-[0_0_30px_-10px_rgba(239,68,68,0.5)]">
            <ServerCrash className="h-8 w-8 text-red-500" />
          </div>

          <div className="content-item space-y-2">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight">
              <HackerText text="PAGE_NOT_FOUND" />
            </h2>
            <p className="text-muted-foreground/80 font-mono text-xs md:text-sm tracking-widest uppercase">
              // ERROR_CODE: 0x404_VOID
            </p>
          </div>

          <MagneticWrapper className="content-item flex flex-col sm:flex-row gap-4 pt-4">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-w-60 gap-3 border border-red-500/50 bg-red-500/10 text-red-500 font-mono font-bold shadow-[0_0_15px_rgba(220,38,38,0.2)] hover:bg-red-500 hover:text-white hover:border-red-500 hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] transition-all duration-300"
              onClick={() => {
                play("click");
                window.location.href = `mailto:contact@t7sen.com?subject=System Anomaly Report (404)&body=Path attempted: ${pathname}`;
              }}
              onMouseEnter={() => play("hover")}
            >
              <Bug className="h-4 w-4" />
              <span>REPORT_ANOMALY</span>
            </Button>
          </MagneticWrapper>
        </div>
      </div>
    </div>
  );
}
