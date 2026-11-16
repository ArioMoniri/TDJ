import { createLimiter } from "../artwork";
import { type SongLoudness, songLoudness } from "./level";

/**
 * 2026-11 (the owner on "Level not available from Spotify": a useful level, in plain words) — a side's level for the
 * players the page cannot hear (Spotify, YouTube), from data instead of samples, and the cache that keeps it:
 *
 * - `knownSideLevel(entity)`: what is known now, in the order of `songLoudness` (level.ts) — the DJ's own linked file
 *   measured, a file or clip measured earlier on this device, the catalogue's analysed level, Deezer's `gain` from
 *   `data/`, a level looked up live earlier;
 * - `ensureSideLevel(entity)`: when nothing is known, one lookup per side (GET /api/level: Deezer's track API, then
 *   Spotify's audio-features), kept on this device like covers (lib/artwork.ts) and on the server in an LRU.
 *
 * The Spotify and YouTube sources read `knownSideLevel` when they prepare an item, so the gain they apply toward the
 * night's target is the level the Booth shows. The cache is the one the meter has kept since round 7
 * (`tdj-booth-loudness`, id → { lufs, from }): file and clip measurements there are never replaced by an estimate.
 */

export const LEVEL_CACHE_KEY = "tdj-booth-loudness";
const DEVICE_MAX = 3000;
/** a lookup the server could not finish (Deezer or Spotify unreachable) is tried again after this long */
const RETRY_MS = 60_000;

type Store = Pick<Storage, "getItem" | "setItem">;
const defaultStorage = (): Store | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};
let storage: () => Store | null = defaultStorage;
let mem: Record<string, SongLoudness> | null = null;
let version = 0;

const FROM = new Set(["file", "clip", "catalogue", "deezer", "spotify"]);
const valid = (v: unknown): v is SongLoudness => {
  const x = v as SongLoudness | null;
  return !!x && typeof x.lufs === "number" && Number.isFinite(x.lufs) && FROM.has(x.from);
};

/** id → the level kept on this device */
export function levelCache(): Record<string, SongLoudness> {
  if (mem) return mem;
  mem = {};
  try {
    const raw = storage()?.getItem(LEVEL_CACHE_KEY);
    const j = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    for (const [k, v] of Object.entries(j ?? {})) if (valid(v)) mem[k] = v;
  } catch {}
  return mem;
}
/** bumps whenever the cache or the file levels change (the meter recomputes the side's level then) */
export const levelCacheVersion = (): number => version;

/** where a level ranks when two compete for one side: a file over a clip over any estimate; estimates: the newest */
const rank = (s: SongLoudness) => (s.from === "file" ? 2 : s.from === "clip" ? 1 : 0);
/** Keep a level for a side on this device; false when it changed nothing (an estimate never replaces a measurement). */
export function rememberLevel(id: string, v: SongLoudness): boolean {
  if (!id || !valid(v)) return false;
  const c = levelCache();
  const old = c[id];
  if (old && rank(old) > rank(v)) return false;
  if (old && old.from === v.from && Math.abs(old.lufs - v.lufs) < 0.05) return false;
  delete c[id];
  c[id] = {
    lufs: Math.round(v.lufs * 10) / 10,
    from: v.from,
    ...(typeof v.peakDbFS === "number" && Number.isFinite(v.peakDbFS)
      ? { peakDbFS: Math.round(v.peakDbFS * 10) / 10 }
      : {}),
  };
  const keys = Object.keys(c);
  for (let i = 0; i < keys.length - DEVICE_MAX; i++) delete c[keys[i]!];
  try {
    storage()?.setItem(LEVEL_CACHE_KEY, JSON.stringify(c));
  } catch {}
  version++;
  return true;
}

/* ---------- the DJ's linked files (the store hands them over: no import cycle) ---------- */

type FileLevel = { lufs?: number; peakDbFS?: number } | null | undefined;
let fileLevels: (id: string) => FileLevel = () => null;
/** The Booth store tells this module how to read the measurements of the DJ's linked files. */
export function provideFileLevels(fn: (id: string) => FileLevel): void {
  fileLevels = fn;
  version++;
}

/* ---------- what is known now ---------- */

/** the fields of a song or cortina the level reads (a loose shape: songs and cortinas differ) */
export type LevelEntity =
  | {
      id?: string;
      audio?: { loudnessDb?: number | null } | null;
      level?: { gainDb?: number | null } | null;
      deezer?: { id?: string; gain?: number | null } | null;
      resolved?: { provider?: string; id?: string } | null;
      spotify?: { uri?: string } | null;
    }
  | null
  | undefined;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** the catalogue's analysed level and Deezer's `gain` as `data/` has them for a side */
