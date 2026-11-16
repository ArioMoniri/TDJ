/**
 * Store creative v2: every App Store image and video T-DJ uploads, from one command (`pnpm store:creative`).
 * What is made, at which exact pixel sizes, with which words. Design notes: docs/design/store-assets.md.
 *
 *   capture devices  the bundled app UI at a device's own CSS size (capture.ts)
 *   screenshot sets  8 panels per display, one continuous panorama per set (compose.ts)
 *   header assets    the product page's Header and Search Results images (compose.ts → headers)
 *   app previews     15–30 s H.264 videos with a poster frame (preview.ts, Remotion: apps/video/src/StorePreview.tsx)
 */
import type { Step } from "../scenes";

export type Locale = "en-US" | "tr";
export const LOCALES: Locale[] = ["en-US", "tr"];

/* ------------------------------------------------------------------ capture devices */

export type CaptureId = "phone" | "tablet" | "mac" | "duoOuter" | "duoInner";

export interface CaptureDevice {
  /** CSS viewport and device pixel ratio */
  width: number;
  height: number;
  scale: number;
  /** what the Tauri mock reports (one iOS binary says "ipados") */
  native: "macos" | "ipados";
  touch: boolean;
  /** user agent family (phone/tablet), none on the Mac */
  ua?: "phone" | "tablet";
  /** safe-area insets in CSS px, emulated in the capture (Emulation.setSafeAreaInsetsOverride) */
  safe: { top: number; bottom: number; left: number; right: number };
}

/**
 * iPhone Duo (2026-10, iOS 27.1): Apple's screenshot sizes are 1398 × 2034 (outer display) and 2007 × 2853 (inner
 * display, or 2853 × 2007 open like a book). Apple publishes no point sizes; both are taken at 3x (466 × 678 pt
 * folded, 951 × 669 pt open), which multiplies to the exact upload sizes. Open, the fold runs down the middle of the
 * inner display, so the inner set is landscape (the book pose; the inner display ignores supported orientations). Built with the 27.1 SDK the app runs edge to edge: the outer display keeps a camera region
 * at the top, the inner display moves the status bar into a vertical bar on the trailing edge (insets "on opposite
 * sides are not equal"). The insets here are estimates until Device Hub's iPhone Duo simulator confirms them
 * (docs/RELEASING.md → iPhone Duo).
 */
export const CAPTURE: Record<CaptureId, CaptureDevice> = {
  phone: {
    width: 440,
    height: 956,
    scale: 3,
    native: "ipados",
    touch: true,
    ua: "phone",
    safe: { top: 62, bottom: 34, left: 0, right: 0 },
  },
  tablet: {
    width: 1032,
    height: 1376,
    scale: 2,
    native: "ipados",
    touch: true,
    ua: "tablet",
    safe: { top: 24, bottom: 20, left: 0, right: 0 },
  },
  mac: {
    width: 1440,
    height: 900,
    scale: 2,
    native: "macos",
    touch: false,
    safe: { top: 0, bottom: 0, left: 0, right: 0 },
  },
  duoOuter: {
    width: 466,
    height: 678,
    scale: 3,
    native: "ipados",
    touch: true,
    ua: "phone",
    safe: { top: 44, bottom: 20, left: 0, right: 0 },
  },
  duoInner: {
    width: 951,
    height: 669,
    scale: 3,
    native: "ipados",
    touch: true,
    ua: "tablet",
    safe: { top: 0, bottom: 20, left: 0, right: 28 },
  },
};

/* ------------------------------------------------------------------ screenshot sets */

export type SetId =
  | "iphone69"
  | "iphone65"
  | "ipad13"
  | "ipad129"
  | "mac"
  | "mac2560"
  | "duoOuter"
  | "duoInner";

export type Frame = "phone" | "tablet" | "laptop" | "duoOuter" | "duoInner";

export interface ShotSet {
  label: string;
  /** exact App Store Connect size */
  out: { width: number; height: number };
  capture: CaptureId;
  frame: Frame;
  /** where fastlane deliver reads it (relative to apps/desktop/fastlane); null: uploaded by hand (docs/RELEASING.md) */
  dir: string;
  /** deliver can upload this set (it knows the display type from the size) */
  deliver: boolean;
}

