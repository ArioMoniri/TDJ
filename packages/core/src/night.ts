import { attachBooth, type BoothInputs, boothInputs } from "./booth";
import type { Catalog } from "./catalog";
import { normTitle } from "./energy";
import { scorePlaylist } from "./score";
import { renight, retimeTanda } from "./swap";
import type {
  ComposeOptions,
  Cortina,
  DanceRhythm,
  Era,
  Phase,
  Playlist,
  Rhythm,
  Song,
  Tanda,
} from "./types";

/**
 * A composed night as a portable file (`.tdjnight`, ROADMAP §13): versioned JSON with every tanda, each side's
 * catalogue id and stream ids, the cortinas, the Cumparsitas, the DJ's skip / lock flags, the night's settings and
 * its score. It never carries keys, tokens or personal data: the options are cleaned of what the DJ's own database
 * and memory put there (learned preferences, overrides, recent sets), the booth inputs of per-device measurements.
 *
 * Import resolves each side against the local catalogue by id (and merged ids), then by title + orchestra + year;
 * a side the catalogue does not hold stays in its tanda as a placeholder built from the file (its stream ids still
 * export) and is listed in `missing`: nothing is ever dropped silently.
 */
export const NIGHT_FORMAT = "tdjnight";
export const NIGHT_VERSION = 1;
export const NIGHT_EXTENSION = ".tdjnight";
export const NIGHT_MIME = "application/vnd.tdj.night+json";

export interface NightStreams {
  spotify?: string;
  deezer?: string;
  itunes?: string;
  musicbrainz?: string;
}
export interface NightSide {
  id: string;
  title: string;
  orchestra: string;
  orchestraId: string;
  singer: string | null;
  year: number | null;
  rhythm: Rhythm;
  durationSec?: number;
  streams?: NightStreams;
  /**
   * QA fix 2026-11 (a room's night changed length when a second DJ joined): the side exactly as it plays in the
   * night that was shared — its recording length, its checked Spotify and preview recordings, its tempo, level and
   * analysis. A room carries it (`exportNight(p, { exact: true })`), so the night a DJ joins is the night that went
   * in, not the catalogue's own take of the same side; a key with `null` means the night has none.
   */
  play?: NightPlay;
}
export interface NightPlay {
  durationSec?: number | null;
  spotify?: Song["spotify"] | null;
  resolved?: Song["resolved"] | null;
  tempo?: Song["tempo"] | null;
  level?: Song["level"] | null;
  audio?: Song["audio"] | null;
}
const PLAY_KEYS = ["durationSec", "spotify", "resolved", "tempo", "level", "audio"] as const;
export interface NightCortinaPlay {
  spotify?: Cortina["spotify"] | null;
  resolved?: Cortina["resolved"] | null;
  hook?: Cortina["hook"] | null;
  startSec?: number | null;
  lengthSec?: number | null;
}
const CORTINA_PLAY_KEYS = ["spotify", "resolved", "hook", "startSec", "lengthSec"] as const;
export interface NightCortina {
  id: string;
  title: string;
  artist: string;
  genre?: string;
  culture?: string;
  energy?: number;
  year?: number;
  lengthSec?: number;
  startSec?: number;
  streams?: NightStreams;
  /** the cortina's recordings and hook as the shared night plays them (rooms; see `NightSide.play`) */
  play?: NightCortinaPlay;
  /** 2026-11 (rooms): the DJ chose it for this gap (kept when the cortinas are re-picked) */
  picked?: boolean;
}
export interface NightTanda {
  rhythm: DanceRhythm;
  orchestra: string;
  orchestraId: string;
  singer: string | null;
  vocal: boolean;
  era: Era;
  phase: Phase;
  targetEnergy: number;
  sides: NightSide[];
  cortina: NightCortina | null;
  locked?: boolean;
  bypass?: boolean;
  pinned?: { by: "dj"; reason?: string; at?: string };
  note?: string;
  birthday?: boolean;
  peak?: boolean;
  style?: Tanda["style"];
  reason?: string;
  /** what the engine measured about the tanda when it was built (heatmap, band, cohesion…), kept for the score */
  meta?: Partial<Pick<Tanda, (typeof TANDA_META)[number]>>;
}
const TANDA_META = [
  "heat",
  "band",
  "golden",
  "crossesBreak",
  "spreadFloor",
  "poolSmall",
  "cohesion",
] as const;
export interface NightFile {
  format: typeof NIGHT_FORMAT;
  version: number;
  name: string;
  createdAt: string;
  /** the night's settings (engine options, cleaned of personal data) */
  options: Partial<ComposeOptions>;
  /** the booth's timing inputs (gaps, cortina stop and fades, trims), without per-device measurements */
  booth?: BoothInputs;
  score: { total: number; verdict: string };
  tandas: NightTanda[];
  opening: NightSide | null;
  closing: NightSide | null;
  closingPinned?: Playlist["closingPinned"];
  breaks?: Playlist["breaks"];
  /** what the night's settings could not do and what played instead (shown with the score) */
  fallbacks?: { settings?: string[]; cortinas?: string };
}

