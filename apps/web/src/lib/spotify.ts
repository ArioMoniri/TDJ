"use client";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";

/**
 * Spotify in the browser. Two paths:
 * 1. Hosted "Log in with Spotify" (the deployment's own Client ID; tokens sealed in an httpOnly cookie, see
 *    lib/server/spotify.ts): the browser calls /api/spotify/*, never Spotify's token endpoint.
 * 2. BYO Client ID with PKCE (below), when the server has no Spotify credentials.
 */
const SCOPES = "playlist-modify-private playlist-modify-public playlist-read-private";
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function redirectUri() {
  return `${location.origin}/callback`;
}

export async function beginAuth(clientId: string) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)).buffer);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("tdj-pkce", verifier);
  const u = new URL("https://accounts.spotify.com/authorize");
  u.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  }).toString();
  location.assign(u.toString());
}

export async function finishAuth(clientId: string, code: string) {
  const verifier = sessionStorage.getItem("tdj-pkce") ?? "";
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!r.ok) throw new Error(`Spotify token exchange failed: ${r.status}`);
  const j = await r.json();
  return {
    access: j.access_token as string,
    refresh: j.refresh_token as string | undefined,
    expires: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
}

export async function refresh(clientId: string, refreshToken: string) {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!r.ok) throw new Error("refresh failed");
  const j = await r.json();
  return {
    access: j.access_token as string,
    refresh: (j.refresh_token ?? refreshToken) as string,
    expires: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (r.status === 429) {
    const wait = Number(r.headers.get("retry-after") ?? 2);
    await new Promise((res) => setTimeout(res, wait * 1000));
    return api(token, path, init);
  }
  if (!r.ok) throw new Error(`Spotify ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? (undefined as T) : r.json();
}

export interface Resolved {
  uri: string;
  name: string;
  artist: string;
  durationMs: number;
  url: string;
}
const memo = new Map<string, Resolved | null>();

/** Resolve one catalogue track to a Spotify URI (search limit ≤10 under 2026 Dev Mode rules). Cached in memory + localStorage. */
export async function resolveTrack(token: string, q: string, year?: number | null): Promise<Resolved | null> {
  const key = `${q}|${year ?? ""}`;
  if (memo.has(key)) return memo.get(key)!;
  try {
    const ls = localStorage.getItem(`tdj-sp:${key}`);
    if (ls) {
      const v = JSON.parse(ls);
      memo.set(key, v);
      return v;
    }
  } catch {}
  const j = await api<{
    tracks: {
      items: Array<{
        uri: string;
        name: string;
        duration_ms: number;
        artists: { name: string }[];
        external_urls: { spotify: string };
      }>;
    };
  }>(token, `/search?${new URLSearchParams({ q, type: "track", limit: "5" })}`);
  const it = j.tracks?.items?.[0];
  const v = it
    ? {
        uri: it.uri,
        name: it.name,
        artist: it.artists.map((a) => a.name).join(", "),
        durationMs: it.duration_ms,
        url: it.external_urls.spotify,
      }
    : null;
  memo.set(key, v);
  try {
    localStorage.setItem(`tdj-sp:${key}`, JSON.stringify(v));
  } catch {}
  return v;
}

export async function createPlaylist(
  token: string,
  name: string,
  description: string,
  uris: string[],
  isPublic = false,
) {
  const me = await api<{ id: string }>(token, "/me");
  const pl = await api<{ id: string; external_urls: { spotify: string } }>(token, "/me/playlists", {
    method: "POST",
    body: JSON.stringify({ name, description, public: isPublic }),
  }).catch(() =>
    api<{ id: string; external_urls: { spotify: string } }>(token, `/users/${me.id}/playlists`, {
      method: "POST",
      body: JSON.stringify({ name, description, public: isPublic }),
    }),
  );
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await api(token, `/playlists/${pl.id}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: chunk }),
    }).catch(() =>
      api(token, `/playlists/${pl.id}/tracks`, { method: "POST", body: JSON.stringify({ uris: chunk }) }),
    );
  }
  return pl;
}

/* ---------- Hosted session + Pipedream Connect (server routes) ---------- */

