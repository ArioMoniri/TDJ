"use client";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { bestMatch, type Match, type MatchItem, rejectReason, searchQueries } from "@/lib/match";
import { findPlayable, marketOf, createPlaylist as webCreatePlaylist, writePlaylist } from "@/lib/spotifyWeb";
import type { PlaylistCheck } from "@/lib/spotifyWrite";
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
  if (!r.ok) throw new Error(t("spotify.spotify_token_exchange_failed", { status: r.status }));
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
  if (!r.ok) throw new Error(t("spotify.refresh_failed"));
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
    super(t("spotify.spotify_is_pausing_searches_for_s", { retryAfter }));
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
  if (!r.ok) throw new Error(t("spotify.spotify_2", { path, status: r.status, p1: await r.text() }));
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
      const v = JSON.parse(ls) as Resolved | null;
      // round 15: a remembered match is used only when the match rules still accept it; else it is searched again
      if (
        v &&
        !rejectReason(item, {
          uri: v.uri,
          name: v.name,
          artists: v.artist.split(/,\s*/),
          album: "",
          durationMs: v.durationMs,
        })
      ) {
        memo.set(key, v);
        return v;
      }
      if (v) localStorage.removeItem(`tdj-sp:${key}`);
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

/** What a write (or a check) of the playlist found, read back with the DJ's own token. */
export interface SpotifyWriteResult {
  id: string;
  url: string;
  check: PlaylistCheck;
  /** the listener's country the replacements are remembered under (`from_token` when Spotify did not say) */
  market: string;
}
/**
 * BYO path: writes `uris` into the playlist (`replace` rewrites it, `new` makes one first, `check` only reads)
 * and proves it with the shared writer (lib/spotifyWrite.ts): chunks in order, Retry-After honoured, the whole
 * playlist read back with the listener's market, unplayable rows swapped for a playable version.
 */
export async function byoWritePlaylist(
  token: string,
  target: { playlistId: string } | { name: string; description: string; isPublic?: boolean },
  uris: string[],
  items: Array<MatchItem | null>,
  mode: "replace" | "check" = "replace",
): Promise<SpotifyWriteResult> {
  const market = await marketOf(token);
  let id: string;
  let url: string;
  let before: string | null | undefined;
  if ("playlistId" in target) {
    id = target.playlistId;
    url = `https://open.spotify.com/playlist/${id}`;
  } else {
    const pl = await webCreatePlaylist(token, { ...target, isPublic: !!target.isPublic });
    id = pl.id;
    url = pl.url;
    before = pl.snapshot;
  }
  const check = await writePlaylist(token, id, uris, {
    mode: "playlistId" in target ? mode : "new",
    before,
    market: "from_token",
    findPlayable: async (at, avoid) => {
      const it = items[at];
      return it ? ((await findPlayable(token, it, avoid))?.uri ?? null) : null;
    },
  });
  return { id, url, check, market };
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
  /** an update: the title and description (with the score) were rewritten; false when Spotify refused it */
  details?: boolean;
  /** Spotify: what the playlist holds, read back after the write (lib/spotifyWrite.ts) */
  check?: PlaylistCheck;
  /** Spotify: the listener's country the replacements are remembered under */
  market?: string;
  /** Spotify: rows sent that Spotify could never hold (not a track or episode URI) */
  invalid?: string[];
}
/**
 * Creates the playlist from `uris` (matched first through `hostedMatch`), or appends them to `playlistId` (the
 * "Try again" after a rate limit). `playlist` alone makes the server match the unresolved tracks itself.
 */
export async function hostedCreatePlaylist(body: {
  playlist?: unknown;
  uris?: string[];
  /** the matcher's view of each row of `uris`, so an unplayable row can be swapped for a playable version */
  items?: Array<MatchItem | null>;
  playlistId?: string;
  url?: string;
  /** with `playlistId`: replace the playlist's contents instead of appending */
  replace?: boolean;
  /** with `playlistId`: read the playlist and compare it with `uris`, writing nothing */
  check?: boolean;
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
  if (!r.ok) throw new Error(j.error ?? t("spotify.spotify_answered", { status: r.status }));
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
  if (!r.ok) throw new Error(j.error ?? t("spotify.spotify_answered", { status: r.status }));
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
    {
      slug: "youtube_data_api",
      get label() {
        return t("spotify.youtube");
      },
      kind: "playlist",
    },
    {
      slug: "dropbox",
      get label() {
        return t("spotify.dropbox");
      },
      kind: "file",
    },
    {
      slug: "google_drive",
      get label() {
        return t("spotify.google_drive");
      },
      kind: "file",
    },
    {
      slug: "spotify",
      get label() {
        return t("spotify.spotify");
      },
      kind: "playlist",
    },
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
      throw new Error(j.error ?? t("spotify.could_not_start_the_connection", { status: r.status }));
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
  if (!r.ok) throw new Error(j.error ?? t("spotify.export_answered", { status: r.status }));
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
  if (!r.ok) throw new Error(j.error ?? t("spotify.answered", { path, status: r.status }));
  return j as T;
}
export interface FileResult {
  path: string;
  url?: string;
}
export interface YoutubeResult extends PlaylistResult {
  /** left out because YouTube's daily search budget ran out (`quota`) or the request's time budget did (`timeout`) */
  skipped: string[];
  timeout?: boolean;
  /** this call created the playlist (the first batch); later batches append to `playlistId` */
  created?: boolean;
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
