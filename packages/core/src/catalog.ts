import { setActiveCatalog } from "./active";
import type { AudioFeatures, ResolvedTrack } from "./audio/index";
import { estimateDuration, normTitle, parseNonDanceTitle, songEnergy } from "./energy";
import { DEFAULT_HEATMAP, type Heatmap, monthIndex } from "./knowledge";
import { judgeStreams, takesIndex } from "./matchRules";
import { ERA_PRESETS, mergeProfiles } from "./profiles";
import { creditNamesOther, dateMismatch, knownSingers } from "./streams";
import type { DanceRhythm, EraPreset, OrchestraProfile, Song, UserOverrides } from "./types";

export interface ReferenceCorpus {
  famousRecordings?: Array<{
    title: string;
    orchestraId: string;
    singer?: string | null;
    year?: number;
    rhythm?: string;
    fame?: number;
    energy?: number;
    role?: string;
  }>;
  canonicalTandas?: Array<{
    id: string;
    rhythm: string;
    orchestraId: string;
    singer?: string | null;
    years?: [number, number];
    titles?: string[];
    phase?: string;
    popularity?: number;
  }>;
  blacklist?: Array<{ title: string; orchestraId?: string | null; reason?: string }>;
  sets?: unknown[];
}

export interface CatalogFilter {
  eras?: EraPreset[];
  rhythms?: DanceRhythm[];
  includeOrchestras?: string[];
  excludeOrchestras?: string[];
  onlySelection?: boolean;
  requireSpotify?: boolean;
  minTier?: 1 | 2 | 3;
  yearRange?: [number, number];
}

