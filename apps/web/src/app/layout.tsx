import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Boot } from "@/components/Boot";
import { GlobalToast } from "@/components/GlobalToast";
import { IconSprite } from "@/components/Icons";
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
  // per page: "Compose · TDJ", "History · TDJ"… (round8-qa.md B17); route layouts set the page part
  title: { default: "Compose · TDJ", template: "%s · TDJ" },
  applicationName: "TDJ — Tango DJ playlist composer",
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
  // round 23: never zoom out past the layout width (a zoom-out showed the web view's black beyond the page);
  // zooming in stays available
  minimumScale: 1,
  viewportFit: "cover",
};

/* Applies the saved theme / reduce-transparency choice before first paint so there is no flash; then the macOS
   window's title bar (the app draws under it) and the sidebar's saved width / collapsed state. */
const themeScript = `try{var s=JSON.parse(localStorage.getItem("tdj-v1")).state.settings;var e=document.documentElement;if(s.theme&&s.theme!=="auto")e.dataset.theme=s.theme;if(s.theme==="dark")e.classList.add("dark");if(s.reduceGlass)e.classList.add("reduce-glass")}catch(_){}try{var n=window.__TDJ_NATIVE__;if(n&&n.titleBar==="overlay")document.documentElement.classList.add("titlebar-overlay")}catch(_){}try{var b=JSON.parse(localStorage.getItem("tdj-sidebar"));var r=document.documentElement;if(b.collapsed)r.dataset.sidebar="collapsed";if(b.w>=200&&b.w<=360)r.style.setProperty("--sidebar-open-w",b.w+"px")}catch(_){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable}`}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: constant string defined above, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <div className="ambient" aria-hidden />
        <IconSprite />
        <ThemeSync />
        <Boot />
        <ToolbarProvider>
          <Nav />
          <div className="scroll-edge-bottom sm:hidden" aria-hidden />
          <main className="mx-auto w-full max-w-[720px] px-4 pb-[calc(env(safe-area-inset-bottom)+150px)] pt-2 sm:px-6 sm:pb-16 lg:mx-0 lg:ml-[var(--sidebar-w)] lg:w-auto lg:max-w-none lg:px-8 lg:pt-0">
            <div className="lg:mx-auto lg:max-w-[var(--col-max,1320px)]">
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
