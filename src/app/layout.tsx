import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SoundProvider } from "@/components/sound-provider";
import { GlobalAppWrapper } from "@/components/global-app-wrapper";
import { JsonLd } from "@/components/seo/json-ld";
import "./globals.css";
import { GoogleAnalytics } from "@next/third-parties/google";
import { AdminProvider } from "@/providers/admin-provider";
import { Toaster } from "sonner";
import { CyberChat } from "@/components/cyber-chat";
import { Footer } from "@/components/footer";
import { RealtimeProvider } from "@/providers/realtime-provider";
import { SystemContextMenu } from "@/components/ui/system-context-menu";
import { AchievementsProvider } from "@/hooks/use-achievements";
import { AchievementsManager } from "@/components/achievements-manager";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "T7SEN | SEC_OPS // Frontend",
    template: "%s | T7SEN",
  },
  description:
    "Software Architect and Developer specializing in high-performance web applications, scalable systems, and immersive digital experiences.",
  keywords: [
    "Software Architect",
    "Full Stack Developer",
    "Next.js",
    "React",
    "TypeScript",
    "Portfolio",
    "Cyberpunk Design",
  ],
  authors: [{ name: "T7SEN", url: "https://t7sen.com" }],
  creator: "T7SEN",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "t7sen | Cyber Developer",
    description:
      "Crafting digital reality through code. Specialized in high-performance web graphics and scalable architecture.",
    siteName: "T7SEN Portfolio",
  },
  twitter: {
    card: "summary_large_image",
    title: "t7sen | Cyber Developer",
    description:
      "Crafting digital reality through code. Specialized in high-performance web graphics and scalable architecture.",
    creator: "@T7ME_",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <RealtimeProvider>
          <JsonLd />
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <SoundProvider>
              <AchievementsProvider>
                <SystemContextMenu />
                <CyberChat />
                <AchievementsManager />
                <AdminProvider>
                  <GlobalAppWrapper>
                    <div className="flex min-h-screen flex-col">
                      <main className="flex-1">
                        {children}
                        <div
                          className="h-24 w-full block lg:hidden"
                          aria-hidden="true"
                        />
                      </main>
                      <Footer />
                    </div>
                  </GlobalAppWrapper>
                  <Toaster position="top-center" richColors />
                </AdminProvider>
              </AchievementsProvider>
            </SoundProvider>
          </ThemeProvider>
        </RealtimeProvider>
      </body>
      {process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID} />
      )}
    </html>
  );
}
