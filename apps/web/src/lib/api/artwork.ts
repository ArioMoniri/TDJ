import SHIPPED from "../../../../../data/cache/artwork.json";
import type { ApiDeps } from "./deps";
import { bad, json } from "./http";

/**
 * GET /api/artwork — covers for the songs and cortinas, with no Spotify login (works on iPad / iPhone and without a
 * connection to Spotify): shared with the macOS and iPadOS apps (lib/app/routes.ts), which answer it on the device.
 *
 *   /api/artwork                               → { covers: { id: url } }  the shipped cache (data/cache/artwork.json,
 *                                                 scripts/build_artwork.ts), so tiles get a cover with no lookup
 *   /api/artwork?id=<song or cortina id>        → { url }  from the shipped cache
 *   /api/artwork?uri=spotify:track:<id>         → { url }  Spotify's public oEmbed (thumbnail_url)
 *   /api/artwork?deezer=<track id>              → { url }  Deezer's public track API (the album cover)
 *
 * The parameters combine (the id first, then Spotify, then Deezer). Answers are kept in an in-memory LRU and sent
 * with HTTP cache headers; an upstream failure is never cached (`retry: true`, no-store), a recording with no cover
 * is cached for an hour.
 */
export const SHIPPED_COVERS: Readonly<Record<string, string>> = SHIPPED as Record<string, string>;

const IMAGE = /^https:\/\/[^\s"'<>]+$/;
const SPOTIFY_TRACK =
  /^(?:spotify:track:|https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/)([A-Za-z0-9]{22})/;
const DEEZER_ID = /^\d{1,15}$/;
const ID = /^[\w.:-]{1,80}$/;
const HIT_TTL = 7 * 24 * 3600_000;
const MISS_TTL = 3600_000;
const MAX = 2000;
const TIMEOUT_MS = 6000;

export const spotifyTrackOf = (uri: string | null | undefined): string | null =>
  (uri && SPOTIFY_TRACK.exec(uri.trim())?.[1]) || null;

/** a small LRU with expiry: key → cover url, or null for "no cover" */
export class CoverLru {
  private m = new Map<string, { url: string | null; until: number }>();
  constructor(
    private max = MAX,
    private now: () => number = Date.now,
  ) {}
  get(k: string): { url: string | null } | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.until <= this.now()) {
      this.m.delete(k);
      return undefined;
    }
    this.m.delete(k);
    this.m.set(k, e);
    return { url: e.url };
  }
  set(k: string, url: string | null) {
    this.m.delete(k);
    this.m.set(k, { url, until: this.now() + (url ? HIT_TTL : MISS_TTL) });
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  get size() {
    return this.m.size;
  }
}
const lru = new CoverLru();

/** the cover, or null when the provider has none; throws when the provider could not be reached */
type Lookup = (d: ApiDeps) => Promise<string | null>;
const viaSpotify =
  (track: string): Lookup =>
  async (d) => {
    const r = await d.fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${track}`)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } },
    );
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) throw new Error(`oembed ${r.status}`);
    const j = (await r.json().catch(() => null)) as { thumbnail_url?: unknown } | null;
    return typeof j?.thumbnail_url === "string" && IMAGE.test(j.thumbnail_url) ? j.thumbnail_url : null;
  };
const viaDeezer =
  (id: string): Lookup =>
  async (d) => {
    const r = await d.fetch(`https://api.deezer.com/track/${id}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`deezer ${r.status}`);
    const j = (await r.json().catch(() => null)) as {
      error?: unknown;
      album?: { cover_medium?: unknown; cover_big?: unknown };
    } | null;
    if (!j || j.error) return null;
    const u = j.album?.cover_medium ?? j.album?.cover_big;
    return typeof u === "string" && IMAGE.test(u) ? u : null;
  };

const CACHE_HIT = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const CACHE_MISS = "public, max-age=3600";

export async function artwork(req: Request, d: ApiDeps, cache: CoverLru = lru): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  const uri = q.get("uri");
  const deezer = q.get("deezer");
  if (!id && !uri && !deezer)
    return json({ covers: SHIPPED_COVERS }, { headers: { "cache-control": CACHE_HIT } });
  const track = spotifyTrackOf(uri);
  if ((id && !ID.test(id)) || (uri && !track) || (deezer && !DEEZER_ID.test(deezer)))
    return bad("Expected ?id=<id>, ?uri=spotify:track:<id> or ?deezer=<track id>");
  const shipped = id ? SHIPPED_COVERS[id] : undefined;
  if (shipped) return json({ url: shipped, source: "shipped" }, { headers: { "cache-control": CACHE_HIT } });

  const steps: Array<[string, Lookup]> = [];
  if (track) steps.push([`sp:${track}`, viaSpotify(track)]);
  if (deezer) steps.push([`dz:${deezer}`, viaDeezer(deezer)]);
  let unreachable = false;
  for (const [key, lookup] of steps) {
    const hit = cache.get(key);
    let url: string | null;
    if (hit) url = hit.url;
    else {
      try {
        url = await lookup(d);
        cache.set(key, url);
      } catch {
        unreachable = true;
        continue;
      }
    }
    if (url)
      return json(
        { url, source: key.startsWith("sp:") ? "spotify" : "deezer" },
        { headers: { "cache-control": CACHE_HIT } },
      );
  }
  if (unreachable) return json({ url: null, retry: true }, { headers: { "cache-control": "no-store" } });
  return json({ url: null }, { headers: { "cache-control": CACHE_MISS } });
}
