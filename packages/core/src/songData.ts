import { normTitle } from "./energy";
import type { DeezerCache } from "./enrich";
import type { Song } from "./types";

/**
 * Round 22 — per-song data the Database shows and fills (docs/ROADMAP.md "Round 22 onward" §3, §12): BPM, key, level,
 * artwork, release date, the Spotify and Deezer ids and the vocal style. Three layers, highest first:
 *
 *   1. the DJ's edit (their database, `songs[id]`): always wins;
 *   2. what this user's sources fetched (`ScrapedRecord`, kept per user, each value with its source and fetch time;
 *      refreshed when the source's track changes or the record is old);
 *   3. the shipped index and caches (data/cache/*), with the source they carry.
 */
export type DataField =
  | "bpm"
  | "key"
  | "gainDb"
  | "artwork"
  | "release"
  | "deezerId"
  | "spotifyUri"
  | "vocalStyle";
/** the fields a fill run asks the sources for */
export const FILL_FIELDS: DataField[] = ["bpm", "key", "gainDb", "artwork", "release"];
export const FIELD_LABEL: Record<DataField, string> = {
  bpm: "BPM",
  key: "Key",
  gainDb: "Level",
  artwork: "Artwork",
  release: "Date",
  deezerId: "Deezer",
  spotifyUri: "Spotify",
  vocalStyle: "Vocal style",
};

