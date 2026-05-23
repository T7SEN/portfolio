"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Laptop,
  Moon,
  Sun,
  Mail,
  User,
  Book,
  Home,
  Gamepad2,
  Copy,
  ArrowLeft,
  Command as CommandIcon,
  Monitor,
  Share2,
  PcCase,
  LayoutDashboard,
  Trophy,
  Calculator,
  Palette,
  Ruler,
  Type,
  Clock,
  Music,
  Code2,
  Terminal,
  Activity,
  ExternalLink,
  History,
} from "lucide-react";
import { Icons } from "@/components/ui/icons";
import { useAchievements } from "@/hooks/use-achievements";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useSfx } from "@/hooks/use-sfx";
import { useSound } from "@/components/sound-provider";
import { parseCommand } from "@/lib/command-parser";
import { useLanyard } from "@/hooks/use-lanyard";
import { cn } from "@/lib/utils";

// --- CONSTANTS ---
const DISCORD_ID = "170916597156937728";

// --- TYPES ---
type CommandId = string;
interface CommandDef {
  id: CommandId;
  label: string;
  icon: React.ElementType;
  group: "Suggestions" | "Navigation" | "Utilities" | "Theme" | "Connect";
  action?: () => void;
  route?: string;
  url?: string;
  keywords?: string[];
  autoClose?: boolean;
}

