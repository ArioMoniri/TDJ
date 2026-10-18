import "server-only";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Catalog, type ContextModel, type UserOverrides } from "@tdj/core";
import { findRoot, loadCatalog } from "@tdj/core/load";
import type { AppOverrides, ReferencePlaylist } from "@/lib/types";

let cached: (ReturnType<typeof loadCatalog> & { root: string; referencePlaylists: ReferencePlaylist[] }) | null =
  null;

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
    !Object.keys(o.profiles ?? {}).length &&
    !Object.keys(o.cortinas ?? {}).length &&
    !Object.keys(o.rules ?? {}).length &&
    !(o.addedSongs?.length ?? 0) &&
    !Object.keys(o.contextFactors ?? {}).length
  );
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
  const { contextFactors: _cf, ...core } = o;
  const catalog = new Catalog(
    base.raw.songs,
    base.raw.profiles,
    base.raw.cache,
    base.corpus,
    core as UserOverrides,
    base.trackEnergy,
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
