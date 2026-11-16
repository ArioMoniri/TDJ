import { bestMatch, type Candidate, type Match, type MatchItem, searchQueries } from "./match";
import { api, isRateLimited } from "./providerApi";
import {
  type PlaylistCheck,
  type SpotifyCall,
  type VerifiedWrite,
  type WriteOpts,
  writeVerified,
} from "./spotifyWrite";

/**
 * Spotify's Web API with an access token: profile, matching, playlists. The server calls it with the hosted
 * session (lib/server/spotify.ts); the apps call it from the device with the token kept in the Keychain.
 */
const env = (k: string) => (typeof process !== "undefined" ? process.env?.[k] : undefined);
const API = () => (env("SPOTIFY_API_URL") ?? "https://api.spotify.com/v1").replace(/\/$/, "");

const spotify = <T>(access: string, path: string, init: RequestInit = {}, deadline?: number) =>
  api<T>(access, `${API()}${path}`, init, 0, deadline);
/**
 * How long one matching request may run (CloudFront and the function both stop at 30–60 s): past it the rest of
 * the batch is reported as `rateLimited` with a short pause so the browser's "Try again" carries on.
 */
export const MATCH_BUDGET_MS = Number(env("TDJ_MATCH_BUDGET_MS")) || 20_000;
const BUDGET_PAUSE_S = 5;

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
async function search(access: string, q: string, deadline?: number): Promise<Candidate[]> {
  const j = await spotify<{ tracks?: { items?: SearchHit[] } }>(
    access,
    `/search?${new URLSearchParams({ q, type: "track", limit: "10" })}`,
    {},
    deadline,
  );
  return (j.tracks?.items ?? []).map(toCandidate);
}

/**
 * 2026-11, the smart search: the tracks Spotify finds for what the DJ typed (a plain query, `market=from_token` so
 * only what the DJ can play), as the search's service recordings (lib/smartSearch.ts `ServiceTrack`).
 */
export async function searchTracks(access: string, q: string, limit = 10, deadline?: number) {
  const j = await spotify<{
    tracks?: {
      items?: Array<
        SearchHit & {
          id?: string;
          preview_url?: string | null;
          external_ids?: { isrc?: string };
          is_playable?: boolean;
          album?: { name?: string; release_date?: string; images?: AlbumImage[] };
        }
      >;
    };
  }>(
    access,
    `/search?${new URLSearchParams({ q, type: "track", limit: String(Math.min(10, limit)), market: "from_token" })}`,
    {},
    deadline,
  );
  return (j.tracks?.items ?? [])
    .filter((h) => h.uri && h.is_playable !== false)
    .map((h) => ({
      service: "spotify" as const,
      id: h.id ?? h.uri.split(":").pop() ?? h.uri,
      uri: h.uri,
      url: h.external_urls?.spotify,
      title: h.name,
      artists: h.artists.map((a) => a.name),
      album: h.album?.name,
      year: h.album?.release_date ? Number(h.album.release_date.slice(0, 4)) || null : null,
      durationSec: h.duration_ms ? Math.round(h.duration_ms / 1000) : null,
      previewUrl: h.preview_url ?? null,
      isrc: h.external_ids?.isrc ?? null,
      image: albumImage(h.album?.images),
    }));
}

export interface AlbumImage {
  url: string;
  width?: number | null;
  height?: number | null;
}
/**
 * 2026-11: the album cover a row shows (Spotify sends 640, 300 and 64 px): the smallest one at least 128 px wide (a
 * 56 px tile at 2×), else the largest; an image without a width counts as large.
 */