/** "Comme Il Faut(como Debe Ser)(como Debe Ser)" → "Comme Il Faut (como Debe Ser)": the index doubles some parentheticals. */
export function cleanTitle(t: string): string {
  let out = t;
  for (let i = 0; i < 3; i++) out = out.replace(/(\([^()]*\))\s*\1/g, "$1");
  return out
    .replace(/(\S)\(/g, "$1 (")
    .replace(/\s+/g, " ")
    .trim();
}

/** a collection-reissue copy (round 9): "COL.ALTAYA" / "COL.MAGENTA" notes, "coleccionistas" and "colección" albums */
const REISSUE_RE = /^COL\.|ALTAYA|MAGENTA|COLECCI|COLLECTION|COLECCIONISTAS/i;
export const isReissueRow = (s: Pick<Song, "notes" | "album">) =>
  REISSUE_RE.test(s.notes ?? "") || /ALTAYA|COLECCI|COLLECTION|COLECCIONISTAS/i.test(s.album ?? "");

/** the key a recording is hidden by in the user's database: every copy of this orchestra + title */
export const hideKey = (s: Pick<Song, "orchestraId" | "title">) => `${s.orchestraId}|${normTitle(s.title)}`;

/** how much a row knows about itself: used to keep the best of duplicate rows */
function richness(s: Song): number {
  let n = 0;
  if (s.date) n += 2;
  if (s.spotify) n += 3;
  if (s.resolved) n += 2;
  if (s.audio) n += 2;
  if (s.album) n++;
  if (s.selection) n += 2;
  if (s.notes) n++;
  if (s.bpm) n++;
  return n;
}

export class Catalog {
  readonly songs: Song[];
  readonly profiles: Map<string, OrchestraProfile>;
  readonly byOrchestra = new Map<string, Song[]>();
  readonly fame = new Map<string, { fame: number; energy?: number; role?: string }>();
  readonly blacklist = new Set<string>();
  corpus: ReferenceCorpus;
  /** round 13: the user's orchestra × year × mode grades (coverage.json) */
  readonly heatmap: Heatmap;
  private months?: Map<string, number[]>;
  /** per-orchestra non-dance titles: title → year (null = every version) */
  private readonly nonDanceByOrch = new Map<string, Array<{ title: string; year: number | null }>>();

  constructor(
    songs: Song[],
    extraProfiles: OrchestraProfile[] = [],
    spotifyCache: Record<string, Song["spotify"] & { durationMs?: number }> = {},
    corpus: ReferenceCorpus = {},
    overrides?: UserOverrides,
    trackEnergy: Record<string, number> = {},
    caches: {
      resolved?: Record<string, ResolvedTrack | null>;
      audio?: Record<string, AudioFeatures | null>;
      /** round 13: the user's heatmap (data/index/coverage.json); the committed copy when absent */
      heatmap?: Heatmap;
    } = {},
  ) {
    this.heatmap = caches.heatmap ?? DEFAULT_HEATMAP;
    const profs = extraProfiles.map((p) => ({ ...p, ...(overrides?.profiles?.[p.id] ?? {}) }));
    for (const [id, patch] of Object.entries(overrides?.profiles ?? {}))
      if (!profs.some((p) => p.id === id))
        profs.push({ id, name: id, style: "balanced", energy: 50, ...patch } as OrchestraProfile);
    this.profiles = mergeProfiles(profs);
    for (const p of this.profiles.values())
      if (p.nonDanceTitles?.length) this.nonDanceByOrch.set(p.id, p.nonDanceTitles.map(parseNonDanceTitle));
    for (const f of corpus.famousRecordings ?? [])
      this.fame.set(`${normTitle(f.title)}|${f.orchestraId}`, {
        fame: f.fame ?? 3,
        energy: f.energy,
        role: f.role,
      });
    for (const b of corpus.blacklist ?? []) this.blacklist.add(normTitle(b.title));
    const te = { ...trackEnergy, ...(overrides?.rules?.trackEnergy ?? {}) };
    const all = [...songs, ...(overrides?.addedSongs ?? [])];
    // hide by orchestra + title: an explicit hiddenTitles key, or a song patch `hidden` without hiddenScope "copy"
    // (the patch may name a row the index has since merged into another: altIds resolve it)
    const patchOf = (raw: Song) =>
      overrides?.songs?.[raw.id] ?? raw.altIds?.map((id) => overrides?.songs?.[id]).find((p) => p);
    const hiddenTitles = new Set(overrides?.hiddenTitles ?? []);
    const hiddenCopies = new Set<string>();
    if (overrides?.songs)
      for (const raw of all) {
        const patch = patchOf(raw);
        if (!patch?.hidden) continue;
        if (patch.hiddenScope === "copy") hiddenCopies.add(raw.id);
        else hiddenTitles.add(hideKey({ ...raw, ...patch }));
      }
    // round 16 (export matching M1–M6): the later takes the index knows beside each row, and every index voice
    const takes = takesIndex(all);
    const indexSingers = knownSingers(all);
    const built = all.flatMap((raw) => {
      const patch = patchOf(raw);
      if (hiddenCopies.has(raw.id) || hiddenTitles.has(hideKey(raw))) return [];
      if (patch && hiddenTitles.has(hideKey({ ...raw, ...patch }))) return [];
      const s = patch ? { ...raw, ...patch } : raw;
      // round 14 (discography R5): a stream match must name the orchestra, the singer or an orquesta típica
      // ("Domy Castellano – Marchantia" is not Biagi's Marcheta); a match naming neither is dropped
      const sp0 = s.spotify ?? spotifyCache[s.id] ?? null;
      const sp1 =
        sp0 && matchNamesArtist(s, (sp0 as { matched?: string }).matched?.split(" – ")[0]) ? sp0 : null;
      const res0 = s.resolved ?? caches.resolved?.[s.id] ?? null;
      // round 15 (discography R4b): a stream whose title dates the recording more than 31 days from the row is
      // another recording (Recuerdo "Buenos Aires 08/01/1941" on the 1942-11-04 row): never played
      const resolved1 =
        res0 && matchNamesArtist(s, res0.artist) && !dateMismatch(s, res0.title) ? res0 : null;
      // round 16 (M1): the Spotify and the Deezer match are judged by the same rules (title, whole-name leader, voice,
      // album years, remake series, positive evidence beside a later take); a match the rules reject plays nothing
      const tk = takes.get(raw.id);
      const verdict = judgeStreams(
        { ...s, ...(tk ?? {}) },
        sp1 as { uri?: string; durationMs?: number; album?: string; matched?: string } | null,
        resolved1,
        { singers: indexSingers },
      );
      const sp = sp1 && !verdict.spotify ? sp1 : null;
      const resolved = resolved1 && !verdict.deezer ? resolved1 : null;
      const audio = patch?.audio ?? s.audio ?? caches.audio?.[s.id] ?? null;
      // a streaming match whose length is implausible for the era (a 1944 tango of 8 min) is a wrong match: estimate instead
      const est = estimateDuration(s);
      const plausible = (ms: number) =>
        ms > 90_000 && (s.era === "nuevo" || s.era === "contemporary" || ms <= Math.max(330_000, est * 1600));
      // round 15 (discography R4c): when the Spotify transfer and the Deezer track disagree by more than 8 s, the Deezer
      // length is the side's (Pensalo bien: Spotify 2:17, Deezer 2:30)
      const spOff =
        !!sp?.durationMs &&
        !!resolved?.durationMs &&
        // (a Deezer restoration runs 10–15 s long: then the Spotify length stands, discography §3)
        !/restaur/i.test(`${resolved.title} ${resolved.album}`) &&
        Math.abs(sp.durationMs - resolved.durationMs) / 1000 > 8;
      const measured =
        s.durationSec ??
        (spOff && plausible(resolved!.durationMs!) ? Math.round(resolved!.durationMs! / 1000) : undefined) ??
        (sp?.durationMs && plausible(sp.durationMs)
          ? Math.round(sp.durationMs / 1000)
          : resolved?.durationMs && plausible(resolved.durationMs)
            ? Math.round(resolved.durationMs / 1000)
            : undefined);
      const song: Song = {
        ...s,
        title: cleanTitle(s.title),
        spotify: sp ?? null,
        resolved,
        audio,
        durationSec: measured ?? est,
        ...(tk?.laterTakes ? { laterTakes: tk.laterTakes } : {}),
        ...(tk?.vocalTwins ? { vocalTwins: tk.vocalTwins } : {}),
        // round 14 (discography §1.3, R3): an estimate is marked, shown as "≈", never judged against a length band
        ...(measured === undefined ? { durationEstimated: true } : {}),
      };
      if (song.reissue === undefined && isReissueRow(song)) song.reissue = true;
      const key = `${normTitle(song.title)}|${song.orchestraId}`;
      // (round 15: a retitled work keeps the corpus fame of its old spelling, "Milongueando en el cuarenta")
      const fame =
        this.fame.get(key) ??
        (song.altTitles ?? [])
          .map((a) => this.fame.get(`${normTitle(a)}|${song.orchestraId}`))
          .find((x) => x);
      song.fame = fame?.fame ?? 0;
      if (fame?.role) song.role = fame.role as Song["role"];
      if (!song.bpm && audio?.bpm) song.bpm = Math.round(audio.bpm);
      // energy: explicit per-track values win; a famous recording's corpus energy is a prior blended with the
      // per-track model (orchestra, era, singer, title jitter) so the tracks of one family keep a gradient
      const model = songEnergy(song, this.profiles.get(song.orchestraId), te);
      song.energy =
        patch?.energy ??
        te[key] ??
        (fame?.energy !== undefined ? Math.round(0.5 * fame.energy + 0.5 * model) : model);
      return [song];
    });
    // duplicates (same title, orchestra, year and singer): keep the row that knows the most about itself
    const seen = new Map<string, number>();
    const deduped: Song[] = [];
    for (const s of built) {
      const k = `${normTitle(s.title)}|${s.orchestraId}|${s.year ?? s.dateRange?.join("/") ?? ""}|${s.singerId ?? ""}`;
      const i = seen.get(k);
      if (i === undefined) {
        seen.set(k, deduped.length);
        deduped.push(s);
      } else if (richness(s) > richness(deduped[i]!)) deduped[i] = s;
    }
    // round 10 — the stream-length guard: the index durations are the resolved stream lengths, and a pre-1946 side whose
    // stream runs over 3:20, or 15 % over its family's (orchestra, singer, rhythm) median, is a match to a later
    // re-recording (Rawson 3:30, Mala junta 3:36): flagged, and its match confidence capped so an export re-matches it
    const fam = new Map<string, number[]>();
    const famKey = (s: Song) => `${s.orchestraId}|${s.singerId ?? ""}|${s.rhythm}`;
    const streamSec = (s: Song) => {
      const ms = s.resolved?.durationMs ?? s.spotify?.durationMs;
      return ms ? ms / 1000 : 0;
    };
    for (const s of deduped)
      if ((s.year ?? 9999) < 1946 && streamSec(s)) {
        const arr = fam.get(famKey(s)) ?? [];
        arr.push(streamSec(s));
        fam.set(famKey(s), arr);
      }
    const median = (xs: number[]) => {
      const a = xs.slice().sort((x, y) => x - y);
      return a[Math.floor(a.length / 2)] ?? 0;
    };
    // round 11: the guard reads the stream itself (the index length of Pugliese's Recuerdo is 2:35, its stream 491 s)
    // and a stream under 1:55 is a cut transfer (Mano brava at 1:52), suspect too
    for (const s of deduped) {
      if ((s.year ?? 9999) >= 1946) continue;
      const sec = streamSec(s);
      if (!sec) continue;
      const med = median(fam.get(famKey(s)) ?? []);
      const n = fam.get(famKey(s))?.length ?? 0;
      if (sec > 200 || sec < 115 || (n >= 4 && med > 0 && sec > 185 && sec > 1.15 * med)) {
        s.streamSuspect = true;
        if (s.resolved && (s.resolved.confidence ?? 1) > 0.6) s.resolved = { ...s.resolved, confidence: 0.6 };
      }
    }
    // round 13 — the re-recording guard (golden-age review R5, R6, R8): a golden side whose stream is a later take
    // passes the length rule when it is short enough (Verdemar 1943 from "Carlos Di Sarli (1954-1956)", D'Arienzo's
    // 1937 and 1943 Cumparsita rows on the 1951 take); album years, live albums, one stream shared by rows of
    // different years and a per-family length band catch them
    flagRerecordings(
      deduped,
      streamSec,
      (s) => median(fam.get(famKey(s)) ?? []),
      (s) => fam.get(famKey(s))?.length ?? 0,
    );
    for (const s of deduped) {
      const g = this.heatmap.grade(s.orchestraId, s.vocal, s.year && !s.yearApprox ? s.year : null);
      if (g !== undefined) s.heat = g;
    }
    flagSuspectCredits(deduped);
    // round 15 (discography R4d): a match whose credit names a singer the row does not have ("cantan Armando Moreno y
    // Chato Flores" on a Flores-only row, "canta Alberto Echagüe" on an instrumental) needs a listen: suspect
    const singers = knownSingers(deduped);
    for (const s of deduped)
      if (
        creditNamesOther(s, s.resolved?.artist, singers) ||
        creditNamesOther(s, (s.spotify as { matched?: string } | null)?.matched?.split(" – ")[0], singers)
      )
        suspect(s);
    this.songs = deduped;
    // analysed audio refines energy within an orchestra: a track louder/denser than its orchestra's analysed
    // mean moves up, a softer one down (±10 max). Explicit per-track energy (overrides) is left alone.
    const sum = new Map<string, { n: number; e: number }>();
    for (const s of this.songs)
      if (s.audio) {
        const a = sum.get(s.orchestraId) ?? { n: 0, e: 0 };
        a.n++;
        a.e += s.audio.energy;
        sum.set(s.orchestraId, a);
      }
    for (const s of this.songs) {
      const a = s.audio && sum.get(s.orchestraId);
      if (!a || a.n < 3 || overrides?.songs?.[s.id]?.energy !== undefined) continue;
      const delta = Math.max(-10, Math.min(10, (s.audio!.energy - a.e / a.n) * 0.8));
      s.energy = Math.max(0, Math.min(100, Math.round((s.energy ?? 50) + delta)));
    }
    for (const s of this.songs) {
      const arr = this.byOrchestra.get(s.orchestraId) ?? [];
      arr.push(s);
      this.byOrchestra.set(s.orchestraId, arr);
    }
    setActiveCatalog(this.byOrchestra);
    // round 13: the corpus spells singers its own way (Ángel Vargas, Jorge Ortiz, Floreal Ruiz, Roberto Flores); joins
    // between corpus and index (canonical tandas, famous recordings) read the index spelling
    this.corpus = normaliseCorpusSingers(corpus, this.songs);
  }

  /** months (year × 12 + month) of every dated studio side of an orchestra + singer (null = instrumental), sorted */
  recordingMonths(orchestraId: string, singer: string | null): number[] {
    if (!this.months) {
      this.months = new Map();
      for (const s of this.songs) {
        if (!s.year || s.yearApprox || s.transcription) continue;
        const m = monthIndex(s.date, s.year);
        if (m === undefined) continue;
        const k = `${s.orchestraId}|${s.vocal ? normTitle(s.singer ?? "") : ""}`;
        const arr = this.months.get(k) ?? [];
        arr.push(m);
        this.months.set(k, arr);
      }
      for (const arr of this.months.values()) arr.sort((a, b) => a - b);
    }
    return this.months.get(`${orchestraId}|${singer ? normTitle(singer) : ""}`) ?? [];
  }

  profile(orchestraId: string): OrchestraProfile | undefined {
    return this.profiles.get(orchestraId);
  }

  /** profile nonDanceTitles: a bare title bans every version, "Title (1963)" bans that year only */
  nonDance(orchestraId: string, title: string, year?: number | null): boolean {
    const list = this.nonDanceByOrch.get(orchestraId);
    if (!list) return false;
    const t = normTitle(title);
    return list.some((e) => e.title === t && (e.year === null || e.year === (year ?? null)));
  }

  /** profile singerDanceable / nonDanceSingers (Tita Merello, Nelly Omar, "Solo de Piano") */
  singerOk(orchestraId: string, singer: string | null): boolean {
    if (!singer) return true;
    const p = this.profiles.get(orchestraId);
    if (!p) return true;
    if (p.singerDanceable?.[singer] === false) return false;
    if (p.nonDanceSingers?.includes(singer)) return false;
    return true;
  }

  filter(f: CatalogFilter): Song[] {
    const presets = Array.isArray(f.eras) ? f.eras : f.eras ? [f.eras as EraPreset] : ["all" as EraPreset];
    const eras = new Set(presets.flatMap((p) => ERA_PRESETS[p]?.eras ?? []));
    const bounds = presets.map((p) => ERA_PRESETS[p]?.years).filter((y): y is [number, number] => !!y);
    const yr: [number, number] | null = bounds.length
      ? [Math.min(...bounds.map((b) => b[0])), Math.max(...bounds.map((b) => b[1]))]
      : null;
    const inc = f.includeOrchestras?.length ? new Set(f.includeOrchestras) : null;
    const exc = new Set(f.excludeOrchestras ?? []);
    const rh = f.rhythms ? new Set<string>(f.rhythms) : null;
    return this.songs.filter((s) => {
      if (rh && !rh.has(s.rhythm)) return false;
      if (!eras.has(s.era)) return false;
      if (yr && s.year && (s.year < yr[0] || s.year > yr[1])) return false;
      if (f.yearRange && s.year && (s.year < f.yearRange[0] || s.year > f.yearRange[1])) return false;
      if (inc && !inc.has(s.orchestraId)) return false;
      if (exc.has(s.orchestraId)) return false;
      if (f.onlySelection && !s.selection) return false;
      if (f.requireSpotify && !s.spotify) return false;
      if (f.minTier) {
        const t = this.profiles.get(s.orchestraId)?.tier ?? 3;
        if (t > f.minTier) return false;
      }
      return true;
    });
  }

  search(q: string, limit = 50): Song[] {
    const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’.]/g, "");
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const out: Song[] = [];
    for (const s of this.songs) {
      const hay = norm(`${s.title} ${s.orchestra} ${s.singer ?? ""} ${s.year ?? ""} ${s.rhythm}`);
      if (terms.every((t) => hay.includes(t))) {
        out.push(s);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}

/** a later-take or live album: a year in the album title more than 2 years after the row, or a live recording */
const LIVE_RE = /en vivo|\blive\b|auditorio|concierto|in concert/i;
/** golden-age review R8: per-rhythm length bands for a pre-1946 side (s); Pugliese and Láurenz 1943+ tangos run long */
export const LENGTH_BAND: Record<string, [number, number]> = {
  tango: [135, 192],
  vals: [120, 185],
  milonga: [115, 175],
};
export function lengthBand(s: Pick<Song, "orchestraId" | "rhythm" | "year">): [number, number] | undefined {
  const b = LENGTH_BAND[s.rhythm];
  if (!b) return undefined;
  if (
    s.rhythm === "tango" &&
    (s.year ?? 0) >= 1943 &&
    (s.orchestraId === "osvaldo-pugliese" || s.orchestraId === "pedro-laurenz")
  )
    return [b[0], 205];
  return b;
}
/** the album the side streams from (the resolved match first, then the Spotify cache) */
const streamAlbum = (s: Song) => (s.resolved ? s.resolved.album : s.spotify?.album) ?? "";
const streamId = (s: Song) =>
  s.resolved?.id ? `${s.resolved.provider}:${s.resolved.id}` : (s.spotify?.uri ?? null);
/** years named in an album title ("Serie 78 RPM: Carlos Di Sarli (1954-1956)" → [1954, 1956]) */
export function albumYears(album: string): number[] {
  return [...album.matchAll(/\b(19[2-9]\d)\b/g)].map((m) => Number(m[1]));
}
function suspect(s: Song) {
  s.streamSuspect = true;
  if (s.resolved && (s.resolved.confidence ?? 1) > 0.6) s.resolved = { ...s.resolved, confidence: 0.6 };
}
function flagRerecordings(
  songs: Song[],
  streamSec: (s: Song) => number,
  famMedian: (s: Song) => number,
  famN: (s: Song) => number,
) {
  const golden = (s: Song) => !!s.year && !s.yearApprox && s.year < 1946;
  // R5: album years and live albums
  for (const s of songs) {
    if (!golden(s) || !streamSec(s)) continue;
    const album = streamAlbum(s);
    const ys = albumYears(album);
    if ((ys.length && ys[0]! > s.year! + 2) || LIVE_RE.test(album)) suspect(s);
  }
  // R6: one stream shared by rows of the same orchestra and title with different years keeps one row: the one whose
  // year the album names; else a later take (a shared match is a later take far more often than an earlier one)
  const byStream = new Map<string, Song[]>();
  for (const s of songs) {
    const id = streamId(s);
    if (!id || !s.year || s.yearApprox) continue;
    const k = `${s.orchestraId}|${normTitle(s.title)}|${id}`;
    const arr = byStream.get(k) ?? [];
    arr.push(s);
    byStream.set(k, arr);
  }
  for (const rows of byStream.values()) {
    if (new Set(rows.map((r) => r.year)).size < 2) continue;
    const named = rows.find((r) => albumYears(streamAlbum(r)).includes(r.year!));
    if (named) {
      for (const r of rows) if (r.year !== named.year) suspect(r);
      continue;
    }
    // no album year: a post-1945 row on the same stream explains it (the golden rows are the wrong matches); among
    // golden rows only, the latest keeps it
    if (rows.some((r) => r.year! >= 1946)) {
      for (const r of rows) if (r.year! < 1946) suspect(r);
      continue;
    }
    const keep = rows.slice().sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0]!;
    for (const r of rows) if (r.year !== keep.year) suspect(r);
  }
  // R8: a golden side outside its rhythm's length band and more than 12 % off its family's median
  const GENERIC: Record<string, number> = { tango: 165, vals: 158, milonga: 148 };
  for (const s of songs) {
    if (!golden(s) || s.streamSuspect) continue;
    const sec = streamSec(s);
    const band = lengthBand(s);
    if (!sec || !band || (sec >= band[0] && sec <= band[1])) continue;
    const med = famN(s) >= 3 ? famMedian(s) : (GENERIC[s.rhythm] ?? 0);
    if (med > 0 && Math.abs(sec - med) / med > 0.12) suspect(s);
  }
}

/** the corpus with its singer names in the index spelling (accents, case and the Chato nickname ignored) */
const SINGER_ALIAS: Record<string, string> = { "roberto flores": "roberto chato flores" };
export function normaliseCorpusSingers(corpus: ReferenceCorpus, songs: Song[]): ReferenceCorpus {
  const spell = new Map<string, Map<string, number>>();
  for (const s of songs) {
    if (!s.singer) continue;
    const k = `${s.orchestraId}|${normTitle(s.singer)}`;
    const m = spell.get(k) ?? new Map<string, number>();
    m.set(s.singer, (m.get(s.singer) ?? 0) + 1);
    spell.set(k, m);
  }
  const fix = (orchestraId: string, singer: string | null | undefined) => {
    if (!singer) return singer;
    const n = normTitle(singer);
    const m = spell.get(`${orchestraId}|${SINGER_ALIAS[n] ?? n}`);
    if (!m) return singer;
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  };
  return {
    ...corpus,
    famousRecordings: corpus.famousRecordings?.map((f) => ({ ...f, singer: fix(f.orchestraId, f.singer) })),
    canonicalTandas: corpus.canonicalTandas?.map((t) => ({ ...t, singer: fix(t.orchestraId, t.singer) })),
  };
}

/** round 14 (discography R5): the artist a stream match names carries the orchestra's or the singer's surname */
export function matchNamesArtist(
  s: Pick<Song, "orchestra" | "singer">,
  artist: string | undefined | null,
): boolean {
  if (artist === undefined || artist === null) return true; // older cache entries carry no artist: kept
  const a = normTitle(artist);
  const last = (x: string) =>
    normTitle(x)
      .split(" ")
      .filter((w) => w.length > 2)
      .slice(-1);
  const keys = [...last(s.orchestra), ...(s.singer ? last(s.singer) : []), "orquesta", "tipica", "orchestra"];
  return keys.some((k) => a.includes(k));
}

/**
 * Round 14 (dancer R14-4b, R14-13): a fame-0 row whose title another orchestra made famous in the same year (fame ≥ 4),
 * or within two years when the row has no recording date (fame ≥ 3), is a possible crossed credit (Lomuto "Isabelita"
 * 1940-08-12, one day before Rodríguez–Moreno's): flagged, kept off the opener chair, the peaks and the first side.
 */
export function flagSuspectCredits(songs: Song[]): void {
  const famous = new Map<string, Array<{ o: string; y: number; f: number }>>();
  for (const s of songs)
    if ((s.fame ?? 0) >= 3 && s.year) {
      const k = normTitle(s.title);
      famous.set(k, [...(famous.get(k) ?? []), { o: s.orchestraId, y: s.year, f: s.fame ?? 0 }]);
    }
  for (const s of songs) {
    if ((s.fame ?? 0) > 0 || !s.year) continue;
    const hits = famous.get(normTitle(s.title)) ?? [];
    const dated = !!s.date && /^\d{4}-\d{2}-\d{2}/.test(s.date);
    if (
      hits.some(
        (h) => h.o !== s.orchestraId && (dated ? h.y === s.year && h.f >= 4 : Math.abs(h.y - s.year!) <= 2),
      )
    )
      s.suspectCredit = true;
  }
}