// --- SUB-COMPONENT: PERSISTENT PROFILE FOOTER ---
function CommandMenuProfile() {
  const { data, isConnected } = useLanyard(DISCORD_ID);

  if (!data || !isConnected) {
    return (
      <div className="flex items-center gap-3 px-1">
        <div className="relative">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted/50" />
          <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="h-2.5 w-16 animate-pulse rounded-full bg-muted/50" />
          <div className="h-2 w-12 animate-pulse rounded-full bg-muted/30" />
        </div>
      </div>
    );
  }

  const {
    discord_user,
    discord_status,
    activities,
    listening_to_spotify,
    spotify,
  } = data;

  let statusText = "System Online";
  let StatusIcon = Activity;
  let isActivity = false;

  if (listening_to_spotify && spotify) {
    statusText = `${spotify.song}`;
    StatusIcon = Music;
    isActivity = true;
  } else if (activities.length > 0) {
    const game = activities.find((a) => a.type !== 4) || activities[0];
    if (game.type !== 4) {
      if (game.name === "Visual Studio Code") {
        statusText = game.details || "Writing Code";
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

  const statusColor = {
    online: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]",
    idle: "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]",
    dnd: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]",
    offline: "bg-zinc-500",
  }[discord_status];

  return (
    <div className="flex items-center gap-3 px-1 overflow-hidden">
      <div className="relative shrink-0">
        {discord_user.avatar ? (
          <Image
            src={`https://cdn.discordapp.com/avatars/${discord_user.id}/${discord_user.avatar}.png`}
            alt={discord_user.username}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full border border-border/50 bg-muted"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted border border-border/50" />
        )}
        <span
          className={cn(
            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background transition-all duration-300",
            statusColor,
          )}
        />
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="text-xs font-bold leading-none text-foreground tracking-tight">
          {discord_user.username}
        </span>
        <div className="flex items-center gap-1.5 pt-0.5">
          <StatusIcon
            className={cn(
              "h-2.5 w-2.5 shrink-0 transition-colors duration-300",
              isActivity ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="truncate text-[10px] font-medium text-muted-foreground">
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
}

interface CommandMenuProps {
  onOpenGame?: () => void;
}

export function CommandMenu({ onOpenGame }: CommandMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [activePage, setActivePage] = React.useState("main");
  const [search, setSearch] = React.useState("");
  const [recents, setRecents] = React.useState<CommandId[]>([]);

  const { unlock } = useAchievements();
  const { setTheme } = useTheme();
  const { play } = useSfx();
  const { isMuted, toggleMute } = useSound();
  const router = useRouter();

  React.useEffect(() => {
    const saved = localStorage.getItem("t7sen-command-recents");
    if (saved) {
      try {
        setRecents(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse recents", e);
      }
    }
  }, []);

  const addToRecents = React.useCallback((id: CommandId) => {
    setRecents((prev) => {
      const filtered = prev.filter((i) => i !== id);
      const next = [id, ...filtered].slice(0, 3);
      localStorage.setItem("t7sen-command-recents", JSON.stringify(next));
      return next;
    });
  }, []);

  const COMMANDS: CommandDef[] = React.useMemo(
    () => [
      // SUGGESTIONS
      {
        id: "nav-contact",
        label: "Contact Me",
        icon: Mail,
        group: "Suggestions",
        route: "/contact",
      },
      {
        id: "util-theme",
        label: "Change Theme...",
        icon: Laptop,
        group: "Suggestions",
        autoClose: false,
        action: () => {
          setSearch("");
          setActivePage("theme");
        },
      },
      {
        id: "game-snake",
        label: "Play Snake",
        icon: Gamepad2,
        group: "Suggestions",
        action: () => {
          if (onOpenGame) onOpenGame();
          window.dispatchEvent(new Event("open-snake-game"));
        },
      },

      // NAVIGATION
      {
        id: "nav-home",
        label: "Home",
        icon: Home,
        group: "Navigation",
        route: "/",
      },
      {
        id: "nav-about",
        label: "About",
        icon: User,
        group: "Navigation",
        route: "/about",
      },
      {
        id: "nav-uses",
        label: "Uses",
        icon: PcCase,
        group: "Navigation",
        route: "/uses",
      },
      {
        id: "nav-guestbook",
        label: "Guestbook",
        icon: Book,
        group: "Navigation",
        route: "/guestbook",
      },
      {
        id: "nav-achievements",
        label: "Achievements",
        icon: Trophy,
        group: "Navigation",
        route: "/achievements",
      },
      {
        id: "nav-dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        group: "Navigation",
        route: "/dashboard",
      },

      // UTILITIES
      {
        id: "util-copy",
        label: "Copy Current URL",
        icon: Copy,
        group: "Utilities",
        action: () => navigator.clipboard.writeText(window.location.href),
      },
      {
        id: "util-mute",
        label: isMuted ? "Unmute Sfx" : "Mute Sfx",
        icon: Monitor,
        group: "Utilities",
        action: toggleMute,
      },
      {
        id: "util-socials",
        label: "Socials...",
        icon: Share2,
        group: "Utilities",
        autoClose: false,
        action: () => {
          setSearch("");
          setActivePage("socials");
        },
      },

      // THEME
      {
        id: "theme-light",
        label: "Light Mode",
        icon: Sun,
        group: "Theme",
        action: () => setTheme("light"),
      },
      {
        id: "theme-dark",
        label: "Dark Mode",
        icon: Moon,
        group: "Theme",
        action: () => setTheme("dark"),
      },
      {
        id: "theme-system",
        label: "System",
        icon: Laptop,
        group: "Theme",
        action: () => setTheme("system"),
      },

      // CONNECT
      {
        id: "social-github",
        label: "GitHub",
        icon: Icons.github,
        group: "Connect",
        url: "https://github.com/t7sen",
      },
      {
        id: "social-linkedin",
        label: "LinkedIn",
        icon: Icons.linkedin,
        group: "Connect",
        url: "https://linkedin.com/in/t7sen",
      },
      {
        id: "social-twitter",
        label: "Twitter",
        icon: Icons.twitter,
        group: "Connect",
        url: "https://twitter.com/t7sen",
      },
      {
        id: "social-email",
        label: "Email",
        icon: Mail,
        group: "Connect",
        url: "mailto:contact@t7sen.com",
      },
    ],
    [isMuted, onOpenGame, setTheme, toggleMute],
  );

  const executeCommand = (cmd: CommandDef) => {
    play("success");
    addToRecents(cmd.id);

    if (cmd.autoClose !== false) {
      setOpen(false);
    }
    setSearch("");

    if (cmd.action) cmd.action();
    if (cmd.route) router.push(cmd.route);
    if (cmd.url)
      window.open(cmd.url, cmd.url.startsWith("mailto") ? "_self" : "_blank");
  };

  const smartResult = React.useMemo(() => {
    const query = search.trim();
    if (activePage !== "main" || query.length === 0) return null;

    if (query.startsWith("sudo ")) {
      const cmd = query.replace("sudo ", "").toLowerCase();
      if (cmd === "unlock") {
        return {
          type: "sudo",
          label: "ADMINISTRATOR OVERRIDE",
          value: "Grant Root Access",
          action: () => {
            unlock("ROOT_ACCESS");
            play("success");
          },
        };
      }
      if (cmd === "status") {
        return {
          type: "sudo",
          label: "SYSTEM DIAGNOSTICS",
          value: "All Systems Operational",
          action: () => {
            play("success");
          },
        };
      }
    }
    return parseCommand(search);
  }, [search, activePage, unlock, play]);

  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setActivePage("main");
        setSearch("");
      }, 300);
    }
  }, [open]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!open) unlock("COMMAND_LINE");
        setOpen((open) => !open);
        if (!open) play("click");
      }
      if (e.key === "Backspace" && activePage !== "main" && open && !search) {
        e.preventDefault();
        setSearch("");
        setActivePage("main");
        play("hover");
      }
    };
    const openHandler = () => {
      if (!open) unlock("COMMAND_LINE");
      setOpen(true);
      play("click");
    };
    document.addEventListener("keydown", down);
    window.addEventListener("open-command-menu", openHandler);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("open-command-menu", openHandler);
    };
  }, [open, activePage, play, search, unlock]);

  const handleSmartResult = () => {
    if (smartResult) {
      smartResult.action();
      setOpen(false);
      setSearch("");
    }
  };

  const renderCommands = (cmds: CommandDef[], keySuffix = "") => {
    return cmds.map((cmd) => {
      // ⚡ FIX: Generate a truly unique value to prevent duplicate highlights & scroll glitches
      // We append the keySuffix to the value, so "Home" becomes "Home-recent" in the Recent list.
      const uniqueValue = keySuffix ? `${cmd.label}${keySuffix}` : cmd.label;

      return (
        <CommandItem
          key={`${cmd.id}${keySuffix}`}
          value={uniqueValue} // Unique Value Logic
          onSelect={() => executeCommand(cmd)}
          onMouseEnter={() => play("hover")}
          className="group"
        >
          <cmd.icon className="mr-2 h-4 w-4" />
          <span className="flex-1">{cmd.label}</span>
          {cmd.url && !cmd.url.startsWith("mailto") && (
            <ExternalLink className="ml-2 h-3 w-3 text-muted-foreground opacity-0 group-aria-selected:opacity-100 transition-opacity" />
          )}
        </CommandItem>
      );
    });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="cursor-none">
      <div className="flex items-center border-b border-border/40 px-3">
        {activePage === "main" ? (
          <CommandIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        ) : (
          <ArrowLeft
            className="mr-2 h-4 w-4 shrink-0 cursor-pointer hover:text-primary transition-colors"
            onClick={() => {
              setActivePage("main");
              setSearch("");
            }}
          />
        )}
        <CommandInput
          placeholder={
            activePage === "main"
              ? "Type a command or choose an option..."
              : `Searching ${activePage}...`
          }
          value={search}
          onValueChange={setSearch}
          className="border-none focus:ring-0"
          onKeyDown={() => play("hover")}
        />
      </div>

      <CommandList className="h-75 overflow-y-auto overflow-x-hidden scrollbar-none">
        {!smartResult && <CommandEmpty>No results found.</CommandEmpty>}

        {activePage === "main" && smartResult && (
          <>
            <CommandGroup
              heading={
                smartResult.type === "sudo"
                  ? "Administrator"
                  : "Terminal Output"
              }
            >
              <CommandItem
                onSelect={handleSmartResult}
                onMouseEnter={() => play("hover")}
                className="text-primary font-mono group"
                value={search}
              >
                {smartResult.type === "calculation" && (
                  <Calculator className="mr-2 h-4 w-4" />
                )}
                {smartResult.type === "color" && (
                  <Palette className="mr-2 h-4 w-4" />
                )}
                {smartResult.type === "unit" && (
                  <Ruler className="mr-2 h-4 w-4" />
                )}
                {smartResult.type === "string" && (
                  <Type className="mr-2 h-4 w-4" />
                )}
                {smartResult.type === "time" && (
                  <Clock className="mr-2 h-4 w-4" />
                )}
                {smartResult.type === "sudo" && (
                  <Terminal className="mr-2 h-4 w-4 text-red-500" />
                )}

                <span className="flex-1 font-bold">{smartResult.value}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest group-aria-selected:text-primary/70 transition-colors">
                  {smartResult.label}
                </span>
                <span className="ml-2 text-[10px] text-muted-foreground opacity-0 group-aria-selected:opacity-100 transition-opacity">
                  {smartResult.type === "sudo" ? "↵ EXECUTE" : "↵ COPY"}
                </span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* RECENT COMMANDS */}
        {activePage === "main" && recents.length > 0 && !search && (
          <>
            <CommandGroup
              heading={
                <div className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  <span>Recent</span>
                </div>
              }
            >
              {renderCommands(
                recents
                  .map((id) => COMMANDS.find((c) => c.id === id))
                  .filter((c): c is CommandDef => !!c),
                "-recent", // ⚡ FIX: Suffix added to value for uniqueness
              )}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {activePage === "main" && (
          <>
            <CommandGroup heading="Suggestions">
              {renderCommands(
                COMMANDS.filter((c) => c.group === "Suggestions"),
              )}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              {renderCommands(COMMANDS.filter((c) => c.group === "Navigation"))}
            </CommandGroup>
            <CommandGroup heading="Utilities">
              {renderCommands(COMMANDS.filter((c) => c.group === "Utilities"))}
            </CommandGroup>
          </>
        )}

        {activePage === "theme" && (
          <CommandGroup heading="Theme">
            {renderCommands(COMMANDS.filter((c) => c.group === "Theme"))}
          </CommandGroup>
        )}

        {activePage === "socials" && (
          <CommandGroup heading="Connect">
            {renderCommands(COMMANDS.filter((c) => c.group === "Connect"))}
          </CommandGroup>
        )}
      </CommandList>

      <div className="border-t border-border/40 p-2 px-3 flex items-center justify-between bg-muted/5 shrink-0">
        <CommandMenuProfile />
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-muted-foreground font-mono">
              ONLINE
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono opacity-50">
            <kbd>BACKSPACE</kbd> to go back // <kbd>ESC</kbd> to close
          </span>
        </div>
      </div>
    </CommandDialog>
  );
}
