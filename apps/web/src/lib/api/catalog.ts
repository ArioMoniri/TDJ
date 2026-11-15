import { Catalog, type ContextModel, type Cortina, heatmapWith, scrapedCaches, type UserOverrides } from "@tdj/core";
import type { Loaded } from "@tdj/core/data";
import type { AppOverrides, ReferencePlaylist } from "@/lib/types";

/** The committed index as both runtimes hold it: the server reads it from `data/`, the apps from their bundle. */
export type BaseCatalog = Loaded & { referencePlaylists: ReferencePlaylist[] };
export interface LiveCatalog {
  catalog: Catalog;
  cortinas: Cortina[];
  contextModel?: ContextModel;
}
export interface CatalogDeps {
  /** the committed catalogue (built once) */
  catalog(): BaseCatalog;
  /** the catalogue with the DJ's own database edits applied (memoised) */
  catalogFor(overrides?: AppOverrides | null): LiveCatalog;
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

/** 53-bit string hash (cyrb53): the memo key of an overrides object where `node:crypto` does not exist. */
export function hash53(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + s.length.toString(36);
}

const LRU_MAX = 8;

/**
 * `catalog()` and `catalogFor(overrides)` over a loader: the per-request catalogue is built over the index with the
 * DJ's overrides and memoised by content hash (LRU 8). The same code on the server and in the apps.
 */
export function catalogStore(load: () => BaseCatalog, hash: (s: string) => string = hash53): CatalogDeps {
  let cached: BaseCatalog | null = null;
  const lru = new Map<string, { catalog: Catalog; contextModel?: ContextModel }>();
  const catalog = () => {
    if (!cached) cached = load();
    return cached;
  };
  const catalogFor = (overrides?: AppOverrides | null): LiveCatalog => {
    const base = catalog();
    if (overridesEmpty(overrides))
      return { catalog: base.catalog, cortinas: base.cortinas, contextModel: base.contextModel };
    const o = overrides as AppOverrides;
    const key = hash(JSON.stringify(o));
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
    const built = new Catalog(
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
          heatEdits && Object.keys(heatEdits).length ? heatmapWith(base.coverage, heatEdits) : base.heatmap,
        deezer: Object.keys(userDeezer).length ? { ...base.raw.deezer, ...userDeezer } : base.raw.deezer,
        learned: base.raw.learned,
      },
    );
    const contextModel = mergeContextModel(base.contextModel, o.contextFactors);
    lru.set(key, { catalog: built, contextModel });
    if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value as string);
    return { catalog: built, cortinas: base.cortinas, contextModel };
  };
  return { catalog, catalogFor };
}