/** Option keys that come from the DJ's database or memory, never the night itself. */
const PRIVATE_OPTION_KEYS = [
  "learned",
  "favourites",
  "overrides",
  "recent",
  "explicit",
  "contextApplied",
  "trackSecByRhythm",
];

/** The night's options without anything personal (learned preferences, database overrides, recent sets). */
export function cleanNightOptions(o: Partial<ComposeOptions>): Partial<ComposeOptions> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {}))
    if (!PRIVATE_OPTION_KEYS.includes(k) && v !== undefined) out[k] = v;
  return JSON.parse(JSON.stringify(out)) as Partial<ComposeOptions>;
}

const STREAM_PROVIDERS = ["spotify", "deezer", "itunes", "musicbrainz"] as const;
function streamsOf(x: {
  spotify?: { uri: string } | null;
  resolved?: { provider: string; id: string } | null;
}): NightStreams | undefined {
  const s: NightStreams = {};
  if (x.spotify?.uri) s.spotify = x.spotify.uri;
  const r = x.resolved;
  if (r?.id && (STREAM_PROVIDERS as readonly string[]).includes(r.provider) && r.provider !== "spotify")
    s[r.provider as keyof NightStreams] = r.id;
  return Object.keys(s).length ? s : undefined;
}

/** What a night export keeps: `exact` adds each side's and cortina's playback data (a room carries the night exactly). */
export interface NightExportOptions {
  exact?: boolean;
}
const copy = <T>(x: T): T => (x == null ? x : (JSON.parse(JSON.stringify(x)) as T));

export function nightSide(s: Song, o: NightExportOptions = {}): NightSide {
  const out: NightSide = {
    id: s.id,
    title: s.title,
    orchestra: s.orchestra,
    orchestraId: s.orchestraId,
    singer: s.singer ?? null,
    year: s.year ?? null,
    rhythm: s.rhythm,
  };
  if (s.durationSec) out.durationSec = Math.round(s.durationSec);
  const st = streamsOf(s);
  if (st) out.streams = st;
  if (o.exact) {
    const play: NightPlay = {};
    for (const k of PLAY_KEYS) (play as Record<string, unknown>)[k] = copy(s[k]) ?? null;
    out.play = play;
  }
  return out;
}

export function nightCortina(c: Cortina, o: NightExportOptions = {}): NightCortina {
  const out: NightCortina = { id: c.id, title: c.title, artist: c.artist };
  if (c.genre) out.genre = c.genre;
  if (c.culture) out.culture = c.culture;
  if (typeof c.energy === "number") out.energy = c.energy;
  if (c.year) out.year = c.year;
  if (c.lengthSec) out.lengthSec = c.lengthSec;
  if (c.startSec) out.startSec = c.startSec;
  if (c.picked) out.picked = true;
  const st = streamsOf(c);
  if (st) out.streams = st;
  if (o.exact) {
    const play: NightCortinaPlay = {};
    for (const k of CORTINA_PLAY_KEYS) (play as Record<string, unknown>)[k] = copy(c[k]) ?? null;
    out.play = play;
  }
  return out;
}

