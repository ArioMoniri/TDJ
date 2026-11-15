import type { AudioFeatures, ResolvedTrack } from "./audio/index";
import type { ReferenceCorpus } from "./catalog";
import { Catalog } from "./catalog";
import { BUILTIN_CORTINAS } from "./cortinas";
import type { DeezerCache } from "./enrich";
import { type CoverageRow, Heatmap } from "./knowledge";
import { cortinaMatchProblem } from "./matchRules";
import type {
  ContextModel,
  Cortina,
  LearnedPreferences,
  OrchestraProfile,
  Song,
  UserOverrides,
} from "./types";

/**
 * The committed index as parsed JSON, keyed by role. The server reads these files from `data/` (src/load.ts); the
 * macOS and iPadOS apps ship the same files inside the app and hand them over parsed, so both build the catalogue
 * with `buildLoaded` and compose the same night for the same options and seed. No file system here.
 */
export const DATA_FILES = {
  songs: "data/index/songs.json",
  meta: "data/index/meta.json",
  coverage: "data/index/coverage.json",
  profiles: "data/knowledge/orchestra_profiles.json",
  cortinas: "data/knowledge/cortinas.json",
  contextFactors: "data/knowledge/context_factors.json",
  trackEnergy: "data/knowledge/track_energy.json",
  learned: "data/knowledge/dj_preferences.json",
  referenceSets: "data/knowledge/reference_sets.json",
  referencePlaylists: "data/knowledge/reference_playlists.json",
  songPatches: "data/knowledge/song_patches.json",
  addedSongs: "data/knowledge/added_songs.json",
  spotifyTracks: "data/cache/spotify/tracks.json",
  spotifyCortinas: "data/cache/spotify/cortinas.json",
  resolvedTracks: "data/cache/resolve/tracks.json",
  resolvedCortinas: "data/cache/resolve/cortinas.json",
  audio: "data/cache/audio/features.json",
  deezer: "data/cache/deezer/tracks.json",
} as const;
export type DataFileKey = keyof typeof DATA_FILES;
/** Parsed JSON per role; a role whose file is absent is left out. */
export type DataFiles = Partial<Record<DataFileKey, unknown>>;

export interface Loaded {
  catalog: Catalog;
  cortinas: Cortina[];
  meta: Record<string, unknown>;
  contextModel?: ContextModel;
  corpus: ReferenceCorpus;
  trackEnergy: Record<string, number>;
  /** round 13: the user's orchestra heatmap (data/index/coverage.json, parsed from data/sources/All_orchestras.xls) */
  heatmap: Heatmap;
  /** the heatmap's rows as shipped (round 22: the DJ's grade edits are applied over them, heatmapWith) */
  coverage: CoverageRow[];
  raw: {
    songs: Song[];
    profiles: OrchestraProfile[];
    cache: Record<string, Song["spotify"] & { durationMs?: number }>;
    resolved: Record<string, ResolvedTrack | null>;
    audio: Record<string, AudioFeatures | null>;
    /** round 21: Deezer BPM and gain (data/cache/deezer/tracks.json) */
    deezer: DeezerCache;
    learned?: LearnedPreferences;
  };
}

type PatchFile = { songs?: Record<string, Partial<Song> & { source?: string; at?: string }> } | null;
type AddedFile = { songs?: Song[] } | null;

/**
 * Round 21: the index as the app reads it — data/index/songs.json (built from the listado) with the repo-level
 * database applied: corrections of rows with their source (data/knowledge/song_patches.json) and the sides the DJ
 * added that the listado does not hold (data/knowledge/added_songs.json). A DJ's own database edits apply on top.
 */
export function indexSongs(songs: Song[], patchFile?: PatchFile, addedFile?: AddedFile): Song[] {
  const patches = patchFile?.songs ?? {};
  const added = addedFile?.songs ?? [];
  const out = songs.map((s) => {
    const p = patches[s.id];
    if (!p) return s;
    const { source: _s, at: _a, ...fields } = p;
    return {
      ...s,
      ...fields,
      notes: [s.notes, `corrected: ${p.source ?? "repo database"}`].filter(Boolean).join(" · "),
    };
  });
  const ids = new Set(out.map((s) => s.id));
  return [...out, ...added.filter((s) => !ids.has(s.id))];
}