export function entityLevelInputs(e: LevelEntity): { catalogueDb: number | null; deezerGain: number | null } {
  return {
    catalogueDb: num(e?.audio?.loudnessDb),
    deezerGain: num(e?.level?.gainDb) ?? num(e?.deezer?.gain),
  };
}

/** The best level known for a side right now (no lookup); `o` adds a measurement of the item playing. */
export function knownSideLevel(
  e: LevelEntity,
  o: { measured?: { lufs?: number; peakDbFS?: number } | null; measuredFrom?: "file" | "clip" | null } = {},
): SongLoudness | null {
  const id = e?.id;
  let file: FileLevel = null;
  if (id)
    try {
      file = fileLevels(id);
    } catch {}
  return songLoudness({
    ...o,
    fileMeasured: file,
    cached: id ? (levelCache()[id] ?? null) : null,
    ...entityLevelInputs(e),
  });
}

/**
 * What an external source hands the engine as the item's measurement: the side's known level (the engine's
 * `gainFor` turns it into the gain toward the target). Undefined for the catalogue's level, which the plan's prior
 * already carries (`it.gainDb`, peak cap included), and when nothing is known.
 */
export function preparedLevel(
  e: LevelEntity,
): { lufs: number; peakDbFS: number; introSec: number } | undefined {
  const l = knownSideLevel(e);
  if (!l || l.from === "catalogue") return undefined;
  return { lufs: l.lufs, peakDbFS: l.peakDbFS ?? Number.NaN, introSec: 0 };
}

/* ---------- the live lookup (GET /api/level) ---------- */

const SPOTIFY_URI = /^spotify:track:[A-Za-z0-9]{22}$/;
/** the lookup's query for a side: its id, its Deezer match and its Spotify recording; null with nothing to ask by */
export function levelQuery(e: LevelEntity): string | null {
  const id = e?.id;
  if (!id || !/^[\w.:-]{1,80}$/.test(id)) return null;
  const dz = (e?.resolved?.provider === "deezer" ? e.resolved.id : undefined) ?? e?.deezer?.id ?? undefined;
  const uri = e?.spotify?.uri;
  const p = new URLSearchParams({ id });
  if (dz && /^\d{1,15}$/.test(dz)) p.set("deezer", dz);
  if (uri && SPOTIFY_URI.test(uri)) p.set("uri", uri);
  return p.toString();
}

const asked = new Map<string, { p: Promise<SongLoudness | null>; until: number }>();
const limiter = createLimiter(3);
let fetcher: (url: string) => Promise<Response> = (url) => fetch(url);

/**
 * The side's level, looked up once when nothing is known (a few at a time, never twice in a session for the same
 * side unless the server could not reach Deezer or Spotify). Resolves to the best level known afterwards.
 */
export function ensureSideLevel(e: LevelEntity): Promise<SongLoudness | null> {
  const known = knownSideLevel(e);
  if (known) return Promise.resolve(known);
  const id = e?.id;
  const qs = levelQuery(e);
  if (!id || !qs || typeof window === "undefined") return Promise.resolve(null);
  const prev = asked.get(id);
  if (prev && prev.until > Date.now()) return prev.p;
  const entry = { p: Promise.resolve<SongLoudness | null>(null), until: Number.POSITIVE_INFINITY };
  entry.p = limiter
    .run(() => fetcher(`/api/level?${qs}`))
    .then((r) => (r.ok ? (r.json() as Promise<{ lufs?: unknown; from?: unknown; retry?: unknown }>) : null))
    .then((j) => {
      const v = { lufs: j?.lufs, from: j?.from } as SongLoudness;
      if (valid(v)) rememberLevel(id, v);
      else if (!j || j.retry) entry.until = Date.now() + RETRY_MS;
      return knownSideLevel(e);
    })
    .catch(() => {
      entry.until = Date.now() + RETRY_MS;
      return null;
    });
  asked.set(id, entry);
  return entry.p;
}

/** for the vitest: a fresh cache over the given storage and fetch */
export function _resetSideLevels(
  o: { storage?: Store | null; fetch?: (url: string) => Promise<Response> } = {},
) {
  mem = null;
  version = 0;
  asked.clear();
  fileLevels = () => null;
  storage = o.storage !== undefined ? () => o.storage ?? null : defaultStorage;
  fetcher = o.fetch ?? ((url) => fetch(url));
}
