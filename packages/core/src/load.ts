import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedTrack } from "./audio/index";
import { BUILTIN_CORTINAS } from "./cortinas";
import { buildLoaded, DATA_FILES, type DataFiles, indexSongs, type Loaded } from "./data";
import { cortinaMatchProblem } from "./matchRules";
import type { Cortina, Song, UserOverrides } from "./types";

export type { Loaded };

/** Node-only loader: reads the committed index from `data/` (repo root); the catalogue itself is src/data.ts. */
export function readDataFiles(root = findRoot()): DataFiles {
  const out: DataFiles = {};
  for (const [k, rel] of Object.entries(DATA_FILES)) {
    const p = join(/* turbopackIgnore: true */ root, rel);
    if (existsSync(p)) (out as Record<string, unknown>)[k] = JSON.parse(readFileSync(p, "utf8"));
  }
  return out;
}

export function loadCatalog(root = findRoot(), overrides?: UserOverrides): Loaded {
  return buildLoaded(readDataFiles(root), overrides);
}

/** Round 21: data/index/songs.json with the repo-level database applied (src/data.ts → indexSongs). */
export function readIndexSongs(root = findRoot()): Song[] {
  const read = (rel: string) => {
    const p = join(/* turbopackIgnore: true */ root, rel);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
  };
  return indexSongs(
    read(DATA_FILES.songs) as Song[],
    read(DATA_FILES.songPatches),
    read(DATA_FILES.addedSongs),
  );
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
      release: (v as { release?: string }).release,
    });
    if (why) out.push({ id, why: `${v.uri} ${why}` });
  }
  return out;
}