export function nightTanda(t: Tanda, o: NightExportOptions = {}): NightTanda {
  const out: NightTanda = {
    rhythm: t.rhythm,
    orchestra: t.orchestra,
    orchestraId: t.orchestraId,
    singer: t.singer ?? null,
    vocal: !!t.vocal,
    era: t.era,
    phase: t.phase,
    targetEnergy: t.targetEnergy,
    sides: t.songs.map((s) => nightSide(s, o)),
    cortina: t.cortina ? nightCortina(t.cortina, o) : null,
  };
  if (t.locked) out.locked = true;
  if (t.bypass) out.bypass = true;
  if (t.pinned) out.pinned = { ...t.pinned };
  if (t.note) out.note = t.note;
  if (t.birthday) out.birthday = true;
  if (t.peak) out.peak = true;
  if (t.style) out.style = t.style;
  if (t.reason) out.reason = t.reason;
  const meta: Record<string, unknown> = {};
  for (const k of TANDA_META) if (t[k] !== undefined) meta[k] = JSON.parse(JSON.stringify(t[k]));
  if (Object.keys(meta).length) out.meta = meta as NightTanda["meta"];
  return out;
}

function boothOf(p: Playlist): BoothInputs | undefined {
  if (!p.booth) return undefined;
  const { measurements: _m, ...rest } = boothInputs(p.booth);
  return Object.keys(rest).length ? (JSON.parse(JSON.stringify(rest)) as BoothInputs) : undefined;
}

/** The night as a `.tdjnight` document (deterministic: the same night gives the same JSON). */
export function exportNight(p: Playlist, o: NightExportOptions = {}): NightFile {
  const out: NightFile = {
    format: NIGHT_FORMAT,
    version: NIGHT_VERSION,
    name: p.name,
    createdAt: p.createdAt,
    options: cleanNightOptions(p.options),
    score: { total: p.score?.total ?? 0, verdict: p.score?.verdict ?? "" },
    tandas: p.tandas.map((t) => nightTanda(t, o)),
    opening: p.opening ? nightSide(p.opening, o) : null,
    closing: p.closing ? nightSide(p.closing, o) : null,
  };
  const booth = boothOf(p);
  if (booth) out.booth = booth;
  if (p.closingPinned) out.closingPinned = { ...p.closingPinned };
  if (p.breaks?.length) out.breaks = p.breaks.map((b) => ({ ...b }));
  const fb: NonNullable<NightFile["fallbacks"]> = {};
  if (p.stats?.settingFallbacks?.length) fb.settings = [...p.stats.settingFallbacks];
  if (p.stats?.cortinaFallback) fb.cortinas = p.stats.cortinaFallback;
  if (Object.keys(fb).length) out.fallbacks = fb;
  return out;
}

/** The file as text: pretty JSON with a trailing newline. */
export function nightFileText(n: NightFile): string {
  return `${JSON.stringify(n, null, 2)}\n`;
}

export class NightFormatError extends Error {}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max = 400) => (typeof x === "string" ? x.slice(0, max) : "");
function checkSide(x: unknown, where: string): NightSide {
  if (!isObj(x) || typeof x.id !== "string" || typeof x.title !== "string")
    throw new NightFormatError(`${where} is not a recording`);
  return x as unknown as NightSide;
}

