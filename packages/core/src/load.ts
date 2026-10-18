import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Catalog } from "./catalog";
import type { Cortina, OrchestraProfile, Song } from "./types";

/** Node-only loader: reads the committed index from `data/` (repo root). */
export function loadCatalog(root = findRoot()): { catalog: Catalog; cortinas: Cortina[]; meta: Record<string, unknown> } {
  const j = (p: string) => join(/* turbopackIgnore: true */ root, p);
  const songs = JSON.parse(readFileSync(j("data/index/songs.json"), "utf8")) as Song[];
  const pf = j("data/knowledge/orchestra_profiles.json");
  const profiles = existsSync(pf) ? (JSON.parse(readFileSync(pf, "utf8")) as OrchestraProfile[]) : [];
  const cf = j("data/knowledge/cortinas.json");
  const cortinas = existsSync(cf) ? (JSON.parse(readFileSync(cf, "utf8")) as Cortina[]) : [];
  const sf = j("data/cache/spotify/tracks.json");
  const cache = existsSync(sf) ? JSON.parse(readFileSync(sf, "utf8")) : {};
  const meta = JSON.parse(readFileSync(j("data/index/meta.json"), "utf8"));
  return { catalog: new Catalog(songs, profiles, cache), cortinas, meta };
}

export function findRoot(start = process.cwd()): string {
  let d = start;
  for (let i = 0; i < 6; i++) { if (existsSync(join(/* turbopackIgnore: true */ d, "data/index/meta.json"))) return d; d = join(/* turbopackIgnore: true */ d, ".."); }
  return start;
}
