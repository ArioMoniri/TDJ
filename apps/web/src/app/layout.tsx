import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Boot } from "@/components/Boot";
import { GlobalToast } from "@/components/GlobalToast";
import { MiniPlayer } from "@/components/MiniPlayer";
import { Motion } from "@/components/Motion";
import { Nav } from "@/components/Nav";
import { ToolbarProvider } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { ThemeSync } from "@/components/ThemeSync";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-loaded", display: "swap" });
const serif = Fraunces({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-serif-loaded",
  display: "swap",
});

/**
 * Every page renders on the server per request: the prerendered RSC payloads (`?_rsc=` prefetches) were 404 on the
 * CloudFront deployment because the static route cache was not served from the function; a dynamic app answers
 * them from the same Lambda that serves the HTML and the API.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TDJ — Tango DJ playlist composer",
  description:
    "Compose milonga sets: tandas, cortinas and a night-long energy arc from a 21,000-recording golden-age index. Export to Spotify, Rekordbox, Traktor, M3U.",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TDJ", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2efe9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a10" },
  ],
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
        <Boot />
        <ToolbarProvider>
          <Nav />
          <div className="scroll-edge-top sm:hidden" aria-hidden />
          <div className="scroll-edge-bottom sm:hidden" aria-hidden />
          <main className="mx-auto w-full max-w-[720px] px-4 pb-[calc(env(safe-area-inset-bottom)+150px)] pt-2 sm:px-6 sm:pb-16 lg:mx-0 lg:ml-[220px] lg:max-w-none lg:px-8">
            <div className="lg:mx-auto lg:max-w-[980px]">
              <Motion>
                <PageTransition>{children}</PageTransition>
              </Motion>
            </div>
          </main>
          <MiniPlayer />
          <GlobalToast />
        </ToolbarProvider>
      </body>
    </html>
  );
}
