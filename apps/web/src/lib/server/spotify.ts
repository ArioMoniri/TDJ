import "server-only";
import {
  ApiError,
  api,
  clearSessionCookie as clearFor,
  enabled,
  type Session,
  SPOTIFY,
  withSession as withSessionFor,
} from "./oauth";

/**
 * Hosted "Log in with Spotify": the app's own Client ID/Secret from the server environment, authorization-code
 * flow, tokens sealed in an httpOnly cookie, refreshed transparently (the generic machinery is lib/server/oauth.ts).
 * Spotify Development Mode serves 5 users per Client ID (docs/DEPLOY.md → Connectors).
 */
const API = () => (process.env.SPOTIFY_API_URL ?? "https://api.spotify.com/v1").replace(/\/$/, "");
export const SCOPES = SPOTIFY.scopes;
export const SESSION_COOKIE = SPOTIFY.cookie;
export type { Session };

export const hostedEnabled = async () => enabled(SPOTIFY);
export const withSession = (req: Request, origin: string) => withSessionFor(SPOTIFY, req, origin);
export const clearSessionCookie = () => clearFor(SPOTIFY);
export { ApiError as SpotifyError };

const spotify = <T>(access: string, path: string, init: RequestInit = {}) =>
  api<T>(access, `${API()}${path}`, init);

export interface Profile {
  id: string;
  name: string;
  email?: string;
  product?: string;
  url?: string;
}
export async function profile(access: string): Promise<Profile> {
  const j = await spotify<{
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
  const j = await spotify<{ tracks?: { items?: SearchHit[] } }>(
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
  const pl = await spotify<{ id: string; external_urls: { spotify: string } }>(access, "/me/playlists", {
    method: "POST",
    body,
  }).catch(async () => {
    const me = await spotify<{ id: string }>(access, "/me");
    return spotify<{ id: string; external_urls: { spotify: string } }>(access, `/users/${me.id}/playlists`, {
      method: "POST",
      body,
    });
  });
  for (let i = 0; i < p.uris.length; i += 100) {
    const uris = p.uris.slice(i, i + 100);
    await spotify(access, `/playlists/${pl.id}/items`, {
      method: "POST",
      body: JSON.stringify({ uris }),
    }).catch(() =>
      spotify(access, `/playlists/${pl.id}/tracks`, { method: "POST", body: JSON.stringify({ uris }) }),
    );
  }
  return { id: pl.id, url: pl.external_urls.spotify };
}
