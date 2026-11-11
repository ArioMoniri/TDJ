import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AudioFeatures, ResolvedTrack } from "./audio/index";
import type { ReferenceCorpus } from "./catalog";
import { Catalog } from "./catalog";
import { BUILTIN_CORTINAS } from "./cortinas";
import { type CoverageRow, Heatmap } from "./knowledge";
import { cortinaMatchProblem } from "./matchRules";
import type { ContextModel, Cortina, OrchestraProfile, Song, UserOverrides } from "./types";

/** Node-only loader: reads the committed index from `data/` (repo root). */
export interface Loaded {
  catalog: Catalog;
  cortinas: Cortina[];
  meta: Record<string, unknown>;
  contextModel?: ContextModel;
  corpus: ReferenceCorpus;
  trackEnergy: Record<string, number>;
  /** round 13: the user's orchestra heatmap (data/index/coverage.json, parsed from data/sources/All_orchestras.xls) */
  heatmap: Heatmap;
  raw: {
    songs: Song[];
    profiles: OrchestraProfile[];
    cache: Record<string, Song["spotify"] & { durationMs?: number }>;
    resolved: Record<string, ResolvedTrack | null>;
    audio: Record<string, AudioFeatures | null>;
  };
}
export function loadCatalog(root = findRoot(), overrides?: UserOverrides): Loaded {
  const j = (p: string) => join(/* turbopackIgnore: true */ root, p);
  const songs = JSON.parse(readFileSync(j("data/index/songs.json"), "utf8")) as Song[];
  const pf = j("data/knowledge/orchestra_profiles.json");
  const profiles = existsSync(pf) ? (JSON.parse(readFileSync(pf, "utf8")) as OrchestraProfile[]) : [];
  const cf = j("data/knowledge/cortinas.json");
  const cortinasRaw = existsSync(cf) ? (JSON.parse(readFileSync(cf, "utf8")) as Cortina[]) : [];
  const crf = j("data/cache/resolve/cortinas.json");
  const cortinaResolved = existsSync(crf)
    ? (JSON.parse(readFileSync(crf, "utf8")) as Record<string, ResolvedTrack | null>)
    : {};
  const cspf = j("data/cache/spotify/cortinas.json");
  const cortinaSpotify = existsSync(cspf)
    ? (JSON.parse(readFileSync(cspf, "utf8")) as Record<string, Cortina["spotify"]>)
    : {};
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
        }))
        ? sp0
        : null;
    const tags =
      resolved === null && !spotify && !c.tags?.includes("no-audio")
        ? [...(c.tags ?? []), "no-audio"]
        : c.tags;
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
  const sf = j("data/cache/spotify/tracks.json");
  const cache = existsSync(sf) ? JSON.parse(readFileSync(sf, "utf8")) : {};
  const meta = JSON.parse(readFileSync(j("data/index/meta.json"), "utf8"));
  const cxf = j("data/knowledge/context_factors.json");
  const contextModel = existsSync(cxf) ? (JSON.parse(readFileSync(cxf, "utf8")) as ContextModel) : undefined;
  const tef = j("data/knowledge/track_energy.json");
  const trackEnergy = existsSync(tef)
    ? (JSON.parse(readFileSync(tef, "utf8")) as Record<string, number>)
    : {};
  const rsf = j("data/cache/resolve/tracks.json");
  const resolved = existsSync(rsf)
    ? (JSON.parse(readFileSync(rsf, "utf8")) as Record<string, ResolvedTrack | null>)
    : {};
  const af = j("data/cache/audio/features.json");
  const audio = existsSync(af)
    ? (JSON.parse(readFileSync(af, "utf8")) as Record<string, AudioFeatures | null>)
    : {};
  const cvf = j("data/index/coverage.json");
  const heatmap = new Heatmap(
    existsSync(cvf) ? (JSON.parse(readFileSync(cvf, "utf8")) as CoverageRow[]) : [],
  );
  const rf = j("data/knowledge/reference_sets.json");
  const corpus = existsSync(rf) ? (JSON.parse(readFileSync(rf, "utf8")) as ReferenceCorpus) : {};
  return {
    catalog: new Catalog(songs, profiles, cache, corpus, overrides, trackEnergy, {
      resolved,
      audio,
      heatmap,
    }),
    cortinas,
    meta,
    contextModel,
    corpus,
    trackEnergy,
    heatmap,
    raw: { songs, profiles, cache, resolved, audio },
  };
}

export function findRoot(start = process.cwd()): string {
  let d = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(/* turbopackIgnore: true */ d, "data/index/meta.json"))) return d;
    d = join(/* turbopackIgnore: true */ d, "..");
  }
  return start;
}

/**
 * Round 16 (M7): every cached cortina record (Deezer resolve and Spotify) judged by the cortina match rules: the same
 * title, the artist by whole name, the original record (no duet, live, remix, karaoke or re-recording album).
 */
export function auditCortinaCaches(root = findRoot()): Array<{ id: string; why: string }> {
  const j = (p: string) => join(/* turbopackIgnore: true */ root, p);
  const read = <T>(p: string, d: T): T =>
    existsSync(j(p)) ? (JSON.parse(readFileSync(j(p), "utf8")) as T) : d;
  const known = read<Cortina[]>("data/knowledge/cortinas.json", []);
  const byId = new Map<string, Cortina>([...BUILTIN_CORTINAS, ...known].map((c) => [c.id, c]));
  const rz = read<Record<string, ResolvedTrack | null>>("data/cache/resolve/cortinas.json", {});
  const sp = read<Record<string, Cortina["spotify"]>>("data/cache/spotify/cortinas.json", {});
  const out: Array<{ id: string; why: string }> = [];
  for (const [id, v] of Object.entries(rz)) {
    const c = byId.get(id);
    if (!c || !v) continue;
    const why = cortinaMatchProblem(c, {
      name: v.title,
      artists: [v.artist],
      album: v.album,
      durationMs: v.durationMs,
    });
    if (why) out.push({ id, why: `deezer:${v.id} ${why}` });
  }
  for (const [id, v] of Object.entries(sp)) {
    const c = byId.get(id);
    if (!c || !v?.matched) continue;
    const [artist, ...rest] = v.matched.split(" – ");
    const why = cortinaMatchProblem(c, {
      name: rest.join(" – ") || c.title,
      artists: (artist ?? "").split(/,\s*/),
      album: v.album,
      durationMs: v.durationMs,
    });
    if (why) out.push({ id, why: `${v.uri} ${why}` });
  }
  return out;
}
