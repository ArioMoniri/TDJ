/**
 * The version this build of T-DJ is, where each platform gets the next one, and whether a newer one is out.
 * One version for the web, the Mac (DMG and Mac App Store) and iPhone/iPad: the root package.json, inlined at build
 * time by next.config.ts / the app's UI build (scripts/release/version.mjs → releaseEnv). docs/RELEASING.md.
 *
 * Never updates anything by itself: the web shows "Update available" and the DJ reloads when the night is over;
 * the apps point at the App Store, TestFlight or the DMG (whose own updater asks before it installs).
 */

export const VERSION = process.env.NEXT_PUBLIC_TDJ_VERSION || "0.0.0";
export const COMMIT = process.env.NEXT_PUBLIC_TDJ_COMMIT || "";
const REPO = process.env.NEXT_PUBLIC_TDJ_REPO || "ArioMoniri/TDJ";
const APP_STORE_ID = process.env.NEXT_PUBLIC_TDJ_APP_STORE_ID || "";

/** Where to get T-DJ. The App Store links work once App Review approves (`release.appStoreLive`). */
export const LINKS = {
  // no public instance: a deployment sets its own address (NEXT_PUBLIC_TDJ_WEB_URL); empty hides the link
  web: process.env.NEXT_PUBLIC_TDJ_WEB_URL || "",
  appStore: APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : "",
  macAppStore: APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}?platform=mac` : "",
  appStoreLive: process.env.NEXT_PUBLIC_TDJ_APP_STORE_LIVE === "1",
  testflight: process.env.NEXT_PUBLIC_TDJ_TESTFLIGHT_URL || "",
  dmg: `https://github.com/${REPO}/releases/latest/download/T-DJ-macOS.dmg`,
  releases: `https://github.com/${REPO}/releases`,
} as const;

/** How this copy of T-DJ was installed. */
export type Channel = "web" | "dmg" | "mac-app-store" | "ios";

export function channelOf(
  app: boolean,
  native?: { platform?: string; appStore?: boolean; updater?: boolean } | null,
): Channel {
  if (!app) return "web";
  if (native?.platform === "ipados" || native?.platform === "ios") return "ios";
  if (native?.platform === "macos") return native.appStore ? "mac-app-store" : "dmg";
  return "web";
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** -1, 0 or 1; null when either is not a version. A pre-release sorts before its release. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d > 0 ? 1 : -1;
  }
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  return pa[4] < pb[4] ? -1 : 1;
}

export interface Remote {
  version?: string;
  commit?: string;
}

/**
 * "newer": a higher version is out. "redeployed": same version, a later deploy of the web (another commit), so a
 * long-open tab runs old code. "current" otherwise (also for an older or unreadable answer: never nag backwards).
 */
export function updateState(
  remote: Remote | null | undefined,
  local: Remote = { version: VERSION, commit: COMMIT },
): "newer" | "redeployed" | "current" {
  if (!remote?.version || !local.version) return "current";
  const c = compareVersions(remote.version, local.version);
  if (c === 1) return "newer";
  if (c === 0 && remote.commit && local.commit && remote.commit !== local.commit) return "redeployed";
  return "current";
}

/** Where the next version comes from, per channel (null: the web just reloads). */
export function updateLink(channel: Channel): string | null {
  switch (channel) {
    case "web":
      return null;
    case "dmg":
      return LINKS.releases;
    case "mac-app-store":
      return LINKS.appStoreLive ? LINKS.macAppStore : LINKS.testflight || null;
    case "ios":
      return LINKS.appStoreLive ? LINKS.appStore : LINKS.testflight || null;
  }
}

/** "0.1.0 (95e7530)" */
export const versionLabel = (v = VERSION, c = COMMIT) => (c ? `${v} (${c.slice(0, 7)})` : v);
