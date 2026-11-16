/**
 * App Store screenshots: which screens, at which exact pixel sizes, with which headline per locale.
 * Captured from the **bundled app UI** (ui/dist, the files the app ships) with the native side mocked
 * (store/tauri-mock.ts), so the pictures show the app as built. One command: `pnpm store:shots` (docs/RELEASING.md).
 * Design notes and references: docs/design/store-assets.md.
 */

export type Device = "iphone69" | "iphone65" | "ipad13" | "ipad129" | "mac";
/** kept for older imports: the platform a device belongs to */
export type Platform = Device;
export type Locale = "en-US" | "tr";

export interface Size {
  /** CSS viewport */
  width: number;
  height: number;
  /** device pixel ratio of the capture */
  scale: number;
  /** the size App Store Connect takes for this display (checked by test/pipeline.test.ts) */
  out: { width: number; height: number };
  /** what the Tauri mock reports (src-tauri/src/commands.rs → platform(): one iOS binary says "ipados") */
  native: "macos" | "ipados";
  /** the frame drawn around the capture in compose.ts */
  kind: "phone" | "tablet" | "mac";
  label: string;
  /** the device's safe-area insets in CSS px (status bar + Dynamic Island, home indicator): emulated in the capture
   * (the page lays out under them with env(safe-area-inset-*)), drawn back as a status bar in compose.ts */
  safe: { top: number; bottom: number };
}

// Apple "Screenshot specifications" (checked 2026-11-16): iPhone 6.9" 1320×2868 portrait (required; 6.5" 1284×2778
// is the fallback slot), iPad 13" 2064×2752 portrait (2048×2732 is the 12.9" size of the same slot), Mac 16:10
// 2880×1800. The capture is taken at the device's own CSS size and drawn into the frame at full output resolution.
export const SIZES: Record<Device, Size> = {
  iphone69: {
    width: 440,
    height: 956,
    scale: 3,
    out: { width: 1320, height: 2868 },
    native: "ipados",
    kind: "phone",
    label: 'iPhone 6.9"',
    safe: { top: 62, bottom: 34 },
  },
  iphone65: {
    width: 428,
    height: 926,
    scale: 3,
    out: { width: 1284, height: 2778 },
    native: "ipados",
    kind: "phone",
    label: 'iPhone 6.5"',
    safe: { top: 47, bottom: 34 },
  },
  ipad13: {
    width: 1032,
    height: 1376,
    scale: 2,
    out: { width: 2064, height: 2752 },
    native: "ipados",
    kind: "tablet",
    label: 'iPad 13"',
    safe: { top: 24, bottom: 20 },
  },
  ipad129: {
    width: 1024,
    height: 1366,
    scale: 2,
    out: { width: 2048, height: 2732 },
    native: "ipados",
    kind: "tablet",
    label: 'iPad 12.9"',
    safe: { top: 24, bottom: 20 },
  },
  mac: {
    width: 1440,
    height: 900,
    scale: 2,
    out: { width: 2880, height: 1800 },
    native: "macos",
    kind: "mac",
    label: "Mac",
    safe: { top: 0, bottom: 0 },
  },
};

export type Step =
  | { click: string; optional?: boolean }
  /** a DOM click (el.click()), for a control in a sheet that is still settling */
  | { tap: string }
  | { press: string }
  | { scroll: string; block?: "start" | "center" }
  | { scrollTop: true }
  | { scrollBy: number }
  | { wait: number }
  | { waitFor: string; optional?: boolean }
  | { fill: string; text: string }
  | { blur: true };