// Apple "Screenshot specifications" (checked 2026-11-16). One App Store Connect slot takes up to ten images, so the
// fallback sizes of a slot (6.5", 12.9", Mac 2560) live in their own folders and go up only on request.
export const SETS: Record<SetId, ShotSet> = {
  iphone69: {
    label: 'iPhone 6.9"',
    out: { width: 1320, height: 2868 },
    capture: "phone",
    frame: "phone",
    dir: "screenshots",
    deliver: true,
  },
  iphone65: {
    label: 'iPhone 6.5"',
    out: { width: 1284, height: 2778 },
    capture: "phone",
    frame: "phone",
    dir: "screenshots",
    deliver: true,
  },
  ipad13: {
    label: 'iPad 13"',
    out: { width: 2064, height: 2752 },
    capture: "tablet",
    frame: "tablet",
    dir: "screenshots",
    deliver: true,
  },
  ipad129: {
    label: 'iPad 12.9"',
    out: { width: 2048, height: 2732 },
    capture: "tablet",
    frame: "tablet",
    dir: "screenshots_ipad129",
    deliver: true,
  },
  mac: {
    label: "Mac 2880",
    out: { width: 2880, height: 1800 },
    capture: "mac",
    frame: "laptop",
    dir: "screenshots_mac",
    deliver: true,
  },
  mac2560: {
    label: "Mac 2560",
    out: { width: 2560, height: 1600 },
    capture: "mac",
    frame: "laptop",
    dir: "screenshots_mac2560",
    deliver: true,
  },
  duoOuter: {
    label: "iPhone Duo, outer",
    out: { width: 1398, height: 2034 },
    capture: "duoOuter",
    frame: "duoOuter",
    dir: "screenshots_duo",
    deliver: false,
  },
  duoInner: {
    label: "iPhone Duo, inner",
    out: { width: 2853, height: 2007 },
    capture: "duoInner",
    frame: "duoInner",
    dir: "screenshots_duo",
    deliver: false,
  },
};
export const SET_IDS = Object.keys(SETS) as SetId[];

/* ------------------------------------------------------------------ shots (raw captures) */

export interface Shot {
  id: string;
  path: string;
  steps?: Step[];
  stepsFor?: Partial<Record<CaptureId, Step[]>>;
  dark?: boolean;
  /** a full-page capture too (the previews pan down it) */
  full?: boolean;
  /** two DJs in one room: the capture runs a linked TDJ server in memory (rooms.ts) */
  room?: "host" | "guest";
}

const T = (id: string) => `[data-testid="${id}"]`;
const featured: Step[] = [{ waitFor: "#result" }, { wait: 1500 }];
const booth: Step[] = [
  ...featured,
  { click: T("play-the-night") },
  { waitFor: T("booth-now-title") },
  { waitFor: `${T("booth-ttc")}:not([data-resolving="1"])`, optional: true },
  { wait: 1000 },
];
const foldSidebar: Step = { click: T("sidebar-hide"), optional: true };
const playing: Step[] = [
  ...booth,
  foldSidebar,
  { click: T("booth-start") },
  { waitFor: T("booth-pause"), optional: true },
  { wait: 2500 },
];

