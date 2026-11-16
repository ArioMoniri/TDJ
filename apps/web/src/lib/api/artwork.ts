import { FIND_STRONG, type FindSide, type FoundRec, fold, queryLadder, rankFound } from "@/lib/findMatch";
import SHIPPED from "../../../../../data/cache/artwork.json";
import OWNER from "../../../../../data/index/owner.json";
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
 *   /api/artwork?search=1&id=…|title=&orchestra=&singer=&year=&dur=&alt=
 *                                               → { url }  2026-11: Deezer's search climbed with the query ladder of
 *                                                 "Find on services" (lib/findMatch.ts), each candidate judged by
 *                                                 the core match rules (a solo singer's side with guitars, a side
 *                                                 with no stream)
 *
 * The parameters combine (the id first, then Spotify, then Deezer). Answers are kept in an in-memory LRU and sent
 * with HTTP cache headers; an upstream failure is never cached (`retry: true`, no-store), a recording with no cover
 * is cached for an hour.
 */
// 2026-11: the deployment owner's merged covers (data/index/owner.json, packages/core/src/owner.ts) win over the cache
export const SHIPPED_COVERS: Readonly<Record<string, string>> = {
  ...(SHIPPED as Record<string, string>),
  ...((OWNER as { artwork?: Record<string, string> }).artwork ?? {}),
};

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

/* ---------- 2026-11: a side with no recording to ask about: Deezer's search, climbed like "Find on services" ---------- */

/** at or above this the search's best candidate is the side's own recording (title and singer / leader agree) */
export const SEARCH_MIN = 0.55;
interface DeezerHit {
  id: number;
  title: string;
  duration: number;
  artist: { name: string };
  album: { title: string; cover_medium?: string; cover_big?: string };
}
/** the side the search looks for: the catalogue's own record when it has the id, else what the page sent */
export function searchSide(q: URLSearchParams, d: Pick<ApiDeps, "catalog">): FindSide | null {
  const id = q.get("id");
  const str = (k: string, max = 160) => (q.get(k) ?? "").trim().slice(0, max);
  const n = (k: string) => {
    const v = Number(q.get(k));
    return q.get(k) && Number.isFinite(v) && v > 0 ? v : null;
  };
  if (id && ID.test(id)) {
    try {
      const cat = d.catalog().catalog;
      const s = cat.songs.find((x) => x.id === id || x.altIds?.includes(id));
      if (s)
        return {
          title: s.title,
          orchestra: s.orchestra,
          singer: s.singer ?? null,
          vocal: s.vocal,
          year: s.year ?? null,
          yearApprox: s.yearApprox,
          date: s.date ?? null,
          durationSec: s.durationSec ?? null,
          durationEstimated: s.durationEstimated,
          altTitles: s.altTitles,
          rhythm: s.rhythm,
          orchestraAliases: cat.profiles?.get?.(s.orchestraId)?.aliases,
        };
    } catch {}
  }
  const title = str("title");
  const orchestra = str("orchestra", 120);
  if (!title || !orchestra) return null;
  const vocal = q.get("vocal");
  return {
    title,
    orchestra,
    singer: str("singer", 120) || null,
    ...(vocal === "0" || vocal === "1" ? { vocal: vocal === "1" } : {}),
    year: n("year"),
    durationSec: n("dur"),
    altTitles: q
      .getAll("alt")
      .map((a) => a.trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 3),
  };
}
/** the cache key of a search: what decides its answer */
export const searchKey = (s: FindSide) =>
  `q:${[fold(s.title), fold(s.orchestra), fold(s.singer ?? ""), s.year ?? ""].join("|").toLowerCase()}`;
/**
 * The ladder's queries against Deezer's public search (the same rungs as "Find on services": the singer first for a
 * solo singer's side, the leader's surname, the aliases, the folded title), each candidate judged by the core match
 * rules; the first strong one's album cover. Null when none is the side's own; throws when Deezer cannot be reached.
 */
const viaSearch =
  (side: FindSide): Lookup =>
  async (d) => {
    const seen = new Map<string, FoundRec & { cover?: string }>();
    let reached = false;
    for (const rung of queryLadder("deezer", side).slice(0, 4)) {
      const r = await d
        .fetch(`https://api.deezer.com/search?q=${encodeURIComponent(rung.q)}&limit=10`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        .catch(() => null);
      if (!r?.ok) continue;
      reached = true;
      const j = (await r.json().catch(() => null)) as { data?: DeezerHit[] } | null;
      for (const t of j?.data ?? [])
        if (t && !seen.has(String(t.id)))
          seen.set(String(t.id), {
            title: t.title,
            artists: [t.artist?.name ?? ""],
            album: t.album?.title,
            durationMs: (t.duration ?? 0) * 1000,
            mainArtistOnly: true,
            cover: t.album?.cover_medium ?? t.album?.cover_big,
          });
      const top = rankFound(side, [...seen.values()]).ranked[0];
      if (top && top.score >= FIND_STRONG) break;
    }
    if (!reached) throw new Error("deezer search unreachable");
    const best = rankFound(side, [...seen.values()]).ranked.find((x) => x.score >= SEARCH_MIN);
    const u = best?.item.cover;
    return typeof u === "string" && IMAGE.test(u) ? u : null;
  };

const CACHE_HIT = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const CACHE_MISS = "public, max-age=3600";

export async function artwork(req: Request, d: ApiDeps, cache: CoverLru = lru): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  const uri = q.get("uri");
  const deezer = q.get("deezer");
  const search = q.get("search") === "1";
  if (!id && !uri && !deezer && !search)
    return json({ covers: SHIPPED_COVERS }, { headers: { "cache-control": CACHE_HIT } });
  const track = spotifyTrackOf(uri);
  if ((id && !ID.test(id)) || (uri && !track) || (deezer && !DEEZER_ID.test(deezer)))
    return bad("Expected ?id=<id>, ?uri=spotify:track:<id>, ?deezer=<track id> or ?search=1 with the side");
  const shipped = id ? SHIPPED_COVERS[id] : undefined;
  if (shipped) return json({ url: shipped, source: "shipped" }, { headers: { "cache-control": CACHE_HIT } });

  const steps: Array<[string, Lookup]> = [];
  if (track) steps.push([`sp:${track}`, viaSpotify(track)]);
  if (deezer) steps.push([`dz:${deezer}`, viaDeezer(deezer)]);
  // 2026-11: no recording to ask about (a solo singer's side with guitars, a side with no stream): search for it
  if (search) {
    const side = searchSide(q, d);
    if (side) steps.push([searchKey(side), viaSearch(side)]);
    else if (!steps.length) return bad("?search=1 needs a catalogue id or a title and an orchestra");
  }
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
