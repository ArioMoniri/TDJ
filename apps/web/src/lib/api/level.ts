import { deezerGainToLufs, spotifyLoudnessToLufs } from "@/lib/booth/level";
import { spotifyTrackOf } from "./artwork";
import type { ApiDeps } from "./deps";
import { bad, json } from "./http";

/**
 * GET /api/level — 2026-11: a side's level for the players the page cannot hear (Spotify, YouTube), from data about
 * the recording instead of its samples (the Web Playback SDK is DRM'd). Shared with the macOS and iPadOS apps
 * (lib/app/routes.ts), like /api/artwork.
 *
 *   /api/level?id=<side id>[&deezer=<track id>][&uri=spotify:track:<id>]
 *     → { lufs, from: "catalogue" | "deezer" | "spotify" }   the first that knows, in this order:
 *       1. the catalogue (`data/`): the analysed preview's level, else Deezer's `gain` of the judged match;
 *       2. Deezer's public track API (`gain`, a level in dB: lib/booth/level.ts `deezerGainToLufs`), for the side's
 *          Deezer match (`deezer`, else the catalogue's);
 *       3. Spotify's audio-features `loudness` with the DJ's Spotify session — deprecated for new apps: a 401 / 403 /
 *          404 / 429 is a quiet "unknown", never an error;
 *     → { lufs: null }                 nothing knows (cached an hour)
 *     → { lufs: null, retry: true }    Deezer could not be reached (never cached)
 *
 * Answers are kept in an in-memory LRU (a week for a level, an hour for none) and sent with HTTP cache headers; the
 * page keeps them on the device (lib/booth/sideLevel.ts).
 */
export type LevelFrom = "catalogue" | "deezer" | "spotify";
export interface LevelAnswer {
  lufs: number | null;
  from?: LevelFrom;
  retry?: boolean;
}

const ID = /^[\w.:-]{1,80}$/;
const DEEZER_ID = /^\d{1,15}$/;
const HIT_TTL = 7 * 24 * 3600_000;
const MISS_TTL = 3600_000;
const MAX = 4000;
const TIMEOUT_MS = 6000;
const env = (k: string) => (typeof process !== "undefined" ? process.env?.[k] : undefined);
const SPOTIFY_API = () => (env("SPOTIFY_API_URL") ?? "https://api.spotify.com/v1").replace(/\/$/, "");

/** a small LRU with expiry: key → a level, or null for "nothing known" */
export class LevelLru {
  private m = new Map<string, { v: { lufs: number; from: LevelFrom } | null; until: number }>();
  constructor(
    private max = MAX,
    private now: () => number = Date.now,
  ) {}
  get(k: string): { v: { lufs: number; from: LevelFrom } | null } | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.until <= this.now()) {
      this.m.delete(k);
      return undefined;
    }
    this.m.delete(k);
    this.m.set(k, e);
    return { v: e.v };
  }
  set(k: string, v: { lufs: number; from: LevelFrom } | null) {
    this.m.delete(k);
    this.m.set(k, { v, until: this.now() + (v ? HIT_TTL : MISS_TTL) });
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  get size() {
    return this.m.size;
  }
}
const lru = new LevelLru();

type SideRec = {
  audio?: { loudnessDb?: number | null } | null;
  level?: { gainDb?: number | null } | null;
  deezer?: { id?: string; gain?: number | null } | null;
  resolved?: { provider?: string; id?: string } | null;
  spotify?: { uri?: string } | null;
};
function catalogueSide(id: string, d: Pick<ApiDeps, "catalog">): SideRec | null {
  try {
    const cat = d.catalog().catalog as unknown as {
      songs: Array<SideRec & { id: string; altIds?: string[] }>;
      cortinas?: Array<SideRec & { id: string }>;
    };
    return (
      cat.songs.find((x) => x.id === id || x.altIds?.includes(id)) ??
      cat.cortinas?.find((x) => x.id === id) ??
      null
    );
  } catch {
    return null;
  }
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Deezer's track API: the level, null when the track carries none; throws when Deezer cannot be reached */
async function viaDeezer(id: string, d: ApiDeps): Promise<number | null> {
  const r = await d.fetch(`https://api.deezer.com/track/${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`deezer ${r.status}`);
  const j = (await r.json().catch(() => null)) as { error?: unknown; gain?: unknown } | null;
  if (!j || j.error) return null;
  return deezerGainToLufs(j.gain);
}
/**
 * Spotify's audio-features with the DJ's session; null on any refusal (the endpoint is closed to new apps), undefined
 * without a session (that says nothing about the track: not cached)
 */
async function viaSpotify(track: string, req: Request, d: ApiDeps): Promise<number | null | undefined> {
  const s = await d.spotify.session(req).catch(() => null);
  if (!s) return undefined;
  try {
    const r = await d.fetch(`${SPOTIFY_API()}/audio-features/${track}`, {
      headers: { authorization: `Bearer ${s.access}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { loudness?: unknown } | null;
    return spotifyLoudnessToLufs(j?.loudness);
  } catch {
    return null;
  }
}

const CACHE_HIT = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const CACHE_MISS = "public, max-age=3600";

export async function level(req: Request, d: ApiDeps, cache: LevelLru = lru): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  const deezer = q.get("deezer");
  const uri = q.get("uri");
  const track = spotifyTrackOf(uri);
  if (!id || !ID.test(id) || (deezer && !DEEZER_ID.test(deezer)) || (uri && !track))
    return bad("Expected ?id=<side id>, with &deezer=<track id> and &uri=spotify:track:<id> when known");
  const hit = (lufs: number, from: LevelFrom) =>
    json({ lufs, from } satisfies LevelAnswer, { headers: { "cache-control": CACHE_HIT } });

  // 1. the catalogue
  const side = catalogueSide(id, d);
  const cat = num(side?.audio?.loudnessDb);
  if (cat !== null) return hit(cat, "catalogue");
  const shipped = deezerGainToLufs(num(side?.level?.gainDb) ?? num(side?.deezer?.gain));
  if (shipped !== null) return hit(shipped, "deezer");

  // 2. Deezer's track API, 3. Spotify's audio-features (each answer kept in the LRU)
  const dz =
    deezer ??
    (side?.resolved?.provider === "deezer" && DEEZER_ID.test(side.resolved.id ?? "")
      ? side.resolved.id
      : null) ??
    (side?.deezer?.id && DEEZER_ID.test(side.deezer.id) ? side.deezer.id : null);
  const sp = track ?? spotifyTrackOf(side?.spotify?.uri);
  let unreachable = false;
  const steps: Array<[string, LevelFrom, () => Promise<number | null | undefined>]> = [];
  if (dz) steps.push([`dz:${dz}`, "deezer", () => viaDeezer(dz, d)]);
  if (sp) steps.push([`sp:${sp}`, "spotify", () => viaSpotify(sp, req, d)]);
  for (const [key, from, look] of steps) {
    const c = cache.get(key);
    let v = c?.v ?? null;
    if (!c) {
      try {
        const lufs = await look();
        v = lufs === null || lufs === undefined ? null : { lufs, from };
        if (lufs !== undefined) cache.set(key, v);
      } catch {
        unreachable = true;
        continue;
      }
    }
    if (v) return hit(v.lufs, v.from);
  }
  if (unreachable)
    return json({ lufs: null, retry: true } satisfies LevelAnswer, {
      headers: { "cache-control": "no-store" },
    });
  return json({ lufs: null } satisfies LevelAnswer, { headers: { "cache-control": CACHE_MISS } });
}
