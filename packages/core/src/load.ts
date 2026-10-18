import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReferenceCorpus } from "./catalog";
import { Catalog } from "./catalog";
import type { ContextModel, Cortina, OrchestraProfile, Song, UserOverrides } from "./types";

/** Node-only loader: reads the committed index from `data/` (repo root). */
export interface Loaded {
  catalog: Catalog;
  cortinas: Cortina[];
  meta: Record<string, unknown>;
  contextModel?: ContextModel;
  corpus: ReferenceCorpus;
  trackEnergy: Record<string, number>;
  raw: {
    songs: Song[];
    profiles: OrchestraProfile[];
    cache: Record<string, Song["spotify"] & { durationMs?: number }>;
  };
}
export function loadCatalog(root = findRoot(), overrides?: UserOverrides): Loaded {
  const j = (p: string) => join(/* turbopackIgnore: true */ root, p);
  const songs = JSON.parse(readFileSync(j("data/index/songs.json"), "utf8")) as Song[];
  const pf = j("data/knowledge/orchestra_profiles.json");
  const profiles = existsSync(pf) ? (JSON.parse(readFileSync(pf, "utf8")) as OrchestraProfile[]) : [];
  const cf = j("data/knowledge/cortinas.json");
  const cortinas = existsSync(cf) ? (JSON.parse(readFileSync(cf, "utf8")) as Cortina[]) : [];
  const sf = j("data/cache/spotify/tracks.json");
  const cache = existsSync(sf) ? JSON.parse(readFileSync(sf, "utf8")) : {};
  const meta = JSON.parse(readFileSync(j("data/index/meta.json"), "utf8"));
  const cxf = j("data/knowledge/context_factors.json");
  const contextModel = existsSync(cxf) ? (JSON.parse(readFileSync(cxf, "utf8")) as ContextModel) : undefined;
  const tef = j("data/knowledge/track_energy.json");
  const trackEnergy = existsSync(tef)
    ? (JSON.parse(readFileSync(tef, "utf8")) as Record<string, number>)
    : {};
  const rf = j("data/knowledge/reference_sets.json");
  const corpus = existsSync(rf) ? (JSON.parse(readFileSync(rf, "utf8")) as ReferenceCorpus) : {};
  return {
    catalog: new Catalog(songs, profiles, cache, corpus, overrides, trackEnergy),
    cortinas,
    meta,
    contextModel,
    corpus,
    trackEnergy,
    raw: { songs, profiles, cache },
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