export interface Scene {
  id: string;
  /** route of the bundled UI */
  path: string;
  /** steps after load (a missing control never fails the run: the shot is still taken, the log says what was skipped) */
  steps?: Step[];
  /** devices this scene is not taken on (their layout hides what it shows) */
  skip?: Device[];
  /** device-specific steps replacing `steps` */
  stepsFor?: Partial<Record<Device, Step[]>>;
  dark?: boolean;
  /** headline (≤ 34 characters: two lines at thumbnail size) and a short line under it (≤ 64) */
  caption: Record<Locale, { title: string; sub: string }>;
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

export const SCENES: Scene[] = [
  {
    id: "01_compose",
    path: "/?featured=golden-double-peak",
    steps: [...featured, { scroll: "#result", block: "start" }, { wait: 3500 }],
    caption: {
      "en-US": {
        title: "A whole milonga, tanda by tanda",
        sub: "Cortinas that fit the next tanda, and an arc with room to breathe",
      },
      tr: {
        title: "Bütün bir milonga, tanda tanda",
        sub: "Sonraki tandaya uyan kortinalar, nefes alan bir enerji eğrisi",
      },
    },
  },
  {
    id: "02_booth",
    path: "/?featured=golden-double-peak",
    dark: true,
    steps: [
      ...booth,
      foldSidebar,
      { click: T("booth-start") },
      { waitFor: T("booth-pause"), optional: true },
      { wait: 2500 },
    ],
    caption: {
      "en-US": {
        title: "Play the night from the Booth",
        sub: "Your own files or Spotify Connect, with real gaps between songs",
      },
      tr: {
        title: "Geceyi Kabin'den çalın",
        sub: "Kendi dosyalarınızla ya da Spotify Connect ile, gerçek boşluklarla",
      },
    },
  },
  {
    id: "03_transition",
    path: "/?featured=golden-double-peak",
    dark: true,
    steps: [
      ...booth,
      foldSidebar,
      // a phone keeps the set list in a sheet
      { click: T("booth-set-open"), optional: true },
      { wait: 800 },
      { scroll: `${T("booth-gap")} >> nth=3`, block: "center" },
      { click: `${T("booth-gap")} >> nth=3` },
      { waitFor: T("booth-transition-sheet") },
      { click: `${T("booth-transition-sheet")} ${T("booth-tr-preset-fade")}` },
      { wait: 1200 },
    ],
    caption: {
      "en-US": {
        title: "Every gap, the way you want it",
        sub: "A gap that measures the silence, or a fade, set per pair of songs",
      },
      tr: {
        title: "Her geçiş istediğiniz gibi",
        sub: "Sessizliği ölçen bir boşluk ya da fade, her şarkı çifti için ayrı",
      },
    },
  },
  {
    id: "04_build",
    path: "/build",
    steps: [
      { waitFor: T("build-guide") },
      { wait: 1500 },
      // the checklist's first one-tap fix, "Fill the rest": the night fills up and every check shows its state
      { click: T("build-fix") },
      { wait: 2500 },
      { click: `${T("rule-sheet")} ${T("rule-as-said")}`, optional: true },
      { scrollTop: true },
      { wait: 1500 },
    ],
    caption: {
      "en-US": {
        title: "Or build it by hand",
        sub: "A checklist beside your night, and tandas suggested for the next slot",
      },
      tr: {
        title: "Ya da geceyi kendiniz kurun",
        sub: "Yanınızda bir kontrol listesi, sıradaki yer için önerilen tandalar",
      },
    },
  },
  {
    id: "05_search",
    path: "/library",
    steps: [
      { wait: 1500 },
      { fill: "#library-search", text: "ventaron" },
      { waitFor: T("library-corrected"), optional: true },
      { wait: 1500 },
      { blur: true },
    ],
    caption: {
      "en-US": {
        title: "Type it wrong, still find it",
        sub: '"ventaron" finds Ventarrón, "di sarli 1941" finds the year',
      },
      tr: {
        title: "Yanlış yazsanız da bulur",
        sub: '"ventaron" yazınca Ventarrón, "di sarli 1941" yazınca o yıl gelir',
      },
    },
  },
  {
    id: "06_orchestras",
    path: "/database",
    steps: [
      { wait: 1500 },
      { click: "role=radio[name=/^(Orchestras|Orkestralar)$/]", optional: true },
      { wait: 1500 },
    ],
    caption: {
      "en-US": {
        title: "Your own tango database",
        sub: "Edit any recording or orchestra, and your nights follow",
      },
      tr: {
        title: "Size ait bir tango veritabanı",
        sub: "Her kaydı ve orkestrayı düzenleyin, geceleriniz buna uyar",
      },
    },
  },
  {
    id: "07_learning",
    path: "/settings",
    steps: [
      { wait: 1500 },
      { scroll: T("featured-learned"), block: "start" },
      { scrollBy: -110 },
      { wait: 1000 },
    ],
    caption: {
      "en-US": {
        title: "It learns what fills your floor",
        sub: "Floor reactions and dancer hearts count, and you set how much",
      },
      tr: {
        title: "Pistin sevdiğini öğrenir",
        sub: "Pist tepkileri ve dansçı beğenileri sayılır, ağırlığı siz seçersiniz",
      },
    },
  },
];

export const LOCALES: Locale[] = ["en-US", "tr"];
export const DEVICES: Device[] = ["iphone69", "iphone65", "ipad13", "ipad129", "mac"];
/** kept for older imports */
export const PLATFORMS = DEVICES;

/**
 * fastlane deliver layout. `screenshots/<locale>/` is uploaded for iOS (deliver tells the slot from the size:
 * 6.9", 6.5", iPad 13"), `screenshots_mac/<locale>/` for macOS. The 12.9" set shares the iPad 13" slot in App Store
 * Connect (ten images at most per slot), so it is kept beside them in `screenshots_ipad129/` and uploaded only with
 * `fastlane ios metadata ipad:129` (docs/RELEASING.md).
 */
export const outDir = (device: Device) =>
  device === "mac" ? "screenshots_mac" : device === "ipad129" ? "screenshots_ipad129" : "screenshots";

export const outPath = (device: Device, locale: Locale, scene: string) =>
  `${outDir(device)}/${locale}/${scene}_${device}.jpg`;

export const scenesFor = (device: Device) => SCENES.filter((s) => !s.skip?.includes(device));
