"use client";

/**
 * Links that leave T-DJ (a Spotify track, a YouTube playlist, an Apple Music album, TuneMyMusic…) open in the
 * service's own app when it is installed, else on its web page — never inside T-DJ's own view.
 *
 * - Web: always the https link. iOS and iPadOS hand open.spotify.com, www.youtube.com, music.youtube.com and
 *   music.apple.com to the Spotify / YouTube / YouTube Music / Music app (universal links); macOS browsers show the
 *   page, which offers its own "Open in the app".
 * - The apps (Tauri): the native opener (`open_external`, src-tauri/src/commands.rs). On iOS / iPadOS the system
 *   resolves the universal link the same way; on macOS the Rust side tries the service's app scheme first
 *   (`spotify:track:…`, `music://…`) and falls back to the browser (src-tauri/src/links.rs `app_url`).
 */

/** The services a link may belong to (for labels and tests). */
export type LinkService = "spotify" | "youtube" | "youtube-music" | "apple-music" | "deezer" | "other";

export function linkService(url: string): LinkService {
  let host = "";
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return "other";
  }
  if (host === "open.spotify.com" || url.startsWith("spotify:")) return "spotify";
  if (host === "music.youtube.com") return "youtube-music";
  if (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be")
    return "youtube";
  if (host === "music.apple.com") return "apple-music";
  if (host === "www.deezer.com" || host === "deezer.com" || host === "deezer.page.link") return "deezer";
  return "other";
}

/** a Spotify URI (`spotify:track:…`, `spotify:playlist:…`) as the universal link iOS hands to the app */
export function spotifyWebUrl(uriOrUrl: string): string | null {
  const t = uriOrUrl.trim();
  const m = t.match(/^spotify:(track|playlist|album|artist|episode|show):([A-Za-z0-9]{10,40})$/);
  if (m) return `https://open.spotify.com/${m[1]}/${m[2]}`;
  return /^https:\/\/open\.spotify\.com\//.test(t) ? t : null;
}
export const youtubeVideoUrl = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
export const youtubeMusicVideoUrl = (id: string) =>
  `https://music.youtube.com/watch?v=${encodeURIComponent(id)}`;
export const youtubePlaylistUrl = (id: string) =>
  `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
export const youtubeMusicPlaylistUrl = (id: string) =>
  `https://music.youtube.com/playlist?list=${encodeURIComponent(id)}`;

/** a YouTube playlist link → the same playlist on YouTube Music (null for anything else) */
export function youtubeMusicFor(url: string): string | null {
  try {
    const u = new URL(url);
    if (linkService(url) !== "youtube") return null;
    const list = u.searchParams.get("list");
    if (list) return youtubeMusicPlaylistUrl(list);
    const v = u.searchParams.get("v");
    return v ? youtubeMusicVideoUrl(v) : null;
  } catch {
    return null;
  }
}

/** A link opens outside T-DJ only when it is https, mailto or a music app's own scheme (the app's rule too). */
export function isExternalLink(url: string): boolean {
  return /^(https:|mailto:|spotify:|music:|musics:|youtube:|youtubemusic:)/i.test(url.trim());
}

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
interface Env {
  invoke?: Invoke;
  open?: (url: string, target: string, features: string) => unknown;
}
function env(): Env {
  if (typeof window === "undefined") return {};
  const t = (window as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__;
  return { invoke: t?.invoke, open: window.open.bind(window) };
}

/**
 * Open `url` outside T-DJ (see the module comment). `fallback`: where to go when the app scheme has no app (the
 * apps) — e.g. "Open Spotify" tries `spotify:` and falls back to open.spotify.com. Resolves true when it was handed
 * off.
 */
export async function openExternal(url: string, o: { fallback?: string } & Env = {}): Promise<boolean> {
  const e = { ...env(), ...o };
  if (!isExternalLink(url)) return false;
  if (e.invoke) {
    try {
      await e.invoke("open_external", { url });
      return true;
    } catch {
      if (!o.fallback) return false;
      return e.invoke("open_external", { url: o.fallback }).then(
        () => true,
        () => false,
      );
    }
  }
  // a browser: a music app's own scheme only where the system has the app (a phone); else its web page
  const target = /^https:|^mailto:/i.test(url) ? url : (o.fallback ?? url);
  if (/^https:/i.test(target)) e.open?.(target, "_blank", "noopener,noreferrer");
  else if (typeof window !== "undefined") window.location.href = target;
  return true;
}