/** The catalogue, cortina pool and models from the parsed data files (what `loadCatalog` does after reading). */
export function buildLoaded(f: DataFiles, overrides?: UserOverrides): Loaded {
  if (f.meta === undefined) throw new Error("data/index/meta.json is required");
  const songs = indexSongs((f.songs ?? []) as Song[], f.songPatches as PatchFile, f.addedSongs as AddedFile);
  const profiles = (f.profiles ?? []) as OrchestraProfile[];
  const cortinasRaw = (f.cortinas ?? []) as Cortina[];
  const cortinaResolved = (f.resolvedCortinas ?? {}) as Record<string, ResolvedTrack | null>;
  const cortinaSpotify = (f.spotifyCortinas ?? {}) as Record<string, Cortina["spotify"]>;
  // round 14 (discography R12): a cue the resolver tried and found nothing for is tagged "no-audio" (never in a pool)
  // round 16 (M7): a cue's Deezer and Spotify records pass the cortina match rules (title, artist by whole name, the
  // original record); the code-defined cortinas carry their cached records too (Cambaz c-tr-2)
  const withAudio = (c: Cortina): Cortina => {
    if (!(c.id in cortinaResolved) && !(c.id in cortinaSpotify)) return c;
    let resolved = c.resolved ?? (c.id in cortinaResolved ? (cortinaResolved[c.id] ?? null) : undefined);
    if (
      resolved &&
      cortinaMatchProblem(c, {
        name: resolved.title,
        artists: [resolved.artist],
        album: resolved.album,
        durationMs: resolved.durationMs,
      })
    )
      resolved = null;
    const sp0 = cortinaSpotify[c.id] ?? c.spotify ?? null;
    const [artist, ...rest] = (sp0?.matched ?? "").split(" – ");
    const spotify =
      sp0 &&
      (!sp0.matched ||
        !cortinaMatchProblem(c, {
          name: rest.join(" – ") || c.title,
          artists: (artist ?? "").split(/,\s*/),
          album: sp0.album,
          durationMs: sp0.durationMs,
          release: (sp0 as { release?: string }).release,
        }))
        ? sp0
        : null;
    // round 19: a Spotify record alone does not make a cue drawable — the app previews and rehearses cues through
    // their Deezer audio, and the pools (and so the golden set) stay the ones round 14 defined; such a cue's record
    // is kept for the Spotify export
    const tags =
      resolved === null && !c.tags?.includes("no-audio") ? [...(c.tags ?? []), "no-audio"] : c.tags;
    return {
      ...c,
      ...(resolved !== undefined ? { resolved } : {}),
      ...(spotify ? { spotify } : {}),
      ...(tags ? { tags } : {}),
    };
  };
  const knowledgeIds = new Set(cortinasRaw.map((c) => c.id));
  const cortinas = [
    ...cortinasRaw,
    ...BUILTIN_CORTINAS.filter(
      (c) => !knowledgeIds.has(c.id) && (c.id in cortinaResolved || c.id in cortinaSpotify),
    ),
  ].map(withAudio);
  const cache = (f.spotifyTracks ?? {}) as Loaded["raw"]["cache"];
  const meta = f.meta as Record<string, unknown>;
  const contextModel = f.contextFactors as ContextModel | undefined;
  const trackEnergy = (f.trackEnergy ?? {}) as Record<string, number>;
  const resolved = (f.resolvedTracks ?? {}) as Record<string, ResolvedTrack | null>;
  const audio = (f.audio ?? {}) as Record<string, AudioFeatures | null>;
  const deezer = (f.deezer ?? {}) as DeezerCache;
  const learned = f.learned as LearnedPreferences | undefined;
  const coverage = (f.coverage ?? []) as CoverageRow[];
  const heatmap = new Heatmap(coverage);
  const corpus = (f.referenceSets ?? {}) as ReferenceCorpus;
  return {
    catalog: new Catalog(songs, profiles, cache, corpus, overrides, trackEnergy, {
      resolved,
      audio,
      heatmap,
      deezer,
      learned,
    }),
    cortinas,
    meta,
    contextModel,
    corpus,
    trackEnergy,
    heatmap,
    coverage,
    raw: { songs, profiles, cache, resolved, audio, deezer, learned },
  };
}
