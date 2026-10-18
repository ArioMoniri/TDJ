import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "TDJ — Tango DJ playlist composer",
  description: "Compose milonga sets: tandas, cortinas and a night-long energy arc from a 21,000-recording golden-age index. Export to Spotify, Rekordbox, Traktor, M3U.",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TDJ", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0b0a10", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <div className="ambient" aria-hidden />
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter id="tdj-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:px-8">{children}</main>
      </body>
    </html>
  );
}
