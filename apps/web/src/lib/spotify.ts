"use client";
/** Spotify Web API — PKCE in the browser. Each user brings their own Client ID (Dev Mode app) in Settings. */
const SCOPES = "playlist-modify-private playlist-modify-public playlist-read-private";
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function redirectUri() { return `${location.origin}/callback`; }

export async function beginAuth(clientId: string) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)).buffer);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("tdj-pkce", verifier);
  const u = new URL("https://accounts.spotify.com/authorize");
  u.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri(), scope: SCOPES, code_challenge_method: "S256", code_challenge: challenge }).toString();
  location.assign(u.toString());
}

export async function finishAuth(clientId: string, code: string) {
  const verifier = sessionStorage.getItem("tdj-pkce") ?? "";
  const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier }) });
  if (!r.ok) throw new Error(`Spotify token exchange failed: ${r.status}`);
  const j = await r.json();
  return { access: j.access_token as string, refresh: j.refresh_token as string | undefined, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

export async function refresh(clientId: string, refreshToken: string) {
  const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken }) });
  if (!r.ok) throw new Error("refresh failed");
  const j = await r.json();
  return { access: j.access_token as string, refresh: (j.refresh_token ?? refreshToken) as string, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://api.spotify.com/v1${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (r.status === 429) { const wait = Number(r.headers.get("retry-after") ?? 2); await new Promise((res) => setTimeout(res, wait * 1000)); return api(token, path, init); }
  if (!r.ok) throw new Error(`Spotify ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? (undefined as T) : r.json();
}

export interface Resolved { uri: string; name: string; artist: string; durationMs: number; url: string }
const memo = new Map<string, Resolved | null>();

/** Resolve one catalogue track to a Spotify URI (search limit ≤10 under 2026 Dev Mode rules). Cached in memory + localStorage. */
export async function resolveTrack(token: string, q: string, year?: number | null): Promise<Resolved | null> {
  const key = `${q}|${year ?? ""}`;
  if (memo.has(key)) return memo.get(key)!;
  try { const ls = localStorage.getItem(`tdj-sp:${key}`); if (ls) { const v = JSON.parse(ls); memo.set(key, v); return v; } } catch {}
  const j = await api<{ tracks: { items: Array<{ uri: string; name: string; duration_ms: number; artists: { name: string }[]; external_urls: { spotify: string } }> } }>(token, `/search?${new URLSearchParams({ q, type: "track", limit: "5" })}`);
  const it = j.tracks?.items?.[0];
  const v = it ? { uri: it.uri, name: it.name, artist: it.artists.map((a) => a.name).join(", "), durationMs: it.duration_ms, url: it.external_urls.spotify } : null;
  memo.set(key, v);
  try { localStorage.setItem(`tdj-sp:${key}`, JSON.stringify(v)); } catch {}
  return v;
}

export async function createPlaylist(token: string, name: string, description: string, uris: string[], isPublic = false) {
  const me = await api<{ id: string }>(token, "/me");
  const pl = await api<{ id: string; external_urls: { spotify: string } }>(token, "/me/playlists", { method: "POST", body: JSON.stringify({ name, description, public: isPublic }) }).catch(() => api<{ id: string; external_urls: { spotify: string } }>(token, `/users/${me.id}/playlists`, { method: "POST", body: JSON.stringify({ name, description, public: isPublic }) }));
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await api(token, `/playlists/${pl.id}/items`, { method: "POST", body: JSON.stringify({ uris: chunk }) }).catch(() => api(token, `/playlists/${pl.id}/tracks`, { method: "POST", body: JSON.stringify({ uris: chunk }) }));
  }
  return pl;
}
