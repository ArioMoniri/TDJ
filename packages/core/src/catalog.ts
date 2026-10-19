import { estimateDuration, normTitle, songEnergy } from "./energy";
import type { AudioFeatures, ResolvedTrack } from "./audio/index";
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

export class Catalog {
  readonly songs: Song[];
  readonly profiles: Map<string, OrchestraProfile>;
  readonly byOrchestra = new Map<string, Song[]>();
  readonly fame = new Map<string, { fame: number; energy?: number; role?: string }>();
  readonly blacklist = new Set<string>();
  readonly corpus: ReferenceCorpus;

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
    for (const f of corpus.famousRecordings ?? [])
      this.fame.set(`${normTitle(f.title)}|${f.orchestraId}`, {
        fame: f.fame ?? 3,
        energy: f.energy,
        role: f.role,
      });
    for (const b of corpus.blacklist ?? []) this.blacklist.add(normTitle(b.title));
    const te = { ...trackEnergy, ...(overrides?.rules?.trackEnergy ?? {}) };
    const all = [...songs, ...(overrides?.addedSongs ?? [])];
    this.songs = all.flatMap((raw) => {
      const patch = overrides?.songs?.[raw.id];
      if (patch?.hidden) return [];
      const s = patch ? { ...raw, ...patch } : raw;
      const sp = s.spotify ?? spotifyCache[s.id] ?? null;
      const resolved = s.resolved ?? caches.resolved?.[s.id] ?? null;
      const audio = patch?.audio ?? s.audio ?? caches.audio?.[s.id] ?? null;
      const song: Song = {
        ...s,
        spotify: sp ?? null,
        resolved,
        audio,
        durationSec:
          s.durationSec ??
          (sp?.durationMs
            ? Math.round(sp.durationMs / 1000)
            : resolved?.durationMs && resolved.durationMs > 90_000
              ? Math.round(resolved.durationMs / 1000)
              : estimateDuration(s)),
      };
      const key = `${normTitle(song.title)}|${song.orchestraId}`;
      const fame = this.fame.get(key);
      song.fame = fame?.fame ?? 0;
      song.energy =
        patch?.energy ?? te[key] ?? fame?.energy ?? songEnergy(song, this.profiles.get(song.orchestraId), te);
      return [song];
    });
    for (const s of this.songs) {
      const arr = this.byOrchestra.get(s.orchestraId) ?? [];
      arr.push(s);
      this.byOrchestra.set(s.orchestraId, arr);
    }
  }

  profile(orchestraId: string): OrchestraProfile | undefined {
    return this.profiles.get(orchestraId);
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
    const norm = (x: string) =>
      x
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/['\u2019.]/g, "");
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