/** Parses and checks a `.tdjnight` document (text or object). Throws `NightFormatError` with a plain reason. */
export function parseNightFile(input: unknown): NightFile {
  let x = input;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      throw new NightFormatError("This file is not a T-DJ night.");
    }
  }
  if (!isObj(x) || x.format !== NIGHT_FORMAT) throw new NightFormatError("This file is not a T-DJ night.");
  if (typeof x.version !== "number" || x.version > NIGHT_VERSION)
    throw new NightFormatError("This night was made by a newer T-DJ. Update the app to open it.");
  if (!Array.isArray(x.tandas) || x.tandas.length > 80)
    throw new NightFormatError("The night has no tandas.");
  x.tandas.forEach((t, i) => {
    if (!isObj(t) || !Array.isArray(t.sides) || t.sides.length > 12)
      throw new NightFormatError(`Tanda ${i + 1} is damaged.`);
    t.sides.forEach((s, k) => checkSide(s, `Tanda ${i + 1}, side ${k + 1}`));
  });
  if (x.opening) checkSide(x.opening, "The opening Cumparsita");
  if (x.closing) checkSide(x.closing, "The closing Cumparsita");
  return {
    ...(x as unknown as NightFile),
    name: str(x.name, 200) || "Shared night",
    createdAt: str(x.createdAt, 40) || new Date(0).toISOString(),
    options: isObj(x.options) ? cleanNightOptions(x.options as Partial<ComposeOptions>) : {},
    score: isObj(x.score)
      ? { total: Number(x.score.total) || 0, verdict: str(x.score.verdict) }
      : { total: 0, verdict: "" },
    opening: (x.opening as NightSide | null) ?? null,
    closing: (x.closing as NightSide | null) ?? null,
  };
}

/* ---------- import ---------- */

export interface MissingItem {
  /** "Tanda 3, side 2", "Cortina after tanda 3", "Closing Cumparsita" */
  where: string;
  title: string;
  /** the orchestra, or the cortina's artist */
  by: string;
  year: number | null;
  /** it still has a stream id, so the Spotify export can carry it */
  streamable: boolean;
}
export interface ImportResult {
  playlist: Playlist;
  missing: MissingItem[];
  matched: { byId: number; byTitle: number; missing: number };
}

const fold = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

interface Index {
  byId: Map<string, Song>;
  byTitle: Map<string, Song[]>;
  cortinas: Map<string, Cortina>;
}
const titleKey = (title: string, orchestra: string) => `${normTitle(title)}|${fold(orchestra)}`;
const indexCache = new WeakMap<object, Index>();
function indexOf(catalog: Pick<Catalog, "songs">, cortinas: Cortina[]): Index {
  const hit = indexCache.get(catalog);
  if (hit && hit.cortinas.size === cortinas.length) return hit;
  const byId = new Map<string, Song>();
  const byTitle = new Map<string, Song[]>();
  for (const s of catalog.songs) {
    byId.set(s.id, s);
    for (const a of (s as Song & { altIds?: string[] }).altIds ?? []) if (!byId.has(a)) byId.set(a, s);
    for (const k of [titleKey(s.title, s.orchestraId), titleKey(s.title, s.orchestra)]) {
      const l = byTitle.get(k);
      if (l) l.includes(s) || l.push(s);
      else byTitle.set(k, [s]);
    }
  }
  const out = { byId, byTitle, cortinas: new Map(cortinas.map((c) => [c.id, c])) };
  indexCache.set(catalog, out);
  return out;
}

function findSide(ix: Index, x: NightSide): { song: Song; by: "id" | "title" } | null {
  const id = ix.byId.get(x.id);
  if (id) return { song: id, by: "id" };
  const pool = [
    ...(ix.byTitle.get(titleKey(x.title, x.orchestraId)) ?? []),
    ...(ix.byTitle.get(titleKey(x.title, x.orchestra)) ?? []),
  ];
  if (!pool.length) return null;
  const singer = fold(x.singer);
  const sameYear = pool.filter((s) => x.year !== null && s.year === x.year);
  const pick = (l: Song[]) => l.find((s) => fold(s.singer) === singer) ?? (l.length === 1 ? l[0] : undefined);
  const song =
    pick(sameYear) ??
    (x.year === null ? pick(pool) : undefined) ??
    // a year one off (a session dated across New Year in one discography, not the other), same singer only
    pool.find(
      (s) =>
        x.year !== null && s.year !== null && Math.abs(s.year - x.year) === 1 && fold(s.singer) === singer,
    );
  return song ? { song, by: "title" } : null;
}

