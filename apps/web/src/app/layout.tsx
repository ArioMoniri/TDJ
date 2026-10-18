import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ThemeSync } from "@/components/ThemeSync";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-loaded", display: "swap" });
const serif = Fraunces({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-serif-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TDJ — Tango DJ playlist composer",
  description:
    "Compose milonga sets: tandas, cortinas and a night-long energy arc from a 21,000-recording golden-age index. Export to Spotify, Rekordbox, Traktor, M3U.",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TDJ", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  themeColor: "#0b0a10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Applies the saved theme / reduce-transparency choice before first paint so there is no flash. */
const themeScript = `try{var s=JSON.parse(localStorage.getItem("tdj-v1")).state.settings;var e=document.documentElement;if(s.theme&&s.theme!=="auto")e.dataset.theme=s.theme;if(s.theme==="dark")e.classList.add("dark");if(s.reduceGlass)e.classList.add("reduce-glass")}catch(_){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable}`}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: constant string defined above, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <div className="ambient" aria-hidden />
        <ThemeSync />
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-36 pt-4 sm:px-6 sm:pb-12 lg:px-8">{children}</main>
      </body>
    </html>
  );
}