export interface HostedUser {
  id: string;
  name: string;
  email?: string;
  product?: string;
  url?: string;
}
export interface HostedState {
  /** the deployment offers "Log in with Spotify" */
  hosted: boolean;
  user: HostedUser | null;
  /** short-lived access token for the Listen tab's searches; the refresh token never leaves the server */
  token?: { access: string; expires: number };
}
export async function fetchHosted(): Promise<HostedState> {
  try {
    const r = await fetch("/api/spotify/me", { cache: "no-store" });
    const j = (await r.json()) as HostedState;
    return { hosted: !!j.hosted, user: r.ok ? (j.user ?? null) : null, token: r.ok ? j.token : undefined };
  } catch {
    return { hosted: false, user: null };
  }
}
export const hostedLoginUrl = (next = "/settings") => `/api/spotify/login?next=${encodeURIComponent(next)}`;
export async function hostedLogout() {
  await fetch("/api/spotify/logout", { method: "POST" });
}
export interface PlaylistResult {
  id: string;
  url: string;
  added: number;
  missing: string[];
  quota?: boolean;
}
export async function hostedCreatePlaylist(body: {
  playlist: unknown;
  includeCortinas: boolean;
  name?: string;
  isPublic?: boolean;
}): Promise<PlaylistResult> {
  const r = await fetch("/api/spotify/playlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `Spotify answered ${r.status}`);
  return j as PlaylistResult;
}

export type ConnectApp = "spotify" | "youtube_data_api" | "dropbox" | "google_drive";
export interface ConnectedAccount {
  id: string;
  app: ConnectApp;
  label: string;
  name?: string;
  healthy: boolean;
}
export interface ConnectState {
  enabled: boolean;
  apps: Array<{ slug: ConnectApp; label: string; kind: "playlist" | "file" }>;
  accounts: ConnectedAccount[];
  error?: string;
}
export const CONNECT_FALLBACK: ConnectState = {
  enabled: false,
  apps: [
    { slug: "youtube_data_api", label: "YouTube", kind: "playlist" },
    { slug: "dropbox", label: "Dropbox", kind: "file" },
    { slug: "google_drive", label: "Google Drive", kind: "file" },
    { slug: "spotify", label: "Spotify", kind: "playlist" },
  ],
  accounts: [],
};
export async function fetchConnect(): Promise<ConnectState> {
  try {
    const r = await fetch("/api/connect/accounts", { cache: "no-store" });
    const j = (await r.json()) as Partial<ConnectState>;
    return { ...CONNECT_FALLBACK, ...j, accounts: Array.isArray(j.accounts) ? j.accounts : [] };
  } catch {
    return CONNECT_FALLBACK;
  }
}
/**
 * Opens Pipedream Connect Link for one app in a new tab. The tab is opened synchronously (popup blockers) and
 * pointed at the link once the server has minted the single-use token.
 */
export async function openConnectLink(app: ConnectApp): Promise<void> {
  const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
  try {
    const r = await fetch("/api/connect/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app }),
    });
    const j = await r.json();
    if (!r.ok || !j.connect_link_url)
      throw new Error(j.error ?? `Could not start the connection (${r.status})`);
    if (tab) {
      tab.opener = null;
      tab.location.href = j.connect_link_url;
    } else location.assign(j.connect_link_url);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
export async function connectExport(
  body: Record<string, unknown>,
): Promise<Record<string, unknown> & PlaylistResult> {
  const r = await fetch("/api/connect/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `Export answered ${r.status}`);
  return j;
}

/* ---------- Direct Google (Drive + YouTube) and Dropbox: the deployment's own OAuth apps ---------- */

export type GoogleFeature = "drive" | "youtube";
export interface DirectState {
  /** the deployment has this provider's credentials */
  hosted: boolean;
  user: { id: string; name: string; email?: string } | null;
  /** Google only: which features the account has granted so far */
  scopes?: Record<GoogleFeature, boolean>;
}
const DIRECT_OFF: DirectState = { hosted: false, user: null };
async function fetchDirect(provider: "google" | "dropbox"): Promise<DirectState> {
  try {
    const r = await fetch(`/api/${provider}/me`, { cache: "no-store" });
    const j = (await r.json()) as DirectState;
    return { hosted: !!j.hosted, user: r.ok ? (j.user ?? null) : null, scopes: r.ok ? j.scopes : undefined };
  } catch {
    return DIRECT_OFF;
  }
}
export const googleLoginUrl = (scope: GoogleFeature | "" = "", next = "/settings") =>
  `/api/google/login?${scope ? `scope=${scope}&` : ""}next=${encodeURIComponent(next)}`;
export const dropboxLoginUrl = (next = "/settings") => `/api/dropbox/login?next=${encodeURIComponent(next)}`;
export async function directLogout(provider: "google" | "dropbox") {
  await fetch(`/api/${provider}/logout`, { method: "POST" });
}
/**
 * POST to a direct route. A 403 `needs_scope` answer (Google: the feature was never granted) sends the browser
 * through the incremental consent and resolves never; the page comes back with the scope.
 */
export async function directPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, next: `${location.pathname}${location.search}` }),
  });
  const j = await r.json();
  if (r.status === 403 && j.error === "needs_scope" && typeof j.login === "string") {
    location.assign(j.login);
    return new Promise<T>(() => {});
  }
  if (!r.ok) throw new Error(j.error ?? `${path} answered ${r.status}`);
  return j as T;
}
export interface FileResult {
  path: string;
  url?: string;
}
export interface YoutubeResult extends PlaylistResult {
  /** left out because YouTube's daily search budget ran out */
  skipped: string[];
}

/**
 * The connector state for Settings and the Export sheet: the hosted Spotify session, the direct Google and
 * Dropbox sessions and the Pipedream accounts, refetched when the tab regains focus (the OAuth dance happens in
 * another tab). A hosted Spotify session also hands its short-lived access token to the store so Listen keeps
 * working without a BYO Client ID.
 */
export function useConnectors() {
  const [spotify, setSpotify] = useState<HostedState | null>(null);
  const [google, setGoogle] = useState<DirectState | null>(null);
  const [dropbox, setDropbox] = useState<DirectState | null>(null);
  const [connect, setConnect] = useState<ConnectState | null>(null);
  const setSpotifyToken = useStore((s) => s.setSpotifyToken);
  const reload = useCallback(async () => {
    const [h, g, d, c] = await Promise.all([
      fetchHosted(),
      fetchDirect("google"),
      fetchDirect("dropbox"),
      fetchConnect(),
    ]);
    setSpotify(h);
    setGoogle(g);
    setDropbox(d);
    setConnect(c);
    if (h.hosted && h.user && h.token) setSpotifyToken({ access: h.token.access, expires: h.token.expires });
    else if (h.hosted && !h.user) {
      const cur = useStore.getState().spotifyToken;
      if (cur && !cur.refresh) setSpotifyToken(null); // a hosted token that was logged out
    }
    return h;
  }, [setSpotifyToken]);
  useEffect(() => {
    void reload();
    const onFocus = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reload]);
  return { spotify, google, dropbox, connect, reload };
}