const SPOTIFY_URI = /^spotify:track:[A-Za-z0-9]{22}$/;
function placeholderSide(x: NightSide, era: Era): Song {
  const uri = x.streams?.spotify && SPOTIFY_URI.test(x.streams.spotify) ? x.streams.spotify : null;
  return {
    id: x.id,
    title: x.title,
    rhythm: x.rhythm ?? "tango",
    orchestra: x.orchestra,
    orchestraId: x.orchestraId,
    singer: x.singer ?? null,
    singerId: null,
    vocal: !!x.singer,
    year: x.year ?? null,
    era,
    source: "import",
    notes: "Not in this catalogue (imported night)",
    durationSec: x.durationSec ?? 170,
    spotify: uri ? { uri, url: `https://open.spotify.com/track/${uri.slice(14)}` } : null,
  };
}
function placeholderCortina(x: NightCortina): Cortina {
  const uri = x.streams?.spotify && SPOTIFY_URI.test(x.streams.spotify) ? x.streams.spotify : null;
  return {
    id: x.id,
    title: x.title,
    artist: x.artist,
    genre: x.genre ?? "",
    culture: x.culture ?? "global",
    energy: x.energy ?? 50,
    year: x.year,
    lengthSec: x.lengthSec,
    startSec: x.startSec,
    spotify: uri ? { uri, url: `https://open.spotify.com/track/${uri.slice(14)}` } : null,
  };
}

/** The night's own playback data over the catalogue's side (`NightSide.play`): the shared night decides. */
function withPlay(song: Song, x: NightSide): Song {
  const play = x.play;
  if (!play || typeof play !== "object") return song;
  const out = { ...song } as Record<string, unknown>;
  for (const k of PLAY_KEYS) {
    if (!(k in play)) continue;
    const v = play[k];
    if (v == null) delete out[k];
    else out[k] = copy(v);
  }
  return out as unknown as Song;
}
function withCortinaPlay(c: Cortina, x: NightCortina): Cortina {
  const play = x.play;
  if (!play || typeof play !== "object") return c;
  const out = { ...c } as Record<string, unknown>;
  for (const k of CORTINA_PLAY_KEYS) {
    if (!(k in play)) continue;
    const v = play[k];
    if (v == null) delete out[k];
    else out[k] = copy(v);
  }
  return out as unknown as Cortina;
}

/** A side from another catalogue keeps the stream ids it was shared with. */
function withStreams(song: Song, x: NightSide): Song {
  if (x.play) return withPlay(song, x);
  const uri = x.streams?.spotify;
  if (song.spotify?.uri || !uri || !SPOTIFY_URI.test(uri)) return song;
  return { ...song, spotify: { uri, url: `https://open.spotify.com/track/${uri.slice(14)}` } };
}

export interface ImportDeps {
  catalog: Pick<Catalog, "songs">;
  cortinas?: Cortina[];
}

