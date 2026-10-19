import "server-only";
import { bestMatch, type Candidate, type Match, type MatchItem, searchQueries } from "../match";
import {
  ApiError,
  api,
  clearSessionCookie as clearFor,
  enabled,
  isRateLimited,
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
export { ApiError as SpotifyError, isRateLimited };

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

/* ---------- matching ---------- */

interface SearchHit {
  uri: string;
  name: string;
  artists: { name: string }[];
  duration_ms: number;
  album?: { name?: string; release_date?: string };
  external_urls?: { spotify?: string };
}
const toCandidate = (h: SearchHit): Candidate => ({
  uri: h.uri,
  name: h.name,
  artists: h.artists.map((a) => a.name),
  album: h.album?.name ?? "",
  albumYear: h.album?.release_date ? Number(h.album.release_date.slice(0, 4)) || null : null,
  durationMs: h.duration_ms,
  url: h.external_urls?.spotify,
});
/** Up to 10 candidates for one query (Dev Mode caps the search limit at 10). */
async function search(access: string, q: string): Promise<Candidate[]> {
  const j = await spotify<{ tracks?: { items?: SearchHit[] } }>(
    access,
    `/search?${new URLSearchParams({ q, type: "track", limit: "10" })}`,
  );
  return (j.tracks?.items ?? []).map(toCandidate);
}

/**
 * Per-process memo (warm Lambda): a recording is searched once per instance ever; the browser stores the answer in
 * the DJ's database too, so a re-export never searches again. `null` is "not found", remembered for an hour only.
 */
const memo = new Map<string, { m: Match | null; at: number }>();
const NOT_FOUND_TTL = 3600_000;
const memoKey = (i: MatchItem) => `${i.id}|${i.title}|${i.orchestra}|${i.singer ?? ""}|${i.year ?? ""}`;

/**
 * The best Spotify track for one catalogue recording: ISRC first (the exact recording), then a field-filtered
 * search (`track:"…" artist:"…"`), then a plain text query; every candidate is scored by lib/match.ts and only a
 * score above the threshold counts. A 429 the helper could not wait out propagates as RateLimitError.
 */
export async function matchOne(access: string, item: MatchItem): Promise<Match | null> {
  const key = memoKey(item);
  const hit = memo.get(key);
  if (hit && (hit.m || Date.now() - hit.at < NOT_FOUND_TTL)) return hit.m;
  const q = searchQueries(item);
  let m: Match | null = null;
  if (item.isrc) {
    const c = await search(access, `isrc:${item.isrc}`);
    if (c[0]) m = bestMatch(item, c, 0);
  }
  if (!m) m = bestMatch(item, await search(access, q.filtered));
  if (!m) m = bestMatch(item, await search(access, q.plain));
  memo.set(key, { m, at: Date.now() });
  return m;
}

export interface MatchResult {
  matches: Match[];
  /** ids searched and not found (a wrong song is never returned) */
  missing: string[];
  /** Spotify asked for a pause this long (seconds): the items after the last match were not searched */
  rateLimited?: number;
}
/** Items one after the other (one search in flight per request); stops at the first rate limit and says so. */
export async function matchItems(access: string, items: MatchItem[]): Promise<MatchResult> {
  const out: MatchResult = { matches: [], missing: [] };
  for (const item of items) {
    try {
      const m = await matchOne(access, item);
      if (m) out.matches.push(m);
      else out.missing.push(item.id);
    } catch (e) {
      if (isRateLimited(e)) {
        out.rateLimited = e.retryAfter;
        return out;
      }
      throw e;
    }
  }
  return out;
}

/* ---------- playlists ---------- */

/** Adds URIs in chunks of ≤100 (the `/items` endpoint, then the older `/tracks` one). */
export async function addTracks(access: string, playlistId: string, uris: string[]): Promise<number> {
  let added = 0;
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await spotify(access, `/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: chunk }),
    }).catch(() =>
      spotify(access, `/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: chunk }),
      }),
    );
    added += chunk.length;
  }
  return added;
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
  await addTracks(access, pl.id, p.uris);
  return { id: pl.id, url: pl.external_urls.spotify };
}
