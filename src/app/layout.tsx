import type { Metadata, Viewport } from "next";

import { EngineHost } from "@/components/engine/engine-host";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/site/skip-link";
import { colors } from "@/tokens/colors";

import { fontVariables } from "./fonts";
import "./globals.css";

// Arabic in R2 changes these two values, not the markup (REQ-I18N-02).
const LOCALE = { lang: "en", dir: "ltr" } as const satisfies {
  lang: string;
  dir: "ltr" | "rtl";
};

export const metadata: Metadata = {
  title: { default: "T7SEN", template: "%s | T7SEN" },
  // The tier 3 line: true for every visitor, whatever their device draws.
  description: "Real-time worlds, built for your GPU.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: colors.void,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={LOCALE.lang} dir={LOCALE.dir} className={fontVariables}>
      <body className="flex min-h-dvh flex-col bg-void font-sans text-body text-text antialiased">
        <SkipLink />
        <SiteHeader />
        {/* Focusable so the skip link moves focus here, not only the scroll
            position; it is not a control, so it shows no ring. */}
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        {/* Last in body, so the skip link stays the first focus stop. It is
            mounted once here and never recreated on navigation. */}
        <EngineHost />
      </body>
    </html>
  );
}
