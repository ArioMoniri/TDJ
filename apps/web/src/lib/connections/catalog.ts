/**
 * 2026-11 — every music service T-DJ talks to, in one table: what it is for, what it needs, where its credentials
 * come from and what a DJ or a self-deployer can bring of their own. Settings → Connections (components/
 * Connections.tsx) reads it, and docs/CONNECTORS.md says the same in prose. Nothing here is secret: the env names
 * are the ones sst.config.ts forwards and lib/server/config.ts reads.
 */
export type ConnectionId =
  | "spotify"
  | "youtube"
  | "google_drive"
  | "dropbox"
  | "deezer"
  | "musicbrainz"
  | "lrclib"
  | "apple_music";

/**
 * What a DJ may bring of their own, and where:
 * - `client_id`: a public OAuth client (PKCE, no secret) — Spotify on web and apps; Google Drive in the apps only
 *   (Google's web clients always need a secret, so the web uses the server's);
 * - `app_key`: Dropbox's public app key (PKCE, no secret), web and apps;
 * - `api_key`: a YouTube Data API key, used from this browser or app straight to Google.
 */
export type ByoKind = "client_id" | "app_key" | "api_key";

export interface ConnectionInfo {
  id: ConnectionId;
  /** the brand name, the same in every language */
  label: string;
  color: string;
  /** what the service needs before it works at all */
  needs: "nothing" | "login" | "login_or_key" | "developer";
  byo: ByoKind | null;
  /** where bring-your-own works */
  byoOn: "web_and_apps" | "apps" | null;
  /** the deployment's environment / Parameter Store names (sst.config.ts, lib/server/config.ts) */
  serverKeys: readonly string[];
  /** the provider's developer console */
  console: string | null;
  /** the section of docs/CONNECTORS.md */
  docs: string;
}

export const DOCS_URL = "https://github.com/ArioMoniri/TDJ/blob/main/docs/CONNECTORS.md";
export const docsLink = (anchor: string) => `${DOCS_URL}#${anchor}`;

export const CONNECTIONS: readonly ConnectionInfo[] = [
  {
    id: "spotify",
    label: "Spotify",
    color: "#1db954",
    needs: "login",
    byo: "client_id",
    byoOn: "web_and_apps",
    serverKeys: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
    console: "https://developer.spotify.com/dashboard",
    docs: "spotify",
  },
  {
    id: "youtube",
    label: "YouTube",
    color: "#ff0000",
    needs: "login_or_key",
    byo: "api_key",
    byoOn: "web_and_apps",
    serverKeys: ["YOUTUBE_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    console: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    docs: "youtube-data-api-v3",
  },
  {
    id: "google_drive",
    label: "Google Drive",
    color: "#1fa463",
    needs: "login",
    byo: "client_id",
    byoOn: "apps",
    serverKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    console: "https://console.cloud.google.com/auth/clients",
    docs: "google-drive-oauth",
  },
  {
    id: "dropbox",
    label: "Dropbox",
    color: "#0061ff",
    needs: "login",
    byo: "app_key",
    byoOn: "web_and_apps",
    serverKeys: ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET"],
    console: "https://www.dropbox.com/developers/apps",
    docs: "dropbox",
  },
  {
    id: "deezer",
    label: "Deezer",
    color: "#a238ff",
    needs: "nothing",
    byo: null,
    byoOn: null,
    serverKeys: [],
    console: null,
    docs: "deezer-musicbrainz-lrclib",
  },
  {
    id: "musicbrainz",
    label: "MusicBrainz",
    color: "#ba478f",
    needs: "nothing",
    byo: null,
    byoOn: null,
    serverKeys: [],
    console: null,
    docs: "deezer-musicbrainz-lrclib",
  },
  {
    id: "lrclib",
    label: "LRCLIB",
    color: "#ff2d55",
    needs: "nothing",
    byo: null,
    byoOn: null,
    serverKeys: [],
    console: null,
    docs: "deezer-musicbrainz-lrclib",
  },
  {
    id: "apple_music",
    label: "Apple Music",
    color: "#fa2d48",
    needs: "developer",
    byo: null,
    byoOn: null,
    serverKeys: ["APPLE_TEAM_ID", "APPLE_MUSIC_KEY_ID", "APPLE_MUSIC_PRIVATE_KEY"],
    console: "https://developer.apple.com/account/resources/identifiers/list/mediaId",
    docs: "apple-music-musickit",
  },
];

export const connectionInfo = (id: ConnectionId): ConnectionInfo => {
  const c = CONNECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown connection ${id}`);
  return c;
};

/* ---------- the shapes of the public identifiers and keys a DJ pastes ---------- */

/** A YouTube Data API key (Google API keys are `AIza` and 35 more characters). */
export const validYoutubeKey = (v: string) => /^AIza[0-9A-Za-z_-]{35}$/.test(v.trim());
/** A Dropbox app key: 15 lowercase letters and digits. */
export const validDropboxAppKey = (v: string) => /^[a-z0-9]{15}$/.test(v.trim());
/** A Google OAuth client ID. */
export const validGoogleClientId = (v: string) =>
  /^\d{6,}-[a-z0-9]{8,}\.apps\.googleusercontent\.com$/.test(v.trim());
