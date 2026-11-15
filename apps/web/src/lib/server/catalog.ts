import "server-only";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Catalog,
  type ContextModel,
  type CoverageRow,
  heatmapWith,
  scrapedCaches,
  type UserOverrides,
} from "@tdj/core";
import { findRoot, loadCatalog } from "@tdj/core/load";
import type { AppOverrides, ReferencePlaylist } from "@/lib/types";

let cached:
  | (ReturnType<typeof loadCatalog> & { root: string; referencePlaylists: ReferencePlaylist[] })
  | null = null;

export function getCatalog() {
  if (!cached) {
    const candidates = [
      process.env.TDJ_DATA_ROOT,
      process.cwd(),
      join(process.cwd(), "../.."),
      findRoot(),
    ].filter(Boolean) as string[];
    const root = candidates.find((r) => existsSync(join(r, "data/index/meta.json"))) ?? findRoot();
    const rp = join(root, "data/knowledge/reference_playlists.json");
    const referencePlaylists: ReferencePlaylist[] = existsSync(rp)
      ? ((JSON.parse(readFileSync(rp, "utf8")) as { playlists?: ReferencePlaylist[] }).playlists ?? [])
      : [];
    cached = { ...loadCatalog(root), root, referencePlaylists };
  }
  return cached;
}

/** True when the overrides object carries no change that would alter the catalogue. */
export function overridesEmpty(o?: AppOverrides | null): boolean {
  if (!o) return true;
  return (
    !Object.keys(o.songs ?? {}).length &&
    !(o.hiddenTitles?.length ?? 0) &&
    !Object.keys(o.profiles ?? {}).length &&
    !Object.keys(o.cortinas ?? {}).length &&
    !Object.keys(o.rules ?? {}).length &&
    !(o.addedSongs?.length ?? 0) &&
    !Object.keys(o.contextFactors ?? {}).length &&
    !Object.keys(o.heatmap ?? {}).length &&
    !Object.keys(o.scraped ?? {}).length
  );
}

/** the shipped heatmap rows (data/index/coverage.json under the data root), read once */
let coverage: CoverageRow[] | null = null;
export function coverageRows(): CoverageRow[] {
  if (!coverage) {
    const f = join(getCatalog().root, "data/index/coverage.json");
    coverage = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as CoverageRow[]) : [];
  }
  return coverage;
}

const LRU_MAX = 8;
const lru = new Map<string, { catalog: Catalog; contextModel?: ContextModel }>();

/** Per-request catalogue built over the repo index with the user's overrides (memoised by content hash, LRU 8). */
export function getCatalogFor(overrides?: AppOverrides | null) {
  const base = getCatalog();
  if (overridesEmpty(overrides))
    return { catalog: base.catalog, cortinas: base.cortinas, contextModel: base.contextModel };
  const o = overrides as AppOverrides;
  const key = createHash("sha1").update(JSON.stringify(o)).digest("hex");
  const hit = lru.get(key);
  if (hit) {
    lru.delete(key);
    lru.set(key, hit);
    return { catalog: hit.catalog, cortinas: base.cortinas, contextModel: hit.contextModel };
  }
  const { contextFactors: _cf, heatmap: heatEdits, scraped, connectors: _c, guide: _g, ...core } = o;
  // round 22: what the DJ's own sources fetched (Deezer BPM and gain) is newer than the shipped cache and replaces its
  // record; the DJ's edits (`songs`) still win over both; the DJ's grade edits sit over the shipped heatmap
  const userDeezer = scrapedCaches(scraped).deezer;
  const catalog = new Catalog(
    base.raw.songs,
    base.raw.profiles,
    base.raw.cache,
    base.corpus,
    core as UserOverrides,
    base.trackEnergy,
    // (round 21: the committed caches carry under the user's edits — previews, analysed audio, the heatmap, Deezer
    // BPM and gain — so a DJ correction replaces one value and keeps the rest)
    {
      resolved: base.raw.resolved,
      audio: base.raw.audio,
      heatmap:
        heatEdits && Object.keys(heatEdits).length ? heatmapWith(coverageRows(), heatEdits) : base.heatmap,
      deezer: Object.keys(userDeezer).length ? { ...base.raw.deezer, ...userDeezer } : base.raw.deezer,
      learned: base.raw.learned,
    },
  );
  const contextModel = mergeContextModel(base.contextModel, o.contextFactors);
  lru.set(key, { catalog, contextModel });
  if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value as string);
  return { catalog, cortinas: base.cortinas, contextModel };
}

/** Apply per-option shift edits ({ factorId: { optionId: { energyShift… } } }) over the research model. */
export function mergeContextModel(
  model: ContextModel | undefined,
  edits?: AppOverrides["contextFactors"],
): ContextModel | undefined {
  if (!model || !edits || !Object.keys(edits).length) return model;
  return {
    ...model,
    factors: model.factors.map((f) => {
      const fe = edits[f.id];
      if (!fe) return f;
      return { ...f, options: f.options.map((op) => (fe[op.id] ? { ...op, ...fe[op.id] } : op)) };
    }),
  };
}