export const SHOTS: Shot[] = [
  {
    id: "compose",
    path: "/?featured=golden-double-peak",
    steps: [...featured, { scroll: "#result", block: "start" }, { scrollBy: -40 }, { wait: 3000 }],
    full: true,
  },
  { id: "booth", path: "/?featured=golden-double-peak", dark: true, steps: playing },
  {
    id: "transition",
    path: "/?featured=golden-double-peak",
    dark: true,
    steps: [
      ...booth,
      foldSidebar,
      { click: T("booth-set-open"), optional: true },
      { wait: 800 },
      { scroll: `${T("booth-gap")} >> nth=3`, block: "center" },
      { click: `${T("booth-gap")} >> nth=3` },
      { waitFor: T("booth-transition-sheet") },
      { click: `${T("booth-transition-sheet")} ${T("booth-tr-preset-fade")}` },
      { wait: 1500 },
    ],
  },
  {
    id: "build",
    path: "/build",
    steps: [
      { waitFor: T("build-guide") },
      { wait: 1500 },
      { click: T("build-fix") },
      { wait: 2500 },
      { click: `${T("rule-sheet")} ${T("rule-as-said")}`, optional: true },
      { scrollTop: true },
      { wait: 1500 },
    ],
  },
  {
    id: "dna",
    path: "/library",
    steps: [
      { wait: 1500 },
      { fill: "#library-search", text: "malena demare" },
      { wait: 1800 },
      { blur: true },
      { click: `${T("library-row")} ${T("song-info")}` },
      { waitFor: T("song-details-sheet") },
      { click: T("song-dna-link") },
      { waitFor: T("dna-title") },
      { wait: 1500 },
      { scrollTop: true },
      { wait: 1000 },
    ],
  },
  {
    id: "song",
    path: "/library",
    steps: [
      { wait: 1500 },
      { fill: "#library-search", text: "malena demare" },
      { wait: 1800 },
      { blur: true },
      { click: `${T("library-row")} ${T("song-info")}` },
      { waitFor: T("song-details-sheet") },
      { wait: 2500 },
    ],
  },
  {
    id: "nowplaying",
    path: "/?featured=golden-double-peak",
    dark: true,
    steps: [...playing, { click: T("booth-now-full") }, { waitFor: T("now-view") }, { wait: 2500 }],
  },
  { id: "rooms", path: "/rooms", room: "host" },
  { id: "rooms-guest", path: "/rooms", room: "guest" },
  {
    // the dancers' Floor screen (roadmap 2026-11-16); until it ships, the Booth's full-screen Now playing, which is
    // what a second display shows the floor today
    id: "floor",
    path: "/?featured=golden-double-peak",
    dark: true,
    steps: [
      ...playing,
      { click: T("booth-floor-open"), optional: true },
      { waitFor: T("floor-screen"), optional: true },
      { click: T("booth-now-full"), optional: true },
      { wait: 2500 },
    ],
  },
  {
    id: "library",
    path: "/library",
    steps: [{ wait: 2500 }],
  },
  { id: "import", path: "/import", steps: [{ wait: 2500 }] },
];

/* ------------------------------------------------------------------ panels */

/** A headline: two lines (`\n`), one bold word (`*word*`), ≤ 30 characters without the marks. */
export type Headline = Record<Locale, string>;

export interface Panel {
  id: string;
  shot: string;
  /** a second device that crosses into the next panel (Agenda-style overlap) */
  bridge?: string;
  headline: Headline;
}

export const PANELS: Panel[] = [
  {
    id: "01_compose",
    shot: "compose",
    headline: { "en-US": "Compose a *milonga*\nin one tap", tr: "Tek dokunuşla\nbir *milonga*" },
  },
  {
    id: "02_booth",
    shot: "booth",
    bridge: "nowplaying",
    headline: { "en-US": "Play the night\nfrom the *Booth*", tr: "Geceyi\n*Kabin*'den çalın" },
  },
  {
    id: "03_transition",
    shot: "transition",
    headline: { "en-US": "*Transitions*\nyou can hear", tr: "Duyabildiğiniz\n*geçişler*" },
  },
  {
    id: "04_build",
    shot: "build",
    bridge: "song",
    headline: { "en-US": "Build by hand\nwith a *checklist*", tr: "Elle kurun,\n*liste* yanınızda" },
  },
  {
    id: "05_dna",
    shot: "dna",
    headline: { "en-US": "Each song's *DNA*\nand its lyrics", tr: "Her şarkının\n*DNA*'sı ve sözleri" },
  },
  {
    id: "06_rooms",
    shot: "rooms",
    bridge: "rooms-guest",
    headline: { "en-US": "Two DJs,\none *room*", tr: "İki DJ,\ntek *oda*" },
  },
  {
    id: "07_floor",
    shot: "floor",
    headline: { "en-US": "A *Floor* screen\nfor the dancers", tr: "Dansçılar için\n*Pist* ekranı" },
  },
  {
    id: "08_library",
    shot: "library",
    bridge: "import",
    headline: {
      "en-US": "Your *library*,\nSpotify, files",
      tr: "*Kütüphane*,\nSpotify ve dosyalar",
    },
  },
];

/** the headline without its marks, line by line */
export const plain = (h: string) => h.replace(/\*/g, "");
export const lines = (h: string) => h.split("\n");

/** Words the store copy never uses (docs/design/store-assets.md → Copy rules). */
export const HYPE =
  /\b(seamless(ly)?|elevate|unleash|powerful|effortless(ly)?|revolutionary|ultimate|magic(al)?|AI-powered|best)\b|!/i;

/* ------------------------------------------------------------------ header assets (product page) */

