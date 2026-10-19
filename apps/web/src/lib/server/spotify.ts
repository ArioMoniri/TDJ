import "server-only";
import { randomBytes } from "node:crypto";
import { clearCookieHeader, cookieHeader, readCookie, seal, unseal } from "./cookies";

/**
 * Hosted "Log in with Spotify": the app's own Client ID/Secret from the server environment, authorization-code
 * flow, tokens sealed in an httpOnly cookie, refreshed transparently. Nothing is stored server-side.
 * Spotify Development Mode serves 5 users per Client ID (docs/DEPLOY.md → Connectors).
 */
const ACCOUNTS = () =>
  (process.env.SPOTIFY_ACCOUNTS_URL ?? "https://accounts.spotify.com").replace(/\/$/, "");
const API = () => (process.env.SPOTIFY_API_URL ?? "https://api.spotify.com/v1").replace(/\/$/, "");
export const SCOPES =
  "playlist-modify-private playlist-modify-public user-read-email streaming user-read-private";
export const SESSION_COOKIE = "tdj_sp";
export const STATE_COOKIE = "tdj_sp_state";
const SESSION_DAYS = 180;

export function hostedEnabled(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}
export const redirectUri = (origin: string) => `${origin}/api/spotify/callback`;

export interface Session {
  access: string;
  refresh: string;
  expires: number;
  authorizedAt: number;
}

export function authorizeUrl(origin: string, state: string): string {
  const u = new URL(`${ACCOUNTS()}/authorize`);
  u.search = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: redirectUri(origin),
    scope: SCOPES,
    state,
  }).toString();
  return u.toString();
}
export const newState = () => randomBytes(16).toString("base64url");

const basic = () =>
  `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`;

async function tokenRequest(params: Record<string, string>) {
  const r = await fetch(`${ACCOUNTS()}/api/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic() },
    body: new URLSearchParams(params),
  });
  if (!r.ok) throw new Error(`Spotify token endpoint answered ${r.status}`);
  return (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function exchangeCode(code: string, origin: string): Promise<Session> {
  const j = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  return {
    access: j.access_token,
    refresh: j.refresh_token ?? "",
    expires: Date.now() + (j.expires_in ?? 3600) * 1000,
    authorizedAt: Date.now(),
  };
}

export async function refreshSession(s: Session): Promise<Session> {
  const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh });
  return {
    access: j.access_token,
    refresh: j.refresh_token ?? s.refresh,
    expires: Date.now() + (j.expires_in ?? 3600) * 1000,
    authorizedAt: s.authorizedAt,
  };
}

export function readSession(req: Request): Session | null {
  const s = unseal<Session>(readCookie(req, SESSION_COOKIE));
  return s && typeof s.access === "string" && typeof s.refresh === "string" ? s : null;
}
export function sessionCookie(s: Session, origin: string): string {
  return cookieHeader(SESSION_COOKIE, seal(s), {
    maxAge: SESSION_DAYS * 86400,
    secure: origin.startsWith("https://"),
  });
}
export const clearSessionCookie = () => clearCookieHeader(SESSION_COOKIE);

/** The current session with a valid access token, refreshing when it is about to expire (then `setCookie` is set). */
export async function withSession(
  req: Request,
  origin: string,
): Promise<{ session: Session; setCookie?: string } | null> {
  const s = readSession(req);
  if (!s) return null;
  if (s.expires > Date.now() + 60_000) return { session: s };
  if (!s.refresh) return null;
  try {
    const fresh = await refreshSession(s);
    return { session: fresh, setCookie: sessionCookie(fresh, origin) };
  } catch {
    return null;
  }
}

export class SpotifyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(access: string, path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const r = await fetch(`${API()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (r.status === 429 && attempt < 3) {
    const wait = Math.min(10, Number(r.headers.get("retry-after") ?? 2));
    await new Promise((res) => setTimeout(res, wait * 1000));
    return api<T>(access, path, init, attempt + 1);
  }
  if (!r.ok)
    throw new SpotifyError(r.status, `Spotify ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}

export interface Profile {
  id: string;
  name: string;
  email?: string;
  product?: string;
  url?: string;
}
export async function profile(access: string): Promise<Profile> {
  const j = await api<{
    id: string;
    display_name?: string;
    email?: string;
    product?: string;
    external_urls?: { spotify?: string };
  }>(access, "/me");
  return {
    id: j.id,
    name: j.display_name || j.id,
    email: j.email,
    product: j.product,
    url: j.external_urls?.spotify,
  };
}

interface SearchHit {
  uri: string;
  name: string;
  artists: { name: string }[];
  duration_ms: number;
  external_urls: { spotify: string };
}
/** Per-process memo (warm Lambda): one search per query per provider ever is the goal of the global cache. */
const memo = new Map<string, string | null>();
async function searchOne(access: string, q: string): Promise<string | null> {
  if (memo.has(q)) return memo.get(q)!;
  const j = await api<{ tracks?: { items?: SearchHit[] } }>(
    access,
    `/search?${new URLSearchParams({ q, type: "track", limit: "5" })}`,
  );
  const uri = j.tracks?.items?.[0]?.uri ?? null;
  memo.set(q, uri);
  return uri;
}
/** ISRC first (exact recording), then the text query. */
export async function findTrack(
  access: string,
  t: { isrc?: string | null; query: string },
): Promise<string | null> {
  if (t.isrc) {
    const hit = await searchOne(access, `isrc:${t.isrc}`);
    if (hit) return hit;
  }
  return searchOne(access, t.query);
}

export async function createPlaylist(
  access: string,
  p: { name: string; description: string; isPublic: boolean; uris: string[] },
): Promise<{ id: string; url: string }> {
  const body = JSON.stringify({ name: p.name, description: p.description, public: p.isPublic });
  const pl = await api<{ id: string; external_urls: { spotify: string } }>(access, "/me/playlists", {
    method: "POST",
    body,
  }).catch(async () => {
    const me = await api<{ id: string }>(access, "/me");
    return api<{ id: string; external_urls: { spotify: string } }>(access, `/users/${me.id}/playlists`, {
      method: "POST",
      body,
    });
  });
  for (let i = 0; i < p.uris.length; i += 100) {
    const uris = p.uris.slice(i, i + 100);
    await api(access, `/playlists/${pl.id}/items`, { method: "POST", body: JSON.stringify({ uris }) }).catch(
      () => api(access, `/playlists/${pl.id}/tracks`, { method: "POST", body: JSON.stringify({ uris }) }),
    );
  }
  return { id: pl.id, url: pl.external_urls.spotify };
}
