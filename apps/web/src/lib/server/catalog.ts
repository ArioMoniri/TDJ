import "server-only";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findRoot, loadCatalog } from "@tdj/core/load";
import { type BaseCatalog, catalogStore } from "@/lib/api/catalog";
import type { ReferencePlaylist } from "@/lib/types";

export { mergeContextModel, overridesEmpty } from "@/lib/api/catalog";

/** The committed index read from `data/` (the apps read the same files from their bundle: lib/app/data.ts). */
function load(): BaseCatalog & { root: string } {
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
  return { ...loadCatalog(root), root, referencePlaylists };
}

const store = catalogStore(load, (s) => createHash("sha1").update(s).digest("hex"));

export const getCatalog = store.catalog;
/** Per-request catalogue built over the repo index with the user's overrides (memoised by content hash, LRU 8). */
export const getCatalogFor = store.catalogFor;
export const serverCatalog = store;
export const coverageRows = () => getCatalog().coverage;
