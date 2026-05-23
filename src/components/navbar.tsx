"use client";

import React, { useRef, useState, useEffect } from "react";
import { TransitionLink } from "@/components/ui/transition-link";
import { usePathname } from "next/navigation";
import {
  Send,
  User,
  PcCase,
  Book,
  LayoutDashboard,
  Menu,
  X,
  Search,
  Trophy,
} from "lucide-react";
import { Icons } from "@/components/ui/icons";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

import { ThemeToggle } from "@/components/theme-toggle";
import { SoundToggle } from "@/components/sound-toggle";
import { MagneticWrapper } from "@/components/ui/magnetic-wrapper";
import { CommandTrigger } from "@/components/command-trigger";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { HackerText } from "@/components/ui/hacker-text";
import { useSfx } from "@/hooks/use-sfx";
import { cn } from "@/lib/utils";

// --- Configuration ---
const NAV_ITEMS = [
  { name: "About", href: "/about", icon: User },
  { name: "Uses", href: "/uses", icon: PcCase },
  { name: "Guestbook", href: "/guestbook", icon: Book },
  { name: "Achievements", href: "/achievements", icon: Trophy },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Contact", href: "/contact", icon: Send },
];

const SOCIALS = [
  { icon: Icons.github, href: "https://github.com/t7sen" },
  { icon: Icons.twitter, href: "https://twitter.com/t7sen" },
  { icon: Icons.linkedin, href: "https://linkedin.com/in/t7sen" },
];

