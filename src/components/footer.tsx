import Link from "next/link";
import { cacheLife } from "next/cache";
import { GitPulse } from "@/components/ui/git-pulse";
import { SocialLinks } from "@/components/home/social-links";
import { Ping } from "@/components/ui/ping";
import { ActiveVisitors } from "@/components/ui/active-visitors";

export async function Footer() {
  "use cache";
  cacheLife("days");

  const currentYear = new Date().getFullYear();
  // Same env as the rest of the site's Lanyard wiring. When unset, the
  // copyright renders as plain text instead of a Discord link.
  const discordUserId = process.env.NEXT_PUBLIC_DISCORD_USER_ID;
  const copyrightClass =
    "flex items-center gap-2 font-mono text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors";

  return (
    <footer className="fixed bottom-0 left-0 w-full z-50 py-6 pointer-events-none">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-3 px-4 pointer-events-auto">
        {/* TOP: Socials */}
        <div className="scale-90 origin-bottom">
          <SocialLinks isFooter={true} />
        </div>

        {/* BOTTOM: Info Pill */}
        <div className="flex items-center gap-3 md:gap-5 bg-background/80 backdrop-blur-md px-5 py-2 rounded-full border border-border/50 shadow-sm">
          {/* Copyright — links to Discord profile when configured */}
          {discordUserId ? (
            <Link
              href={`https://discord.com/users/${discordUserId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={copyrightClass}
            >
              <span>© {currentYear} T7SEN</span>
            </Link>
          ) : (
            <span className={copyrightClass}>© {currentYear} T7SEN</span>
          )}

          {/* Divider */}
          <span className="text-border h-3 w-px bg-border block"></span>

          {/* New: Network Latency */}
          <Ping />

          <ActiveVisitors />

          {/* Divider */}
          <span className="text-border h-3 w-px bg-border block"></span>

          {/* GitPulse */}
          <GitPulse />
        </div>
      </div>
    </footer>
  );
}
