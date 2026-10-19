import type { AudioFeatures, ResolvedTrack } from "./audio/index";
import { estimateDuration, normTitle, parseNonDanceTitle, songEnergy } from "./energy";
import { ERA_PRESETS, mergeProfiles } from "./profiles";
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
  readonly corpus: ReferenceCorpus;
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
    } = {},
  ) {
    this.corpus = corpus;
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
    const built = all.flatMap((raw) => {
      const patch = overrides?.songs?.[raw.id];
      if (patch?.hidden) return [];
      const s = patch ? { ...raw, ...patch } : raw;
      const sp = s.spotify ?? spotifyCache[s.id] ?? null;
      const resolved = s.resolved ?? caches.resolved?.[s.id] ?? null;
      const audio = patch?.audio ?? s.audio ?? caches.audio?.[s.id] ?? null;
      // a streaming match whose length is implausible for the era (a 1944 tango of 8 min) is a wrong match: estimate instead
      const est = estimateDuration(s);
      const plausible = (ms: number) =>
        ms > 90_000 && (s.era === "nuevo" || s.era === "contemporary" || ms <= Math.max(330_000, est * 1600));
      const song: Song = {
        ...s,
        title: cleanTitle(s.title),
        spotify: sp ?? null,
        resolved,
        audio,
        durationSec:
          s.durationSec ??
          (sp?.durationMs && plausible(sp.durationMs)
            ? Math.round(sp.durationMs / 1000)
            : resolved?.durationMs && plausible(resolved.durationMs)
              ? Math.round(resolved.durationMs / 1000)
              : est),
      };
      const key = `${normTitle(song.title)}|${song.orchestraId}`;
      const fame = this.fame.get(key);
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
      const k = `${normTitle(s.title)}|${s.orchestraId}|${s.year ?? ""}|${s.singerId ?? ""}`;
      const i = seen.get(k);
      if (i === undefined) {
        seen.set(k, deduped.length);
        deduped.push(s);
      } else if (richness(s) > richness(deduped[i]!)) deduped[i] = s;
    }
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
