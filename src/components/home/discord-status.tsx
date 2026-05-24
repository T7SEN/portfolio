"use client";

import * as React from "react";
import Image from "next/image";
import { Music, Gamepad2, Moon, Code2, AlertCircle } from "lucide-react";
import { useLanyard } from "@/hooks/use-lanyard";
import { useSfx } from "@/hooks/use-sfx";
import { cn } from "@/lib/utils";

// Lanyard user ID (distinct from DISCORD_CLIENT_ID for OAuth). If
// unset, the component renders nothing — keeps the layout from
// reserving space for a feature that can't function.
const DISCORD_ID = process.env.NEXT_PUBLIC_DISCORD_USER_ID ?? "";

export function DiscordStatus() {
  const { data, isConnected } = useLanyard(DISCORD_ID);
  const { play } = useSfx();
  const [isTimeout, setIsTimeout] = React.useState(false);

  // ⚡ TIMEOUT LOGIC: If Lanyard doesn't load in 3s, show offline/fallback
  React.useEffect(() => {
    if (data) return;
    const timer = setTimeout(() => setIsTimeout(true), 3000);
    return () => clearTimeout(timer);
  }, [data]);

  // No Discord ID configured → render nothing. Placed after all hooks
  // so rules-of-hooks stays intact across renders. useLanyard already
  // bails internally on empty id.
  if (!DISCORD_ID) return null;

  const isLoading = (!data || !isConnected) && !isTimeout;

  if (isLoading) {
    return (
      <div className="flex min-w-55 items-center gap-3 rounded-2xl border border-border/50 bg-background/40 px-4 py-3 backdrop-blur-md">
        <div className="relative">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-2 w-16 animate-pulse rounded-full bg-muted/50" />
        </div>
      </div>
    );
  }

  // Fallback data if timeout occurs or API fails
  const displayData = data || {
    discord_user: {
      id: DISCORD_ID,
      username: "t7sen",
      avatar: null,
    },
    discord_status: "offline",
    activities: [],
    listening_to_spotify: false,
    spotify: null,
  };

  const {
    discord_user,
    discord_status,
    activities,
    listening_to_spotify,
    spotify,
  } = displayData;

  let statusText = "Chilling";
  let StatusIcon = Moon;
  let isActivity = false;

  if (listening_to_spotify && spotify) {
    statusText = `${spotify.song}`;
    StatusIcon = Music;
    isActivity = true;
  } else if (activities.length > 0) {
    const game = activities.find((a) => a.type !== 4) || activities[0];
    if (game.type !== 4) {
      if (game.name === "Visual Studio Code") {
        statusText = "Coding";
        StatusIcon = Code2;
      } else {
        statusText = game.name;
        StatusIcon = Gamepad2;
      }
      isActivity = true;
    } else {
      statusText = game.state || "Vibing";
    }
  }

  // Handle Offline/Timeout specific text
  if (discord_status === "offline" || isTimeout) {
    statusText = "Offline";
  }

  const statusColor =
    {
      online: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]",
      idle: "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]",
      dnd: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]",
      offline: "bg-zinc-500",
    }[discord_status] || "bg-zinc-500";

  return (
    <a
      href={`https://discord.com/users/${DISCORD_ID}`}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => play("hover")}
      onClick={() => play("click")}
      className="group relative flex min-w-55 items-center gap-4 rounded-2xl border border-border/40 bg-background/40 px-4 py-3 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:bg-background/60 hover:shadow-xl hover:shadow-primary/5 active:scale-[0.98] active:translate-y-0"
    >
      <div className="relative shrink-0">
        {discord_user.avatar ? (
          <Image
            src={`https://cdn.discordapp.com/avatars/${discord_user.id}/${discord_user.avatar}.png`}
            alt={discord_user.username}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full border border-border/50 bg-muted transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-muted border border-border/50 text-muted-foreground">
            <AlertCircle className="w-5 h-5 opacity-50" />
          </div>
        )}

        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background transition-all duration-300",
            statusColor,
          )}
        />
      </div>

      <div className="flex flex-col text-left overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold leading-none text-foreground tracking-tight">
            {discord_user.username}
          </span>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <StatusIcon
            className={cn(
              "h-3 w-3 shrink-0 transition-colors duration-300",
              isActivity ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="truncate text-xs font-medium text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
            {statusText}
          </span>
        </div>
      </div>

      <div className="absolute -inset-px -z-10 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-linear-to-r from-primary/10 via-transparent to-transparent blur-sm" />
    </a>
  );
}