/** Rebuilds a playable night from a `.tdjnight` against the local catalogue; see the module comment. */
export function importNight(input: NightFile | unknown, deps: ImportDeps): ImportResult {
  const n = parseNightFile(input);
  const ix = indexOf(deps.catalog, deps.cortinas ?? []);
  const missing: MissingItem[] = [];
  const matched = { byId: 0, byTitle: 0, missing: 0 };
  const side = (x: NightSide, era: Era, where: string): Song => {
    const f = findSide(ix, x);
    if (f) {
      matched[f.by === "id" ? "byId" : "byTitle"]++;
      return withStreams(f.song, x);
    }
    matched.missing++;
    missing.push({
      where,
      title: x.title,
      by: x.orchestra,
      year: x.year ?? null,
      streamable: !!x.streams?.spotify,
    });
    return withPlay(placeholderSide(x, era), x);
  };
  const tandas: Tanda[] = n.tandas.map((t, i) => {
    const songs = t.sides.map((s, k) => side(s, t.era, `Tanda ${i + 1}, side ${k + 1}`));
    let cortina: Cortina | null = null;
    if (t.cortina) {
      const c = ix.cortinas.get(t.cortina.id);
      // the night's own cue: where it starts and how long it plays (the composer sets them per night)
      if (c)
        cortina = withCortinaPlay(
          {
            ...c,
            lengthSec: t.cortina.lengthSec ?? c.lengthSec,
            startSec: t.cortina.startSec ?? c.startSec,
          },
          t.cortina,
        );
      else {
        cortina = withCortinaPlay(placeholderCortina(t.cortina), t.cortina);
        if (ix.cortinas.size) {
          missing.push({
            where: `Cortina after tanda ${i + 1}`,
            title: t.cortina.title,
            by: t.cortina.artist,
            year: t.cortina.year ?? null,
            streamable: !!t.cortina.streams?.spotify,
          });
        }
      }
      // 2026-11 (rooms): the DJ's own choice stays theirs
      if (cortina && t.cortina.picked) cortina = { ...cortina, picked: true };
    }
    const base: Tanda = {
      index: i,
      rhythm: t.rhythm,
      orchestra: t.orchestra,
      orchestraId: t.orchestraId,
      singer: t.singer ?? null,
      vocal: !!t.vocal,
      yearRange: null,
      era: t.era ?? "unknown",
      songs: [],
      energy: 0,
      energyCurve: [],
      targetEnergy: t.targetEnergy ?? 50,
      phase: t.phase ?? "build",
      durationSec: 0,
      cortina,
    };
    if (t.style) base.style = t.style;
    if (t.locked) base.locked = true;
    if (t.bypass) base.bypass = true;
    if (t.pinned) base.pinned = { ...t.pinned };
    if (t.note) base.note = t.note;
    if (t.birthday) base.birthday = true;
    if (t.peak) base.peak = true;
    if (t.reason) base.reason = t.reason;
    if (t.meta && typeof t.meta === "object")
      for (const k of TANDA_META)
        if (t.meta[k] !== undefined) (base as unknown as Record<string, unknown>)[k] = t.meta[k];
    return retimeTanda(base, songs);
  });
  const opening = n.opening ? side(n.opening, "golden-peak", "Opening Cumparsita") : null;
  const closing = n.closing ? side(n.closing, "golden-peak", "Closing Cumparsita") : null;
  const shell: Playlist = {
    id: `import-${nightHash(JSON.stringify(n.tandas.map((t) => t.sides.map((s) => s.id))))}`,
    name: n.name,
    createdAt: n.createdAt,
    options: n.options as ComposeOptions,
    tandas,
    closing,
    opening,
    stats: {
      ...(n.fallbacks?.settings?.length ? { settingFallbacks: [...n.fallbacks.settings] } : {}),
      ...(n.fallbacks?.cortinas ? { cortinaFallback: n.fallbacks.cortinas } : {}),
    } as Playlist["stats"],
    score: { total: n.score.total, verdict: n.score.verdict, factors: [] },
  };
  if (n.breaks?.length) shell.breaks = n.breaks.map((b) => ({ ...b }));
  if (n.closingPinned) shell.closingPinned = { ...n.closingPinned };
  let playlist = renight(shell, tandas);
  if (n.booth) {
    playlist = attachBooth(playlist, n.booth);
    playlist.score = scorePlaylist(playlist);
  }
  return { playlist, missing, matched };
}

/** A short stable hash (FNV-1a, base 36) for ids. */
export function nightHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** A safe file name for the night: "Milonga del Sábado.tdjnight" → letters, digits, spaces and dashes. */
export function nightFileName(name: string): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9 _-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Night";
  return `${base}${NIGHT_EXTENSION}`;
}