export function Navbar() {
  const { play } = useSfx();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  // Refs for GSAP
  const containerRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  // Determine the text to display in the dynamic label
  const activeItem = NAV_ITEMS.find((item) => item.href === pathname);
  const hoveredItem = NAV_ITEMS.find((item) => item.href === hoveredPath);

  let displayName = "TERMINAL";
  if (hoveredPath === "/") {
    displayName = "HOME";
  } else if (hoveredItem) {
    displayName = hoveredItem.name.toUpperCase();
  } else if (pathname === "/") {
    displayName = "HOME";
  } else if (activeItem) {
    displayName = activeItem.name.toUpperCase();
  }

  useGSAP(
    () => {
      if (!mobileMenuRef.current) return;

      timeline.current = gsap.timeline({ paused: true });

      timeline.current.to(mobileMenuRef.current, {
        autoAlpha: 1,
        duration: 0.3,
        ease: "power2.inOut",
      });

      timeline.current.fromTo(
        ".mobile-nav-item",
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          stagger: 0.05,
          ease: "back.out(1.2)",
        },
        "-=0.1",
      );
    },
    { scope: containerRef },
  );

  useEffect(() => {
    if (timeline.current) {
      if (isMobileMenuOpen) {
        timeline.current.play();
      } else {
        timeline.current.reverse();
      }
    }
  }, [isMobileMenuOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const handleMobileSearch = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMobileMenuOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new Event("open-command-menu"));
    }, 300);
  };

  return (
    <nav ref={containerRef}>
      {/* --- TOP BAR (FIXED) --- */}
      <div className="fixed top-0 left-0 right-0 z-50 flex w-full items-center justify-between p-4 md:p-6 md:px-12 pointer-events-none">
        <div className="pointer-events-auto z-50">
          <MagneticWrapper strength={0.2}>
            {/* ⚡ FIX: Used TransitionLink here */}
            <TransitionLink
              href="/"
              aria-label="Home"
              className="block"
              onClick={() => {
                play("click");
                setIsMobileMenuOpen(false);
              }}
              onMouseEnter={() => setHoveredPath("/")}
              onMouseLeave={() => setHoveredPath(null)}
            >
              <Logo
                id="navbar-logo"
                className="h-8 w-auto text-foreground transition-transform hover:scale-105"
              />
            </TransitionLink>
          </MagneticWrapper>
        </div>

        <div
          className={cn(
            "hidden md:flex pointer-events-auto items-center gap-2 rounded-full border border-border/40 p-1.5 backdrop-blur-md shadow-lg shadow-black/5",
            "bg-white/60 dark:bg-neutral-950/60",
          )}
        >
          <div className="hidden lg:flex items-center justify-center min-w-25 overflow-hidden px-2">
            <HackerText
              key={displayName}
              text={displayName}
              className="text-xs font-mono font-bold tracking-widest text-muted-foreground whitespace-nowrap"
              speed={40}
            />
          </div>

          <div className="h-6 w-px bg-border/50 mx-1 hidden lg:block" />

          <div className="flex items-center">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <MagneticWrapper key={item.href} strength={0.6}>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "relative overflow-hidden rounded-full transition-all duration-300",
                      isActive
                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    onMouseEnter={() => play("hover")}
                    aria-label={item.name}
                  >
                    {/* ⚡ FIX: TransitionLink inside Button asChild */}
                    <TransitionLink
                      href={item.href}
                      onClick={() => play("click")}
                      onMouseEnter={() => setHoveredPath(item.href)}
                      onMouseLeave={() => setHoveredPath(null)}
                    >
                      <item.icon className="h-4 w-4" />
                    </TransitionLink>
                  </Button>
                </MagneticWrapper>
              );
            })}
          </div>

          <div className="h-6 w-px bg-border/50 mx-1" />

          <div className="flex items-center gap-1">
            <MagneticWrapper strength={0.6}>
              <CommandTrigger />
            </MagneticWrapper>
            <MagneticWrapper strength={0.6}>
              <SoundToggle />
            </MagneticWrapper>
            <MagneticWrapper strength={0.6}>
              <ThemeToggle />
            </MagneticWrapper>
          </div>
        </div>

        <div className="flex md:hidden pointer-events-auto items-center gap-2 z-50">
          <MagneticWrapper strength={0.2}>
            <Button
              variant="outline"
              size="icon"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              className={cn(
                "rounded-full backdrop-blur-md border-border/40",
                "bg-white/60 dark:bg-neutral-950/60",
              )}
              onClick={() => {
                play("click");
                setIsMobileMenuOpen(!isMobileMenuOpen);
              }}
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </MagneticWrapper>
        </div>
      </div>

      <div
        ref={mobileMenuRef}
        className={cn(
          "fixed inset-0 z-40 flex flex-col justify-center px-8 opacity-0 invisible backdrop-blur-xl md:hidden",
          "bg-white/80 dark:bg-black/60",
        )}
      >
        <div className="flex flex-col gap-8 max-w-sm mx-auto w-full">
          {/* Navigation Links */}
          <div className="flex flex-col gap-4">
            <span className="mobile-nav-item text-xs font-mono text-muted-foreground mb-2 block uppercase tracking-widest">
              Navigation
            </span>
            {NAV_ITEMS.map((item, index) => {
              const isActive = pathname === item.href;
              return (
                <TransitionLink
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    play("click");
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "mobile-nav-item text-4xl font-black tracking-tighter flex items-center gap-4 transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-foreground/60 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-mono tracking-widest",
                      isActive ? "text-primary" : "text-muted-foreground/30",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.name}
                </TransitionLink>
              );
            })}
          </div>

          <div className="w-full h-px bg-foreground/10 mobile-nav-item" />

          {/* Utilities Grid */}
          <div className="mobile-nav-item grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className={cn(
                "h-14 justify-start gap-3",
                "bg-black/5 border-black/10 hover:bg-black/10",
                "dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10",
              )}
              onClick={handleMobileSearch}
            >
              <Search className="h-5 w-5" />
              <span className="text-base">Search</span>
            </Button>

            <div className="flex gap-2 h-14">
              {/* ⚡ RESTORED: Specific styling for ThemeToggle container */}
              <div
                className={cn(
                  "flex-1 h-full",
                  "[&>button]:w-full [&>button]:h-full [&>button]:rounded-md",
                  "[&>button]:bg-black/5 [&>button]:border-black/10",
                  "dark:[&>button]:bg-white/5 dark:[&>button]:border-white/10",
                )}
              >
                <ThemeToggle />
              </div>

              {/* ⚡ RESTORED: Specific styling for SoundToggle container */}
              <div
                className={cn(
                  "flex-1 h-full",
                  "[&>button]:w-full [&>button]:h-full [&>button]:rounded-md",
                  "[&>button]:bg-black/5 [&>button]:border-black/10",
                  "dark:[&>button]:bg-white/5 dark:[&>button]:border-white/10",
                )}
              >
                <SoundToggle />
              </div>
            </div>
          </div>

          {/* Footer Socials */}
          <div className="mobile-nav-item flex items-center justify-between mt-4">
            <div className="flex gap-6">
              {SOCIALS.map((social) => (
                <a
                  key={social.href}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => play("click")}
                >
                  <social.icon className="h-6 w-6" />
                </a>
              ))}
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/50">
              SYS_ONLINE
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
