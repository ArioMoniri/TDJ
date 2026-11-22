import { t } from "@/lib/i18n";

/**
 * "Use my own Spotify app" (2026-02: Spotify's Development Mode admits 5 listed users, and Extended Quota needs an
 * organisation with 250k+ monthly users), so any DJ can sign in with a free Spotify app of their own. PKCE only:
 * a Client ID is public and no client secret is ever asked for. The steps are the ones in docs/CONNECTORS.md.
 */
export const SPOTIFY_DASHBOARD = "https://developer.spotify.com/dashboard";
export const APP_REDIRECT = "tdj://spotify-callback";
/** the apps' bundle ID (root package.json release.bundleId, set at build time; empty in a build without apps) */
export const BUNDLE_ID = process.env.NEXT_PUBLIC_TDJ_BUNDLE_ID ?? "";

/** The redirect URIs a DJ adds: the apps' deep link, or this browser's PKCE page (and a server's hosted login). */
export function ownAppRedirects(o: { app: boolean; origin?: string }): { uris: string[]; server?: string } {
  if (o.app) return { uris: [APP_REDIRECT] };
  const origin = (o.origin ?? "").replace(/\/$/, "");
  return { uris: [`${origin}/callback`], server: `${origin}/api/spotify/callback` };
}

/** The steps at developer.spotify.com/dashboard, in order, as Settings lists them. */
export function ownAppSteps(o: { app: boolean; origin?: string }): string[] {
  const r = ownAppRedirects(o);
  return [
    t("spotify_own.step_create"),
    t("spotify_own.step_redirect", { uris: r.uris.join(", ") }),
    ...(o.app && BUNDLE_ID ? [t("spotify_own.step_bundle", { bundle: BUNDLE_ID })] : []),
    t("spotify_own.step_apis"),
    t("spotify_own.step_users"),
    t("spotify_own.step_copy"),
  ];
}

/** A Spotify Client ID: 32 hexadecimal characters today (letters and digits, at most 64; src-tauri spotify.rs). */
export const isSpotifyClientId = (s: string) => /^[A-Za-z0-9]{1,64}$/.test(s.trim());
