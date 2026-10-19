"use client";
import { useCallback, useEffect, useState } from "react";
import { bestMatch, type Match, type MatchItem, searchQueries } from "@/lib/match";
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

/** Spotify answered 429 and would not let the browser wait it out: `retryAfter` seconds is what it asked for. */
export class SpotifyRateLimit extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(`Spotify is pausing searches for ${retryAfter} s`);
    this.retryAfter = retryAfter;
  }
}
/** BYO path only. A 429 is retried once when Retry-After ≤ 10 s; otherwise it is thrown (never an open-ended loop). */
async function api<T>(token: string, path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (r.status === 429) {
    const header = Number(r.headers.get("retry-after"));
    const wait = Number.isFinite(header) && header > 0 ? Math.ceil(header) : 2;
    if (attempt >= 1 || wait > 10) throw new SpotifyRateLimit(wait);
    await new Promise((res) => setTimeout(res, wait * 1000));
    return api<T>(token, path, init, attempt + 1);
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

interface SearchHit {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album?: { name?: string; release_date?: string };
  external_urls: { spotify: string };
}
/**
 * BYO path: resolve one catalogue recording to a Spotify URI with the same scorer as the server (lib/match.ts):
 * field-filtered search first, a plain query as the fallback, the best candidate only above the threshold.
 * Cached in memory + localStorage. Throws SpotifyRateLimit when Spotify asks for a pause.
 */
export async function resolveTrack(token: string, item: MatchItem): Promise<Resolved | null> {
  const key = `${item.id}|${item.title}|${item.orchestra}`;
  if (memo.has(key)) return memo.get(key)!;
  try {
    const ls = localStorage.getItem(`tdj-sp:${key}`);
    if (ls) {
      const v = JSON.parse(ls);
      memo.set(key, v);
      return v;
    }
  } catch {}
  const q = searchQueries(item);
  const search = async (query: string) => {
    const j = await api<{ tracks?: { items?: SearchHit[] } }>(
      token,
      `/search?${new URLSearchParams({ q: query, type: "track", limit: "10" })}`,
    );
    return (j.tracks?.items ?? []).map((h) => ({
      uri: h.uri,
      name: h.name,
      artists: h.artists.map((a) => a.name),
      album: h.album?.name ?? "",
      albumYear: h.album?.release_date ? Number(h.album.release_date.slice(0, 4)) || null : null,
      durationMs: h.duration_ms,
      url: h.external_urls?.spotify,
    }));
  };
  const m: Match | null = bestMatch(item, await search(q.filtered)) ?? bestMatch(item, await search(q.plain));
  const v: Resolved | null = m
    ? { uri: m.uri, name: m.name, artist: m.artist, durationMs: m.durationMs, url: m.url ?? "" }
    : null;
  memo.set(key, v);
  try {
    localStorage.setItem(`tdj-sp:${key}`, JSON.stringify(v));
  } catch {}
  return v;
}

/** BYO path: appends URIs (≤100 per call) to a playlist made earlier. */
export async function addToPlaylist(token: string, playlistId: string, uris: string[]) {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await api(token, `/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: chunk }),
    }).catch(() =>
      api(token, `/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: chunk }),
      }),
    );
  }
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
  rateLimited?: number;
}
/**
 * Creates the playlist from `uris` (matched first through `hostedMatch`), or appends them to `playlistId` (the
 * "Try again" after a rate limit). `playlist` alone makes the server match the unresolved tracks itself.
 */
export async function hostedCreatePlaylist(body: {
  playlist?: unknown;
  uris?: string[];
  playlistId?: string;
  url?: string;
  includeCortinas: boolean;
  name?: string;
  description?: string;
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
export interface MatchResponse {
  matches: Match[];
  missing: string[];
  /** Spotify asked for a pause (seconds): items after the last match were not searched */
  rateLimited?: number;
}
/** One batch (≤ 10 items) through the server-side matcher; the browser never searches Spotify itself here. */
export async function hostedMatch(items: MatchItem[]): Promise<MatchResponse> {
  const r = await fetch("/api/spotify/match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `Spotify answered ${r.status}`);
  return j as MatchResponse;
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

interface ConnectorsSnapshot {
  spotify: HostedState;
  google: DirectState;
  dropbox: DirectState;
  connect: ConnectState;
}
/** One fetch of the four `/me`-style endpoints per page view, shared by every component that asks. */
let snapshot: ConnectorsSnapshot | null = null;
let inflight: Promise<ConnectorsSnapshot> | null = null;
let fetchedAt = 0;
const listeners = new Set<(s: ConnectorsSnapshot) => void>();
/** a tab coming back to the front refetches when the last look is older than this */
const STALE_MS = 60_000;
async function loadConnectors(force = false): Promise<ConnectorsSnapshot> {
  if (!force && snapshot && Date.now() - fetchedAt < STALE_MS) return snapshot;
  if (inflight) return inflight;
  inflight = (async () => {
    const [spotify, google, dropbox, connect] = await Promise.all([
      fetchHosted(),
      fetchDirect("google"),
      fetchDirect("dropbox"),
      fetchConnect(),
    ]);
    const s = { spotify, google, dropbox, connect };
    snapshot = s;
    fetchedAt = Date.now();
    inflight = null;
    applyHostedToken(spotify);
    for (const l of listeners) l(s);
    return s;
  })();
  return inflight;
}
/** forget the shared snapshot (tests, logout) */
export function resetConnectors() {
  snapshot = null;
  fetchedAt = 0;
}
/**
 * A hosted session hands its short-lived access token to the store so Listen keeps working without a BYO Client
 * ID. It also retires any bring-your-own token left in storage: the hosted token has no refresh token, and a stale
 * BYO refresh would only ever fail against accounts.spotify.com (the 400s the console used to show).
 */
function applyHostedToken(h: HostedState) {
  const setSpotifyToken = useStore.getState().setSpotifyToken;
  const cur = useStore.getState().spotifyToken;
  if (h.hosted && h.user && h.token) {
    setSpotifyToken({ access: h.token.access, expires: h.token.expires });
    try {
      sessionStorage.removeItem("tdj-pkce");
    } catch {}
  } else if (h.hosted && !h.user && cur && !cur.refresh) setSpotifyToken(null); // a hosted token that was logged out
}

/**
 * The connector state for Settings and the Export sheet: the hosted Spotify session, the direct Google and
 * Dropbox sessions and the Pipedream accounts. Fetched once per page view and shared between components; refetched
 * when the tab regains focus after a minute (the OAuth dance happens in another tab) or on `reload()`.
 */
export function useConnectors() {
  const [state, setState] = useState<ConnectorsSnapshot | null>(snapshot);
  const reload = useCallback(async () => {
    const s = await loadConnectors(true);
    return s.spotify;
  }, []);
  useEffect(() => {
    listeners.add(setState);
    void loadConnectors().then(setState);
    const onFocus = () => {
      if (document.visibilityState === "visible") void loadConnectors();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      listeners.delete(setState);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  return {
    spotify: state?.spotify ?? null,
    google: state?.google ?? null,
    dropbox: state?.dropbox ?? null,
    connect: state?.connect ?? null,
    reload,
  };
}