export function albumImage(images: readonly AlbumImage[] | null | undefined): string | null {
  const ok = (images ?? []).filter((i) => typeof i?.url === "string" && /^https:\/\//.test(i.url));
  if (!ok.length) return null;
  const w = (i: AlbumImage) => i.width ?? 640;
  const big = ok.filter((i) => w(i) >= 128).sort((a, b) => w(a) - w(b));
  return (big[0] ?? [...ok].sort((a, b) => w(b) - w(a))[0])!.url;
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
export async function matchOne(access: string, item: MatchItem, deadline?: number): Promise<Match | null> {
  const key = memoKey(item);
  const hit = memo.get(key);
  if (hit && (hit.m || Date.now() - hit.at < NOT_FOUND_TTL)) return hit.m;
  const q = searchQueries(item);
  let m: Match | null = null;
  if (item.isrc) {
    const c = await search(access, `isrc:${item.isrc}`, deadline);
    if (c[0]) m = bestMatch(item, c, 0);
  }
  if (!m) m = bestMatch(item, await search(access, q.filtered, deadline));
  if (!m) m = bestMatch(item, await search(access, q.plain, deadline));
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
/**
 * Items one after the other (one search in flight per request); stops at the first rate limit, or when the time
 * budget is spent, and says so (`rateLimited`: the items after the last one were not searched).
 */
export async function matchItems(
  access: string,
  items: MatchItem[],
  o: { deadline?: number } = {},
): Promise<MatchResult> {
  const deadline = o.deadline ?? Date.now() + MATCH_BUDGET_MS;
  const out: MatchResult = { matches: [], missing: [] };
  for (const item of items) {
    if (Date.now() >= deadline) {
      out.rateLimited = BUDGET_PAUSE_S;
      return out;
    }
    try {
      const m = await matchOne(access, item, deadline);
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

/**
 * The calls the playlist writer makes (lib/spotifyWrite.ts): a 429 is not waited out here but handed to the writer,
 * which honours Retry-After per chunk within `deadline`.
 */
export const spotifyCall =
  (access: string, deadline?: number): SpotifyCall =>
  <T>(method: "GET" | "PUT" | "POST", path: string, body?: unknown) =>
    api<T>(
      access,
      `${API()}${path}`,
      { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
      1,
      deadline,
    );

/**
 * A version of `item` the listener's country can play (Spotify's `market=from_token`): the same recording for a song
 * (the match rules of lib/match.ts: orchestra, singer, year), the same song and artist for a cortina; never `avoid`.
 */
export async function findPlayable(
  access: string,
  item: MatchItem,
  avoid: string,
  deadline?: number,
): Promise<Match | null> {
  const q = searchQueries(item);
  const playable = async (query: string) => {
    const j = await spotify<{ tracks?: { items?: Array<SearchHit & { is_playable?: boolean }> } }>(
      access,
      `/search?${new URLSearchParams({ q: query, type: "track", limit: "10", market: "from_token" })}`,
      {},
      deadline,
    );
    return (j.tracks?.items ?? []).filter((h) => h.is_playable !== false && h.uri !== avoid).map(toCandidate);
  };
  return (
    (item.isrc ? bestMatch(item, await playable(`isrc:${item.isrc}`), 0) : null) ??
    bestMatch(item, await playable(q.filtered)) ??
    bestMatch(item, await playable(q.plain))
  );
}

/** The listener's country (`/me`, needs user-read-private): the key a replacement is remembered under. */
export async function marketOf(access: string): Promise<string> {
  try {
    const j = await spotify<{ country?: string }>(access, "/me");
    return /^[A-Z]{2}$/.test(j.country ?? "") ? j.country! : "from_token";
  } catch {
    return "from_token";
  }
}

/**
 * Writes `uris` into a playlist and reads it back (lib/spotifyWrite.ts): `replace` rewrites it, `append` adds
 * after what it holds, `new` fills one just made. The answer is the check, never the count that was sent.
 */
export function writePlaylist(
  access: string,
  playlistId: string,
  uris: string[],
  w: VerifiedWrite,
  o: WriteOpts = {},
): Promise<PlaylistCheck> {
  return writeVerified(spotifyCall(access, o.deadline), playlistId, uris, w, o);
}

/**
 * Rewrites a playlist's name and description (Change Playlist Details). An update replaces the tracks, and the
 * description carries the set's score, so both are rewritten with the tracks; Spotify refuses this for a playlist
 * the DJ only follows, which the caller treats as "details unchanged", never as a failed update.
 */
export async function updatePlaylistDetails(
  access: string,
  playlistId: string,
  d: { name?: string; description?: string },
): Promise<boolean> {
  const body: { name?: string; description?: string } = {};
  if (d.name) body.name = d.name;
  if (typeof d.description === "string") body.description = d.description;
  if (!Object.keys(body).length) return false;
  return spotify(access, `/playlists/${playlistId}`, { method: "PUT", body: JSON.stringify(body) }).then(
    () => true,
    () => false,
  );
}

/** Makes an empty playlist in the DJ's library; the rows go in through `writePlaylist` (mode `new`). */
export async function createPlaylist(
  access: string,
  p: { name: string; description: string; isPublic: boolean },
): Promise<{ id: string; url: string; snapshot: string | null }> {
  const body = JSON.stringify({ name: p.name, description: p.description, public: p.isPublic });
  type Made = { id: string; external_urls: { spotify: string }; snapshot_id?: string };
  const pl = await spotify<Made>(access, "/me/playlists", { method: "POST", body }).catch(async () => {
    const me = await spotify<{ id: string }>(access, "/me");
    return spotify<Made>(access, `/users/${me.id}/playlists`, { method: "POST", body });
  });
  return { id: pl.id, url: pl.external_urls.spotify, snapshot: pl.snapshot_id ?? null };
}
