"use client";

import * as React from "react";
import { useRef, useEffect, useState, useMemo } from "react";
import { useActionState } from "react";
import Image from "next/image";
import { signOut, useSession } from "@/lib/auth-client";
import type { Session } from "@/lib/auth";

type SessionUser = Session["user"];
import { useRouter } from "next/navigation";
import { signGuestbook, type GuestbookState } from "@/app/actions/guestbook";
import { Button } from "@/components/ui/button";
import { sendGAEvent } from "@next/third-parties/google";
import { Send, Loader2, LogOut, Fingerprint, Wifi, X } from "lucide-react";
import { useSfx } from "@/hooks/use-sfx";
import { Icons } from "@/components/ui/icons";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const initialState: GuestbookState = {
  success: false,
  message: "",
};

export function GuestbookForm({
  user: serverUser,
}: {
  user?: SessionUser | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { play } = useSfx();
  const router = useRouter();

  // 1. CLIENT SOURCE OF TRUTH (Better Auth)
  const { data: session, isPending: sessionPending, refetch } = useSession();
  const [charCount, setCharCount] = useState(0);

  // Animation States
  const [isAuthenticating, setIsAuthenticating] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const popupRef = useRef<Window | null>(null);

  const [state, formAction, isPending] = useActionState(
    signGuestbook,
    initialState,
  );

  const effectiveUser = useMemo(() => {
    if (sessionPending) return serverUser;
    return session?.user ?? null;
  }, [sessionPending, session, serverUser]);

  // --- 3D TILT LOGIC ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation (Max 4 degrees for subtle physical feel)
    // rotateX is inverted so mouse-up tilts the top back
    const rotateX = ((y - centerY) / centerY) * -5;
    const rotateY = ((x - centerX) / centerX) * 5;

    setRotation({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    // Reset to flat when mouse leaves
    setRotation({ x: 0, y: 0 });
  };

  // --- Effects & Handlers ---

  useEffect(() => {
    if (state.success && state.newEntry) {
      play("success");
      formRef.current?.reset();

      setTimeout(() => setCharCount(0), 0);

      sendGAEvent("event", "guestbook_sign", {
        event_category: "Engagement",
        event_label: "Success",
        method: state.newEntry.provider || "anonymous",
      });
      window.dispatchEvent(
        new CustomEvent("guestbook-new-entry", {
          detail: state.newEntry,
        }),
      );
    } else if (!state.success && state.message) {
      play("error");
      sendGAEvent("event", "guestbook_error", {
        event_category: "Error",
        event_label: state.message,
      });
    }
  }, [state, play]);

  // Popup Polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAuthenticating) {
      interval = setInterval(() => {
        if (popupRef.current?.closed) {
          setIsAuthenticating(null);
          popupRef.current = null;
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isAuthenticating]);

  const openLoginPopup = (provider: string) => {
    if (isAuthenticating) return;
    play("click");
    setIsAuthenticating(provider);

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    popupRef.current = window.open(
      `/auth/popup?provider=${provider}`,
      `Login with ${provider}`,
      `width=${width},height=${height},left=${left},top=${top}`,
    );
  };

  // Optimistic Login
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "AUTH_SUCCESS") {
        play("on");
        await refetch();
        router.refresh();
        setIsAuthenticating(null);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [play, router, refetch]);

  // Optimistic Logout
  const handleLogout = async () => {
    play("click");
    setIsLoggingOut(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await signOut();
    router.refresh();
    setIsLoggingOut(false);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCharCount(e.target.value.length);
    play("type");
  };

  return (
    <div className="w-full max-w-lg mx-auto" style={{ perspective: "1000px" }}>
      {/* Container with Glass Effect & Tilt */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
        }}
        className={cn(
          "group relative overflow-hidden rounded-3xl bg-zinc-50/5 dark:bg-zinc-900/5 backdrop-blur-3xl border border-white/10 dark:border-white/5",
          "transition-all duration-200 ease-out",
          "hover:border-white/20 hover:bg-zinc-50/10 dark:hover:bg-zinc-900/10 hover:shadow-2xl hover:shadow-primary/5",
          "min-h-55 flex flex-col justify-center will-change-transform",
        )}
      >
        {effectiveUser ? (
          /* --- LOGGED IN: CONVERSATIONAL UI --- */
          <div
            className={cn(
              "relative flex w-full p-6 gap-5 transition-all duration-700 ease-in-out",
              isLoggingOut
                ? "opacity-0 scale-95 blur-md"
                : "opacity-100 scale-100 blur-0",
            )}
          >
            {/* Logout Button */}
            <div className="absolute top-4 right-4 z-10">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                onMouseEnter={() => play("hover")}
                className="h-6 w-6 rounded-full text-muted-foreground/30 hover:text-red-500 hover:bg-red-500/10 transition-all"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Avatar */}
            <div className="shrink-0 pt-1">
              <div className="relative h-11 w-11 overflow-hidden rounded-full ring-2 ring-white/10 shadow-sm">
                <Image
                  src={effectiveUser.image || "/Avatar.png"}
                  alt={effectiveUser.name || "User"}
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              </div>
            </div>

            {/* Input Form */}
            <form
              ref={formRef}
              action={formAction}
              className="flex-1 flex flex-col gap-3"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground/90 leading-none">
                    {effectiveUser.name}
                  </span>
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium leading-none">
                    Verified
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground/50 font-medium">
                  @{effectiveUser.email?.split("@")[0] || "user"}
                </span>
              </div>

              <div className="relative group/input">
                <Textarea
                  name="message"
                  placeholder="What's on your mind?"
                  className="min-h-20 w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/30 focus-visible:ring-0 -ml-1 pl-1"
                  required
                  maxLength={500}
                  onChange={handleInput}
                  onFocus={() => play("hover")}
                  onMouseEnter={() => play("hover")}
                />
                {state.errors?.message && (
                  <p className="text-[10px] font-medium text-red-400 mt-1 animate-in slide-in-from-top-1">
                    {state.errors.message[0]}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors duration-300",
                    charCount > 450
                      ? "text-amber-500"
                      : "text-muted-foreground/30",
                  )}
                >
                  {charCount}/500
                </span>

                <Button
                  type="submit"
                  disabled={isPending}
                  onClick={() => play("click")}
                  onMouseEnter={() => play("hover")}
                  className={cn(
                    "h-8 px-4 rounded-full text-xs font-semibold shadow-sm transition-all duration-300",
                    isPending
                      ? "bg-muted text-muted-foreground shadow-none cursor-wait"
                      : "bg-foreground text-background hover:scale-105 hover:shadow-md active:scale-95",
                  )}
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      Post <Send className="w-3 h-3" />
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          /* --- LOGGED OUT: IDENTITY PORTAL --- */
          <div className="relative w-full h-full flex flex-col items-center justify-center p-8">
            <div
              className={cn(
                "flex flex-col items-center justify-center space-y-8 w-full transition-all duration-500",
                isAuthenticating
                  ? "opacity-0 scale-95 pointer-events-none absolute"
                  : "opacity-100 scale-100 relative",
              )}
            >
              <div className="relative">
                <div className="absolute inset-0 bg-linear-to-tr from-primary/20 to-purple-500/20 blur-2xl opacity-50 rounded-full" />
                <div className="relative h-14 w-14 rounded-2xl bg-linear-to-b from-white/10 to-white/5 border border-white/20 flex items-center justify-center shadow-inner backdrop-blur-md">
                  <Fingerprint className="w-6 h-6 text-foreground/80" />
                </div>
              </div>

              <div className="space-y-2 max-w-65 text-center">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Sign the Guestbook
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Authenticate to leave your mark on the permanent ledger.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 w-full">
                {[
                  { id: "github", Icon: Icons.github, label: "GitHub" },
                  { id: "google", Icon: Icons.google, label: "Google" },
                  { id: "discord", Icon: Icons.discord, label: "Discord" },
                ].map(({ id, Icon, label }) => (
                  <button
                    key={id}
                    onClick={() => openLoginPopup(id)}
                    onMouseEnter={() => play("hover")}
                    className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-all hover:bg-foreground hover:text-background hover:scale-110 active:scale-95"
                    title={`Sign in with ${label}`}
                  >
                    <Icon className="h-4 w-4 transition-transform group-hover:scale-110" />
                  </button>
                ))}
              </div>
            </div>

            {/* Auth Loader */}
            <div
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 z-20",
                isAuthenticating
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-105 pointer-events-none",
              )}
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                <div className="relative h-16 w-16 rounded-full border border-primary/20 flex items-center justify-center bg-background/50 backdrop-blur-md">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
                <div className="absolute inset-0 w-full h-full animate-[spin_3s_linear_infinite]">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
                </div>
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2 justify-center">
                  <Wifi className="w-3 h-3 animate-pulse text-primary" />
                  Connecting...
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest opacity-70">
                  Waiting for {isAuthenticating}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  play("click");
                  setIsAuthenticating(null);
                }}
                onMouseEnter={() => play("hover")}
                className="mt-6 h-7 text-[10px] text-muted-foreground hover:text-red-400 gap-1"
              >
                <X className="w-3 h-3" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Error/Success Feedback */}
      {state.message && !state.success && (
        <div className="mt-4 text-center animate-in fade-in slide-in-from-top-2">
          <span className="inline-block px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium">
            {state.message}
          </span>
        </div>
      )}
    </div>
  );
}