export interface ScrapedValues {
  bpm?: number;
  /** "Am", "F♯m", "C" */
  key?: string;
  gainDb?: number;
  artwork?: string;
  /** ISO date or year */
  release?: string;
  deezerId?: string;
  spotifyUri?: string;
  vocalStyle?: "estribillo" | "cantor";
}
export interface SourceStamp {
  fetchedAt: string;
  /** the source's own id for what it matched (a Deezer track, a MusicBrainz recording): a new one means refetch */
  ref?: string;
  changedAt?: string;
  /** the values the last change from this source replaced */
  previous?: Partial<ScrapedValues>;
}
export interface ScrapedRecord extends ScrapedValues {
  /** which source gave each value */
  fields: Partial<Record<DataField, string>>;
  sources: Record<string, SourceStamp>;
}
/** the DJ's own values (a subset of the song patch) */
export interface DjSongData {
  bpm?: number;
  key?: string;
  gainDb?: number;
  artwork?: string;
  release?: string;
  deezerId?: string;
  spotify?: { uri: string } | null;
  vocalStyle?: "estribillo" | "cantor";
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** a fetch from one source over the stored record: new values replace old ones; the replaced ones are kept */
export function mergeScraped(
  prev: ScrapedRecord | null | undefined,
  fetched: ScrapedValues,
  source: string,
  ref?: string,
  now: string = new Date().toISOString(),
): ScrapedRecord {
  const next: ScrapedRecord = {
    ...(prev ?? {}),
    fields: { ...(prev?.fields ?? {}) },
    sources: { ...(prev?.sources ?? {}) },
  };
  const replaced: Partial<ScrapedValues> = {};
  for (const [k, v] of Object.entries(fetched) as Array<[keyof ScrapedValues, unknown]>) {
    if (v === undefined || v === null || v === "") continue;
    if (prev && prev[k] !== undefined && !same(prev[k], v))
      (replaced as Record<string, unknown>)[k] = prev[k];
    (next as unknown as Record<string, unknown>)[k] = v;
    next.fields[k] = source;
  }
  const old = prev?.sources[source];
  const changed = Object.keys(replaced).length > 0;
  next.sources[source] = {
    fetchedAt: now,
    ...(ref ? { ref } : {}),
    ...(changed
      ? { changedAt: now, previous: replaced }
      : old?.changedAt
        ? { changedAt: old.changedAt, previous: old.previous }
        : {}),
  };
  return next;
}

/** due for a refetch from `source`: never fetched, the source now matches another track (`ref`), or older than `maxAgeDays` */
export function needsRefresh(
  rec: ScrapedRecord | null | undefined,
  source: string,
  ref?: string,
  now = Date.now(),
  maxAgeDays = 90,
): boolean {
  const st = rec?.sources?.[source];
  if (!st) return true;
  if (ref !== undefined && st.ref !== ref) return true;
  const t = Date.parse(st.fetchedAt);
  return !Number.isFinite(t) || now - t > maxAgeDays * 86_400_000;
}

const SHARP: Record<string, string> = { "C#": "C♯", "D#": "D♯", "F#": "F♯", "G#": "G♯", "A#": "A♯" };
/** "Am" from analysed audio */
export const keyName = (a: { key: string; mode: string }) =>
  `${SHARP[a.key] ?? a.key}${a.mode === "minor" ? "m" : ""}`;

export type Valued<T> = { value: T; source: string };
export type SongDataView = Partial<{ [K in DataField]: Valued<NonNullable<ScrapedValues[K]>> }>;

/** every field's effective value and where it came from: the DJ's edit, then the user's sources, then the index */
export function songData(s: Song, scraped?: ScrapedRecord | null, dj?: DjSongData | null): SongDataView {
  const out: SongDataView = {};
  const put = <K extends DataField>(k: K, v: unknown, source: string) => {
    if (out[k] || v === undefined || v === null || v === "" || (typeof v === "number" && !Number.isFinite(v)))
      return;
    (out as Record<string, unknown>)[k] = { value: v, source };
  };
  // 1. the DJ
  if (dj) {
    put("bpm", dj.bpm, "dj");
    put("key", dj.key, "dj");
    put("gainDb", dj.gainDb, "dj");
    put("artwork", dj.artwork, "dj");
    put("release", dj.release, "dj");
    put("deezerId", dj.deezerId, "dj");
    put("spotifyUri", dj.spotify?.uri, "dj");
    put("vocalStyle", dj.vocalStyle, "dj");
  }
  // 2. the user's sources
  if (scraped)
    for (const k of Object.keys(scraped.fields) as DataField[])
      put(k, scraped[k], scraped.fields[k] ?? "source");
  // 3. the index and the shipped caches
  if (s.tempo?.bpm) put("bpm", s.tempo.bpm, s.tempo.source);
  if (s.audio?.bpm) put("bpm", s.audio.bpm, "audio");
  put("bpm", s.bpm || undefined, "index");
  if (s.audio?.key) put("key", keyName(s.audio), "audio");
  if (s.level) put("gainDb", s.level.gainDb, s.level.source);
  if (s.resolved?.artwork) put("artwork", s.resolved.artwork, s.resolved.provider);
  put("release", s.date, "index");
  put("deezerId", s.deezer?.id ?? (s.resolved?.provider === "deezer" ? s.resolved.id : undefined), "deezer");
  put("spotifyUri", s.spotify?.uri, "spotify");
  put("vocalStyle", s.vocalStyle, s.vocalStyleSource ?? "knowledge");
  return out;
}

/** the fill fields nothing has a value for */
export function missingFields(v: SongDataView): DataField[] {
  return FILL_FIELDS.filter((k) => !v[k]);
}

/** the user's scraped records as the engine's caches: Deezer BPM / gain records and artwork per song */
export function scrapedCaches(recs: Record<string, ScrapedRecord> | null | undefined): {
  deezer: DeezerCache;
  artwork: Record<string, string>;
} {
  const deezer: DeezerCache = {};
  const artwork: Record<string, string> = {};
  for (const [id, r] of Object.entries(recs ?? {})) {
    if (r.artwork) artwork[id] = r.artwork;
    if (!r.deezerId) continue;
    const st = r.sources.deezer;
    deezer[id] = {
      id: r.deezerId,
      ...(r.bpm !== undefined ? { bpm: r.bpm } : {}),
      ...(r.gainDb !== undefined ? { gain: r.gainDb } : {}),
      ...(r.release ? { release: r.release } : {}),
      source: "deezer",
      fetchedAt: st?.fetchedAt ?? new Date(0).toISOString(),
    };
  }
  return { deezer, artwork };
}

export interface TandaTone {
  mode: "minor" | "major" | "mixed" | null;
  keys: string[];
  bpm: number | null;
  feel: "calm" | "steady" | "lively";
  /** "Minor · lively · 122 BPM" */
  label: string;
}
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** a tanda's tone: its mode and keys (analysed or the DJ's), its feel (energy) and its mean tempo */
export function tandaTone(songs: Song[], keys?: Array<string | undefined>): TandaTone | null {
  if (!songs.length) return null;
  const ks = songs
    .map((s, i) => keys?.[i] ?? (s.audio?.key ? keyName(s.audio) : undefined))
    .filter((k): k is string => !!k);
  const modes = new Set(ks.map((k) => (k.endsWith("m") ? "minor" : "major")));
  const mode = !modes.size ? null : modes.size > 1 ? "mixed" : ([...modes][0] as "minor" | "major");
  const bpms = songs.map((s) => s.tempo?.bpm || s.audio?.bpm || 0).filter((b) => b > 0);
  const bpm = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
  const e = songs.reduce((a, s) => a + (s.energy ?? 50), 0) / songs.length;
  const feel = e < 45 ? "calm" : e < 65 ? "steady" : "lively";
  const label = [
    mode === "mixed" ? "Mixed keys" : mode ? cap(mode) : null,
    mode ? feel : cap(feel),
    bpm ? `${bpm} BPM` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { mode, keys: [...new Set(ks)], bpm, feel, label };
}

/** every recording of a title (any orchestra, any year), oldest first, the side itself included */
export function versionsOf(songs: Song[], s: Pick<Song, "title">): Song[] {
  const t = normTitle(s.title);
  return songs
    .filter((x) => normTitle(x.title) === t)
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.orchestra.localeCompare(b.orchestra));
}
