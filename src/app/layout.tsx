import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "T7SEN",
  description: "Real-time worlds, built for your GPU.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
