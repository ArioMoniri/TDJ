/**
 * App Store screenshots: which screens, at which exact pixel sizes, with which caption per locale
 * (r22-apps-plan.md §8). Captured from the **bundled app UI** (ui/dist, the same files the app ships) served
 * locally with its API proxied to a TDJ server (store/serve.ts), so the pictures show the app as built.
 */

export type Platform = "mac" | "ipad";
export type Locale = "en-US" | "tr";

export interface Size {
  /** CSS viewport */
  width: number;
  height: number;
  /** device pixel ratio → exact upload size */
  scale: number;
  /** the size App Store Connect requires (checked by test/store.test.ts) */
  out: { width: number; height: number };
  touch: boolean;
}

// Apple "Screenshot specifications" (checked 2026-11-14): Mac 16:10 2880×1800 (or 2560×1600 / 1440×900 /
// 1280×800); iPad 13-inch 2752×2064 landscape (or 2064×2752 portrait, 2732×2048).
export const SIZES: Record<Platform, Size> = {
  mac: { width: 1440, height: 900, scale: 2, out: { width: 2880, height: 1800 }, touch: false },
  ipad: { width: 1376, height: 1032, scale: 2, out: { width: 2752, height: 2064 }, touch: true },
};

/** The app window shown inside the captioned frame: the capture is scaled into this box of the output. */
export const FRAME = { captionHeight: 0.2, inset: 0.06 } as const;

export interface Scene {
  id: string;
  /** route of the bundled UI */
  path: string;
  /** steps after load (selectors are tolerant: a missing control never fails the run, the shot is still taken) */
  steps?: Array<
    { click: string } | { press: string } | { scroll: string } | { wait: number } | { waitFor: string }
  >;
  dark?: boolean;
  caption: Record<Locale, string>;
}

export const SCENES: Scene[] = [
  {
    id: "01_compose",
    path: "/?featured=golden-double-peak",
    steps: [{ waitFor: "#result" }, { wait: 1500 }],
    caption: { "en-US": "A whole milonga in seconds", tr: "Bütün bir milonga, saniyeler içinde" },
  },
  {
    id: "02_tandas",
    path: "/?featured=golden-double-peak",
    steps: [{ waitFor: "#result" }, { scroll: "#tanda-3" }, { wait: 800 }],
    caption: { "en-US": "Tandas that belong together", tr: "Birbirine yakışan tandalar" },
  },
  {
    id: "03_booth",
    path: "/booth",
    dark: true,
    steps: [{ wait: 1500 }],
    caption: { "en-US": "Play the night from the booth", tr: "Geceyi kabinden çalın" },
  },
  {
    id: "04_database",
    path: "/database",
    steps: [{ wait: 1500 }],
    caption: { "en-US": "Your own tango database", tr: "Kendi tango veritabanınız" },
  },
  {
    id: "05_export",
    path: "/?featured=golden-double-peak",
    steps: [{ waitFor: "#result" }, { press: "ControlOrMeta+e" }, { wait: 1000 }],
    caption: { "en-US": "Send it to Spotify or your DJ app", tr: "Spotify'a ya da DJ uygulamanıza gönderin" },
  },
  {
    id: "06_settings",
    path: "/settings",
    steps: [{ wait: 1200 }],
    caption: { "en-US": "Connect in one tap", tr: "Tek dokunuşla bağlanın" },
  },
];

export const LOCALES: Locale[] = ["en-US", "tr"];
export const PLATFORMS: Platform[] = ["mac", "ipad"];

/** fastlane deliver layout: iPad sets in screenshots/<locale>, Mac sets in screenshots_mac/<locale>. */
export const outPath = (platform: Platform, locale: Locale, scene: string) =>
  `${platform === "mac" ? "screenshots_mac" : "screenshots"}/${locale}/${scene}_${platform}.jpg`;