export interface HeaderSpec {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Apple's art safe area: key elements (logo, words) stay inside it */
  safe: { x: number; y: number; width: number; height: number };
  format: "png" | "jpg";
}

// App Store Connect Help → Creative assets specifications → Product page header and search results (2026-11-16).
export const HEADERS: HeaderSpec[] = [
  {
    id: "header-21x9",
    label: "Product page header 21:9",
    width: 3840,
    height: 1646,
    safe: { x: 1097, y: 493, width: 1646, height: 661 },
    format: "png",
  },
  {
    id: "universal-16x9",
    label: "Universal (header and search results) 16:9",
    width: 5244,
    height: 2950,
    safe: { x: 1921, y: 660, width: 1402, height: 962 },
    format: "png",
  },
];

export const HEADER_COPY: Record<Locale, string> = {
  "en-US": "A *milonga*,\nthe way a tango DJ builds it",
  tr: "Bir tango DJ'inin\nkurduğu gibi bir *milonga*",
};

/* ------------------------------------------------------------------ app previews */

export interface PreviewSpec {
  id: "iphone" | "ipad" | "mac";
  width: number;
  height: number;
  capture: CaptureId;
  /** fastlane deliver's device name in the file name (app_previews/<locale>/…) */
  deliverType: string;
  label: string;
}

// App preview specifications: 15–30 s, ≤ 30 fps, H.264 10–12 Mbps High ≤ 4.0, stereo AAC 256 kbps 44.1/48 kHz.
// iPhone 6.9" and 6.5" both take 886 × 1920 (each slot falls back to the other); iPhone Duo uses the same file.
export const PREVIEWS: PreviewSpec[] = [
  { id: "iphone", width: 886, height: 1920, capture: "phone", deliverType: "IPHONE_67", label: "iPhone" },
  {
    id: "ipad",
    width: 1200,
    height: 1600,
    capture: "tablet",
    deliverType: "IPAD_PRO_3GEN_129",
    label: "iPad",
  },
  { id: "mac", width: 1920, height: 1080, capture: "mac", deliverType: "DESKTOP", label: "Mac" },
];
export const PREVIEW_FPS = 30;
export const PREVIEW_SECONDS = { min: 15, max: 30 } as const;
/** the poster frame (fastlane: preview_frame_time_code, hh:mm:ss:cc) */
export const POSTER_SECONDS = 5;

/** the preview's chapters: shot, words (≤ 32 characters), seconds */
export const PREVIEW_CHAPTERS: Array<{ shot: string; words: Headline; seconds: number }> = [
  { shot: "compose", words: { "en-US": "Compose a *milonga*", tr: "Bir *milonga* kurun" }, seconds: 4 },
  { shot: "booth", words: { "en-US": "Play it from the *Booth*", tr: "*Kabin*'den çalın" }, seconds: 3.5 },
  {
    shot: "transition",
    words: { "en-US": "Shape every *transition*", tr: "Her *geçiş* sizin" },
    seconds: 3.5,
  },
  { shot: "build", words: { "en-US": "Or build it *by hand*", tr: "Ya da *elle* kurun" }, seconds: 3 },
  { shot: "dna", words: { "en-US": "Every song's *DNA*", tr: "Her şarkının *DNA*'sı" }, seconds: 3 },
  { shot: "rooms", words: { "en-US": "Two DJs, one *room*", tr: "İki DJ, tek *oda*" }, seconds: 3 },
];

/* ------------------------------------------------------------------ output paths */

export const shotFile = (set: SetId, locale: Locale, panel: string) =>
  `${SETS[set].dir}/${locale}/${panel}_${set}.jpg`;
export const headerFile = (h: HeaderSpec, locale: Locale) => `product_page/${locale}/${h.id}.${h.format}`;
/** fastlane deliver infers the preview's device from the file name (Spaceship AppPreviewSet.preview_type_from_filename:
 * the first type name the upper-cased name contains); the Mac lane reads its own folder */
export const previewDir = (p: PreviewSpec) => (p.id === "mac" ? "app_previews_mac" : "app_previews");
export const previewFile = (p: PreviewSpec, locale: Locale) =>
  `${previewDir(p)}/${locale}/${p.deliverType}_tdj.mp4`;
export const posterFile = (p: PreviewSpec, locale: Locale) =>
  `app_previews_posters/${locale}/${p.deliverType}_tdj.jpg`;
